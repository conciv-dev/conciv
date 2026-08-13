import type {Accessor} from 'solid-js'
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'

export type ThreadAutoScroll = {
  isAtBottom: Accessor<boolean>
  escapedFromLock: Accessor<boolean>
  follows: Accessor<boolean>
  paused: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  pauseFollow: (durationMs: number) => void
}

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>; hasActiveTopAnchor?: Accessor<boolean>},
): ThreadAutoScroll {
  let pausedUntil = 0
  const follows = () => opts.autoScroll() && !(opts.hasActiveTopAnchor?.() ?? false) && Date.now() >= pausedUntil
  const stick = createStickToBottom(viewport, {
    initial: 'instant',
    follow: follows,
  })
  return {
    isAtBottom: stick.isAtBottom,
    escapedFromLock: stick.escapedFromLock,
    follows,
    paused: () => Date.now() < pausedUntil,
    scrollToBottom: (behavior: ScrollBehavior = 'smooth') => {
      void stick.scrollToBottom({animation: behavior === 'smooth' ? undefined : 'instant'})
    },
    pauseFollow: (durationMs: number) => {
      pausedUntil = Date.now() + durationMs
    },
  }
}
