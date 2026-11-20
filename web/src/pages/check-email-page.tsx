import { MailIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'

export function CheckEmailPage() {
  const [params] = useSearchParams()
  const isReset = params.get('kind') === 'reset'
  const email = params.get('email')

  return (
    <AuthLayout
      title="Check your email"
      description={
        isReset
          ? 'If that account exists, we’ve sent a link to reset its password.'
          : (
              <>
                We’ve sent a confirmation link to{' '}
                {email ? <span className="font-medium text-foreground">{email}</span> : 'your email address'}. Open it to
                finish creating your account.
              </>
            )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <MailIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p>
            The link expires in 1 hour. Don’t see it? Check your spam folder, or wait a minute before asking for another.
          </p>
        </div>
        <Button asChild variant="outline" size="lg" className="h-10 w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </div>
    </AuthLayout>
  )
}
