import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {z} from 'zod'
import type {Browser} from 'playwright-core'
import type {Keyframe, RrwebEvent} from '../shared/protocol.js'

export type KeyframeRenderer = {
  render(events: RrwebEvent[], timestamps: number[]): Promise<Keyframe[]>
  renderVideo(events: RrwebEvent[]): Promise<Buffer | null>
  dispose(): Promise<void>
}

const VIDEO_DURATION_CAP_MS = 5 * 60 * 1000
const VIDEO_FINISH_MARGIN_MS = 15_000

const localRequire = createRequire(import.meta.url)

function rrwebAssets(): {script: string; style: string} {
  const distDir = dirname(localRequire.resolve('rrweb'))
  return {script: join(distDir, 'rrweb.umd.cjs'), style: join(distDir, 'style.css')}
}

const metaSize = z.object({width: z.number().optional(), height: z.number().optional()})

function viewportOf(events: RrwebEvent[]): {width: number; height: number} {
  const parsed = metaSize.safeParse(events.find((event) => event.type === 4)?.data)
  const size = parsed.success ? parsed.data : {}
  return {width: size.width ?? 1024, height: size.height ?? 768}
}

async function launchChromium(): Promise<Browser | null> {
  try {
    const {chromium} = await import('playwright-core')
    return await chromium.launch()
  } catch {
    return null
  }
}

export async function createChromiumRenderer(): Promise<KeyframeRenderer | null> {
  const browser = await launchChromium()
  if (!browser) return null
  return {
    async render(events, timestamps) {
      if (!events.some((event) => event.type === 2)) return []
      const assets = rrwebAssets()
      const page = await browser.newPage({viewport: viewportOf(events)})
      try {
        await page.setContent('<!doctype html><html><body><div id="replay"></div></body></html>')
        await page.addStyleTag({path: assets.style})
        await page.addScriptTag({path: assets.script})
        const firstTs = events[0]?.timestamp ?? 0
        const frames: Keyframe[] = []
        for (const ts of timestamps) {
          await page.evaluate(seekReplay, {events, offset: ts - firstTs})
          const shot = await page.screenshot({type: 'png'})
          frames.push({ts, pngBase64: shot.toString('base64')})
        }
        return frames
      } finally {
        await page.close()
      }
    },
    async renderVideo(events) {
      if (!events.some((event) => event.type === 2)) return null
      const assets = rrwebAssets()
      const viewport = viewportOf(events)
      const videoDir = await mkdtemp(join(tmpdir(), 'conciv-recorder-video-'))
      const context = await browser.newContext({viewport, recordVideo: {dir: videoDir, size: viewport}})
      try {
        const page = await context.newPage()
        await page.setContent('<!doctype html><html><body><div id="replay"></div></body></html>')
        await page.addStyleTag({path: assets.style})
        await page.addScriptTag({path: assets.script})
        const firstTs = events[0]?.timestamp ?? 0
        const lastTs = events.at(-1)?.timestamp ?? firstTs
        const timeout = Math.min(lastTs - firstTs, VIDEO_DURATION_CAP_MS) + VIDEO_FINISH_MARGIN_MS
        await page.evaluate(playReplayToEnd, {events})
        await page
          .waitForFunction(() => document.documentElement.hasAttribute('data-replay-finished'), null, {timeout})
          .catch(() => {})
        const video = page.video()
        await page.close()
        const videoPath = await video?.path().catch(() => null)
        if (!videoPath) return null
        return await readFile(videoPath)
      } catch {
        return null
      } finally {
        await context.close()
        await rm(videoDir, {recursive: true, force: true}).catch(() => {})
      }
    },
    dispose: () => browser.close(),
  }
}

type ReplayWindow = {
  rrweb: {Replayer: new (events: unknown[], config: {root: Element}) => {pause(offset: number): void}}
}

function seekReplay(arg: {events: unknown[]; offset: number}): void {
  const mount = document.querySelector('#replay')
  if (!mount) return
  mount.innerHTML = ''
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
