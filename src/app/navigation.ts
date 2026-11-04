import type { Role } from './role'

export type NavItem = { key: string; segment: string }
export const navigation: Record<Role, NavItem[]> = {
  teacher: [
    { key: 'home', segment: 'inicio' },
    { key: 'courses', segment: 'cursos' },
    { key: 'offerings', segment: 'ediciones' },
    { key: 'students', segment: 'estudiantes' },
    { key: 'calendar', segment: 'calendario' },
    { key: 'certificates', segment: 'certificados' },
    { key: 'analytics', segment: 'analitica' },
    { key: 'profile', segment: 'perfil' },
  ],
  admin: [
    { key: 'home', segment: 'inicio' },
    { key: 'clients', segment: 'clientes' },
    { key: 'courses', segment: 'cursos' },
    { key: 'users', segment: 'usuarios' },
    { key: 'certificates', segment: 'certificados' },
    { key: 'branding', segment: 'marca' },
    { key: 'reports', segment: 'reportes' },
    { key: 'settings', segment: 'configuracion' },
  ],
  student: [
    { key: 'home', segment: 'inicio' },
    { key: 'courses', segment: 'cursos' },
    { key: 'calendar', segment: 'calendario' },
    { key: 'certificates', segment: 'certificados' },
    { key: 'profile', segment: 'perfil' },
  ],
  coordinator: [
    { key: 'summary', segment: 'resumen' },
    { key: 'students', segment: 'alumnos' },
    { key: 'offerings', segment: 'ediciones' },
    { key: 'certificates', segment: 'certificados' },
    { key: 'reports', segment: 'reportes' },
  ],
  platform: [{ key: 'home', segment: 'inicio' }],
}
