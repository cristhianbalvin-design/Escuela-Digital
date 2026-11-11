import type { Role } from './role'

export type NavItem = { key: string; segment: string }
export const navigation: Record<Role, NavItem[]> = {
  teacher: [
    { key: 'home', segment: 'inicio' },
    { key: 'courses', segment: 'cursos' },
    { key: 'offerings', segment: 'ediciones' },
    { key: 'students', segment: 'estudiantes' },
    { key: 'calendar', segment: 'calendario' },
    { key: 'analytics', segment: 'analitica' },
    { key: 'profile', segment: 'perfil' },
  ],
  // Pendientes de construir (se vuelven a mostrar cuando estén listos):
  // home, branding + settings (Escuela), reports.
  admin: [
    { key: 'clients', segment: 'clientes' },
    { key: 'courses', segment: 'cursos' },
    { key: 'users', segment: 'personas' },
    { key: 'certificates', segment: 'certificados' },
  ],
  student: [
    { key: 'home', segment: 'inicio' },
    { key: 'courses', segment: 'cursos' },
    { key: 'calendar', segment: 'calendario' },
    { key: 'certificates', segment: 'certificados' },
    { key: 'profile', segment: 'perfil' },
  ],
  // Pendientes de construir: resumen, alumnos, ediciones y reportes.
  coordinator: [{ key: 'certificates', segment: 'certificados' }, { key: 'planning', segment: 'guias' }],
  platform: [{ key: 'home', segment: 'inicio' }],
}
