import type { Bundle, ClaimView } from '../inspector/bundle.ts';
import type { Generation } from '../tools/flux.ts';

/**
 * Evidence-linked executive brief. Every fact is rendered by code from the RawTree bundle; the FLUX
 * cover and video are labelled illustrations and carry no data.
 */
export interface BriefMedia {
  cover?: { dataUri: string; generation: Generation };
  video?: { href: string; generation: Generation };
  /** Decorative per-model cards; the model name is HTML text beside the image, never inside it. */
  cards?: { entity: string; dataUri: string; generation: Generation }[];
}

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const link = (url: string, label: string) => {
  try { const u = new URL(url); if (u.protocol === 'https:' || u.protocol === 'http:') return `<a href="${esc(u.href)}" rel="noopener noreferrer">${esc(label)}</a>`; } catch {}
  return esc(label);
};
const ICON: Record<ClaimView['status'], string> = { supported: '✓', qualified: '◐', unresolved: '⚠', insufficient: '?', pending: '…' };

function cellText(c: ClaimView): string {
  if (c.status === 'supported') return c.value ?? '';
  if (c.status === 'qualified') return c.groups.map(g => g.label).join(' / ') + ' (by condition)';
  if (c.status === 'unresolved') return c.groups.map(g => g.label).join(' vs ');
  const voting = c.evidence.filter(e => (c.voting ?? []).includes(e.id));
  if (c.status === 'insufficient') return voting.length ? `${voting[0].value} (1 source)` : 'no admissible evidence';
  return 'pending';
}

export function howWeKnow(b: Bundle) {
  const evidence = b.claims.flatMap(c => c.evidence);
  const count = (re: RegExp) => b.timeline.filter(e => re.test(e.label)).length;
  return {
    claims: b.claims.length,
    evidence: evidence.length,
    hosts: new Set(evidence.map(e => e.host)).size,
    fullPage: evidence.filter(e => e.via === 'full page').length,
    snippet: evidence.filter(e => e.via === 'search snippet').length,
    sessions: b.sessions.length,
    failures: b.findings.filter(f => f.kind === 'failed_attempt').length,
    retries: b.findings.filter(f => f.kind === 'retry_decided').length,
    followUps: count(/^follow-up planned/),
    pageFailures: count(/^page fetch failed/),
  };
}

export function renderBrief(b: Bundle, media: BriefMedia = {}): string {
  const stats = howWeKnow(b);
  const uncertain = b.claims.filter(c => c.status === 'unresolved' || c.status === 'qualified');
  const matrix = `<table class="matrix"><thead><tr><th></th>${b.attributes.map(a => `<th>${esc(a)}</th>`).join('')}</tr></thead><tbody>${
    b.entities.map(entity => `<tr><th>${esc(entity)}</th>${b.attributes.map(attribute => {
      const c = b.claims.find(x => x.entity === entity && x.attribute === attribute);
      return c ? `<td class="s-${c.status}"><span class="i">${ICON[c.status]}</span> ${esc(cellText(c))}</td>` : '<td></td>';
    }).join('')}</tr>`).join('')}</tbody></table>`;
  const callouts = uncertain.map(c => {
    const latest = c.decisions.at(-1);
    // One line per distinct (host, quote): the same passage can be stored by more than one task.
    const quotes = [...new Map(c.evidence.filter(e => e.quote && (c.voting ?? []).includes(e.id))
      .map(e => [`${e.host}\u0000${e.quote}`, e])).values()].slice(0, 4).map(e =>
      `<li><strong>${esc(e.value)}</strong>: “${esc(e.quote!.slice(0, 260))}” <span class="src">${link(e.sourceUrl, e.host)} · ${esc(e.via)}</span></li>`).join('');
    return `<section class="callout s-${c.status}"><h3>${ICON[c.status]} ${esc(c.claimKey)}: ${esc(c.status)}</h3>
      <p>${esc(latest?.reason ?? '')}</p><ul>${quotes}</ul></section>`;
  }).join('') || '<p>No open disagreements.</p>';
  const sources = b.claims.map(c => `<tr><td>${esc(c.claimKey)}</td><td>${ICON[c.status]} ${esc(c.status)}</td><td>${
    c.evidence.length ? [...new Map(c.evidence.map(e => [e.host, e])).values()].map(e => link(e.sourceUrl, e.host)).join(', ') : '—'}</td></tr>`).join('');
  const cover = media.cover ? `<img class="cover-img" src="${media.cover.dataUri}" alt="AI-generated illustration (FLUX); contains no data">` : '';
  const provenance = [media.cover, media.video, ...(media.cards ?? [])].filter(Boolean).map(m => {
    const g = m!.generation;
    const what = 'entity' in m! ? `Emblem for ${(m as { entity: string }).entity}` : g.kind === 'image' ? 'Cover image' : 'Video';
    return `<li>${esc(what)}: ${esc(g.model)} · request ${esc(g.requestId)} · ${g.seed !== null ? `seed ${esc(g.seed)} · ` : ''}` +
      `reported cost ${g.reportedCostUsd === null ? 'not reported' : '$' + esc(g.reportedCostUsd.toFixed(3))} · sha256 ${esc(g.files[0]?.sha256.slice(0, 16))}…</li>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(b.runId)}: Evidence brief</title><style>
:root{--ink:#1d1d1b;--muted:#6b6b66;--line:#e3e2dd;--bg:#fbfbf9;--ok:#2f7d4f;--okb:#e6f4ec;--q:#1c6f8c;--qb:#e2f1f7;--w:#a3600a;--wb:#fdf1dc;--n:#6b6b66;--nb:#efeeea}
@media (prefers-color-scheme:dark){:root{--ink:#ecebe6;--muted:#a09f98;--line:#34332f;--bg:#151514;--ok:#7fd3a0;--okb:#1d3327;--q:#7cc8e3;--qb:#17303a;--w:#f2b45c;--wb:#3a2c14;--n:#b5b4ad;--nb:#2a2a27}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
.cover{position:relative;min-height:320px;background:#1b2436;color:#fff;display:flex;align-items:flex-end;overflow:hidden}
.cover-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.cover .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,14,24,.85),rgba(10,14,24,.35) 60%,rgba(10,14,24,0))}
.cover .t{position:relative;padding:32px 40px;max-width:760px}.cover h1{margin:0 0 8px;font-size:30px;line-height:1.2}.cover p{margin:0;opacity:.9}
.badge{display:inline-block;margin-top:12px;font-size:12px;padding:3px 8px;border-radius:4px;background:rgba(255,255,255,.18)}
main{max-width:1100px;margin:0 auto;padding:24px 20px 60px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin:32px 0 10px}
.kpis{display:flex;flex-wrap:wrap;gap:10px}.kpi{padding:6px 12px;border-radius:999px;font-weight:600;font-size:14px}
.s-supported{background:var(--okb);color:var(--ok)}.s-qualified{background:var(--qb);color:var(--q)}.s-unresolved{background:var(--wb);color:var(--w)}.s-insufficient,.s-pending{background:var(--nb);color:var(--n)}
.wrap{overflow-x:auto}table{border-collapse:separate;border-spacing:4px;width:100%}th{text-align:left;font-size:13px;color:var(--muted);font-weight:500;padding:4px 8px}
tbody th{color:var(--ink);font-weight:600;white-space:nowrap}.matrix td{padding:10px;border-radius:8px;font-size:14px;vertical-align:top}.i{font-weight:700}
.callout{border-radius:10px;padding:12px 16px;margin:10px 0}.callout h3{margin:0 0 6px;font-size:15px}.callout p,.callout li{color:var(--ink)}.callout ul{margin:6px 0 0;padding-left:18px}
.src{color:var(--muted);font-size:13px}a{color:inherit}.sources td{padding:6px 8px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:top}
.note{color:var(--muted);font-size:13px}.cards{display:flex;flex-wrap:wrap;gap:14px}.cards figure{margin:0;width:150px;text-align:center}.cards img{width:150px;height:150px;border-radius:12px;object-fit:cover;display:block}.cards figcaption{font-size:13px;font-weight:600;margin-top:6px}video{width:100%;max-width:720px;border-radius:10px;display:block;margin-top:8px}
</style></head><body>
<header class="cover">${cover}<div class="shade"></div><div class="t"><h1>${esc(b.goal ?? b.runId)}</h1>
<p>Continuum evidence brief · run ${esc(b.runId)} · revision ${esc(b.latestRevision)} · generated ${esc(b.generatedAt)}</p>
${media.cover ? '<span class="badge">Cover: AI-generated illustration (FLUX). All data below is rendered from stored evidence.</span>' : ''}</div></header>
<main>
${media.cards?.length ? `<h2>Candidates</h2><div class="cards">${media.cards.map(c => `<figure><img src="${c.dataUri}" alt="Decorative AI-generated emblem (FLUX); contains no data"><figcaption>${esc(c.entity)}</figcaption></figure>`).join('')}</div><p class="note">Emblems are decorative AI illustrations (FLUX.2 [klein]); they carry no information about the models.</p>` : ''}
<h2>Answer at a glance</h2>
<div class="kpis">${(['supported', 'qualified', 'unresolved', 'insufficient', 'pending'] as const).filter(k => b.totals[k])
    .map(k => `<span class="kpi s-${k}">${ICON[k]} ${b.totals[k]} ${k}</span>`).join('')}</div>
<div class="wrap" style="margin-top:12px">${matrix}</div>
<p class="note">✓ two or more distinct source hosts agree (agreement, not proof of truth) · ◐ values differ by a condition one source states · ⚠ stored values disagree · ? fewer than two hosts</p>
<h2>What is uncertain, and why</h2>${callouts}
<h2>How we know</h2>
<p>${stats.evidence} quoted observations from ${stats.hosts} distinct source hosts across ${stats.claims} claims (${stats.snippet} from search snippets, ${stats.fullPage} from full pages).
${stats.sessions > 1 ? `The run spanned ${stats.sessions} process sessions, each resuming from RawTree,` : 'The run completed in one process session,'} with ${stats.failures} failed attempt(s) and ${stats.retries} recorded retry decision(s),
${stats.followUps} contradiction follow-up(s), and ${stats.pageFailures} page fetch(es) that failed and were skipped. Every value above links to an exact stored quote.</p>
<div class="wrap"><table class="sources"><thead><tr><th>Claim</th><th>Verdict</th><th>Sources</th></tr></thead><tbody>${sources}</tbody></table></div>
${media.video ? `<h2>Pitch video (AI-generated, illustrative only)</h2><video controls preload="metadata" src="${esc(media.video.href)}"></video>` : ''}
<h2>Provenance</h2><ul class="note"><li>Evidence: Nimble search and page extraction; observations extracted by Liquid LFM2.5 with exact-quote grounding; decisions by deterministic verification; stored append-only in RawTree.</li>${provenance}
<li>Generated media contain no facts from this run; prompts are built by code and exclude text, numbers, and names.</li></ul>
</main></body></html>`;
}
