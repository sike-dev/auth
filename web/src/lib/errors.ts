const messages: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  email_not_confirmed: 'Confirm your email first. Check your inbox for the link we sent.',
  weak_password: 'Use at least 6 characters.',
  same_password: 'Choose a password you haven’t used for this account.',
  over_email_send_rate_limit: 'We’ve sent too many emails recently. Try again in a little while.',
  over_request_rate_limit: 'Too many attempts. Wait a minute and try again.',
  email_address_invalid: 'Enter a valid email address.',
  signup_disabled: 'New accounts are closed right now.',
  session_not_found: 'Your link has expired. Request a new one.',
  otp_expired: 'This link has expired or was already used. Request a new one.',
  captcha_failed: 'We couldn’t verify you’re human. Please try again.',
}

const NETWORK = 'Can’t reach the server. Check your connection and try again.'
const GENERIC = 'Something went wrong on our side. Please try again.'

type ErrorLike = { code?: string; name?: string; status?: number; message?: string }

export function messageFor(error: unknown): string {
  const e = (error ?? {}) as ErrorLike
  if (e.code && messages[e.code]) return messages[e.code]
  if (e.status === 429) return messages.over_request_rate_limit
  if (e.name === 'AuthRetryableFetchError' || error instanceof TypeError) return NETWORK
  return GENERIC
}
