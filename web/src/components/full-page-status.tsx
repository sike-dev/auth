import { Spinner } from '@/components/ui/spinner'

export function FullPageStatus({ label }: { label: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-4" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        <span>{label}</span>
      </div>
    </div>
  )
}
