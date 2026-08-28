import type {Accessor} from 'solid-js'
import {createStickToBottom, type FollowContent, type FollowPhase} from '@conciv/solid-stick-to-bottom'

export type ThreadAutoScroll = {
  phase: Accessor<FollowPhase>
  isAtBottom: Accessor<boolean>
  released: Accessor<boolean>
  follows: Accessor<boolean>
  paused: Accessor<boolean>
  scrollToBottom: () => void
  pauseFollow: (durationMs: number) => void
}

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {
    autoScroll: Accessor<boolean>
    hasActiveTopAnchor?: Accessor<boolean>
    content?: Accessor<FollowContent | undefined>
  },
): ThreadAutoScroll {
  let pausedUntil = 0
  const paused = () => Date.now() < pausedUntil
  const topAnchored = () => opts.hasActiveTopAnchor?.() ?? false
  const follows = () => opts.autoScroll() && !topAnchored() && !paused()
  const stick = createStickToBottom(viewport, {follow: follows, content: opts.content})
  return {
    phase: stick.phase,
    isAtBottom: stick.isAtBottom,
    released: stick.released,
    follows,
    paused,
    scrollToBottom: stick.scrollToBottom,
    pauseFollow: (durationMs: number) => {
      pausedUntil = Date.now() + durationMs
    },
  }
}
