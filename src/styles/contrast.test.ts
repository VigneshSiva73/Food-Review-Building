import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Automated WCAG AA contrast check over the theme tokens (plan §34).
 * Reads the real stylesheet, so a palette tweak that hurts legibility fails
 * the suite rather than shipping.
 */

const css = readFileSync(join(__dirname, 'index.css'), 'utf8')

function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!match) throw new Error(`Token --color-${name} not found`)
  return match[1]
}

function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const h = hex.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

const SURFACES = ['surface-950', 'surface-900', 'surface-800', 'surface-700']
const TEXT = ['ink-100', 'ink-300', 'ink-500', 'accent-400']

describe('theme typography', () => {
  it('uses Poppins as the primary family, with real fallbacks', () => {
    const stack = /--font-sans:\s*([^;]+);/.exec(css)?.[1] ?? ''
    expect(stack).toMatch(/^'Poppins'/)
    // A missing webfont must still land on something sane.
    expect(stack).toMatch(/system-ui|sans-serif/)
  })
})

describe('theme contrast', () => {
  it.each(TEXT)('%s meets WCAG AA (4.5:1) on every surface', (fg) => {
    for (const bg of SURFACES) {
      expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('verifies the ratio formula against known extremes', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
})
