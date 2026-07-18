import type {KeyframeRenderer} from './render.js'

const RENDERER_IDLE_MS = 5 * 60 * 1000

export type RendererCache = {get(): Promise<KeyframeRenderer | null>; dispose(): Promise<void>}

export function createRendererCache(create: () => Promise<KeyframeRenderer | null>): RendererCache {
  const state: {value?: Promise<KeyframeRenderer | null>; idleTimer?: ReturnType<typeof setTimeout>} = {}

  const dispose = async (): Promise<void> => {
    if (state.idleTimer) clearTimeout(state.idleTimer)
    const active = await state.value?.catch(() => null)
    state.value = undefined
    await active?.dispose()
  }

  return {
    get() {
      if (state.idleTimer) clearTimeout(state.idleTimer)
      state.idleTimer = setTimeout(() => void dispose(), RENDERER_IDLE_MS)
      state.idleTimer.unref?.()
      state.value ??= create().then((created) => {
        if (!created) state.value = undefined
        return created
      })
      return state.value
    },
    dispose,
  }
}
