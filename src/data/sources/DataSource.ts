/**
 * Abstraction over where the raw review data comes from.
 * v1 ships a CSV source; an API/JSON/database source only needs to
 * implement this interface — the pipeline is agnostic.
 */
export interface DataSource {
  /** Returns raw CSV text (header + rows). */
  fetchText(): Promise<string>
  /** Human-readable origin, for error messages. */
  readonly label: string
}
