import { z } from 'zod'

// Supabase Auth refuses to go below 6 characters, so this is the lowest the site can ask for.
// Keep it in sync with "Minimum password length" in the Supabase project.
export const MIN_PASSWORD_LENGTH = 6

export function meetsPasswordRules(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

const emailField = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .pipe(z.email('Enter a valid email address.'))

const newPasswordField = z
  .string()
  .max(256, 'Use 256 characters or fewer.')
  .refine(meetsPasswordRules, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password.'),
})

export const signUpSchema = z.object({
  email: emailField,
  password: newPasswordField,
})

export const forgotPasswordSchema = z.object({
  email: emailField,
})

export const newPasswordSchema = z
  .object({
    password: newPasswordField,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords don’t match.' })

export type SignInValues = z.input<typeof signInSchema>
export type SignUpValues = z.input<typeof signUpSchema>
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>
export type NewPasswordValues = z.input<typeof newPasswordSchema>
