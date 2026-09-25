/**
 * Deterministic comparison of extracted values. Raw values stay stored; this only decides whether two
 * spellings state the same fact. Anything unparseable falls back to whitespace/case-insensitive text.
 */
export type ValueKind = 'tokens' | 'parameters' | 'license' | 'date' | 'text';

// Distinct model sizes differ by ~2×; 5% absorbs 128K = 128,000 vs 131,072 and 2.6B vs 2.7B rounding.
const TOLERANCE = 0.05;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function kindFor(claimKey: string): ValueKind {
  const attribute = (claimKey.split('|')[1] ?? claimKey).toLowerCase();
  if (/context|token|window/.test(attribute)) return 'tokens';
  if (/param/.test(attribute)) return 'parameters';
  if (/licen[cs]e/.test(attribute)) return 'license';
  if (/date|release|launch/.test(attribute)) return 'date';
  return 'text';
}

const text = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** A single unambiguous quantity, or null when the value names zero or several. */
function quantity(value: string, units: Record<string, number>, minimumBare: number): number | null {
  const found = quantities(value, units, minimumBare);
  return found.size === 1 ? [...found][0] : null;
}

function quantities(value: string, units: Record<string, number>, minimumBare: number): Set<number> {
  const found = new Set<number>();
  const pattern = /(\d[\d,]*(?:\.\d+)?)\s*-?\s*([a-z]+)?/gi;
  for (const match of value.matchAll(pattern)) {
    // Skip digits glued to letters, such as "Qwen3" or "LFM2.5".
    if (match.index && /[a-z]/i.test(value[match.index - 1])) continue;
    const number = Number(match[1].replace(/,/g, ''));
    const unit = match[2]?.toLowerCase();
    const multiplier = unit && units[unit];
    if (multiplier) found.add(number * multiplier);
    // A bare four-digit year ("2026") is a date, not a quantity.
    else if (number >= minimumBare && !(/^(19|20)\d{2}$/.test(match[1]))) found.add(number);
  }
  return found;
}

const TOKEN_UNITS = { k: 1_000, m: 1_000_000 };
const PARAM_UNITS = { b: 1e9, billion: 1e9, bn: 1e9, m: 1e6, million: 1e6 };

/** Recognized license identifiers, found anywhere in a value ("Both models are licensed under MIT."). */
const LICENSES: { re: RegExp; key: (m: RegExpMatchArray) => string; label: (m: RegExpMatchArray) => string }[] = [
  { re: /\bapache(?:[ -]license)?(?:[ ,-]*(?:version|v)?[ -]?(2(?:\.0)?))?/i, key: m => m[1] ? 'apache-2.0' : 'apache', label: m => m[1] ? 'Apache-2.0' : 'Apache' },
  { re: /\bmit\b/i, key: () => 'mit', label: () => 'MIT' },
  { re: /\bllama[ -]?(\d(?:\.\d)?)(?:[ -]community)?/i, key: m => `llama-${m[1]}`, label: m => `Llama ${m[1]} Community License` },
  { re: /\bgemma(?: terms| license| prohibited)/i, key: () => 'gemma-terms', label: () => 'Gemma Terms of Use' },
  { re: /\blfm open license(?: v?(\d(?:\.\d)?))?/i, key: m => `lfm-open${m[1] ? '-' + m[1] : ''}`, label: m => `LFM Open License${m[1] ? ' v' + m[1] : ''}` },
  { re: /\bcc[- ]by((?:-[a-z]{2}){0,2})(?:[- ](\d\.\d))?/i, key: m => `cc-by${m[1].toLowerCase()}${m[2] ? '-' + m[2] : ''}`, label: m => `CC-BY${m[1].toUpperCase()}${m[2] ? ' ' + m[2] : ''}` },
  { re: /\b(a?gpl)[- ]?v?(\d(?:\.\d)?)?/i, key: m => `${m[1].toLowerCase()}${m[2] ? '-' + m[2] : ''}`, label: m => `${m[1].toUpperCase()}${m[2] ? '-' + m[2] : ''}` },
];

function licenseId(value: string): { key: string; label: string } | null {
  for (const l of LICENSES) { const m = value.match(l.re); if (m) return { key: l.key(m), label: l.label(m) }; }
  return null;
}

function dateKey(value: string): string | null {
  const v = text(value);
  const iso = v.match(/\b(19|20)\d{2}-(\d{2})(-\d{2})?\b/);
  if (iso) return iso[0].slice(0, 7);
  const year = v.match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return null;
  const month = MONTHS.findIndex(m => new RegExp(`\\b${m}[a-z]*\\.?\\b`).test(v));
  return month >= 0 ? `${year}-${String(month + 1).padStart(2, '0')}` : year;
}

export interface Canonical { kind: ValueKind; number?: number; key: string; label: string }

export function canonical(kind: ValueKind, value: string): Canonical {
  if (kind === 'tokens') {
    const n = quantity(value, TOKEN_UNITS, 1_000);
    if (n !== null) {
      const pow = 2 ** Math.round(Math.log2(n));
      const tokens = Math.abs(pow - n) / pow <= TOLERANCE ? pow : n;
      return { kind, number: tokens, key: String(tokens), label: `${Math.round(tokens / 1024)}K tokens` };
    }
  } else if (kind === 'parameters') {
    const n = quantity(value, PARAM_UNITS, Infinity);
    if (n !== null) return { kind, number: n, key: String(n), label: n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : `${+(n / 1e6).toFixed(0)}M` };
  } else if (kind === 'license') {
    const id = licenseId(value);
    if (id) return { kind, key: id.key, label: id.label };
  } else if (kind === 'date') {
    const key = dateKey(value);
    if (key) return { kind, key, label: key };
  }
  return { kind: 'text', key: text(value), label: value.trim() };
}

export function sameValue(a: Canonical, b: Canonical): boolean {
  if (a.number !== undefined && b.number !== undefined && a.kind === b.kind) {
    return Math.abs(a.number - b.number) / Math.max(a.number, b.number) <= TOLERANCE;
  }
  if (a.kind === 'license' && b.kind === 'license') {
    // An unversioned family name ("Apache License") is compatible with a versioned one ("apache-2.0").
    const [short, long] = a.key.length <= b.key.length ? [a.key, b.key] : [b.key, a.key];
    return a.key === b.key || (!/\d/.test(short) && long.startsWith(short));
  }
  if (a.kind === 'date' && b.kind === 'date') {
    // A year-only value is compatible with a month in that year; two different months are not.
    return a.key === b.key || (a.key.length === 4 || b.key.length === 4) && a.key.slice(0, 4) === b.key.slice(0, 4);
  }
  return a.kind === b.kind && a.key === b.key;
}

/** Groups raw values that state the same fact. A value joins a group only if it matches every member. */
export function groupValues(claimKey: string, values: string[]): { label: string; values: string[]; kind: ValueKind }[] {
  const kind = kindFor(claimKey);
  const groups: { members: Canonical[]; values: string[] }[] = [];
  for (const value of [...new Set(values)]) {
    const c = canonical(kind, value);
    const group = groups.find(g => g.members.every(m => sameValue(m, c)));
    if (group) { group.members.push(c); group.values.push(value); }
    else groups.push({ members: [c], values: [value] });
  }
  return groups.map(g => ({ label: g.members[0].label, values: g.values, kind: g.members[0].kind }));
}

/**
 * Type gate for extracted observations: a grounded quote can still carry the wrong kind of value
 * (output length, training-set size, a page title). Off-type values are dropped before storage.
 */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Matches the entity name with flexible separators: "Qwen3-4B" ≈ "Qwen3 4B" ≈ "qwen3_4b". */
function entityPattern(entity: string, flags = 'i'): RegExp | null {
  const parts = entity.split(/[-\s_.]+/).filter(Boolean);
  return parts.length ? new RegExp(parts.map(escapeRe).join('[-\\s_.]*'), flags) : null;
}

export function admissible(claimKey: string, value: string, quote: string): boolean {
  const kind = kindFor(claimKey);
  const entity = (claimKey.split('|')[0] ?? '').trim();
  // Version-coded variant: "Qwen3 4B 2507 Instruct" is not Qwen3-4B (codes like 2507; years such as 2025 are not codes).
  const named = entityPattern(entity);
  if (named && kind !== 'text') {
    const coded = new RegExp(`${named.source}[-\\s_]*(2[1-9]\\d{2})\\b`, 'i').exec(quote);
    if (coded && !entity.includes(coded[1])) return false;
  }
  // Variant guard: "32K tokens for the 1B size" is not a Gemma-3-4B value, even when quoted from its card.
  const size = (text: string) => [...text.matchAll(/(?<![a-z0-9.])(\d+(?:\.\d+)?)\s?b\b/gi)].map(m => Number(m[1]));
  const entitySizes = size(claimKey.split('|')[0] ?? '');
  const valueSizes = size(value);
  if (entitySizes.length && valueSizes.length && !valueSizes.some(v => entitySizes.includes(v))) return false;
  const c = canonical(kind, value);
  switch (kind) {
    case 'tokens': {
      if (/output\b|\bgenerat/i.test(quote) && !/\binput\b|context (window|length)/i.test(quote)) return false;
      // Implementation settings (e.g. max_position_embeddings 40,960) are not the advertised context length.
      if (/max_position_embeddings|config\.json|rope_scaling|original_max_position/i.test(quote)) return false;
      const inRange = (n: number) => n >= 256 && n <= 10_000_000;
      if (c.kind === 'tokens') return inRange(c.number!);
      // A conditional statement ("32,768 natively and 131,072 tokens with YaRN") carries 2–3 limits.
      const all = [...quantities(value, TOKEN_UNITS, 1_000)];
      return all.length >= 2 && all.length <= 3 && all.every(inRange);
    }
    case 'parameters': {
      // A model identifier ("google/gemma-3-4b-it", "Qwen3-4B") names a size; it does not state a count.
      const stripped = value.replace(entityPattern(entity, 'gi') ?? /$^/, ' ').replace(/\S*\/\S*/g, ' ');
      const p = canonical(kind, stripped);
      return p.kind === 'parameters' && p.number! >= 1e6 && p.number! <= 1e13;
    }
    case 'date': return c.kind === 'date';
    case 'license':
      // A recognized identifier, or a short "<Name> License" form; not page titles ("LICENSE · org/model")
      // or legal boilerplate ("“Licensee” or “you” means …").
      return Boolean(licenseId(value)) || (value.length <= 60 && /\b(license|licence|terms of use)\b/i.test(value) &&
        !/[\/·|]/.test(value) && !/^[“"']/.test(value.trim()) && !/\bmeans\b|\bagreement\b/i.test(value));
    default: return true;
  }
}

/**
 * True when one quote states a value from every disagreeing group, e.g. "32,768 natively and 131,072
 * tokens with YaRN". Such a quote explains a disagreement by condition; it does not pick a winner.
 */
export function coversAllGroups(claimKey: string, quote: string, groups: { label: string; values: string[] }[]): boolean {
  if (groups.length < 2) return false;
  const kind = kindFor(claimKey);
  const numeric = kind === 'tokens' || kind === 'parameters';
  const inQuote = numeric ? [...quantities(quote, kind === 'tokens' ? TOKEN_UNITS : PARAM_UNITS, kind === 'tokens' ? 1_000 : Infinity)]
    .map(n => canonical(kind, kind === 'tokens' ? `${n} tokens` : `${n / 1e9}B`)) : [];
  const lower = quote.toLowerCase();
  return groups.every(group => group.values.some(value => {
    if (lower.includes(value.toLowerCase())) return true;
    const c = canonical(kind, value);
    return numeric && inQuote.some(q => sameValue(q, c));
  }));
}

const FOCUS_HINT: Record<ValueKind, string> = {
  tokens: 'native extended', parameters: 'total parameters', license: 'license terms', date: 'release announced', text: '',
};

/** Deterministic follow-up search hint naming the disagreeing values. */
export function followUpFocus(claimKey: string, groups: { label: string }[]): string {
  return [...groups.map(g => g.label), FOCUS_HINT[kindFor(claimKey)]].filter(Boolean).join(' ').slice(0, 120);
}

/** Groups to name when describing a qualified claim: normalized values, not the conditional sentence itself. */
export function namedGroups<T extends { kind?: ValueKind }>(claimKey: string, groups: T[]): T[] {
  const named = kindFor(claimKey) === 'text' ? groups : groups.filter(g => g.kind !== 'text');
  return named.length >= 2 ? named : groups;
}

/** Groups over the stored evidence that passes today's type checks (stored records are never deleted). */
export function admittedGroups(claimKey: string, evidence: { value: string; quote?: string }[]) {
  return groupValues(claimKey, evidence.filter(e => admissible(claimKey, e.value, e.quote ?? e.value)).map(e => e.value));
}
