import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'

import { AuthLayout } from '@/components/auth-layout'
import { FullPageStatus } from '@/components/full-page-status'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSession } from '@/hooks/use-session'
import { safeNextPath } from '@/lib/redirects'
import { SignInForm } from '@/pages/auth/sign-in-form'
import { SignUpForm } from '@/pages/auth/sign-up-form'

type Tab = 'signin' | 'signup'

export function AuthPage() {
  const session = useSession()
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const tab: Tab = location.pathname === '/signup' ? 'signup' : 'signin'

  if (session.status === 'loading') return <FullPageStatus label="Checking your session…" />
  if (session.status === 'signed_in') return <Navigate to={next} replace />

  const switchTab = (value: string) => {
    navigate({ pathname: value === 'signup' ? '/signup' : '/login', search: location.search }, { replace: true })
  }

  return (
    <AuthLayout
      title={tab === 'signup' ? 'Create your Sike account' : 'Sign in to Sike'}
      description={tab === 'signup' ? 'One account for every Sike app.' : 'Use your email and password.'}
    >
      <Tabs value={tab} onValueChange={switchTab} className="gap-6">
        <TabsList variant="line" className="w-full border-b border-border pb-0">
          <TabsTrigger value="signin" className="h-9 data-active:after:bg-primary">
            Sign in
          </TabsTrigger>
          <TabsTrigger value="signup" className="h-9 data-active:after:bg-primary">
            Create account
          </TabsTrigger>
        </TabsList>
        <TabsContent value="signin">
          <SignInForm next={next} />
        </TabsContent>
        <TabsContent value="signup">
          <SignUpForm />
        </TabsContent>
      </Tabs>
    </AuthLayout>
  )
}
