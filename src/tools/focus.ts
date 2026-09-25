import { kindFor } from '../agent/normalize.ts';

const TERMS: Record<ReturnType<typeof kindFor>, string[]> = {
  tokens: ['context', 'token', 'window', 'sequence length', 'max length'],
  parameters: ['parameter', 'params', 'billion', 'model size'],
  license: ['license', 'licence', 'terms of use'],
  date: ['release', 'released', 'launch', 'published', 'announced', 'date'],
  text: [],
};

/** Strip link targets and images; keep visible text so quotes remain exact excerpts of the focused text. */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Deterministic excerpting: keep lines naming the claim's attribute plus neighbouring lines, in page order.
 * Windows are joined with a separator, so a quote cannot silently span two distant passages.
 */
export function focusPage(markdown: string, claimKey: string, budget = 8_000): string {
  const lines = cleanMarkdown(markdown).split('\n');
  const attribute = (claimKey.split('|')[1] ?? claimKey).toLowerCase().trim();
  const terms = [...new Set([...TERMS[kindFor(claimKey)], ...attribute.split(/\s+/).filter(w => w.length >= 4)])];
  const hits = lines.flatMap((line, i) => terms.some(t => line.toLowerCase().includes(t)) ? [i] : []);
  if (!hits.length) return lines.join('\n').slice(0, budget);
  const keep = new Set(hits.flatMap(i => [i - 2, i - 1, i, i + 1, i + 2]).filter(i => i >= 0 && i < lines.length));
  const windows: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (keep.has(i)) current.push(lines[i]);
    else if (current.length) { windows.push(current.join('\n')); current = []; }
  }
  if (current.length) windows.push(current.join('\n'));
  let out = '';
  for (const window of windows) {
    const next = out ? `${out}\n[…]\n${window}` : window;
    if (next.length > budget) break;
    out = next;
  }
  return out || windows[0].slice(0, budget);
}
