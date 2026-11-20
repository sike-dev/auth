import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { FullPageStatus } from '@/components/full-page-status'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { withNext } from '@/lib/redirects'
import { supabase } from '@/lib/supabase'

// Supabase's OAuth server sends apps here with ?authorization_id=…
// Every OAuth client is first-party (dynamic registration is off), so we approve
// without asking. Add a real consent screen before registering any third-party client.
export function ConsentPage() {
  const session = useSession()
  const [params] = useSearchParams()
  const authorizationId = params.get('authorization_id')
  const [appName, setAppName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (session.status !== 'signed_in' || !authorizationId || started.current) return
    started.current = true

    const run = async () => {
      const details = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (details.error || !details.data) throw details.error ?? new Error('missing details')

      // Already approved earlier: Supabase hands back the redirect directly.
      if (!('authorization_id' in details.data)) {
        window.location.replace(details.data.redirect_url)
        return
      }

      setAppName(details.data.client.name)
      const approval = await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (approval.error || !approval.data) throw approval.error ?? new Error('approval failed')
      window.location.replace(approval.data.redirect_url)
    }

    run().catch(() => setError('This sign-in request has expired or isn’t valid. Go back to the app and try again.'))
  }, [session.status, authorizationId])

  if (!authorizationId) {
    return (
      <AuthLayout title="Nothing to approve" description="This page is opened by Sike apps during sign-in.">
        <Button asChild variant="outline" size="lg" className="h-10 w-full">
          <Link to="/">Go to your account</Link>
        </Button>
      </AuthLayout>
    )
  }

  if (session.status === 'loading') return <FullPageStatus label="Checking your session…" />
  if (session.status === 'signed_out') {
    const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`
    return <Navigate to={withNext('/login', here)} replace />
  }

  if (error) {
    return (
      <AuthLayout title="Couldn’t finish signing in">
        <div className="flex flex-col gap-5">
          <FormAlert>{error}</FormAlert>
          <Button asChild variant="outline" size="lg" className="h-10 w-full">
            <Link to="/">Go to your account</Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return <FullPageStatus label={appName ? `Signing you in to ${appName}…` : 'Signing you in…'} />
}
