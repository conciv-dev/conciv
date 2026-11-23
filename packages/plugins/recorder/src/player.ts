import {Effect, Queue, Stream, SubscriptionRef, type Scope} from 'effect'
import {z} from 'zod'
import type {eventWithTime} from '@rrweb/types'
import themeCss from './assets/player-theme.css?inline'
import type Player from 'rrweb-player'
import {RrwebEventSchema, type RrwebEvent} from './rpc.js'
import type {ReplaySource} from './player-follow.js'
import {makeMachineDriver} from './machine-driver.js'
import {RecorderPlayerMachine, type Playback} from './player-machine.js'

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

function demoteInjectedStyles(scope: Document | ShadowRoot, known: readonly Element[]): void {
  for (const injected of scope.querySelectorAll('style')) {
    if (known.includes(injected)) continue
    injected.textContent = `@layer rrweb {\n${injected.textContent ?? ''}\n}`
  }
}

export type PlayerKit = {Player: typeof Player; playerCss: string; rrwebCss: string}

export function loadPlayerKit(): Promise<PlayerKit> {
  return Promise.all([
    import('rrweb-player'),
    import('rrweb-player/dist/style.css?inline'),
    import('rrweb/dist/style.css?inline'),
  ]).then(([player, playerStyles, rrwebStyles]) => ({
    Player: player.default,
    playerCss: playerStyles.default,
    rrwebCss: rrwebStyles.default,
  }))
}

function injectPlayerStyles(
  kit: PlayerKit,
  container: HTMLDivElement,
): {scope: Document | ShadowRoot; known: readonly Element[]} {
  const scope = styleScope(container)
  const style = document.createElement('style')
  style.textContent = `@layer rrweb {\n${kit.rrwebCss}\n${kit.playerCss}\n}\n${themeCss}`
  const known = [...scope.querySelectorAll('style'), style]
  container.appendChild(style)
  return {scope, known}
}

const nextFrame: Effect.Effect<void> = Effect.callback<void>((resume) => {
  const frame = requestAnimationFrame(() => resume(Effect.void))
  return Effect.sync(() => cancelAnimationFrame(frame))
})

function whenConnected(container: HTMLDivElement): Effect.Effect<void> {
  return Effect.suspend(() =>
    container.isConnected ? Effect.void : Effect.andThen(nextFrame, whenConnected(container)),
  )
}

function followContainerSize(
  container: HTMLDivElement,
  aspect: () => number,
  resize: (size: {width: number; height: number}) => void,
): Effect.Effect<void, never, Scope.Scope> {
  return Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const observer = new ResizeObserver(() => void Queue.offerUnsafe(queue, undefined))
        observer.observe(container)
        return observer
      }),
      (observer) => Effect.sync(() => observer.disconnect()),
    ),
  ).pipe(
    Stream.switchMap(() => Stream.fromEffect(nextFrame)),
    Stream.runForEach(() =>
      Effect.sync(() => {
        if (document.fullscreenElement) return
        const size = playerSize(container, aspect())
        if (size.width >= 80) resize(size)
      }),
    ),
    Effect.forkScoped,
    Effect.asVoid,
  )
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
  player.getReplayer().service.subscribe(announcePosition)
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

function readPlayback(player: Player | undefined): Playback {
  const replayer = player?.getReplayer()
  if (!replayer) return {playing: false, currentTime: 0}
  return {playing: replayer.service.state.matches('playing'), currentTime: replayer.getCurrentTime()}
}

function buildPlayer(
  kit: PlayerKit,
  container: HTMLDivElement,
  events: RrwebEvent[],
  props: {readonly liveMode: boolean},
): Player {
  const {scope, known} = injectPlayerStyles(kit, container)
  const player = new kit.Player({
    target: container,
    props: {
      ...playerSize(container, recordedAspect(events)),
      events: playerEvents.parse(events),
      autoPlay: false,
      triggerFocus: false,
      ...(props.liveMode ? {liveMode: true, showController: true, skipInactive: false} : {}),
    },
  })
  demoteInjectedStyles(scope, known)
  enhanceControllerAccess(container, player)
  return player
}

export function streamPlayer(
  kit: PlayerKit,
  container: HTMLDivElement,
  initial: ReplaySource,
  hooks: {
    follow: (cursor: number) => Stream.Stream<ReplaySource>
    goLiveRequests: Stream.Stream<void>
    onLive: (live: boolean) => void
  },
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* () {
    const buffer = detachEvents(initial.events)
    const view: {player: Player | undefined} = {player: undefined}
    const observations = yield* Queue.unbounded<void>()
    const observe = (): void => void Queue.offerUnsafe(observations, undefined)
    const append = (events: readonly RrwebEvent[], to: 'buffer' | 'edge' | 'player'): void => {
      buffer.push(...events)
      const player = view.player
      if (!player || to === 'buffer') return
      for (const event of events) {
        const parsed = playerEvent.parse(event)
        if (to === 'edge') player.getReplayer().addEvent(parsed)
        else player.addEvent(parsed)
      }
    }
    const build = (): void => {
      const player = buildPlayer(kit, container, buffer, {liveMode: true})
      player.addEventListener('ui-update-player-state', observe)
      player.addEventListener('ui-update-current-time', observe)
      player.getReplayer().on('event-cast', observe)
      view.player = player
    }
    const perform = (command: RecorderPlayerMachine.PlayerEffect): void => {
      if (command.type === 'announce') hooks.onLive(command.live)
      else if (command.type === 'destroy') view.player?.$destroy()
      else if (command.type === 'seek') view.player?.goto(command.offset, true)
      else if (command.type === 'build') build()
      else append(command.events, command.to)
    }
    const run = (command: RecorderPlayerMachine.PlayerEffect): Effect.Effect<void> =>
      Effect.sync(() => perform(command))
    const driver = yield* makeMachineDriver({
      initial: RecorderPlayerMachine.initialPlayer(buffer, initial.cursor),
      transition: RecorderPlayerMachine.transitionPlayer,
      run,
    })
    yield* Effect.addFinalizer(() => driver.dispatch({type: 'disposed'}))
    yield* followContainerSize(
      container,
      () => recordedAspect(buffer),
      (size) => {
        view.player?.$set(size)
        view.player?.triggerResize()
      },
    )
    yield* whenConnected(container).pipe(Effect.andThen(driver.dispatch({type: 'connected'})), Effect.forkScoped)
    yield* Stream.suspend(() => hooks.follow(SubscriptionRef.getUnsafe(driver.state).cursor)).pipe(
      Stream.runForEach((fresh) =>
        driver.dispatch({
          type: 'arrived',
          events: fresh.events,
          cursor: fresh.cursor,
          playback: readPlayback(view.player),
        }),
      ),
      Effect.forkScoped,
    )
    yield* Stream.fromQueue(observations).pipe(
      Stream.runForEach(() => driver.dispatch({type: 'observed', playback: readPlayback(view.player)})),
      Effect.forkScoped,
    )
    yield* hooks.goLiveRequests.pipe(
      Stream.runForEach(() => driver.dispatch({type: 'go-live'})),
      Effect.forkScoped,
    )
  })
}

export function mountPlayer(
  kit: PlayerKit,
  container: HTMLDivElement,
  events: RrwebEvent[],
): Effect.Effect<void, never, Scope.Scope> {
  return Effect.gen(function* () {
    const detached = detachEvents(events)
    const view: {player: Player | undefined} = {player: undefined}
    yield* Effect.addFinalizer(() => Effect.sync(() => view.player?.$destroy()))
    yield* followContainerSize(
      container,
      () => recordedAspect(detached),
      (size) => {
        view.player?.$set(size)
        view.player?.triggerResize()
      },
    )
    yield* whenConnected(container).pipe(
      Effect.andThen(Effect.sync(() => void (view.player = buildPlayer(kit, container, detached, {liveMode: false})))),
      Effect.forkScoped,
    )
  })
}
