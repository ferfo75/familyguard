/**
 * Cuándo despertar el teléfono de un hijo: si hace más de 25 min que no manda nada (el seguimiento se durmió)
 * y no se le mandó un aviso en los últimos 20 min. Si lleva más de 2 días callado (apagado o sin batería)
 * se deja de insistir: no hay nadie para recibir el aviso.
 */
export const WAKE_AFTER_MS = 25 * 60_000;
export const WAKE_EVERY_MS = 20 * 60_000;
export const WAKE_GIVE_UP_MS = 48 * 3600_000;

export interface WakeCandidate { fcmToken: string | null; lastSeenAt: Date | null; lastWakeAt: Date | null }

export function shouldWake(c: WakeCandidate, now: number = Date.now()): boolean {
  if (!c.fcmToken) return false;
  const silentFor = c.lastSeenAt ? now - c.lastSeenAt.getTime() : Infinity;
  if (silentFor < WAKE_AFTER_MS) return false;
  if (c.lastSeenAt && silentFor > WAKE_GIVE_UP_MS) return false;
  if (c.lastWakeAt && now - c.lastWakeAt.getTime() < WAKE_EVERY_MS) return false;
  return true;
}
