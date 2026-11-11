export const SessionEndReason = {
  DETACHED: 'detached',
  DEAD: 'dead',
  DISPOSED: 'disposed',
} as const satisfies Record<string, string>

export type SessionEndReason = (typeof SessionEndReason)[keyof typeof SessionEndReason]
