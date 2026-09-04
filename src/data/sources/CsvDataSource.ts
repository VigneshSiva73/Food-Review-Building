import type { DataSource } from './DataSource'

/** Fetches the bundled CSV (or any CSV URL) over HTTP. */
export class CsvDataSource implements DataSource {
  readonly label: string
  private readonly url: string

  constructor(url: string) {
    this.url = url
    this.label = `CSV (${url})`
  }

  async fetchText(): Promise<string> {
    let res: Response
    try {
      res = await fetch(this.url)
    } catch (cause) {
      throw new Error(`Could not reach ${this.url}. Check your connection and try again.`, { cause })
    }
    if (!res.ok) {
      throw new Error(`Failed to load dataset from ${this.url}: HTTP ${res.status}`)
    }

    const text = await res.text()
    // Static hosts (and Vite's dev server) answer unknown paths with the SPA
    // shell rather than a 404, so a missing dataset arrives as HTML with a
    // 200. Detect that here for an honest message instead of a confusing
    // "missing column" parse error downstream.
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html') || /^\s*</.test(text)) {
      throw new Error(
        `Expected a CSV file at ${this.url} but received an HTML page — the dataset is probably missing from the server.`,
      )
    }
    return text
  }
}
