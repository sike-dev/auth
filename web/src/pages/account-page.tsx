import { LogOutIcon, MonitorSmartphoneIcon } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { FullPageStatus } from '@/components/full-page-status'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useSession } from '@/hooks/use-session'

export function AccountPage() {
  const session = useSession()
  const [params] = useSearchParams()

  if (session.status === 'loading') return <FullPageStatus label="Loading your account…" />
  if (session.status === 'signed_out') return <Navigate to="/login" replace />

  const { email } = session.user
  const notice = params.get('confirmed')
    ? 'Your email is confirmed. Welcome to Sike.'
    : params.get('password') === 'updated'
      ? 'Your password has been updated.'
      : null

  return (
    <AuthLayout title="Your Sike account" description="You’re signed in. Sike apps will sign you in automatically.">
      <div className="flex flex-col gap-5">
        <FormAlert tone="success">{notice}</FormAlert>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate font-medium">{email ?? '—'}</dd>
        </dl>

        <Separator />

        <div className="flex flex-col gap-2">
          <Button asChild variant="outline" size="lg" className="h-10 w-full justify-start gap-2.5">
            <Link to="/logout">
              <LogOutIcon aria-hidden /> Sign out
            </Link>
          </Button>
          <Button asChild variant="destructive" size="lg" className="h-10 w-full justify-start gap-2.5">
            <Link to="/logout?scope=global">
              <MonitorSmartphoneIcon aria-hidden /> Sign out of all apps and devices
            </Link>
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
