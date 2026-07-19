import type {KeyframeRenderer} from './render.js'

const RENDERER_IDLE_MS = 5 * 60 * 1000

export type RendererCache = {
  use<Result>(work: (renderer: KeyframeRenderer) => Promise<Result>): Promise<Result | null>
  dispose(): Promise<void>
}

export function createRendererCache(create: () => Promise<KeyframeRenderer | null>): RendererCache {
  const state: {value?: Promise<KeyframeRenderer | null>; idleTimer?: ReturnType<typeof setTimeout>} = {}
  let leases = 0

  const dispose = async (): Promise<void> => {
    if (state.idleTimer) clearTimeout(state.idleTimer)
    state.idleTimer = undefined
    const active = await state.value?.catch(() => null)
    state.value = undefined
    await active?.dispose()
  }

  const armIdle = (): void => {
    if (leases > 0) return
    state.idleTimer = setTimeout(() => void dispose(), RENDERER_IDLE_MS)
    state.idleTimer.unref?.()
  }

  const acquire = (): Promise<KeyframeRenderer | null> => {
    if (state.idleTimer) clearTimeout(state.idleTimer)
    state.idleTimer = undefined
    state.value ??= create().then((created) => {
      if (!created) state.value = undefined
      return created
    })
    return state.value
  }

  return {
    async use(work) {
      leases += 1
      try {
        const renderer = await acquire().catch(() => null)
        return renderer ? await work(renderer) : null
      } finally {
        leases -= 1
        armIdle()
      }
    },
    dispose,
  }
}
