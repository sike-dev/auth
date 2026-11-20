import { useEffect, useRef, useState } from 'react'
import type { EmailOtpType } from '@supabase/supabase-js'
import { Link, useNavigate } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { FullPageStatus } from '@/components/full-page-status'
import { Button } from '@/components/ui/button'
import { messageFor } from '@/lib/errors'
import { safeNextPath } from '@/lib/redirects'
import { supabase } from '@/lib/supabase'

type Outcome = { kind: 'working' } | { kind: 'error'; message: string; isRecovery: boolean }

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

// Handles every link we email:
//  - default templates:  #access_token=…&refresh_token=…&type=signup|recovery  (or #error=…)
//  - custom templates:   ?token_hash=…&type=…
async function completeFromUrl(url: URL): Promise<{ type: string | null }> {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const errorCode = hash.get('error_code') ?? url.searchParams.get('error_code')
  if (errorCode || hash.get('error') || url.searchParams.get('error')) {
    throw { code: errorCode ?? 'otp_expired' }
  }

  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) throw error
    return { type: hash.get('type') }
  }

  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) throw error
    return { type }
  }

  throw { code: 'otp_expired' }
}

export function ConfirmPage() {
  const navigate = useNavigate()
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'working' })
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const url = new URL(window.location.href)
    const isRecovery = (url.hash + url.search).includes('type=recovery')
    const next = safeNextPath(url.searchParams.get('next'))
    // Drop tokens from the address bar and history straight away.
    window.history.replaceState(null, '', url.pathname)

    completeFromUrl(url)
      .then(({ type }) => {
        if (type === 'recovery') navigate('/reset-password', { replace: true })
        else navigate(next === '/' ? '/?confirmed=1' : next, { replace: true })
      })
      .catch((error) => setOutcome({ kind: 'error', message: messageFor(error), isRecovery }))
  }, [navigate])

  if (outcome.kind === 'working') return <FullPageStatus label="Confirming your link…" />

  return (
    <AuthLayout title="This link didn’t work">
      <div className="flex flex-col gap-5">
        <FormAlert>{outcome.message}</FormAlert>
        {outcome.isRecovery ? (
          <Button asChild size="lg" className="h-10 w-full font-semibold">
            <Link to="/forgot-password">Send a new reset link</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            If you already confirmed your email, you can sign in. Otherwise, sign up again to get a fresh link.
          </p>
        )}
        <Button asChild variant="outline" size="lg" className="h-10 w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
