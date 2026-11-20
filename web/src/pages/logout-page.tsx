import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { FullPageStatus } from '@/components/full-page-status'
import { Button } from '@/components/ui/button'
import { parseOrigins, safeReturnTo } from '@/lib/redirects'
import { supabase } from '@/lib/supabase'

const RETURN_ORIGINS = parseOrigins(import.meta.env.VITE_LOGOUT_RETURN_ORIGINS)

// /logout                         sign out of the accounts site in this browser
// /logout?scope=global            sign out of every app on every device
// &return_to=<url>                go back to an allow-listed app afterwards
export function LogoutPage() {
  const [params] = useSearchParams()
  const global = params.get('scope') === 'global'
  const returnTo = safeReturnTo(params.get('return_to'), RETURN_ORIGINS)
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    supabase.auth
      .signOut({ scope: global ? 'global' : 'local' })
      .then(({ error }) => {
        // A missing session still counts as signed out.
        if (error && error.status !== 401 && error.code !== 'session_not_found') throw error
        if (returnTo) window.location.replace(returnTo)
        else setState('done')
      })
      .catch(() => setState('error'))
  }, [global, returnTo])

  if (state === 'working') return <FullPageStatus label="Signing you out…" />

  return (
    <AuthLayout
      title={state === 'error' ? 'Couldn’t sign you out everywhere' : 'You’re signed out'}
      description={
        state === 'error'
          ? undefined
          : global
            ? 'You’re signed out of every Sike app on all your devices.'
            : 'You’re signed out of your Sike account in this browser.'
      }
    >
      <div className="flex flex-col gap-5">
        {state === 'error' ? (
          <FormAlert>Check your connection and try again. You’re still signed out in this browser.</FormAlert>
        ) : null}
        <Button asChild size="lg" className="h-10 w-full font-semibold">
          <Link to="/login">Sign in again</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
