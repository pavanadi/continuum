export interface Evidence {
  id: string;
  claimKey: string;
  value: string;
  sourceUrl: string;
  observedAt: string;
  quote?: string;
  sourceDocumentId?: string;
  retrieval?: {
    provider: 'nimble';
    requestId: string;
    query: string;
    depth: 'lite';
    /** A page extract is a focused excerpt of the page fetched after its search hit. */
    sourceKind: 'search-result' | 'page-extract';
  };
  extraction?: {
    provider: 'openrouter' | 'local';
    requestedModel: string;
    model: string;
    requestId: string;
    promptVersion: string;
    costUsd?: number;
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  };
}

export interface Task {
  id: string;
  role: 'researcher' | 'skeptic' | 'verifier';
  claimKey: string;
  status: 'pending' | 'completed';
  /** Set on tasks planned from a contradiction; one follow-up round per claim. */
  followUp?: boolean;
  /** Search hint naming the disagreeing values, e.g. "32K tokens 128K tokens native extended". */
  focus?: string;
}

export type ResearchMode = 'support' | 'challenge' | 'resolve';

export interface Decision {
  claimKey: string;
  /** qualified: values differ, but one source states them together under different conditions. */
  status: 'supported' | 'unresolved' | 'insufficient' | 'qualified';
  value?: string;
  evidenceIds: string[];
  reason: string;
  /** Raw values grouped by deterministic normalization (src/agent/normalize.ts); absent on older decisions. */
  groups?: { label: string; values: string[]; kind?: string }[];
}

export interface State {
  runId: string;
  goal: string;
  tasks: Task[];
  evidence: Evidence[];
  decisions: Decision[];
}

export interface ResearchProvider {
  search(claimKey: string, mode: ResearchMode, taskId?: string, focus?: string): Promise<Evidence[]>;
}

export interface SourceDocument {
  id: string;
  url: string;
  observedAt: string;
  text: string;
  retrieval?: Evidence['retrieval'];
}

/** Nimble will implement this boundary; supplied text is data, never instructions. */
export interface SourceProvider {
  search(claimKey: string, mode: ResearchMode, focus?: string): Promise<SourceDocument[]>;
}
