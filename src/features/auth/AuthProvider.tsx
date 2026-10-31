import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  configured: boolean
  session: Session | null
  user: User | null
  status: AuthStatus
  signInWithPassword: (email: string, password: string) => Promise<void>
  signInWithMagicLink: (email: string, returnTo?: string) => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(!supabase)

  useEffect(() => {
    if (!supabase) return

    // INITIAL_SESSION entrega la sesión persistida sin consultar la API
    // dentro del callback de cambio de autenticación.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession)
        setInitialized(true)
      },
    )

    return () => subscription.unsubscribe()
  }, [])

  const status: AuthStatus = !initialized
    ? 'loading'
    : session
      ? 'authenticated'
      : 'anonymous'

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signInWithMagicLink(email: string, returnTo = '/') {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}${returnTo}`,
        // Solo cuentas existentes: las altas llegan por invitación.
        shouldCreateUser: false,
      },
    })
    if (error) throw error
  }

  async function sendPasswordReset(email: string) {
    if (!supabase) throw new Error('Supabase no está configurado')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-clave${window.location.search}`,
    })
    if (error) throw error
  }

  async function signOut() {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        configured: !!supabase,
        session,
        user: session?.user ?? null,
        status,
        signInWithPassword,
        signInWithMagicLink,
        sendPasswordReset,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('AuthProvider missing')
  return context
}
