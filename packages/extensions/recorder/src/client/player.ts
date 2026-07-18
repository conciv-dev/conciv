import {type Accessor} from 'solid-js'
import {z} from 'zod'
import type {eventWithTime} from '@rrweb/types'
import playerCss from 'rrweb-player/dist/style.css?inline'
import rrwebCss from 'rrweb/dist/style.css?inline'
import themeCss from './player-theme.css?inline'
import Player from 'rrweb-player'
import type {RrwebEvent} from '../shared/protocol.js'
import {computeIdleSpans, idleSpanAt} from './inactivity.js'

const playerEvent = z.custom<eventWithTime>()
const playerEvents = z.array(playerEvent)
const metaSize = z.object({width: z.number(), height: z.number()})
const timePayload = z.number()

const FALLBACK_WIDTH = 620
const FALLBACK_ASPECT = 0.62
const PLAYER_CONTROLLER_HEIGHT = 80
const MIN_FRAME_HEIGHT = 120

function recordedAspect(events: RrwebEvent[]): number {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  if (!parsed.success || parsed.data.width <= 0) return FALLBACK_ASPECT
  return parsed.data.height / parsed.data.width
}

function playerSize(container: HTMLDivElement, aspect: number): {width: number; height: number} {
  const availableWidth = container.clientWidth || FALLBACK_WIDTH
  const availableHeight = container.clientHeight || Math.round(availableWidth * aspect) + PLAYER_CONTROLLER_HEIGHT
  const frameBudget = Math.max(availableHeight - PLAYER_CONTROLLER_HEIGHT, MIN_FRAME_HEIGHT)
  const width = Math.min(availableWidth, Math.round(frameBudget / aspect))
  return {width, height: Math.round(width * aspect)}
}

function skipIdlePlayback(player: Player, events: RrwebEvent[], skipIdle: Accessor<boolean>): void {
  const spans = computeIdleSpans(events)
  if (!spans.length) return
  let playing = false
  player.addEventListener('ui-update-player-state', (payload) => {
    playing = payload === 'playing'
  })
  player.addEventListener('ui-update-current-time', (payload) => {
    if (!playing || !skipIdle()) return
    const parsed = timePayload.safeParse(payload)
    if (!parsed.success) return
    const span = idleSpanAt(spans, parsed.data)
    if (span) player.goto(span.endMs, true)
  })
}

function styleScope(container: HTMLDivElement): Document | ShadowRoot {
  const root = container.getRootNode()
  return root instanceof ShadowRoot ? root : document
}

function demoteInjectedStyles(scope: Document | ShadowRoot, known: Set<Element>): void {
  for (const injected of scope.querySelectorAll('style')) {
    if (known.has(injected)) continue
    injected.textContent = `@layer rrweb {\n${injected.textContent ?? ''}\n}`
    known.add(injected)
  }
}

const LIVE_POLL_MS = 1000

export function mountLivePlayer(
  container: HTMLDivElement,
  events: RrwebEvent[],
  pull: (sinceTs: number) => Promise<RrwebEvent[]>,
): () => void {
  const scope = styleScope(container)
  const known = new Set<Element>(scope.querySelectorAll('style'))
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${rrwebCss}\n${playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  known.add(style)
  const aspect = recordedAspect(events)
  const player = new Player({
    target: container,
    props: {
      ...playerSize(container, aspect),
      events: playerEvents.parse(events),
      autoPlay: false,
      liveMode: true,
      showController: false,
    },
  })
  demoteInjectedStyles(scope, known)
  let cursor = events.at(-1)?.timestamp ?? 0
  player.getReplayer().startLive(cursor)
  let stopped = false
  let poll: ReturnType<typeof setTimeout> | undefined
  const tick = async (): Promise<void> => {
    const fresh = await pull(cursor).catch((): RrwebEvent[] => [])
    if (stopped) return
    for (const event of fresh) {
      player.addEvent(playerEvent.parse(event))
      cursor = Math.max(cursor, event.timestamp)
    }
    poll = setTimeout(() => void tick(), LIVE_POLL_MS)
  }
  poll = setTimeout(() => void tick(), LIVE_POLL_MS)
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const size = playerSize(container, aspect)
      if (size.width < 80) return
      player.$set({width: size.width, height: size.height})
      player.triggerResize()
    })
  })
  observer.observe(container)
  return () => {
    stopped = true
    if (poll) clearTimeout(poll)
    cancelAnimationFrame(frame)
    observer.disconnect()
    player.$destroy()
  }
}

export function mountPlayer(container: HTMLDivElement, events: RrwebEvent[], skipIdle: Accessor<boolean>): () => void {
  const scope = styleScope(container)
  const known = new Set<Element>(scope.querySelectorAll('style'))
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${rrwebCss}\n${playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  known.add(style)
  const aspect = recordedAspect(events)
  const player = new Player({
    target: container,
    props: {...playerSize(container, aspect), events: playerEvents.parse(events), autoPlay: false},
  })
  demoteInjectedStyles(scope, known)
  skipIdlePlayback(player, events, skipIdle)
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const size = playerSize(container, aspect)
      if (size.width < 80) return
      player.$set({width: size.width, height: size.height})
      player.triggerResize()
    })
  })
  observer.observe(container)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
    player.$destroy()
  }
}
