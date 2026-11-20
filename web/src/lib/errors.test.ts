import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/validation', () => ({ MIN_PASSWORD_LENGTH: 10 }))

import { messageFor } from '@/lib/errors'

describe('messageFor', () => {
  it('states the configured minimum password length for weak_password', () => {
    expect(messageFor({ code: 'weak_password' })).toBe('Use at least 10 characters.')
  })

  it('keeps sign-in failures generic', () => {
    expect(messageFor({ code: 'invalid_credentials' })).toBe('Email or password is incorrect.')
  })
})
