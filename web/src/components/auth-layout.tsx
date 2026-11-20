import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import logo from '@/assets/sike-logo.jpg'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

type AuthLayoutProps = {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  useEffect(() => {
    document.title = `${title} · Sike`
  }, [title])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="flex w-full max-w-sm flex-col items-stretch gap-6">
        <Link
          to="/"
          className="mx-auto block rounded-md focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none"
        >
          <img src={logo} alt="Sike" width={180} height={80} className="h-20 w-[180px] object-contain" />
        </Link>

        <Card className="gap-5 border border-border bg-card py-6 shadow-[0_0_0_1px_oklch(1_0_0/0.02),0_24px_60px_-20px_oklch(0.93_0.23_125/0.12)]">
          <CardHeader className="gap-1.5 px-6">
            <h1 className="text-xl leading-snug font-semibold tracking-tight">{title}</h1>
            {description ? <CardDescription className="text-sm leading-relaxed">{description}</CardDescription> : null}
          </CardHeader>
          <CardContent className="px-6">{children}</CardContent>
        </Card>

        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
      </main>
    </div>
  )
}
