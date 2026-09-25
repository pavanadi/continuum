import type { Bundle } from '../inspector/bundle.ts';
import type { GenerationRequest } from '../tools/flux.ts';

/**
 * Deterministic FLUX prompts. They describe mood and subject only: no model names, values, verdicts,
 * or text in the image, so generated pixels can never state (or misstate) a fact from the run.
 */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const NO_TEXT = 'Absolutely no text, letters, numbers, logos, labels, charts, or user-interface elements.';

export function coverRequest(bundle: Bundle, seed = 4625): GenerationRequest {
  const count = WORDS[bundle.entities.length] ?? 'several';
  return {
    kind: 'image', model: 'flux-2-pro', estimateUsd: 0.05,
    body: {
      prompt: [
        `Editorial cover illustration for a research brief comparing ${count} small on-device AI language models.`,
        'Small translucent processor chips resting on a clean pale desk, each linked by fine glowing threads to neat stacks of paper',
        'documents and index cards, suggesting evidence gathered, checked, and filed. One thread is frayed and knotted, hinting at an open question.',
        'Calm, precise, modern editorial style; soft daylight; deep blue and warm amber palette; generous empty space on the left for a title.',
        NO_TEXT,
      ].join(' '),
      width: 1280, height: 720, seed, output_format: 'jpeg', safety_tolerance: 2,
    },
  };
}

export function videoRequest(): GenerationRequest {
  // The FLUX 3 schema lists no seed field, so none is sent. Draft mode is the only tier within the approved video budget (6 s × $0.06/s ≈ $0.36).
  return {
    kind: 'video', model: 'flux-3-video', estimateUsd: 0.36,
    body: {
      mode: 't2v', duration: 6, resolution: 'hd', aspect_ratio: '16:9', draft: true, generate_audio: true, safety_tolerance: 2,
      prompt: [
        'A calm cinematic sequence on a clean desk at night: a small glowing chip sends threads of light out to drifting translucent web pages;',
        'fragments of light return and settle into an orderly stack of cards. The desk lamp flickers off and on again, and the stack is still there, untouched.',
        'The camera slowly pulls back to reveal a neatly organized archive of glowing cards. Deep blue and warm amber palette, shallow depth of field.',
        'Soft ambient electronic music only; no voices, no speech, no narration.', NO_TEXT,
      ].join(' '),
    },
  };
}

// Decorative identity cards: one deterministic palette and motif per position, never a model name or property.
const CARD_STYLES = [
  ['deep cobalt blue', 'concentric ripples of light'], ['warm amber', 'a lattice of fine threads'],
  ['teal and seafoam', 'folded paper facets'], ['soft violet', 'a spiral of small beads'],
  ['copper and rust', 'layered translucent panes'], ['emerald green', 'a braid of luminous fibres'],
  ['graphite and silver', 'a constellation of tiny points'], ['coral red', 'stacked rounded tiles'],
];

export function cardRequests(bundle: Bundle, seed = 4625): { entity: string; request: GenerationRequest }[] {
  return bundle.entities.slice(0, CARD_STYLES.length).map((entity, i) => ({
    entity,
    request: {
      kind: 'image', model: 'flux-2-klein-9b', estimateUsd: 0.02,
      body: {
        prompt: [
          `Minimal abstract emblem: a single small translucent processor chip at the centre, surrounded by ${CARD_STYLES[i][1]},`,
          `${CARD_STYLES[i][0]} glow on a clean dark background, soft studio lighting, crisp and elegant, square composition.`,
          NO_TEXT,
        ].join(' '),
        width: 512, height: 512, seed: seed + i, output_format: 'jpeg', safety_tolerance: 2,
      },
    },
  }));
}

export function pitchVideoRequest(): GenerationRequest {
  // Full-render HD, 12 s: 12 × $0.17/s ≈ $2.04 at list price (user-approved).
  return {
    kind: 'video', model: 'flux-3-video', estimateUsd: 2.04,
    body: {
      mode: 't2v', duration: 12, resolution: 'hd', aspect_ratio: '16:9', draft: false, generate_audio: true, safety_tolerance: 2,
      prompt: [
        'A calm, cinematic sequence in one continuous camera move. Night, a clean desk lit by a single warm lamp.',
        'A small glowing processor chip sends fine threads of light outward to translucent web pages drifting in the dark;',
        'fragments of light travel back along the threads and settle into an orderly stack of cards beside the chip.',
        'Two threads cross and knot; the chip pauses and sends a new thread that untangles them.',
        'The lamp flickers off; darkness; the lamp comes back on and the stack of cards is still there, untouched.',
        'The camera slowly rises to reveal a neatly organized archive of softly glowing cards stretching into the distance.',
        'Deep blue and warm amber palette, shallow depth of field, gentle motion.',
        'Soft ambient electronic music only; no voices, no speech, no narration.', NO_TEXT,
      ].join(' '),
    },
  };
}
