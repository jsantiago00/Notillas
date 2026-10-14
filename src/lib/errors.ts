/** Mensajes de error de Firebase en castellano, con qué hacer. */
export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const message = (e as Error)?.message ?? String(e)
  if (code === 'permission-denied' || /insufficient permissions/i.test(message)) {
    return 'Firestore rechazó el acceso: faltan publicar las reglas en Firebase (Firestore → Reglas). Están en firestore.rules del repo.'
  }
  if (code === 'unavailable') return 'No hay conexión con Firestore. Si es la primera vez que abrís esto en este dispositivo, hace falta internet.'
  if (code === 'failed-precondition') return 'Firestore no está listo en este proyecto (¿se creó la base de datos?).'
  return message
}
