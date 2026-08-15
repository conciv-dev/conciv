export type EffectHandle = {
  element: HTMLElement
  start: () => void
  stop: (onRemoved: () => void) => void
  remove: () => void
}

export type EffectMount = (host: HTMLElement) => EffectHandle
