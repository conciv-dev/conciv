import type {Accessor} from 'solid-js'
import {makeEventListener} from '@solid-primitives/event-listener'

const FOLLOW_PAUSE_CEILING_MS = 1000

export function usePauseFollowOnToggle(
  animatedElement: Accessor<HTMLElement | undefined>,
  pauseFollow: ((durationMs: number) => void) | undefined,
): () => void {
  return () => {
    if (!pauseFollow) return
    pauseFollow(FOLLOW_PAUSE_CEILING_MS)
    const element = animatedElement()
    if (!element) return
    const clearListener = makeEventListener(element, 'animationend', () => {
      clearListener()
      pauseFollow(0)
    })
  }
}
