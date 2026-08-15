import {access, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, type Page, type Route} from '@playwright/test'
import type {MascotConfig} from '../../../src/rig.js'
import {harnessPage} from './harness-page.js'

export type StagePoint = {x: number; y: number}

export type StageParts = {root: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

const helperDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = join(helperDirectory, '..', '..', '..')
const gsapDirectory = dirname(createRequire(import.meta.url).resolve('gsap/package.json'))

const RIG_BUNDLE = join(packageDirectory, 'dist', 'rig.js')

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

function assetFor(pathname: string): string | undefined {
  if (pathname === '/rig.js') return RIG_BUNDLE
  return gsapAsset(pathname)
}

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
  return fulfillFile(route, asset)
}

export async function openMascotPage(page: Page): Promise<void> {
  await access(RIG_BUNDLE)
  await page.route(`${MASCOT_BASE}**`, handleRoute)
  await page.goto(MASCOT_BASE, {waitUntil: 'domcontentloaded'})
  await expect(page.locator('html[data-harness="ready"]')).toBeAttached()
}

export const settle = (page: Page, milliseconds: number): Promise<void> =>
  page.evaluate((wait) => window.mascotHarness.wait(wait), milliseconds)

export function buildLegacyRig(page: Page): Promise<StagePoint> {
  return page.evaluate(() => {
    const harness = window.mascotHarness
    const parts = harness.buildStage()
    window.parts = parts
    window.rig = harness.mascot.createFabRobotRig(parts)
    return harness.stageCenter(parts.root)
  })
}

export function buildService(page: Page, config: MascotConfig, stageSizePx?: number): Promise<StagePoint> {
  return page.evaluate(
    ([initial, sizePx]) => {
      const harness = window.mascotHarness
      const parts = harness.buildStage(sizePx)
      window.parts = parts
      window.service = harness.mascot.createMascot(initial)
      window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      return harness.stageCenter(parts.root)
    },
    [config, stageSizePx] as const,
  )
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

export type EmitterGeometryExpectation = {
  fontSizePx: number
  leadingLeft: number
  trailingLeft: number
  top: number
  risePx: number
}

export const PRODUCT_FAB_STAGE_PX = 44

export function expectedEmitterGeometry(stageSizePx: number): EmitterGeometryExpectation {
  const factor = stageSizePx / PRODUCT_FAB_STAGE_PX
  return {
    fontSizePx: 9 * factor,
    leadingLeft: (-4 + 3) * factor,
    trailingLeft: (-4 - 3) * factor,
    top: -12 * factor,
    risePx: -54 * factor,
  }
}
