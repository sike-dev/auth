import { useEffect, useState } from 'react'

import { supabase } from '@/lib/supabase'

export type SessionUser = {
  id: string
  email: string | null
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; user: SessionUser }

async function readUser(): Promise<SessionState> {
  // getClaims verifies the access token signature against the project's JWKS.
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims) return { status: 'signed_out' }
  return {
    status: 'signed_in',
    user: {
      id: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : null,
    },
  }
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    const update = () => {
      void readUser().then((next) => {
        if (active) setState(next)
      })
    }

    update()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setState({ status: 'signed_out' })
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      else setTimeout(update, 0)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return state
}
