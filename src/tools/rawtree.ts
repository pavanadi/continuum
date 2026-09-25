export interface RawTreeTransport {
  hasTable(table: string): Promise<boolean>;
  insert(table: string, record: Record<string, unknown>): Promise<void>;
  query(sql: string): Promise<Record<string, unknown>[]>;
}

export interface RawTreeOptions {
  apiKey: string;
  database?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  onUsage?: (event: Record<string, unknown>) => Promise<void>;
}

/** Documented RawTree HTTP API; deliberately no automatic write retries. */
export class RawTreeHttp implements RawTreeTransport {
  private options: RawTreeOptions;
  constructor(options: RawTreeOptions) {
    if (!options.apiKey.trim()) throw new Error('RAWTREE_API_KEY is required');
    const url = new URL(options.baseUrl ?? 'https://api.rawtree.com');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
      throw new Error('RawTree requires HTTPS except for local tests');
    }
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('RawTree base URL must be an origin without credentials');
    }
    this.options = { ...options, baseUrl: url.origin };
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    const url = new URL(path, this.options.baseUrl);
    if (this.options.database) url.searchParams.set('database', this.options.database);
    const method = body === undefined ? 'GET' : 'POST';
    const mode = ['localhost', '127.0.0.1'].includes(url.hostname) ? 'fixture' : 'live';
    await this.options.onUsage?.({ type: 'attempt', mode, method, path });
    let response: Response;
    try { response = await (this.options.fetch ?? fetch)(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${this.options.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30_000), redirect: 'error',
    }); } catch (error) {
      await this.options.onUsage?.({ type: 'outcome', mode, method, path, error: 'network_or_timeout' });
      throw error;
    }
    await this.options.onUsage?.({ type: 'outcome', mode, method, path, httpStatus: response.status });
    // Do not echo potentially sensitive remote response bodies.
    if (!response.ok) throw new Error(`RawTree ${path} failed (HTTP ${response.status})`);
    return response.json();
  }

  async hasTable(table: string): Promise<boolean> {
    const result = await this.request('/v1/tables') as { tables?: { name: string }[] };
    if (!Array.isArray(result.tables) || result.tables.some(t => !t || typeof t.name !== 'string')) {
      throw new Error('Malformed RawTree table listing');
    }
    return result.tables.some(t => t.name === table);
  }

  async insert(table: string, record: Record<string, unknown>): Promise<void> {
    await this.request(`/v1/tables/${encodeURIComponent(table)}`, record);
  }

  async query(sql: string): Promise<Record<string, unknown>[]> {
    const result = await this.request('/v1/query', { sql }) as { data?: Record<string, unknown>[] };
    if (!Array.isArray(result.data)) throw new Error('Malformed RawTree query response');
    return result.data;
  }
}
