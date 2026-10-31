import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export type Role = 'teacher' | 'student' | 'admin' | 'coordinator' | 'platform'

export const rolePath: Record<Role, string> = {
  teacher: '/docente',
  student: '/estudiante',
  admin: '/admin',
  coordinator: '/coordinador',
  platform: '/plataforma',
}

type RoleState = {
  role: Role | null
  setRole: (role: Role | null) => void
}

export const useRole = create<RoleState>((set) => ({
  role: import.meta.env.DEV && !supabase ? 'teacher' : null,
  setRole: (role) => {
    // El selector de demostración nunca establece un rol en modo Supabase.
    if (!supabase) set({ role })
  },
}))
