import {access, readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, type Page, type Route} from '@playwright/test'
import {robotSkin, type CurveStyle, type MascotConfig} from '../../src/core/index.js'
import {
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
} from '../../src/core/config.js'

const FRAME_COUNTING_SCRIPT = `
  const pendingFrames = new Set()
  const requestFrame = window.requestAnimationFrame.bind(window)
  const cancelFrame = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) => {
    const handle = requestFrame((now) => {
      pendingFrames.delete(handle)
      callback(now)
    })
    pendingFrames.add(handle)
    return handle
  }
  window.cancelAnimationFrame = (handle) => {
    pendingFrames.delete(handle)
    cancelFrame(handle)
  }
  Object.defineProperty(window, 'pendingFrameLoopCount', {get: () => pendingFrames.size})
`

export const frameCountingScript = (): string => FRAME_COUNTING_SCRIPT

const LAYOUT_COUNTING_SCRIPT = `
  const OFFSET_PROPERTIES = ['offsetLeft', 'offsetTop', 'offsetWidth', 'offsetHeight', 'offsetParent']
  const layoutReads = {computedStyle: 0, offset: 0, rect: 0}
  const readComputedStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (element, pseudoElement) => {
    layoutReads.computedStyle += 1
    return readComputedStyle(element, pseudoElement)
  }
  const readRect = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function () {
    layoutReads.rect += 1
    return readRect.call(this)
  }
  OFFSET_PROPERTIES.forEach((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
    const read = descriptor.get
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        layoutReads.offset += 1
        return read.call(this)
      },
    })
  })
  Object.defineProperty(window, 'layoutReads', {get: () => ({...layoutReads})})
`

export const layoutCountingScript = (): string => LAYOUT_COUNTING_SCRIPT

const HARNESS_SCRIPT = `
  import gsap from 'gsap'
  import * as mascot from '/core/index.js'
  import {binaryEffect, configureBinaryEffect} from '/core/effects/binary.js'

  let pointerMoveListeners = 0
  const addListener = window.addEventListener.bind(window)
  const removeListener = window.removeEventListener.bind(window)
  window.addEventListener = (type, listener, options) => {
    if (type === 'pointermove') pointerMoveListeners += 1
    addListener(type, listener, options)
  }
  window.removeEventListener = (type, listener, options) => {
    if (type === 'pointermove') pointerMoveListeners -= 1
    removeListener(type, listener, options)
  }
  Object.defineProperty(window, 'pointerMoveListenerCount', {get: () => pointerMoveListeners})

  const pendingFrameCount = () => window.pendingFrameLoopCount

  const settleFrames = () =>
    new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => resolve(pendingFrameCount()), 0)))

  const loadEffect = async (name, exportName) => {
    const module = await import('/core/effects/' + name + '.js')
    const mount = module[exportName]
    if (typeof mount !== 'function') throw new Error('the ' + name + ' module exports no ' + exportName + ' mount')
    return mount
  }

  const layerStyle = (insetPx) =>
    'position:absolute;inset:' + insetPx + 'px;background-repeat:no-repeat;background-position:center;' +
    'background-size:contain;image-rendering:pixelated;will-change:transform'

  const DEFAULT_STAGE_SIZE_PX = 120

  const DEFAULT_PLACEMENT = {left: 560, top: 300}

  const stageStyle = (sizePx, placement) =>
    'position:absolute;left:' + placement.left + 'px;top:' + placement.top + 'px;display:block;width:' +
    sizePx + 'px;height:' + sizePx + 'px'

  const makeLayer = (image, insetPx) => {
    const layer = document.createElement('div')
    layer.style.cssText = layerStyle(insetPx) + ";background-image:url('" + image + "')"
    return layer
  }

  const buildStage = (sizePx = DEFAULT_STAGE_SIZE_PX, layerInsetPx = 0, placement = DEFAULT_PLACEMENT) => {
    const root = document.createElement('div')
    root.style.cssText = stageStyle(sizePx, placement)
    const head = makeLayer(mascot.robotLayers.head, layerInsetPx)
    const eyes = makeLayer(mascot.robotLayers.eyes, layerInsetPx)
    const antenna = makeLayer(mascot.robotLayers.antenna, layerInsetPx)
    root.append(head, eyes, antenna)
    document.body.append(root)
    return {root, head, eyes, antenna}
  }

  const SCROLL_VIEWPORT_PX = 240

  const SCROLL_RUNWAY_PX = 1400

  const buildScrollStage = (sizePx = DEFAULT_STAGE_SIZE_PX) => {
    const scroller = document.createElement('div')
    scroller.style.cssText =
      'position:absolute;left:40px;top:40px;width:320px;height:' + SCROLL_VIEWPORT_PX + 'px;overflow:auto'
    const runway = document.createElement('div')
    runway.style.cssText = 'position:relative;height:' + SCROLL_RUNWAY_PX + 'px'
    const root = document.createElement('div')
    root.style.cssText =
      'position:absolute;left:0;top:0;display:block;width:' + sizePx + 'px;height:' + sizePx + 'px'
    const head = makeLayer(mascot.robotLayers.head, 0)
    const eyes = makeLayer(mascot.robotLayers.eyes, 0)
    const antenna = makeLayer(mascot.robotLayers.antenna, 0)
    root.append(head, eyes, antenna)
    runway.append(root)
    scroller.append(runway)
    document.body.append(scroller)
    return {scroller, root, head, eyes, antenna}
  }

  const buildBareStage = (sizePx = DEFAULT_STAGE_SIZE_PX) => {
    const root = document.createElement('div')
    root.style.cssText = stageStyle(sizePx, DEFAULT_PLACEMENT)
    document.body.append(root)
    return root
  }

  const applyStyle = (element, style) => {
    Object.entries(style).forEach(([property, value]) => element.style.setProperty(property, value))
    return element
  }

  const hiddenSpans = () => Array.from(document.querySelectorAll('span[aria-hidden="true"]'))

  const isDigit = (child) => child.textContent === '0' || child.textContent === '1'

  const isEmitter = (element) => element.childElementCount === 5 && Array.from(element.children).every(isDigit)

  const isLeanWrapper = (element) => element.childElementCount === 1 && !isEmitter(element)

  const leanWrappers = () => hiddenSpans().filter(isLeanWrapper)

  const emitters = () => hiddenSpans().filter(isEmitter)

  const requireEmitter = () => {
    const emitter = emitters()[0]
    if (emitter === undefined) throw new Error('no binary emitter is mounted')
    return emitter
  }

  const requireStreamEmitter = (host, particleCount) => {
    const shell = Array.from(host.children).find(
      (child) => child.getAttribute('aria-hidden') === 'true' && child.childElementCount === particleCount,
    )
    if (shell === undefined) {
      throw new Error('no stream emitter with ' + particleCount + ' particles is mounted')
    }
    return shell
  }

  const requireLeanWrapper = () => {
    const wrapper = leanWrappers()[0]
    if (wrapper === undefined) throw new Error('no lean wrapper is mounted')
    return wrapper
  }

  const requireCanvas = (host) => {
    const canvas = host.querySelector('canvas')
    if (canvas === null) throw new Error('no canvas effect is mounted')
    return canvas
  }

  const canvasSignature = (canvas) => {
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('the canvas effect has no 2d context')
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height)
    return data.reduce((total, value, index) => total + value * ((index % 7) + 1), 0)
  }

  const canvasInk = (canvas) => {
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('the canvas effect has no 2d context')
    const {data} = context.getImageData(0, 0, canvas.width, canvas.height)
    let total = 0
    for (let index = 3; index < data.length; index += 4) total += data[index]
    return total
  }

  const tickerListenerCount = () => gsap.ticker._listeners.length

  const requireParticle = (emitter, index) => {
    const particle = emitter.children[index]
    if (!(particle instanceof HTMLElement)) throw new Error('the emitter has no particle at index ' + index)
    return particle
  }

  const requireRealClock = (call) => {
    if (!manualClockInstalled) return
    throw new Error(
      'the manual clock owns time: ' + call + ' cannot advance an animation, use advanceBy/advanceTo instead',
    )
  }

  const wait = (milliseconds) => {
    requireRealClock('wait(' + milliseconds + ')')
    return new Promise((resolve) => setTimeout(resolve, milliseconds))
  }

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))

  const sampleFrames = async (read, milliseconds) => {
    requireRealClock('sampleFrames(' + milliseconds + ')')
    const deadline = performance.now() + milliseconds
    const values = [read()]
    while (performance.now() < deadline) {
      await nextFrame()
      values.push(read())
    }
    return values
  }

  let manualClockInstalled = false

  const effectRuns = []

  const countingEffect = (context) => {
    const element = document.createElement('span')
    element.setAttribute('aria-hidden', 'true')
    context.host.append(element)
    const run = {starts: 0, stops: 0, removes: 0, rests: 0, element}
    effectRuns.push(run)
    let exit
    const rest = () => {
      run.rests += 1
      exit?.kill()
      exit = undefined
      element.remove()
    }
    const remove = () => {
      run.removes += 1
      exit?.kill()
      exit = undefined
      element.remove()
    }
    const start = () => {
      run.starts += 1
      exit?.kill()
      exit = undefined
      context.host.append(element)
      gsap.set(element, {opacity: 1})
    }
    const stop = (onRemoved) => {
      run.stops += 1
      if (exit !== undefined) return
      exit = gsap.to(element, {
        opacity: 0,
        duration: 0.5,
        onComplete: () => {
          exit = undefined
          rest()
          onRemoved()
        },
      })
    }
    return {start, stop, remove, rest}
  }

  const countingEffectTotals = () =>
    effectRuns.reduce(
      (total, run) => ({
        starts: total.starts + run.starts,
        stops: total.stops + run.stops,
        removes: total.removes + run.removes,
        rests: total.rests + run.rests,
        live: total.live + (run.element.isConnected ? 1 : 0),
      }),
      {starts: 0, stops: 0, removes: 0, rests: 0, live: 0},
    )

  const MANUAL_STEP_S = 1 / 60

  let manualOriginS = 0
  let manualElapsedS = 0

  const renderManualClock = () => gsap.updateRoot(manualOriginS + manualElapsedS)

  const installManualClock = () => {
    gsap.ticker.lagSmoothing(0)
    gsap.ticker.remove(gsap.updateRoot)
    manualOriginS = gsap.ticker.time
    manualElapsedS = 0
    manualClockInstalled = true
    renderManualClock()
  }

  const advanceTo = (seconds) => {
    if (seconds < manualElapsedS) {
      throw new Error('the manual clock only moves forward: cannot rewind from ' + manualElapsedS + ' to ' + seconds)
    }
    while (manualElapsedS + MANUAL_STEP_S < seconds) {
      manualElapsedS += MANUAL_STEP_S
      renderManualClock()
    }
    manualElapsedS = seconds
    renderManualClock()
  }

  const advanceBy = (seconds) => advanceTo(manualElapsedS + seconds)

  const stepFrames = (read, seconds) => {
    const target = manualElapsedS + seconds
    const values = [read()]
    while (manualElapsedS < target) {
      advanceTo(Math.min(manualElapsedS + MANUAL_STEP_S, target))
      values.push(read())
    }
    return values
  }

  const summarize = (values) => ({
    min: Math.round(Math.min(...values) * 1000) / 1000,
    max: Math.round(Math.max(...values) * 1000) / 1000,
    last: Math.round(values[values.length - 1] * 1000) / 1000,
  })

  const reversals = (values, deadband) => {
    const directions = []
    let anchor = values[0]
    values.forEach((value) => {
      const delta = value - anchor
      if (Math.abs(delta) < deadband) return
      directions.push(Math.sign(delta))
      anchor = value
    })
    return directions.filter((direction, index) => index > 0 && direction !== directions[index - 1]).length
  }

  const waitUntil = async (predicate, milliseconds) => {
    requireRealClock('waitUntil(' + milliseconds + ')')
    const deadline = performance.now() + milliseconds
    while (performance.now() < deadline && !predicate()) await nextFrame()
    return predicate()
  }

  let resizeSettled = Promise.resolve()

  const watchResize = () => {
    resizeSettled = new Promise((resolve) => window.addEventListener('resize', () => resolve(), {once: true}))
  }

  const awaitResize = () => resizeSettled

  const property = (element, name) => Number.parseFloat(gsap.getProperty(element, name))

  const stageCenter = (root) => {
    const bounds = root.getBoundingClientRect()
    return {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2}
  }

  const globalTweenCount = () => gsap.globalTimeline.getChildren(true, true, true).length

  const activeWritersOf = (element) => gsap.getTweensOf(element).filter((tween) => tween.isActive()).length

  const activeWritersOfProperty = (element, property) =>
    gsap.getTweensOf(element).filter((tween) => tween.isActive() && Object.hasOwn(tween.vars, property)).length

  const boxOf = (element) => ({
    left: element.offsetLeft + property(element, 'x'),
    top: element.offsetTop + property(element, 'y'),
  })

  const anchorOf = (element) => ({
    left: parseFloat(element.style.left) + property(element, 'x'),
    top: parseFloat(element.style.top) + property(element, 'y'),
  })

  const layoutReads = () => {
    const reads = window.layoutReads
    if (reads === undefined) throw new Error('this page was opened without layout-read counting')
    return reads
  }

  const transformOriginOf = (element) => String(gsap.getProperty(element, 'transformOrigin'))

  const failingEffect = () => {
    throw new Error('this effect refuses to mount')
  }

  const particleFlightOf = (emitter, index) => {
    const particle = requireParticle(emitter, index)
    return {
      left: parseFloat(emitter.style.left) + property(emitter, 'x') + property(particle, 'x'),
      top: parseFloat(emitter.style.top) + property(emitter, 'y') + property(particle, 'y'),
    }
  }

  let mountWatch

  const watchEmitterMounts = () => {
    mountWatch?.observer.disconnect()
    const watch = {mounts: 0, observer: undefined}
    const tally = (records) =>
      records.forEach((record) =>
        Array.from(record.addedNodes).forEach((node) => {
          if (node instanceof HTMLElement && isEmitter(node)) watch.mounts += 1
        }),
      )
    watch.observer = new MutationObserver(tally)
    watch.observer.observe(document.body, {childList: true, subtree: true})
    watch.tally = tally
    mountWatch = watch
  }

  const emitterMounts = () => {
    if (mountWatch === undefined) throw new Error('call watchEmitterMounts() before reading emitterMounts()')
    mountWatch.tally(mountWatch.observer.takeRecords())
    return mountWatch.mounts
  }

  const SETTLE_FRAME_LIMIT = 20

  const settleUntil = async (predicate, frames = SETTLE_FRAME_LIMIT) => {
    for (let frame = 0; frame < frames; frame += 1) {
      if (predicate()) return true
      await settleFrames()
    }
    return predicate()
  }

  const emitterFlight = (parts, seconds) => {
    const emitter = requireEmitter()
    const digit = requireParticle(emitter, 0)
    const launchLeft = particleFlightOf(emitter, 0).left
    const geometry = emitterGeometry(emitter)
    return {
      launchLeft,
      stageWidth: parts.root.offsetWidth,
      antennaPx: Math.min(parts.antenna.offsetWidth, parts.antenna.offsetHeight),
      fontSizePx: geometry.fontSizePx,
      leadingLeft: geometry.leadingLeft,
      top: geometry.top,
      rise: stepFrames(() => property(digit, 'y'), seconds),
    }
  }

  const digitOffset = (emitter, index) => {
    const digit = requireParticle(emitter, index)
    const glyph = digit.firstElementChild
    if (!(glyph instanceof HTMLElement)) {
      return {left: parseFloat(digit.style.left), top: parseFloat(digit.style.top)}
    }
    return {
      left: parseFloat(digit.style.left) + parseFloat(glyph.style.left),
      top: parseFloat(digit.style.top) + parseFloat(glyph.style.top),
    }
  }

  const emitterGeometry = (emitter) => ({
    fontSizePx: parseFloat(emitter.style.fontSize),
    leadingLeft: digitOffset(emitter, 0).left,
    trailingLeft: digitOffset(emitter, 1).left,
    top: digitOffset(emitter, 0).top,
  })

  const curvedDigitPlacement = (emitter, index) => {
    const rider = requireParticle(emitter, index)
    const glyph = rider.firstElementChild
    if (!(glyph instanceof HTMLElement)) {
      throw new Error('the digit at index ' + index + ' is not a curve rider')
    }
    return {
      riderLeft: rider.style.left,
      riderTop: rider.style.top,
      glyphLeft: glyph.style.left,
      glyphTop: glyph.style.top,
    }
  }

  const repeatingTimeline = () =>
    gsap.globalTimeline.getChildren(false, false, true).find((child) => child.repeat() === -1)

  window.mascotHarness = {
    mascot: {...mascot, binaryEffect, configureBinaryEffect},
    buildStage,
    buildBareStage,
    buildScrollStage,
    applyStyle,
    leanWrappers,
    emitters,
    requireEmitter,
    requireStreamEmitter,
    requireLeanWrapper,
    requireParticle,
    requireCanvas,
    canvasSignature,
    canvasInk,
    tickerListenerCount,
    pendingFrameCount,
    settleFrames,
    loadEffect,
    emitterGeometry,
    emitterFlight,
    watchEmitterMounts,
    emitterMounts,
    settleUntil,
    curvedDigitPlacement,
    countingEffect,
    countingEffectTotals,
    failingEffect,
    layoutReads,
    transformOriginOf,
    wait,
    nextFrame,
    sampleFrames,
    installManualClock,
    advanceTo,
    advanceBy,
    stepFrames,
    summarize,
    reversals,
    waitUntil,
    property,
    stageCenter,
    watchResize,
    awaitResize,
    globalTweenCount,
    activeWritersOf,
    activeWritersOfProperty,
    boxOf,
    anchorOf,
    particleFlightOf,
    repeatingTimeline,
  }
  document.documentElement.dataset.harness = 'ready'
`

export const harnessPage = (): string =>
  `<!doctype html><html><head>
    <meta charset="utf-8" />
    <title>@conciv/mascot behavior harness</title>
    <style>html,body{margin:0;height:100%;background:#101014}</style>
    <script type="importmap">{"imports":{"gsap":"/gsap/index.js","gsap/MotionPathPlugin":"/gsap/MotionPathPlugin.js"}}</script>
  </head><body>
    <script type="module">${HARNESS_SCRIPT}</script>
  </body></html>`

export type StagePoint = {x: number; y: number}

export type StageParts = {root: HTMLElement; head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

const helperDirectory = dirname(fileURLToPath(import.meta.url))
const packageDirectory = join(helperDirectory, '..', '..')
const gsapDirectory = dirname(createRequire(import.meta.url).resolve('gsap/package.json'))

const DIST_DIRECTORY = join(packageDirectory, 'dist')

const CORE_BUNDLE = join(DIST_DIRECTORY, 'core/index.js')

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

export type MascotPageOptions = {countLayoutReads: boolean}

export async function openMascotPage(page: Page, options?: MascotPageOptions): Promise<void> {
  await access(CORE_BUNDLE)
  await page.addInitScript(frameCountingScript())
  if (options?.countLayoutReads === true) await page.addInitScript(layoutCountingScript())
  await page.route(`${MASCOT_BASE}**`, handleRoute)
  await page.goto(MASCOT_BASE, {waitUntil: 'domcontentloaded'})
  await expect(page.locator('html[data-harness="ready"]')).toBeAttached()
}

export const settle = (page: Page, milliseconds: number): Promise<void> =>
  page.evaluate((wait) => window.mascotHarness.wait(wait), milliseconds)

export const installManualClock = (page: Page): Promise<void> =>
  page.evaluate(() => window.mascotHarness.installManualClock())

export type StagePlacement = {left: number; top: number}

export type DigitPlacement = {riderLeft: string; riderTop: string; glyphLeft: string; glyphTop: string}

type StageSetup = {
  config: MascotConfig
  binary: boolean
  curve?: CurveStyle
  placement?: StagePlacement
  stageSizePx?: number
  layerInsetPx?: number
}

function buildStage(page: Page, setup: StageSetup): Promise<StagePoint> {
  return page.evaluate((options) => {
    const harness = window.mascotHarness
    const parts = harness.buildStage(options.stageSizePx, options.layerInsetPx, options.placement)
    window.parts = parts
    window.service = harness.mascot.createMascot(options.config)
    window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
    if (!options.binary) return harness.stageCenter(parts.root)
    const style = options.curve
    const mount =
      style === undefined ? harness.mascot.binaryEffect : harness.mascot.configureBinaryEffect({curve: style})
    window.service.mountEffect('binary', mount)
    return harness.stageCenter(parts.root)
  }, setup)
}

export const buildCurvedService = (
  page: Page,
  config: MascotConfig,
  curve: CurveStyle,
  placement: StagePlacement,
  stageSizePx: number,
): Promise<StagePoint> => buildStage(page, {config, binary: true, curve, placement, stageSizePx, layerInsetPx: 0})

export const buildPlacedService = (
  page: Page,
  config: MascotConfig,
  placement: StagePlacement,
  stageSizePx: number,
): Promise<StagePoint> => buildStage(page, {config, binary: true, placement, stageSizePx, layerInsetPx: 0})

export const buildService = (
  page: Page,
  config: MascotConfig,
  stageSizePx?: number,
  layerInsetPx?: number,
): Promise<StagePoint> => buildStage(page, {config, binary: true, stageSizePx, layerInsetPx})

export const buildStraightService = (page: Page, config: MascotConfig): Promise<StagePoint> =>
  buildStage(page, {config, binary: true, curve: 'straight'})

export const buildBareService = (page: Page, config: MascotConfig): Promise<StagePoint> =>
  buildStage(page, {config, binary: false})

export async function openIdleService(page: Page): Promise<void> {
  await installManualClock(page)
  await buildService(page, {state: 'rest', working: false, follow: false})
}

export async function openStreamService(page: Page, effectName: string, exportName: string): Promise<void> {
  await installManualClock(page)
  await page.evaluate(
    async ({name, mount}) => {
      const harness = window.mascotHarness
      const effect = await harness.loadEffect(name, mount)
      const parts = harness.buildStage()
      window.parts = parts
      window.service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
      window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
      window.service.mountEffect(name, effect)
    },
    {name: effectName, mount: exportName},
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

export const restTip = (stage: StageSize): StagePoint => ({
  x: stage.width * robotSkin.tipFractions.x,
  y: stage.height * robotSkin.tipFractions.y,
})

const ANTENNA_ORIGIN_FRACTION_Y = robotSkin.originFractions.y

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

const LAUNCH_JUMP_PX = 10

export const FRAMES_PER_SECOND = 60

const LAUNCH_FRAME_COLUMNS = BINARY_EMITTER_DIGIT_COUNT + 2

export type Launch = {top: number; tipY: number}

export const stepsBetween = (values: readonly number[]): number[] =>
  values.slice(1).map((value, index) => value - (values[index] ?? 0))

export const launchFrames = (tops: readonly number[], travelPx = BINARY_EMITTER_RISE_PX): number[] =>
  stepsBetween(tops)
    .map((step, index) => (step * Math.sign(travelPx) < -LAUNCH_JUMP_PX ? index + 1 : -1))
    .filter((index) => index >= 0)

export function medianStep(values: readonly number[]): number {
  const sorted = stepsBetween(values).toSorted((left, right) => left - right)
  if (sorted.length === 0) throw new Error('a median step needs at least two samples')
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

export const scaleFactorOf = (antennaPx: number): number => antennaPx / robotSkin.referenceAntennaPx

export const travelPerFrame = (travelPx: number, durationS: number, antennaPx: number): number =>
  (travelPx * scaleFactorOf(antennaPx)) / durationS / FRAMES_PER_SECOND

export const risePerFrame = (antennaPx: number): number =>
  travelPerFrame(BINARY_EMITTER_RISE_PX, BINARY_EMITTER_RISE_DURATION_S, antennaPx)

function requireLaunchFrames(frames: readonly number[][]): number[][] {
  const ragged = frames.find((frame) => frame.length !== LAUNCH_FRAME_COLUMNS)
  if (ragged === undefined) return frames.map((frame) => [...frame])
  throw new Error(
    `a launch frame carries ${LAUNCH_FRAME_COLUMNS} columns (${BINARY_EMITTER_DIGIT_COUNT} digit tops, scaleY, yPercent) but one carried ${ragged.length}`,
  )
}

export function collectLaunches(frames: readonly number[][], stage: StageSize): Launch[] {
  const rows = requireLaunchFrames(frames)
  const column = (index: number): number[] => rows.map((frame) => frame[index] ?? Number.NaN)
  const scaleY = column(BINARY_EMITTER_DIGIT_COUNT)
  const yPercent = column(BINARY_EMITTER_DIGIT_COUNT + 1)
  const digitTops = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, digit) => column(digit))
  return digitTops.flatMap((tops) =>
    launchFrames(tops).map((frame) => ({
      top: tops[frame] ?? Number.NaN,
      tipY: tipUnderTransform(stage, scaleY[frame] ?? Number.NaN, yPercent[frame] ?? Number.NaN).y,
    })),
  )
}

export function expectNear(label: string, value: number, target: number, tolerance: number): void {
  expect(Math.abs(value - target) <= tolerance, `${label}: got ${value}, expected ${target} +/- ${tolerance}`).toBe(
    true,
  )
}
