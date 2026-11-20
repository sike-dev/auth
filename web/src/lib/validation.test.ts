import { describe, expect, it } from 'vitest'

import { meetsPasswordRules, MIN_PASSWORD_LENGTH, newPasswordSchema, signInSchema, signUpSchema } from '@/lib/validation'

describe('signUpSchema', () => {
  const valid = { email: '  jane@example.com ', password: 'secret' }

  it('trims the email', () => {
    expect(signUpSchema.parse(valid).email).toBe('jane@example.com')
  })

  it.each([[''], ['nope'], ['jane@'], ['@example.com'], ['jane example@x.com']])('rejects email "%s"', (email) => {
    expect(signUpSchema.safeParse({ ...valid, email }).success).toBe(false)
  })

  it('rejects a password shorter than the minimum, with a clear message', () => {
    const result = signUpSchema.safeParse({ ...valid, password: 'abcde' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Use at least 6 characters.')
  })
})

describe('signInSchema', () => {
  it('requires both fields', () => {
    expect(signInSchema.safeParse({ email: '', password: '' }).success).toBe(false)
    expect(signInSchema.safeParse({ email: 'jane@example.com', password: '' }).success).toBe(false)
  })

  it('does not apply the minimum length (existing accounts may predate it)', () => {
    expect(signInSchema.safeParse({ email: 'jane@example.com', password: 'x' }).success).toBe(true)
  })
})

describe('password rules', () => {
  it('uses the Supabase minimum of 6', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6)
  })

  it.each([
    ['', false],
    ['abcde', false],
    ['abcdef', true],
    ['alllowercase', true],
    ['123456', true],
    ['has space!', true],
  ])('%j -> %s (no uppercase, number or symbol needed)', (password, expected) => {
    expect(meetsPasswordRules(password)).toBe(expected)
  })

  it('requires matching confirmation', () => {
    const result = newPasswordSchema.safeParse({ password: 'secret1', confirm: 'secret2' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['confirm'])
  })
})
