import { describe, expect, it } from 'vitest'

import { parseOrigins, safeNextPath, safeReturnTo, withNext } from '@/lib/redirects'

describe('safeNextPath', () => {
  it('keeps same-site paths with query and hash', () => {
    expect(safeNextPath('/oauth/consent?authorization_id=abc')).toBe('/oauth/consent?authorization_id=abc')
    expect(safeNextPath('/account#top')).toBe('/account#top')
  })

  it.each([
    ['https://evil.example/'],
    ['//evil.example/path'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['evil.example'],
    [''],
    [null],
    [undefined],
  ])('falls back for %s', (value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('uses the given fallback', () => {
    expect(safeNextPath('https://evil.example', '/login')).toBe('/login')
  })
})

describe('safeReturnTo', () => {
  const allowed = parseOrigins('https://app.example.com, http://localhost:5173, not a url')

  it('parses only valid origins', () => {
    expect(allowed).toEqual(['https://app.example.com', 'http://localhost:5173'])
  })

  it('allows URLs on allow-listed origins', () => {
    expect(safeReturnTo('https://app.example.com/signed-out?x=1', allowed)).toBe('https://app.example.com/signed-out?x=1')
  })

  it.each([
    ['https://app.example.com.evil.example/'],
    ['https://evil.example/?https://app.example.com'],
    ['javascript:alert(1)'],
    ['/relative'],
    [null],
  ])('rejects %s', (value) => {
    expect(safeReturnTo(value, allowed)).toBeNull()
  })
})

describe('withNext', () => {
  it('omits the default destination', () => {
    expect(withNext('/login', '/')).toBe('/login')
    expect(withNext('/login', null)).toBe('/login')
  })

  it('encodes the next path', () => {
    expect(withNext('/login', '/oauth/consent?authorization_id=a&b=c')).toBe(
      '/login?next=%2Foauth%2Fconsent%3Fauthorization_id%3Da%26b%3Dc',
    )
  })
})
