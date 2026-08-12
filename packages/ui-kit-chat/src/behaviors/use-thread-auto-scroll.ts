import type {Accessor} from 'solid-js'
import {createStickToBottom} from '@conciv/solid-stick-to-bottom'

export type ThreadAutoScroll = {
  isAtBottom: Accessor<boolean>
  scrollToBottom: (behavior?: ScrollBehavior) => void
  pauseFollow: (durationMs: number) => void
}

export function useThreadAutoScroll(
  viewport: Accessor<HTMLElement | undefined>,
  opts: {autoScroll: Accessor<boolean>; hasActiveTopAnchor?: Accessor<boolean>},
): ThreadAutoScroll {
  let pausedUntil = 0
  const stick = createStickToBottom(viewport, {
    initial: 'instant',
    follow: () => opts.autoScroll() && !(opts.hasActiveTopAnchor?.() ?? false) && Date.now() >= pausedUntil,
  })
  return {
    isAtBottom: stick.isAtBottom,
    scrollToBottom: (behavior: ScrollBehavior = 'smooth') => {
      void stick.scrollToBottom({animation: behavior === 'smooth' ? undefined : 'instant'})
    },
    pauseFollow: (durationMs: number) => {
      pausedUntil = Date.now() + durationMs
    },
  }
}
