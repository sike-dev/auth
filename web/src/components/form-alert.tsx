import type { ReactNode } from 'react'
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'

export function FormAlert({ tone = 'error', children }: { tone?: 'error' | 'success'; children: ReactNode }) {
  if (!children) return null
  return (
    <Alert
      variant={tone === 'error' ? 'destructive' : 'default'}
      className={tone === 'error' ? 'border-destructive/40 bg-destructive/10' : 'border-primary/30 bg-primary/10 text-primary'}
    >
      {tone === 'error' ? <CircleAlertIcon /> : <CircleCheckIcon />}
      <AlertDescription className={tone === 'success' ? 'text-primary' : undefined}>{children}</AlertDescription>
    </Alert>
  )
}
