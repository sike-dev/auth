import { describe, expect, it } from 'vitest'

import headersRaw from '../../public/_headers?raw'
import vercelRaw from '../../vercel.json?raw'

// Production runs on Vercel, which ignores public/_headers and only knows how to fall back to
// index.html when told to. vercel.json is that instruction. These tests keep it in step with _headers.

type Header = { key: string; value: string }
type VercelConfig = {
  rewrites?: { source: string; destination: string }[]
  headers?: { source: string; headers: Header[] }[]
}

const vercel = JSON.parse(vercelRaw) as VercelConfig

function parseHeadersFile(text: string): Record<string, string> {
  const entries = text
    .split('\n')
    .filter((line) => /^\s+\S/.test(line) && !line.trim().startsWith('#'))
    .map((line) => {
      const at = line.indexOf(':')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()] as const
    })
  return Object.fromEntries(entries)
}

const fromHeadersFile = parseHeadersFile(headersRaw)
const sent = Object.fromEntries(
  (vercel.headers ?? []).filter((rule) => rule.source === '/(.*)').flatMap((rule) => rule.headers).map((h) => [h.key, h.value]),
)

describe('web/vercel.json', () => {
  it('serves index.html for every route that is not a real file', () => {
    expect(vercel.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' })
  })

  it.each([
    'Content-Security-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ])('sends %s exactly as public/_headers defines it', (name) => {
    expect(fromHeadersFile[name]).toBeTruthy()
    expect(sent[name]).toBe(fromHeadersFile[name])
  })

  it('keeps the framing ban in the policy', () => {
    expect(sent['Content-Security-Policy']).toContain("frame-ancestors 'none'")
  })

  it('leaves HSTS to Vercel, which already sends a longer max-age', () => {
    expect(sent['Strict-Transport-Security']).toBeUndefined()
  })
})
