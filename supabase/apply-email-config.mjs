// Applies Resend SMTP settings and the branded email templates to a Supabase project.
// Usage (from the repo root):  node --env-file=.env supabase/apply-email-config.mjs
// Needs in the environment: SUPABASE_URL, SUPABASE_ACCESS_TOKEN, RESEND_API_KEY
// Optional: MAIL_FROM (default no-reply@mail.sike.dev), MAIL_FROM_NAME (default Sike)
import { readFileSync } from 'node:fs'

const { SUPABASE_URL, SUPABASE_ACCESS_TOKEN, RESEND_API_KEY } = process.env
const MAIL_FROM = process.env.MAIL_FROM ?? 'no-reply@mail.sike.dev'
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME ?? 'Sike'

for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_ACCESS_TOKEN, RESEND_API_KEY })) {
  if (!value) throw new Error(`Missing ${name}`)
}

const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
const read = (file) => readFileSync(new URL(`./email-templates/${file}`, import.meta.url), 'utf8')

const body = {
  smtp_host: 'smtp.resend.com',
  smtp_port: '465',
  smtp_user: 'resend',
  smtp_pass: RESEND_API_KEY,
  smtp_admin_email: MAIL_FROM,
  smtp_sender_name: MAIL_FROM_NAME,
}
for (const name of ['confirmation', 'recovery', 'email_change']) {
  body[`mailer_subjects_${name}`] = read(`${name}.subject.txt`).trim()
  body[`mailer_templates_${name}_content`] = read(`${name}.html`)
}

const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const result = await response.json()
if (!response.ok) {
  console.error('Failed:', result.message ?? response.status)
  process.exit(1)
}
console.log(`Applied to ${ref}: SMTP ${result.smtp_host}:${result.smtp_port} from ${result.smtp_admin_email}, 3 templates.`)
