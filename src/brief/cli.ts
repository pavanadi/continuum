import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { RawTreeHttp } from '../tools/rawtree.ts';
import { RawTreeFlight } from '../memory/flight.ts';
import { recordRawTreeUsage } from '../usage/ledger.ts';
import { runBundle } from '../inspector/server.ts';
import { FluxClient } from '../tools/flux.ts';
import { renderBrief, type BriefMedia } from './brief.ts';
import { cardRequests, coverRequest, pitchVideoRequest, videoRequest } from './prompts.ts';

// Usage: npm run brief -- <run-id> [--cover] [--cards] [--video | --video-hd]
const [runId, ...flags] = process.argv.slice(2);
if (!runId) throw new Error('Usage: npm run brief -- <run-id> [--cover] [--video]');
const transport = new RawTreeHttp({ apiKey: process.env.RAWTREE_API_KEY ?? '', baseUrl: process.env.RAWTREE_BASE_URL,
  database: process.env.RAWTREE_DATABASE ?? 'default', onUsage: recordRawTreeUsage });
const bundle = await runBundle(transport, runId);
const media: BriefMedia = {};
if (['--cover', '--cards', '--video', '--video-hd'].some(f => flags.includes(f))) {
  // Budgets are local UTC-day caps; video defaults to 0 so it is only generated when explicitly funded.
  const flux = new FluxClient({ apiKey: process.env.BFL_API_KEY ?? '',
    budgets: { image: Number(process.env.FLUX_IMAGE_BUDGET_USD ?? 0.25), video: Number(process.env.FLUX_VIDEO_BUDGET_USD ?? 0) },
    flight: new RawTreeFlight(transport, runId, process.env.RAWTREE_FLIGHT_TABLE ?? 'continuum_flight_v1') });
  if (flags.includes('--cover')) {
    const generation = await flux.generate(coverRequest(bundle));
    const file = generation.files.find(f => f.contentType.startsWith('image/'));
    if (!file) throw new Error('FLUX cover returned no image file');
    media.cover = { generation, dataUri: `data:${file.contentType};base64,${(await readFile(file.path)).toString('base64')}` };
    console.error(`cover: ${generation.cached ? 'cached' : 'generated'} (${generation.model}, reported ${generation.reportedCostUsd ?? '?'} USD)`);
  }
  if (flags.includes('--cards')) {
    media.cards = [];
    for (const { entity, request } of cardRequests(bundle)) {
      const generation = await flux.generate(request);
      const file = generation.files.find(f => f.contentType.startsWith('image/'));
      if (!file) throw new Error(`FLUX card for ${entity} returned no image`);
      media.cards.push({ entity, generation, dataUri: `data:${file.contentType};base64,${(await readFile(file.path)).toString('base64')}` });
      console.error(`card ${entity}: ${generation.cached ? 'cached' : 'generated'} (reported ${generation.reportedCostUsd ?? '?'} USD)`);
    }
  }
  if (flags.includes('--video') || flags.includes('--video-hd')) {
    // --video-hd is the 12 s full render; --video is the 6 s draft. Both stay cached separately.
    const generation = await flux.generate(flags.includes('--video-hd') ? pitchVideoRequest() : videoRequest());
    const file = generation.files.find(f => f.contentType.startsWith('video/') || f.path.endsWith('.mp4'));
    console.error(`video: ${generation.cached ? 'cached' : 'generated'} (${generation.model}, reported ${generation.reportedCostUsd ?? '?'} USD; files: ${generation.files.map(f => f.contentType).join(', ')})`);
    if (file) {
      await mkdir('exports/media', { recursive: true });
      const name = `${runId}-${flags.includes('--video-hd') ? 'hd-' : ''}${basename(file.path)}`;
      await copyFile(file.path, `exports/media/${name}`);
      media.video = { generation, href: `media/${name}` };
    } else console.error('video: no playable video in the result (draft may return only a cache file); brief omits it');
  }
}
await mkdir('exports', { recursive: true });
const out = `exports/${runId}-brief.html`;
await writeFile(out, renderBrief(bundle, media));
console.log(JSON.stringify({ brief: out, cover: Boolean(media.cover), video: Boolean(media.video), totals: bundle.totals }, null, 2));
