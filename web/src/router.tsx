import { createBrowserRouter } from 'react-router'

import { AccountPage } from '@/pages/account-page'
import { AuthPage } from '@/pages/auth/auth-page'
import { CheckEmailPage } from '@/pages/check-email-page'
import { ConfirmPage } from '@/pages/confirm-page'
import { ConsentPage } from '@/pages/consent-page'
import { ForgotPasswordPage } from '@/pages/forgot-password-page'
import { LogoutPage } from '@/pages/logout-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { ResetPasswordPage } from '@/pages/reset-password-page'

export const router = createBrowserRouter([
  { path: '/', element: <AccountPage /> },
  { path: '/login', element: <AuthPage /> },
  { path: '/signup', element: <AuthPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/check-email', element: <CheckEmailPage /> },
  { path: '/auth/confirm', element: <ConfirmPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { path: '/oauth/consent', element: <ConsentPage /> },
  { path: '/logout', element: <LogoutPage /> },
  { path: '*', element: <NotFoundPage /> },
])
