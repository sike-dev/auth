import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeftIcon } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { messageFor } from '@/lib/errors'
import { safeNextPath, withNext } from '@/lib/redirects'
import { supabase } from '@/lib/supabase'
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/validation'

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } })

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL('/auth/confirm', window.location.origin).href,
      })
      if (error) throw error
      // Supabase answers the same way for unknown addresses, so this never reveals who has an account.
      navigate('/check-email?kind=reset', { replace: true })
    } catch (error) {
      setFormError(messageFor(error))
    }
  })

  return (
    <AuthLayout
      title="Reset your password"
      description="Enter your account email. We’ll send you a link to choose a new password."
      footer={
        <Link
          to={withNext('/login', next)}
          className="inline-flex items-center gap-1.5 rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden /> Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
        <FieldGroup className="gap-4">
          <FormAlert>{formError}</FormAlert>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
            <Input
              id="forgot-email"
              type="email"
              className="h-10"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'forgot-email-error' : undefined}
              {...register('email')}
            />
            <FieldError id="forgot-email-error" errors={[errors.email]} />
          </Field>
          <Button type="submit" size="lg" className="mt-1 h-10 w-full font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Spinner /> Sending…
              </>
            ) : (
              'Send reset link'
            )}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
