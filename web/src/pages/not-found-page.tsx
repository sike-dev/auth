import { Link } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <AuthLayout title="Page not found" description="This page doesn’t exist.">
      <Button asChild variant="outline" size="lg" className="h-10 w-full">
        <Link to="/">Go to your account</Link>
      </Button>
    </AuthLayout>
  )
}
