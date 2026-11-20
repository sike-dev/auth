import { CheckIcon, CircleIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { meetsPasswordRules, MIN_PASSWORD_LENGTH } from '@/lib/validation'

export function PasswordRules({ password, id }: { password: string; id?: string }) {
  const met = meetsPasswordRules(password)
  return (
    <p
      id={id}
      className={cn('flex items-center gap-1.5 text-xs transition-colors', met ? 'text-primary' : 'text-muted-foreground')}
    >
      {met ? <CheckIcon className="size-3.5" aria-hidden /> : <CircleIcon className="size-3" aria-hidden />}
      <span>
        At least {MIN_PASSWORD_LENGTH} characters
        <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
      </span>
    </p>
  )
}
