// Guards against open redirects: only same-site paths for `next`,
// and only allow-listed origins for `return_to` after sign-out.

export function safeNextPath(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  try {
    const url = new URL(value, 'http://placeholder.invalid')
    if (url.origin !== 'http://placeholder.invalid') return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

export function parseOrigins(list: string | undefined): string[] {
  return (list ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      try {
        return [new URL(entry).origin]
      } catch {
        return []
      }
    })
}

export function safeReturnTo(value: string | null | undefined, allowedOrigins: string[]): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return allowedOrigins.includes(url.origin) ? url.href : null
  } catch {
    return null
  }
}

export function withNext(path: string, next: string | null): string {
  if (!next || next === '/') return path
  return `${path}?next=${encodeURIComponent(next)}`
}
