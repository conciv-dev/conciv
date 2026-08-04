export function waitForCondition(match: () => boolean): Promise<void> {
  return Promise.resolve(match() ? undefined : undefined)
}

export type Waiter = {settle: (match: () => Promise<boolean>) => Promise<void>}

export function nextEvent(): Promise<string> {
  return Promise.resolve('event')
}

function internalPredicate(match: () => boolean): boolean {
  return match()
}

export const usesInternal = (): boolean => internalPredicate(() => true)
