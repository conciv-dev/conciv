import {access, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, type Page, type Route} from '@playwright/test'
import type {CurveStyle, MascotConfig} from '../../../src/rig.js'
import {frameCountingScript, harnessPage} from './harness-page.js'

export type StagePoint = {x: number; y: number}

export type StageParts = {root: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

const helperDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = join(helperDirectory, '..', '..', '..')
const gsapDirectory = dirname(createRequire(import.meta.url).resolve('gsap/package.json'))

const DIST_DIRECTORY = join(packageDirectory, 'dist')

const RIG_BUNDLE = join(DIST_DIRECTORY, 'rig.js')

const MASCOT_BASE = 'http://mascot.test/'

const GSAP_PREFIX = '/gsap/'

const CONTENT_TYPES: Record<string, string> = {'.js': 'text/javascript', '.mjs': 'text/javascript'}

const contentTypeFor = (path: string): string =>
  CONTENT_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream'

function gsapAsset(pathname: string): string | undefined {
  if (!pathname.startsWith(GSAP_PREFIX)) return undefined
  const relative = normalize(pathname.slice(GSAP_PREFIX.length))
  return relative.startsWith('..') ? undefined : join(gsapDirectory, relative)
}

function distAsset(pathname: string): string | undefined {
  const relative = normalize(pathname.slice(1))
  return relative.startsWith('..') ? undefined : join(DIST_DIRECTORY, relative)
}

function assetFor(pathname: string): string | undefined {
  const gsap = gsapAsset(pathname)
  if (gsap !== undefined) return gsap
  return distAsset(pathname)
}

const isReadable = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  )

const isHarnessDocument = (pathname: string): boolean => pathname === '/' || pathname === '/index.html'

async function fulfillFile(route: Route, path: string): Promise<void> {
  const body = await readFile(path)
  await route.fulfill({headers: {'content-type': contentTypeFor(path), 'cache-control': 'no-store'}, body})
}

async function handleRoute(route: Route): Promise<void> {
  const {pathname} = new URL(route.request().url())
  if (isHarnessDocument(pathname)) {
    return route.fulfill({contentType: 'text/html; charset=utf-8', body: harnessPage()})
  }
  const asset = assetFor(pathname)
  if (asset === undefined) return route.fulfill({status: 404, body: ''})
  if (!(await isReadable(asset))) return route.fulfill({status: 404, body: ''})
  return fulfillFile(route, asset)
}

export async function openMascotPage(page: Page): Promise<void> {
  await access(RIG_BUNDLE)
  await page.addInitScript(frameCountingScript())
  await page.route(`${MASCOT_BASE}**`, handleRoute)
  await page.goto(MASCOT_BASE, {waitUntil: 'domcontentloaded'})
  await expect(page.locator('html[data-harness="ready"]')).toBeAttached()
}

export const settle = (page: Page, milliseconds: number): Promise<void> =>
  page.evaluate((wait) => window.mascotHarness.wait(wait), milliseconds)

export const installManualClock = (page: Page): Promise<void> =>
  page.evaluate(() => window.mascotHarness.installManualClock())

export function buildLegacyRig(page: Page): Promise<StagePoint> {
  return page.evaluate(() => {
    const harness = window.mascotHarness
    const parts = harness.buildStage()
    window.parts = parts
    window.rig = harness.mascot.createFabRobotRig(parts)
    return harness.stageCenter(parts.root)
  })
}

function buildStage(
  page: Page,
  config: MascotConfig,
  withBinary: boolean,
  stageSizePx?: number,
  layerInsetPx?: number,
): Promise<StagePoint> {
  return page.evaluate(
    ([initial, binary, sizePx, insetPx]) => {
      const harness = window.mascotHarness
      const parts = harness.buildStage(sizePx, insetPx)
      window.parts = parts
      window.service = harness.mascot.createMascot(initial)
      window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      if (!binary) return harness.stageCenter(parts.root)
      window.service.mountEffect('binary', harness.mascot.binaryEffect)
      return harness.stageCenter(parts.root)
    },
    [config, withBinary, stageSizePx, layerInsetPx] as const,
  )
}

export type StagePlacement = {left: number; top: number}

export type DigitPlacement = {riderLeft: string; riderTop: string; glyphLeft: string; glyphTop: string}

export function buildCurvedService(
  page: Page,
  config: MascotConfig,
  curve: CurveStyle,
  placement: StagePlacement,
  stageSizePx: number,
): Promise<StagePoint> {
  return page.evaluate(
    ([initial, style, spot, sizePx]) => {
      const harness = window.mascotHarness
      const parts = harness.buildStage(sizePx, 0, spot)
      window.parts = parts
      window.service = harness.mascot.createMascot(initial)
      window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      window.service.mountEffect('binary', harness.mascot.configureBinaryEffect({curve: style}))
      return harness.stageCenter(parts.root)
    },
    [config, curve, placement, stageSizePx] as const,
  )
}

export const buildService = (
  page: Page,
  config: MascotConfig,
  stageSizePx?: number,
  layerInsetPx?: number,
): Promise<StagePoint> => buildStage(page, config, true, stageSizePx, layerInsetPx)

export const buildBareService = (page: Page, config: MascotConfig): Promise<StagePoint> =>
  buildStage(page, config, false)

export async function openIdleService(page: Page): Promise<void> {
  await installManualClock(page)
  await buildService(page, {state: 'rest', working: false, follow: false})
}

export type Gaze = {eyesX: number; eyesY: number; lean: number}

export function readGaze(page: Page): Promise<Gaze> {
  return page.evaluate(() => ({
    eyesX: window.mascotHarness.property(window.parts.eyes, 'x'),
    eyesY: window.mascotHarness.property(window.parts.eyes, 'y'),
    lean: window.mascotHarness.property(window.parts.antenna.parentElement, 'rotation'),
  }))
}

export type StageSize = {width: number; height: number}

export const restTip = (stage: StageSize): StagePoint => ({x: stage.width * 0.5, y: stage.height * 0.15625})

const ANTENNA_ORIGIN_FRACTION_Y = 0.328

export function tipUnderTransform(stage: StageSize, scaleY: number, yPercent: number): StagePoint {
  const originY = stage.height * ANTENNA_ORIGIN_FRACTION_Y
  return {
    x: stage.width * 0.5,
    y: originY + (restTip(stage).y - originY) * scaleY + (stage.height * yPercent) / 100,
  }
}

export type EmitterGeometryExpectation = {
  fontSizePx: number
  leadingLeft: number
  trailingLeft: number
  top: number
  risePx: number
}

export const PRODUCT_FAB_ANTENNA_PX = 44

export function expectedEmitterGeometry(antennaBoxPx: number): EmitterGeometryExpectation {
  const factor = antennaBoxPx / PRODUCT_FAB_ANTENNA_PX
  return {
    fontSizePx: 9 * factor,
    leadingLeft: (-4 + 3) * factor,
    trailingLeft: (-4 - 3) * factor,
    top: -12 * factor,
    risePx: -54 * factor,
  }
}
