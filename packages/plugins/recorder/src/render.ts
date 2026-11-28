import {createRequire} from 'node:module'
import {Effect, FileSystem, Path, Stream} from 'effect'
import type {EvlogError} from 'evlog'
import {z} from 'zod'
import type {Browser, BrowserContext, Page} from 'playwright-core'
import type {Keyframe} from './format.js'
import type {RrwebEvent} from './rpc.js'
import {causeFrom, recorderErrors} from './errors/errors.js'

export type KeyframeRenderer = {
  readonly render: (events: RrwebEvent[], timestamps: number[]) => Effect.Effect<Keyframe[], EvlogError>
  readonly renderVideo: (
    events: RrwebEvent[],
    destination: string,
  ) => Effect.Effect<boolean, EvlogError, FileSystem.FileSystem>
}

const VIDEO_DURATION_CAP_MS = 5 * 60 * 1000
const VIDEO_FINISH_MARGIN_MS = 15_000
const REPLAY_PAGE = '<!doctype html><html><body><div id="replay"></div></body></html>'

const localRequire = createRequire(import.meta.url)

const metaSize = z.object({width: z.number().optional(), height: z.number().optional()})

function readViewport(events: RrwebEvent[]): {width: number; height: number} {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  const size = parsed.success ? parsed.data : {}
  return {width: size.width ?? 1024, height: size.height ?? 768}
}

function renderFailed(cause: unknown): EvlogError {
  return recorderErrors.RENDER_FAILED(causeFrom(cause))
}

function attemptRender<Value>(work: () => Promise<Value>) {
  return Effect.tryPromise({try: work, catch: renderFailed})
}

const readAssets = Effect.gen(function* () {
  const path = yield* Path.Path
  const distDir = path.dirname(localRequire.resolve('rrweb'))
  return {script: path.join(distDir, 'rrweb.umd.cjs'), style: path.join(distDir, 'style.css')}
})

function openReplayPage(page: Page, assets: {script: string; style: string}) {
  return attemptRender(async () => {
    await page.setContent(REPLAY_PAGE)
    await page.addStyleTag({path: assets.style})
    await page.addScriptTag({path: assets.script})
  })
}

function scopedPage(open: () => Promise<Page>) {
  return Effect.acquireRelease(attemptRender(open), (page) => Effect.tryPromise(() => page.close()).pipe(Effect.ignore))
}

function scopedContext(open: () => Promise<BrowserContext>) {
  return Effect.acquireRelease(attemptRender(open), (context) =>
    Effect.tryPromise(() => context.close()).pipe(Effect.ignore),
  )
}

function renderFrames(browser: Browser, assets: {script: string; style: string}) {
  return Effect.fn('recorder.render.frames')(function* (events: RrwebEvent[], timestamps: number[]) {
    if (!events.some((event) => event.type === 2)) return []
    const page = yield* scopedPage(() => browser.newPage({viewport: readViewport(events)}))
    yield* openReplayPage(page, assets)
    const firstTs = events[0]?.timestamp ?? 0
    return yield* Effect.forEach(timestamps, (ts) =>
      attemptRender(async () => {
        await page.evaluate(seekReplay, {events, offset: ts - firstTs})
        const shot = await page.screenshot({type: 'png'})
        return {ts, pngBase64: shot.toString('base64')}
      }),
    )
  }, Effect.scoped)
}

function recordVideo(browser: Browser, assets: {script: string; style: string}) {
  return Effect.fn('recorder.render.video')(function* (events: RrwebEvent[], destination: string) {
    if (!events.some((event) => event.type === 2)) return false
    const fs = yield* FileSystem.FileSystem
    const viewport = readViewport(events)
    const videoDir = yield* fs
      .makeTempDirectoryScoped({prefix: 'conciv-recorder-video-'})
      .pipe(Effect.mapError(renderFailed))
    const context = yield* scopedContext(() =>
      browser.newContext({viewport, recordVideo: {dir: videoDir, size: viewport}}),
    )
    const page = yield* attemptRender(() => context.newPage())
    yield* openReplayPage(page, assets)
    const firstTs = events[0]?.timestamp ?? 0
    const lastTs = events.at(-1)?.timestamp ?? firstTs
    const timeout = Math.min(lastTs - firstTs, VIDEO_DURATION_CAP_MS) + VIDEO_FINISH_MARGIN_MS
    const videoPath = yield* attemptRender(async () => {
      await page.evaluate(playReplayToEnd, {events})
      await page
        .waitForFunction(() => document.documentElement.hasAttribute('data-replay-finished'), null, {timeout})
        .catch(() => undefined)
      const video = page.video()
      await page.close()
      return video?.path()
    })
    if (!videoPath) return false
    yield* fs.stream(videoPath).pipe(Stream.run(fs.sink(destination)), Effect.mapError(renderFailed))
    return true
  }, Effect.scoped)
}

export const launchChromiumRenderer = Effect.gen(function* () {
  const assets = yield* readAssets
  const browser = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: async () => (await import('playwright-core')).chromium.launch(),
      catch: (cause) => recorderErrors.RENDERER_UNAVAILABLE(causeFrom(cause)),
    }),
    (launched) => Effect.tryPromise(() => launched.close()).pipe(Effect.ignore),
  )
  const renderer: KeyframeRenderer = {render: renderFrames(browser, assets), renderVideo: recordVideo(browser, assets)}
  return renderer
})

type ReplayWindow = {
  rrweb: {Replayer: new (events: unknown[], config: {root: Element}) => {pause(offset: number): void}}
}

function seekReplay(arg: {events: unknown[]; offset: number}): void {
  const mount = document.querySelector('#replay')
  if (!mount) return
  mount.replaceChildren()
  const replayWindow: ReplayWindow = Object(window)
  const replayer = new replayWindow.rrweb.Replayer(arg.events, {root: mount})
  replayer.pause(arg.offset)
}

type ReplayPlayWindow = {
  rrweb: {
    Replayer: new (
      events: unknown[],
      config: {root: Element; skipInactive: boolean},
    ) => {play(): void; on(event: string, handler: () => void): void}
  }
}

function playReplayToEnd(arg: {events: unknown[]}): void {
  const mount = document.querySelector('#replay')
  if (!mount) return
  const replayWindow: ReplayPlayWindow = Object(window)
  const replayer = new replayWindow.rrweb.Replayer(arg.events, {root: mount, skipInactive: true})
  replayer.on('finish', () => document.documentElement.setAttribute('data-replay-finished', ''))
  replayer.play()
}
