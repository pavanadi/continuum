import type { Decision, Evidence, ResearchProvider, Task } from './types.ts';
import { admissible, coversAllGroups, groupValues, namedGroups } from './normalize.ts';

export class Researcher {
  async run(task: Task, provider: ResearchProvider): Promise<Evidence[]> {
    return task.focus ? provider.search(task.claimKey, 'resolve', task.id, task.focus)
      : provider.search(task.claimKey, 'support', task.id);
  }
}

export class Skeptic {
  async run(task: Task, provider: ResearchProvider): Promise<Evidence[]> {
    return provider.search(task.claimKey, 'challenge', task.id);
  }
}

export class Verifier {
  run(task: Task, evidence: Evidence[]): Decision {
    // Stored evidence is re-checked against today's type rules; excluded items stay stored but do not vote.
    const stored = evidence.filter(item => item.claimKey === task.claimKey);
    const relevant = stored.filter(item => admissible(task.claimKey, item.value, item.quote ?? item.value));
    const excluded = stored.length - relevant.length;
    const note = excluded ? ` ${excluded} stored observation(s) excluded by current type checks.` : '';
    const evidenceIds = [...new Set(relevant.map(item => item.id))];
    // Different spellings of one fact (128K vs 131,072 tokens) are grouped; raw values stay in the evidence.
    const groups = groupValues(task.claimKey, relevant.map(item => item.value));
    // Pages on one publisher's host are not independent corroboration.
    const sources = new Set(relevant.map(item => {
      try { return new URL(item.sourceUrl).hostname.replace(/^www\./, ''); }
      catch { return item.sourceUrl; }
    }));

    // A changed observation from the same source is still a disagreement.
    // Freshness alone cannot establish that an earlier claim was superseded.
    // One quote stating every disagreeing value under its own condition explains the disagreement.
    const reconciling = groups.length > 1 ? relevant.find(item => item.quote && coversAllGroups(task.claimKey, item.quote, groups)) : undefined;
    if (reconciling) {
      const oneHost = sources.size < 2 ? ' Only one source host is stored for this claim, so this is not independently confirmed.' : '';
      return {
        claimKey: task.claimKey,
        status: 'qualified',
        evidenceIds,
        reason: `Values differ by stated condition (${namedGroups(task.claimKey, groups).map(g => g.label).join(' vs ')}). ` +
          `${new URL(reconciling.sourceUrl).hostname.replace(/^www\./, '')} states them together: "${reconciling.quote!.slice(0, 240)}".${oneHost}${note}`,
        groups,
      };
    }
    if (groups.length > 1) {
      return {
        claimKey: task.claimKey,
        status: 'unresolved',
        evidenceIds,
        reason: `Stored observations disagree after normalization (${groups.map(g => g.label).join(' vs ')}). ` +
          'Preserve all values until further evidence resolves the difference.' + note,
        groups,
      };
    }
    const spellings = groups[0]?.values.length > 1
      ? ` Equivalent spellings normalized as ${groups[0].label}: ${groups[0].values.join(' / ')}.` : '';

    if (relevant.length > 0 && sources.size >= 2) {
      return {
        claimKey: task.claimKey,
        status: 'supported',
        value: relevant[0].value,
        evidenceIds,
        reason: `${sources.size} distinct source hosts agree. This is source agreement, not a guarantee of independence or truth.${spellings}${note}`,
        groups,
      };
    }

    return {
      claimKey: task.claimKey,
      status: 'insufficient',
      evidenceIds,
      reason: (relevant.length === 0
        ? 'No evidence has been stored for this claim.'
        : 'Only one distinct source host supports this claim; repeated pages on one host do not add corroboration.') + note,
      ...(groups.length ? { groups } : {}),
    };
  }
}
