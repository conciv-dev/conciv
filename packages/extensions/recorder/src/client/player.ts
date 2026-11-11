import {z} from 'zod'
import type {eventWithTime} from '@rrweb/types'
import themeCss from './player-theme.css?inline'
import type Player from 'rrweb-player'
import {RrwebEventSchema, type RrwebEvent} from '../shared/protocol.js'

const playerEvent = z.custom<eventWithTime>()
const playerEvents = z.array(playerEvent)

function detachEvents(events: RrwebEvent[]): RrwebEvent[] {
  return z.array(RrwebEventSchema).parse(JSON.parse(JSON.stringify(events)))
}
const metaSize = z.object({width: z.number(), height: z.number()})
const controllerTime = z.object({payload: z.number()})

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

export type PlayerKit = {Player: typeof Player; playerCss: string; rrwebCss: string}

let playerKit: Promise<PlayerKit> | undefined

export function loadPlayerKit(): Promise<PlayerKit> {
  playerKit ??= Promise.all([
    import('rrweb-player'),
    import('rrweb-player/dist/style.css?inline'),
    import('rrweb/dist/style.css?inline'),
  ]).then(([player, playerStyles, rrwebStyles]) => ({
    Player: player.default,
    playerCss: playerStyles.default,
    rrwebCss: rrwebStyles.default,
  }))
  return playerKit
}

function injectPlayerStyles(
  kit: PlayerKit,
  container: HTMLDivElement,
): {scope: Document | ShadowRoot; known: Set<Element>} {
  const scope = styleScope(container)
  const known = new Set<Element>(scope.querySelectorAll('style'))
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${kit.rrwebCss}\n${kit.playerCss}\n}\n${themeCss}`
  container.appendChild(style)
  known.add(style)
  return {scope, known}
}

function observeContainerSize(
  container: HTMLDivElement,
  resize: (size: {width: number; height: number}) => void,
  aspect: () => number,
): () => void {
  let frame = 0
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      if (document.fullscreenElement) return
      const size = playerSize(container, aspect())
      if (size.width < 80) return
      resize(size)
    })
  })
  observer.observe(container)
  return () => {
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}

const SCRUB_STEP_MS = 5000

const scrubStep = z.union([z.literal('ArrowLeft'), z.literal('ArrowRight')])
const SCRUB_DELTA_MS = {ArrowLeft: -SCRUB_STEP_MS, ArrowRight: SCRUB_STEP_MS}

function enhanceControllerAccess(container: HTMLDivElement, player: Player): void {
  const buttons = container.querySelectorAll('.rr-controller__btns > button')
  buttons[0]?.setAttribute('aria-label', 'Toggle playback')
  if (buttons.length > 1) buttons[buttons.length - 1]?.setAttribute('aria-label', 'Toggle fullscreen')
  const progress = container.querySelector('.rr-progress')
  if (!(progress instanceof HTMLElement)) return
  progress.setAttribute('role', 'slider')
  progress.setAttribute('aria-label', 'Timeline')
  progress.setAttribute('aria-valuemin', '0')
  progress.tabIndex = 0
  let current = 0
  const announcePosition = (): void => {
    progress.setAttribute('aria-valuemax', String(Math.round(player.getMetaData().totalTime)))
    progress.setAttribute('aria-valuenow', String(Math.round(current)))
  }
  announcePosition()
  player.getReplayer().on('event-cast', announcePosition)
  player.addEventListener('ui-update-current-time', (payload) => {
    const parsed = controllerTime.safeParse(payload)
    if (parsed.success) current = parsed.data.payload
    announcePosition()
  })
  container.addEventListener(
    'keydown',
    (event) => {
      if (!(event.target instanceof Node) || !progress.contains(event.target)) return
      const key = scrubStep.safeParse(event.key)
      if (!key.success) return
      event.preventDefault()
      event.stopPropagation()
      const total = player.getMetaData().totalTime
      player.goto(Math.min(Math.max(current + SCRUB_DELTA_MS[key.data], 0), total))
    },
    true,
  )
}

const LIVE_EDGE_MS = 2500

export type StreamPlayerHandle = {
  goLive: () => void
  dispose: () => void
}

export function mountStreamPlayer(
  kit: PlayerKit,
  container: HTMLDivElement,
  initial: {events: RrwebEvent[]; cursor: number},
  hooks: {
    follow: (cursor: number, signal: AbortSignal) => Promise<AsyncIterable<{events: RrwebEvent[]; cursor: number}>>
    onLive: (live: boolean) => void
  },
): StreamPlayerHandle {
  const buffer = detachEvents(initial.events)
  let cursor = initial.cursor
  let lastTs = buffer.at(-1)?.timestamp ?? 0
  let aspect = recordedAspect(buffer)
  let player: Player | undefined
  const following = new AbortController()

  const tailOffset = (): number => lastTs - (buffer[0]?.timestamp ?? 0)

  const isLive = (): boolean => {
    if (!player) return true
    const replayer = player.getReplayer()
    if (!replayer.service.state.matches('playing')) return false
    return replayer.getCurrentTime() + LIVE_EDGE_MS >= tailOffset()
  }

  const announceLive = (): void => hooks.onLive(isLive())

  const build = (): void => {
    const {scope, known} = injectPlayerStyles(kit, container)
    aspect = recordedAspect(buffer)
    player = new kit.Player({
      target: container,
      props: {
        ...playerSize(container, aspect),
        events: playerEvents.parse(buffer),
        autoPlay: false,
        liveMode: true,
        showController: true,
        skipInactive: false,
      },
    })
    demoteInjectedStyles(scope, known)
    enhanceControllerAccess(container, player)
    player.goto(tailOffset() + 1, true)
    player.addEventListener('ui-update-player-state', announceLive)
    player.addEventListener('ui-update-current-time', announceLive)
    player.getReplayer().on('event-cast', announceLive)
    hooks.onLive(true)
  }

  const cancelBuild = whenConnected(container, build)

  const feed = (event: RrwebEvent, atEdge: boolean): void => {
    buffer.push(event)
    lastTs = Math.max(lastTs, event.timestamp)
    if (!player) return
    const parsed = playerEvent.parse(event)
    if (atEdge) {
      player.getReplayer().addEvent(parsed)
      return
    }
    player.addEvent(parsed)
  }

  const take = (fresh: {events: RrwebEvent[]; cursor: number}): void => {
    const atEdge = isLive()
    for (const event of fresh.events) feed(event, atEdge)
    cursor = Math.max(cursor, fresh.cursor)
    announceLive()
  }

  const follow = async (): Promise<void> => {
    try {
      for await (const fresh of await hooks.follow(cursor, following.signal)) take(fresh)
    } catch (error) {
      if (!following.signal.aborted) console.error('[conciv] the recorder replay stopped following new events', error)
    }
  }
  void follow()

  const stopResize = observeContainerSize(
    container,
    (size) => {
      player?.$set({width: size.width, height: size.height})
      player?.triggerResize()
    },
    () => aspect,
  )

  return {
    goLive: () => {
      player?.goto(tailOffset() + 1, true)
      hooks.onLive(true)
    },
    dispose: () => {
      following.abort()
      cancelBuild()
      stopResize()
      player?.$destroy()
    },
  }
}

export function mountPlayer(kit: PlayerKit, container: HTMLDivElement, events: RrwebEvent[]): () => void {
  const detached = detachEvents(events)
  const aspect = recordedAspect(detached)
  let player: Player | undefined
  const cancelBuild = whenConnected(container, () => {
    const {scope, known} = injectPlayerStyles(kit, container)
    const mounted = new kit.Player({
      target: container,
      props: {...playerSize(container, aspect), events: playerEvents.parse(detached), autoPlay: false},
    })
    demoteInjectedStyles(scope, known)
    enhanceControllerAccess(container, mounted)
    player = mounted
  })
  const stopResize = observeContainerSize(
    container,
    (size) => {
      player?.$set({width: size.width, height: size.height})
      player?.triggerResize()
    },
    () => aspect,
  )
  return () => {
    cancelBuild()
    stopResize()
    player?.$destroy()
  }
}

function whenConnected(container: HTMLDivElement, run: () => void): () => void {
  let frame = 0
  const attempt = (): void => {
    if (!container.isConnected) {
      frame = requestAnimationFrame(attempt)
      return
    }
    run()
  }
  attempt()
  return () => cancelAnimationFrame(frame)
}
