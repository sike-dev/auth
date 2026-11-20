import { describe, expect, it } from 'vitest'

import raw from '../../.env.production?raw'

// web/.env.production is committed so every deploy builds with the same values.
// Everything in it ends up in the public JavaScript, so it may hold public values only.

function parse(text: string): Record<string, string> {
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at), line.slice(at + 1).trim()] as const
    })
  return Object.fromEntries(entries)
}

const env = parse(raw)

describe('web/.env.production', () => {
  it('defines only VITE_ variables', () => {
    expect(Object.keys(env).length).toBeGreaterThan(0)
    for (const name of Object.keys(env)) expect(name).toMatch(/^VITE_[A-Z_]+$/)
  })

  it('contains no secret-looking values', () => {
    expect(raw).not.toMatch(/sb_secret_|sbp_|\bre_[A-Za-z0-9]{10,}|service_role|eyJ[A-Za-z0-9_-]{10,}|PRIVATE KEY/)
  })

  it('points at a Supabase project over https with a publishable key', () => {
    expect(env.VITE_SUPABASE_URL).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co$/)
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/)
  })

  it('allows only https app origins for return after sign-out', () => {
    const origins = (env.VITE_LOGOUT_RETURN_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
    for (const origin of origins) {
      const url = new URL(origin)
      expect(url.protocol).toBe('https:')
      expect(url.origin).toBe(origin)
    }
  })
})
