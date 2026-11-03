/**
 * Participantes sin correo: se crean con una cuenta interna cuyo correo no se usa nunca
 * (empieza por "sin-correo-"). No se muestra en pantallas ni se le envían mensajes.
 */
export const PLACEHOLDER_PREFIX = 'sin-correo-'
export const PLACEHOLDER_DOMAIN = 'sin-correo.invalid'

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().startsWith(PLACEHOLDER_PREFIX)
}

/** Correo para mostrar: vacío si es el interno de un participante sin correo. */
export function shownEmail(email: string | null | undefined): string {
  return !email || isPlaceholderEmail(email) ? '' : email
}
