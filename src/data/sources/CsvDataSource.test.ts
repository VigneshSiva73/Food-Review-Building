// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CsvDataSource } from './CsvDataSource'

const source = new CsvDataSource('/data/food-reviews.csv')

function mockFetch(response: Partial<Response> & { text: () => Promise<string> }) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/csv' }),
    ...response,
  }))
}

afterEach(() => vi.unstubAllGlobals())

describe('CsvDataSource', () => {
  it('returns the body for a successful CSV response', async () => {
    mockFetch({ text: async () => 'date,meal type\n' })
    await expect(source.fetchText()).resolves.toBe('date,meal type\n')
  })

  it('reports HTTP failures with the status code', async () => {
    mockFetch({ ok: false, status: 404, text: async () => '' })
    await expect(source.fetchText()).rejects.toThrow(/HTTP 404/)
  })

  it('detects an SPA fallback page served in place of a missing dataset', async () => {
    mockFetch({
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<!doctype html><html></html>',
    })
    await expect(source.fetchText()).rejects.toThrow(/probably missing from the server/)
  })

  it('detects HTML by shape even when the content type lies', async () => {
    mockFetch({ text: async () => '  <!doctype html>' })
    await expect(source.fetchText()).rejects.toThrow(/Expected a CSV file/)
  })

  it('turns a network failure into a readable message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(source.fetchText()).rejects.toThrow(/Could not reach/)
  })
})
