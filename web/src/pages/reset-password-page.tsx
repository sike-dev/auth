import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FormAlert } from '@/components/form-alert'
import { FullPageStatus } from '@/components/full-page-status'
import { PasswordInput } from '@/components/password-input'
import { PasswordRules } from '@/components/password-rules'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useSession } from '@/hooks/use-session'
import { messageFor } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { newPasswordSchema, type NewPasswordValues } from '@/lib/validation'

export function ResetPasswordPage() {
  const session = useSession()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirm: '' } })
  const password = useWatch({ control, name: 'password' })

  if (session.status === 'loading') return <FullPageStatus label="Checking your link…" />

  if (session.status === 'signed_out') {
    return (
      <AuthLayout title="Reset link needed" description="Open the reset link from your email to choose a new password.">
        <Button asChild size="lg" className="h-10 w-full font-semibold">
          <Link to="/forgot-password">Send a reset link</Link>
        </Button>
      </AuthLayout>
    )
  }

  const onSubmit = handleSubmit(async ({ password: newPassword }) => {
    setFormError(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      navigate('/?password=updated', { replace: true })
    } catch (error) {
      setFormError(messageFor(error))
    }
  })

  return (
    <AuthLayout
      title="Choose a new password"
      description={
        session.user.email ? (
          <>
            For <span className="font-medium text-foreground">{session.user.email}</span>
          </>
        ) : undefined
      }
    >
      <form onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
        <FieldGroup className="gap-4">
          <FormAlert>{formError}</FormAlert>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={!!errors.password}
              aria-describedby="new-password-rules new-password-error"
              {...register('password')}
            />
            <PasswordRules id="new-password-rules" password={password} />
            <FieldError id="new-password-error" errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              aria-describedby="confirm-password-error"
              {...register('confirm')}
            />
            <FieldError id="confirm-password-error" errors={[errors.confirm]} />
          </Field>
          <Button type="submit" size="lg" className="mt-1 h-10 w-full font-semibold" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              'Save new password'
            )}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
