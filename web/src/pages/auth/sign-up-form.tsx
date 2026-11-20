import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router'

import { FormAlert } from '@/components/form-alert'
import { PasswordInput } from '@/components/password-input'
import { PasswordRules } from '@/components/password-rules'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { messageFor } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { signUpSchema, type SignUpValues } from '@/lib/validation'

export function SignUpForm({ next }: { next: string }) {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema), defaultValues: { email: '', password: '' } })
  const password = useWatch({ control, name: 'password' })

  const onSubmit = handleSubmit(async (raw) => {
    setFormError(null)
    const values = signUpSchema.parse(raw)
    const redirect = new URL('/auth/confirm', window.location.origin)
    if (next !== '/') redirect.searchParams.set('next', next)

    try {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: { emailRedirectTo: redirect.href },
      })
      if (error) throw error
      // Same screen whether the address is new or already registered, so this
      // form can’t be used to find out who has an account.
      navigate(`/check-email?kind=signup&email=${encodeURIComponent(values.email)}`, { replace: true })
    } catch (error) {
      setFormError(messageFor(error))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={isSubmitting}>
      <FieldGroup className="gap-4">
        <FormAlert>{formError}</FormAlert>

        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            className="h-10"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'signup-email-error' : undefined}
            {...register('email')}
          />
          <FieldError id="signup-email-error" errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="signup-password">Password</FieldLabel>
          <PasswordInput
            id="signup-password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="signup-password-rules signup-password-error"
            {...register('password')}
          />
          <PasswordRules id="signup-password-rules" password={password} />
          <FieldError id="signup-password-error" errors={[errors.password]} />
        </Field>

        <Button type="submit" size="lg" className="mt-1 h-10 w-full font-semibold" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner /> Creating account…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </FieldGroup>
    </form>
  )
}
