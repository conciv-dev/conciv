import {createReadStream} from 'node:fs'
import {access} from 'node:fs/promises'
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
import {dirname, join, normalize} from 'node:path'
import {fileURLToPath} from 'node:url'
import {chromium} from 'playwright'

const require = createRequire(import.meta.url)
const harnessDirectory = dirname(fileURLToPath(import.meta.url))
const gsapDirectory = dirname(require.resolve('gsap/package.json'))

const argumentValue = (name, fallback) => {
  const match = process.argv.slice(2).find((entry) => entry.startsWith(`--${name}=`))
  return match === undefined ? fallback : match.slice(name.length + 3)
}

const distDirectory = normalize(argumentValue('dist', join(harnessDirectory, '..', 'dist')))
const onlySection = argumentValue('only', 'all')

const CONTENT_TYPES = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript'}

const contentTypeFor = (path) => CONTENT_TYPES[path.slice(path.lastIndexOf('.'))] ?? 'application/octet-stream'

const GSAP_PREFIX = '/gsap/'

const ROUTES = {
  '/': () => join(harnessDirectory, 'page.html'),
  '/index.html': () => join(harnessDirectory, 'page.html'),
  '/rig.js': () => join(distDirectory, 'rig.js'),
}

const gsapAsset = (url) => {
  if (!url.startsWith(GSAP_PREFIX)) return undefined
  const relative = normalize(url.slice(GSAP_PREFIX.length))
  return relative.startsWith('..') ? undefined : join(gsapDirectory, relative)
}

const resolveRequest = (url) => ROUTES[url]?.() ?? gsapAsset(url)

const serveFile = (response, path) => {
  response.writeHead(200, {'content-type': contentTypeFor(path), 'cache-control': 'no-store'})
  createReadStream(path)
    .on('error', () => response.destroy())
    .pipe(response)
}

const startServer = () =>
  new Promise((resolve) => {
    const server = createServer((request, response) => {
      const path = resolveRequest(request.url ?? '/')
      if (path === undefined) return response.writeHead(404).end()
      serveFile(response, path)
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })

const instrumentPointerMove = () => {
  let count = 0
  const add = window.addEventListener.bind(window)
  const remove = window.removeEventListener.bind(window)
  window.addEventListener = (type, listener, options) => {
    if (type === 'pointermove') count += 1
    add(type, listener, options)
  }
  window.removeEventListener = (type, listener, options) => {
    if (type === 'pointermove') count -= 1
    remove(type, listener, options)
  }
  Object.defineProperty(window, 'pointerMoveListenerCount', {get: () => count})
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance

const VIEWPORT = {width: 1280, height: 720}

const openPage = async (browser, baseUrl, reducedMotion) => {
  const page = await browser.newPage({viewport: VIEWPORT})
  await page.addInitScript(instrumentPointerMove)
  await page.emulateMedia({reducedMotion})
  await page.goto(baseUrl, {waitUntil: 'domcontentloaded'})
  await page.waitForSelector('html[data-harness="ready"]')
  return page
}

const buildLegacyRig = (page) =>
  page.evaluate(() => {
    const harness = window.mascotHarness
    const parts = harness.buildStage()
    window.parts = parts
    window.rig = harness.mascot.createFabRobotRig(parts)
    return harness.stageCenter(parts.root)
  })

const buildService = (page, config) =>
  page.evaluate((initial) => {
    const harness = window.mascotHarness
    const parts = harness.buildStage()
    window.parts = parts
    window.service = harness.mascot.createMascot(initial)
    window.service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
    return harness.stageCenter(parts.root)
  }, config)

const readGaze = (page) =>
  page.evaluate(() => ({
    eyesX: window.mascotHarness.property(window.parts.eyes, 'x'),
    eyesY: window.mascotHarness.property(window.parts.eyes, 'y'),
    lean: window.mascotHarness.property(window.parts.antenna.parentElement, 'rotation'),
  }))

const checkLegacyClosedGaze = async (page) => {
  const center = await buildLegacyRig(page)
  await page.mouse.move(center.x + 400, center.y)
  await sleep(1400)
  const right = await readGaze(page)
  await page.mouse.move(center.x - 400, center.y)
  await sleep(1400)
  const left = await readGaze(page)
  await page.mouse.move(center.x + 110, center.y)
  await sleep(1400)
  const half = await readGaze(page)
  const ratio = half.eyesX / 3
  return [
    ['saturated eyes x = +3px', near(right.eyesX, 3, 0.05), right.eyesX],
    ['saturated lean = +10deg', near(right.lean, 10, 0.1), right.lean],
    ['mirrored eyes x = -3px', near(left.eyesX, -3, 0.05), left.eyesX],
    ['mirrored lean = -10deg', near(left.lean, -10, 0.1), left.lean],
    ['half-distance falloff ratio ~ 0.5', near(ratio, 0.5, 0.05), ratio],
  ]
}

const checkLegacyWork = async (page) => {
  await buildLegacyRig(page)
  const enter = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.rig.apply('work')
    await harness.nextFrame()
    const emitter = harness.emitters()[0]
    const scales = await harness.sampleFrames(() => harness.property(emitter, 'scale'), 500)
    return {
      digits: emitter.childElementCount,
      scale: harness.summarize(scales),
      emitters: harness.emitters().length,
      anchor: harness.boxOf(emitter),
      stage: {width: window.parts.root.offsetWidth, height: window.parts.root.offsetHeight},
    }
  })
  const throb = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const values = await harness.sampleFrames(() => harness.property(window.parts.antenna, 'scaleY'), 2400)
    return {antenna: harness.summarize(values), tweens: harness.globalTweenCount()}
  })
  const exit = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.rig.apply('closed')
    const emitter = harness.emitters()[0]
    const values = await harness.sampleFrames(() => harness.property(emitter, 'opacity'), 400)
    await harness.wait(700)
    return {drain: harness.summarize(values), emitters: harness.emitters().length}
  })
  const flap = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const cycles = [0, 1, 2, 3, 4]
    for (const _cycle of cycles) {
      window.rig.apply('work')
      await harness.wait(140)
      window.rig.apply('closed')
      await harness.wait(140)
    }
    window.rig.apply('work')
    await harness.wait(1500)
    return {emitters: harness.emitters().length, tweens: harness.globalTweenCount()}
  })
  const expectedTip = {x: enter.stage.width * 0.5, y: enter.stage.height * 0.15625}
  return [
    ['emitter carries 5 digits', enter.digits === 5, enter.digits],
    [
      'emitter anchors at the antenna tip x = stage width x 0.5',
      near(enter.anchor.left, expectedTip.x, 1),
      {anchor: enter.anchor.left, expected: expectedTip.x},
    ],
    [
      'emitter anchors at the antenna tip y = stage height x 0.15625',
      near(enter.anchor.top, expectedTip.y, 1),
      {anchor: enter.anchor.top, expected: expectedTip.y},
    ],
    ['staged enter starts scaled into the tip', enter.scale.min < 0.5, enter.scale.min],
    ['staged enter overshoots to full size', enter.scale.max >= 1, enter.scale.max],
    ['exactly one emitter while working', enter.emitters === 1, enter.emitters],
    ['throb peaks at scaleY 1.3', near(throb.antenna.max, 1.3, 0.01), throb.antenna.max],
    ['throb oscillates below the peak', throb.antenna.min < 1.2, throb.antenna.min],
    ['exit starts from a fully visible emitter', exit.drain.max > 0.99, exit.drain.max],
    ['exit drains the emitter opacity', exit.drain.last < 0.7, exit.drain.last],
    ['exit removes the emitter', exit.emitters === 0, exit.emitters],
    ['five flaps leave exactly one emitter', flap.emitters === 1, flap.emitters],
    [
      'no runaway tween accumulation',
      flap.tweens <= throb.tweens,
      `${flap.tweens} after flapping vs ${throb.tweens} baseline`,
    ],
  ]
}

const checkLegacyOpenPose = async (page) => {
  await buildLegacyRig(page)
  const pose = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.rig.apply('open')
    await harness.wait(1200)
    return {
      headY: harness.property(window.parts.head, 'yPercent'),
      eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
      antennaRotation: harness.property(window.parts.antenna, 'rotation'),
      listeners: window.pointerMoveListenerCount,
    }
  })
  return [
    ['open head yPercent = -2', near(pose.headY, -2, 0.01), pose.headY],
    ['open eyes scaleY = 1.06', near(pose.eyesScaleY, 1.06, 0.01), pose.eyesScaleY],
    ['open antenna rotation = -4deg', near(pose.antennaRotation, -4, 0.01), pose.antennaRotation],
    ['open disarms the gaze listener', pose.listeners === 0, pose.listeners],
  ]
}

const checkMidWorkStateChange = async (page) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(2200)
    const emitter = harness.emitters()[0]
    const anchorBefore = harness.boxOf(emitter)
    const timelineBefore = harness.repeatingTimeline()
    window.service.update({state: 'awake', working: true, follow: false})
    const during = await harness.sampleFrames(() => harness.property(emitter, 'scale'), 900)
    const anchorAfter = harness.boxOf(emitter)
    const sameTimeline = harness.repeatingTimeline() === timelineBefore
    const values = await harness.sampleFrames(
      () => [harness.property(window.parts.antenna, 'scaleY'), harness.property(window.parts.eyes, 'scaleY')],
      2400,
    )
    return {
      antenna: harness.summarize(values.map((entry) => entry[0])),
      eyes: harness.summarize(values.map((entry) => entry[1])),
      emitterScale: harness.summarize(during),
      sameTimeline,
      sameEmitter: harness.emitters()[0] === emitter,
      emitters: harness.emitters().length,
      anchorBefore,
      anchorAfter,
    }
  })
  const anchorShift = Math.abs(result.anchorAfter.left - result.anchorBefore.left)
  return [
    ['throb still peaks at 1.3 after the change', near(result.antenna.max, 1.3, 0.01), result.antenna.max],
    ['throb still oscillates after the change', result.antenna.min < 1.2, result.antenna.min],
    ['blink still closes the eyes', result.eyes.min < 0.5, result.eyes.min],
    ['blink returns to the awake 1.06', near(result.eyes.max, 1.06, 0.01), result.eyes.max],
    ['the mid-work change keeps the ORIGINAL work timeline running', result.sameTimeline, result.sameTimeline],
    ['the mid-work change keeps the same emitter node', result.sameEmitter, result.sameEmitter],
    ['the mid-work change leaves exactly one emitter', result.emitters === 1, result.emitters],
    [
      'no returnToFull tween fires: emitter scale stays 1 across the change',
      near(result.emitterScale.min, 1, 0.001) && near(result.emitterScale.max, 1, 0.001),
      result.emitterScale,
    ],
    ['the emitter re-anchors to the leaned antenna tip', anchorShift > 0.5, {anchorShift, ...result.anchorAfter}],
  ]
}

const checkWorkToOpenSettle = async (page) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(2200)
    await harness.waitUntil(() => harness.property(window.parts.eyes, 'scaleY') > 0.99, 2000)
    window.service.update({state: 'awake', working: false, follow: false})
    const values = await harness.sampleFrames(() => harness.property(window.parts.eyes, 'scaleY'), 1100)
    return {series: harness.summarize(values), reversals: harness.reversals(values, 0.002)}
  })
  return [
    ['work to open settles at 1.06', near(result.series.last, 1.06, 0.01), result.series.last],
    ['work to open never dips below 1.0', result.series.min >= 0.999, result.series.min],
    ['work to open rises monotonically', result.reversals <= 1, result.reversals],
  ]
}

const checkConnectRefStability = async (page) => {
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
    const first = service.connect()
    const second = service.connect()
    const names = ['getRootProps', 'getHeadProps', 'getEyesProps', 'getAntennaProps', 'getEffectHostProps']
    const sameGetterTwice = names.every((name) => first[name]().ref === first[name]().ref)
    const sameAcrossConnectCalls = names.every((name) => first[name]().ref === second[name]().ref)
    const parts = harness.buildStage()
    harness.applyStyle(parts.root, first.getRootProps().style)
    harness.applyStyle(parts.head, first.getHeadProps().style)
    harness.applyStyle(parts.eyes, first.getEyesProps().style)
    harness.applyStyle(parts.antenna, first.getAntennaProps().style)
    first.getRootProps().ref(parts.root)
    first.getHeadProps().ref(parts.head)
    first.getEyesProps().ref(parts.eyes)
    first.getAntennaProps().ref(parts.antenna)
    service.update({state: 'rest', working: true, follow: false})
    await harness.wait(900)
    const emitterBefore = harness.emitters()[0]
    const wrapperBefore = harness.leanWrappers()[0]
    const rebound = service.connect()
    rebound.getRootProps().ref(parts.root)
    rebound.getHeadProps().ref(parts.head)
    rebound.getEyesProps().ref(parts.eyes)
    rebound.getAntennaProps().ref(parts.antenna)
    const values = await harness.sampleFrames(() => harness.property(parts.antenna, 'scaleY'), 2200)
    return {
      sameGetterTwice,
      sameAcrossConnectCalls,
      sameEmitterNode: harness.emitters()[0] === emitterBefore,
      sameWrapperNode: harness.leanWrappers()[0] === wrapperBefore,
      emitters: harness.emitters().length,
      wrappers: harness.leanWrappers().length,
      antenna: harness.summarize(values),
    }
  })
  return [
    ['same ref identity across repeated getter calls', result.sameGetterTwice, result.sameGetterTwice],
    ['same ref identity across connect() calls', result.sameAcrossConnectCalls, result.sameAcrossConnectCalls],
    ['rebinding keeps the same emitter node', result.sameEmitterNode, result.sameEmitterNode],
    ['rebinding keeps the same lean wrapper', result.sameWrapperNode, result.sameWrapperNode],
    ['exactly one emitter after rebinding', result.emitters === 1, result.emitters],
    ['exactly one lean wrapper after rebinding', result.wrappers === 1, result.wrappers],
    ['work timeline survives the rebind', result.antenna.min < 1.3 && result.antenna.max > 1.29, result.antenna],
  ]
}

const checkStopRecovery = async (page) => {
  await buildService(page, {state: 'rest', working: false, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const settle = async () => {
      await harness.wait(1200)
      return {
        antennaScaleX: harness.property(window.parts.antenna, 'scaleX'),
        antennaScaleY: harness.property(window.parts.antenna, 'scaleY'),
        eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
      }
    }
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(2200)
    window.service.update({state: 'rest', working: false, follow: false})
    const rest = await settle()
    window.service.update({state: 'awake', working: false, follow: false})
    await harness.wait(900)
    window.service.update({state: 'awake', working: true, follow: false})
    await harness.wait(2200)
    window.service.update({state: 'awake', working: false, follow: false})
    const awake = await settle()
    return {rest, awake}
  })
  return [
    ['rest recovery antenna scaleX = 1', near(result.rest.antennaScaleX, 1, 0.001), result.rest.antennaScaleX],
    ['rest recovery antenna scaleY = 1', near(result.rest.antennaScaleY, 1, 0.001), result.rest.antennaScaleY],
    ['rest recovery eyes scaleY = 1', near(result.rest.eyesScaleY, 1, 0.001), result.rest.eyesScaleY],
    ['awake recovery antenna scaleX = 1', near(result.awake.antennaScaleX, 1, 0.001), result.awake.antennaScaleX],
    ['awake recovery antenna scaleY = 1', near(result.awake.antennaScaleY, 1, 0.001), result.awake.antennaScaleY],
    ['awake recovery eyes scaleY = 1.06', near(result.awake.eyesScaleY, 1.06, 0.001), result.awake.eyesScaleY],
  ]
}

const checkStartDuringExit = async (page) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(900)
    const before = harness.emitters()[0]
    window.service.update({state: 'rest', working: false, follow: false})
    await harness.wait(200)
    window.service.update({state: 'rest', working: true, follow: false})
    await harness.wait(900)
    return {
      sameNode: harness.emitters()[0] === before,
      opacity: harness.property(before, 'opacity'),
      emitters: harness.emitters().length,
    }
  })
  return [
    ['restart during exit reuses the emitter node', result.sameNode, result.sameNode],
    ['restart during exit returns opacity to 1', near(result.opacity, 1, 0.001), result.opacity],
    ['restart during exit leaves exactly one emitter', result.emitters === 1, result.emitters],
  ]
}

const checkDisposeDuringExit = async (page) => {
  await buildService(page, {state: 'rest', working: true, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    await harness.wait(900)
    window.service.update({state: 'rest', working: false, follow: false})
    await harness.wait(200)
    window.service.destroy()
    const immediate = {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}
    await harness.wait(900)
    return {immediate, later: {emitters: harness.emitters().length, wrappers: harness.leanWrappers().length}}
  })
  return [
    ['destroy removes every emitter immediately', result.immediate.emitters === 0, result.immediate.emitters],
    ['destroy removes every lean wrapper immediately', result.immediate.wrappers === 0, result.immediate.wrappers],
    ['no emitter resurrects after the exit window', result.later.emitters === 0, result.later.emitters],
    ['no wrapper resurrects after the exit window', result.later.wrappers === 0, result.later.wrappers],
  ]
}

const checkChannelDiscipline = async (page) => {
  await buildService(page, {state: 'rest', working: false, follow: false})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const {head, eyes, antenna} = window.parts
    const drift = () =>
      Math.max(
        Math.abs(harness.property(head, 'yPercent')),
        Math.abs(harness.property(head, 'rotation')),
        Math.abs(harness.property(head, 'scaleX') - 1),
        Math.abs(harness.property(head, 'scaleY') - 1),
        Math.abs(harness.property(eyes, 'x')),
        Math.abs(harness.property(eyes, 'y')),
      )
    window.service.update({state: 'rest', working: true, follow: false})
    const values = await harness.sampleFrames(() => [drift(), harness.property(antenna, 'scaleY')], 2400)
    return {
      drift: harness.summarize(values.map((entry) => entry[0])),
      antenna: harness.summarize(values.map((entry) => entry[1])),
    }
  })
  return [
    ['activity leaves head transform and eyes offset untouched', result.drift.max === 0, result.drift.max],
    ['the sampled window really was throbbing', near(result.antenna.max, 1.3, 0.01), result.antenna.max],
  ]
}

const checkReducedMotion = async (page) => {
  await buildService(page, {state: 'rest', working: false, follow: true})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.service.update({state: 'awake', working: false, follow: true})
    const instant = {
      headY: harness.property(window.parts.head, 'yPercent'),
      eyesScaleY: harness.property(window.parts.eyes, 'scaleY'),
      antennaRotation: harness.property(window.parts.antenna, 'rotation'),
    }
    window.service.update({state: 'awake', working: true, follow: true})
    await harness.wait(700)
    return {instant, listeners: window.pointerMoveListenerCount, emitters: harness.emitters().length}
  })
  return [
    ['reduced motion lands the head pose instantly', near(result.instant.headY, -2, 0.001), result.instant.headY],
    [
      'reduced motion lands the eyes pose instantly',
      near(result.instant.eyesScaleY, 1.06, 0.001),
      result.instant.eyesScaleY,
    ],
    [
      'reduced motion lands the antenna pose instantly',
      near(result.instant.antennaRotation, -4, 0.001),
      result.instant.antennaRotation,
    ],
    ['reduced motion attaches no pointermove listener', result.listeners === 0, result.listeners],
    ['reduced motion emits no binary effect', result.emitters === 0, result.emitters],
  ]
}

const checkFollowLifecycle = async (page) => {
  const center = await buildService(page, {state: 'rest', working: false, follow: true})
  await page.mouse.move(center.x + 400, center.y)
  await sleep(1400)
  const saturated = await readGaze(page)
  await page.mouse.move(center.x + 110, center.y)
  await sleep(1400)
  const half = await readGaze(page)
  const cycles = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const counts = []
    const rounds = [0, 1, 2, 3, 4]
    for (const _round of rounds) {
      window.service.update({state: 'rest', working: false, follow: false})
      await harness.wait(60)
      counts.push(window.pointerMoveListenerCount)
      window.service.update({state: 'rest', working: false, follow: true})
      await harness.wait(60)
      counts.push(window.pointerMoveListenerCount)
    }
    return {disarmed: counts.filter((_value, index) => index % 2 === 0), armed: counts.filter((_v, i) => i % 2 === 1)}
  })
  await page.mouse.move(center.x + 400, center.y)
  await sleep(900)
  const settled = await page.evaluate(async () => {
    const harness = window.mascotHarness
    window.service.update({state: 'rest', working: false, follow: false})
    await harness.wait(900)
    return {
      eyesX: harness.property(window.parts.eyes, 'x'),
      eyesY: harness.property(window.parts.eyes, 'y'),
      lean: harness.property(window.parts.antenna.parentElement, 'rotation'),
      listeners: window.pointerMoveListenerCount,
    }
  })
  const ratio = half.eyesX / 3
  return [
    ['gaze saturates at 3px beyond the falloff', near(saturated.eyesX, 3, 0.05), saturated.eyesX],
    ['lean saturates at 10deg beyond the falloff', near(saturated.lean, 10, 0.1), saturated.lean],
    ['half-distance falloff ratio ~ 0.5', near(ratio, 0.5, 0.05), ratio],
    ['listener count never exceeds one while armed', cycles.armed.every((count) => count === 1), cycles.armed],
    ['listener count returns to zero while disarmed', cycles.disarmed.every((count) => count === 0), cycles.disarmed],
    [
      'animated disarm settles the eyes to zero',
      near(settled.eyesX, 0, 0.001) && near(settled.eyesY, 0, 0.001),
      settled,
    ],
    ['animated disarm settles the lean to zero', near(settled.lean, 0, 0.001), settled.lean],
    ['animated disarm detaches the listener', settled.listeners === 0, settled.listeners],
  ]
}

const checkRepeatedRegisterParts = async (page) => {
  await buildService(page, {state: 'rest', working: false, follow: true})
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const {root, head, eyes, antenna} = window.parts
    const parts = {stage: root, head, eyes, antenna}
    window.service.registerParts(parts)
    window.service.registerParts(parts)
    const repeated = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
    const replacement = document.createElement('div')
    replacement.style.cssText = antenna.style.cssText
    root.append(replacement)
    window.service.registerParts({stage: root, head, eyes, antenna: replacement})
    await harness.wait(120)
    return {
      repeated,
      wrappers: harness.leanWrappers().length,
      listeners: window.pointerMoveListenerCount,
      oldAntennaRestored: antenna.parentElement === root,
      newAntennaWrapped: harness.leanWrappers()[0] === replacement.parentElement,
    }
  })
  return [
    ['repeated registerParts keeps one lean wrapper', result.repeated.wrappers === 1, result.repeated.wrappers],
    ['repeated registerParts keeps one listener', result.repeated.listeners === 1, result.repeated.listeners],
    ['re-registering a new antenna keeps one wrapper', result.wrappers === 1, result.wrappers],
    ['re-registering a new antenna keeps one listener', result.listeners === 1, result.listeners],
    ['the previous antenna is restored to its parent', result.oldAntennaRestored, result.oldAntennaRestored],
    ['the new antenna owns the lean wrapper', result.newAntennaWrapped, result.newAntennaWrapped],
  ]
}

const checkUpdateBeforeRegister = async (page) => {
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const parts = harness.buildStage()
    const service = harness.mascot.createMascot({state: 'rest', working: false, follow: false})
    let threw = false
    try {
      service.update({state: 'awake', working: true, follow: false})
    } catch {
      threw = true
    }
    const beforeRegister = harness.emitters().length
    service.registerParts({stage: parts.root, head: parts.head, eyes: parts.eyes, antenna: parts.antenna})
    const headY = harness.property(parts.head, 'yPercent')
    const eyesScaleY = harness.property(parts.eyes, 'scaleY')
    await harness.wait(600)
    return {threw, beforeRegister, headY, eyesScaleY, emitters: harness.emitters().length}
  })
  return [
    ['update before registerParts does not throw', result.threw === false, result.threw],
    ['update before registerParts starts nothing', result.beforeRegister === 0, result.beforeRegister],
    ['stored state applies on registration', near(result.headY, -2, 0.001), result.headY],
    ['stored eye pose applies on registration', near(result.eyesScaleY, 1.06, 0.001), result.eyesScaleY],
    ['stored working flag applies on registration', result.emitters === 1, result.emitters],
  ]
}

const checkPartialConnect = async (page) => {
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
    const connected = service.connect()
    const root = harness.buildBareStage()
    const head = document.createElement('div')
    const eyes = document.createElement('div')
    const antenna = document.createElement('div')
    root.append(head, eyes, antenna)
    let threw = false
    try {
      connected.getHeadProps().ref(head)
      connected.getEyesProps().ref(eyes)
    } catch {
      threw = true
    }
    const partial = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
    connected.getRootProps().ref(root)
    connected.getAntennaProps().ref(antenna)
    await harness.wait(120)
    return {threw, partial, wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
  })
  return [
    ['a partial part set does not throw', result.threw === false, result.threw],
    ['a partial part set does not register', result.partial.wrappers === 0, result.partial.wrappers],
    ['a partial part set attaches no listener', result.partial.listeners === 0, result.partial.listeners],
    ['completing the set registers exactly once', result.wrappers === 1, result.wrappers],
    ['completing the set arms exactly one listener', result.listeners === 1, result.listeners],
  ]
}

const checkRequiredRefs = async (page) => {
  const result = await page.evaluate(async () => {
    const harness = window.mascotHarness
    const bind = (connected, parts, effectHost) => {
      connected.getRootProps().ref(parts.root)
      connected.getEffectHostProps().ref(effectHost)
      connected.getHeadProps().ref(parts.head)
      connected.getEyesProps().ref(parts.eyes)
      connected.getAntennaProps().ref(parts.antenna)
    }
    const slots = ['getRootProps', 'getHeadProps', 'getEyesProps', 'getAntennaProps']
    const torndown = []
    for (const slot of slots) {
      const service = harness.mascot.createMascot({state: 'rest', working: false, follow: true})
      const connected = service.connect()
      const parts = harness.buildStage()
      const effectHost = document.createElement('div')
      effectHost.style.cssText = 'position:absolute;inset:0;pointer-events:none'
      parts.root.append(effectHost)
      bind(connected, parts, effectHost)
      const armed = {wrappers: harness.leanWrappers().length, listeners: window.pointerMoveListenerCount}
      connected[slot]().ref(null)
      torndown.push({
        slot,
        armed,
        wrappers: harness.leanWrappers().length,
        listeners: window.pointerMoveListenerCount,
        antennaRestored: parts.antenna.parentElement === parts.root,
      })
      service.destroy()
      parts.root.remove()
    }
    const service = harness.mascot.createMascot({state: 'rest', working: true, follow: true})
    const connected = service.connect()
    const host = harness.buildBareStage()
    connected.getEffectHostProps().ref(host)
    await harness.wait(200)
    const effectHostAlone = {
      wrappers: harness.leanWrappers().length,
      listeners: window.pointerMoveListenerCount,
      emitters: harness.emitters().length,
    }
    service.destroy()
    host.remove()

    const mounted = harness.mascot.createMascot({state: 'rest', working: true, follow: false})
    const bound = mounted.connect()
    const parts = harness.buildStage()
    const effectHost = document.createElement('div')
    effectHost.style.cssText = 'position:absolute;inset:0;pointer-events:none'
    parts.root.append(effectHost)
    bind(bound, parts, effectHost)
    await harness.wait(700)
    const emitter = harness.emitters()[0]
    const hosted = {
      emitters: harness.emitters().length,
      parentIsEffectHost: emitter?.parentElement === effectHost,
      anchor: emitter ? harness.boxOf(emitter) : undefined,
      stage: {width: parts.root.offsetWidth, height: parts.root.offsetHeight},
    }
    mounted.destroy()
    parts.root.remove()
    return {torndown, effectHostAlone, hosted}
  })
  const hostedTip = {
    x: result.hosted.stage.width * 0.5,
    y: result.hosted.stage.height * 0.15625,
  }
  const everyArmed = result.torndown.every((entry) => entry.armed.wrappers === 1 && entry.armed.listeners === 1)
  return [
    ['each required ref registers before it is nulled', everyArmed, result.torndown.map((entry) => entry.armed)],
    [
      'nulling any required ref drops the lean wrapper',
      result.torndown.every((entry) => entry.wrappers === 0),
      result.torndown.map((entry) => [entry.slot, entry.wrappers]),
    ],
    [
      'nulling any required ref detaches the gaze listener',
      result.torndown.every((entry) => entry.listeners === 0),
      result.torndown.map((entry) => [entry.slot, entry.listeners]),
    ],
    [
      'nulling any required ref restores the antenna to its parent',
      result.torndown.every((entry) => entry.antennaRestored),
      result.torndown.map((entry) => [entry.slot, entry.antennaRestored]),
    ],
    ['an effectHost alone never registers a wrapper', result.effectHostAlone.wrappers === 0, result.effectHostAlone],
    ['an effectHost alone never arms a listener', result.effectHostAlone.listeners === 0, result.effectHostAlone],
    ['an effectHost alone never starts an emitter', result.effectHostAlone.emitters === 0, result.effectHostAlone],
    ['a bound effectHost hosts exactly one emitter', result.hosted.emitters === 1, result.hosted.emitters],
    ['the emitter mounts inside the effectHost', result.hosted.parentIsEffectHost, result.hosted.parentIsEffectHost],
    [
      'the effect-hosted emitter anchors at the tip x, not the page offset',
      result.hosted.anchor !== undefined && near(result.hosted.anchor.left, hostedTip.x, 1),
      {anchor: result.hosted.anchor, expected: hostedTip},
    ],
    [
      'the effect-hosted emitter anchors at the tip y, not the page offset',
      result.hosted.anchor !== undefined && near(result.hosted.anchor.top, hostedTip.y, 1),
      {anchor: result.hosted.anchor, expected: hostedTip},
    ],
  ]
}

const CHECKS = [
  {id: 'M1', section: 'legacy', name: 'legacy closed gaze', run: checkLegacyClosedGaze, reducedMotion: 'no-preference'},
  {id: 'M2', section: 'legacy', name: 'legacy work activity', run: checkLegacyWork, reducedMotion: 'no-preference'},
  {id: 'M3', section: 'legacy', name: 'legacy open pose', run: checkLegacyOpenPose, reducedMotion: 'no-preference'},
  {
    id: 'A',
    section: 'core',
    name: 'mid-work state change',
    run: checkMidWorkStateChange,
    reducedMotion: 'no-preference',
  },
  {id: 'B', section: 'core', name: 'work to open settle', run: checkWorkToOpenSettle, reducedMotion: 'no-preference'},
  {
    id: 'C',
    section: 'core',
    name: 'connect() ref stability',
    run: checkConnectRefStability,
    reducedMotion: 'no-preference',
  },
  {id: 'D', section: 'core', name: 'stop() recovery', run: checkStopRecovery, reducedMotion: 'no-preference'},
  {
    id: 'E',
    section: 'core',
    name: 'start during staged exit',
    run: checkStartDuringExit,
    reducedMotion: 'no-preference',
  },
  {
    id: 'F',
    section: 'core',
    name: 'destroy during staged exit',
    run: checkDisposeDuringExit,
    reducedMotion: 'no-preference',
  },
  {id: 'G', section: 'core', name: 'channel discipline', run: checkChannelDiscipline, reducedMotion: 'no-preference'},
  {id: 'H', section: 'core', name: 'reduced motion', run: checkReducedMotion, reducedMotion: 'reduce'},
  {
    id: 'I',
    section: 'core',
    name: 'follow falloff and lifecycle',
    run: checkFollowLifecycle,
    reducedMotion: 'no-preference',
  },
  {
    id: 'J',
    section: 'core',
    name: 'repeated registerParts',
    run: checkRepeatedRegisterParts,
    reducedMotion: 'no-preference',
  },
  {
    id: 'K',
    section: 'core',
    name: 'update before registerParts',
    run: checkUpdateBeforeRegister,
    reducedMotion: 'no-preference',
  },
  {
    id: 'L',
    section: 'core',
    name: 'partial part sets via connect()',
    run: checkPartialConnect,
    reducedMotion: 'no-preference',
  },
  {
    id: 'M',
    section: 'core',
    name: 'required refs and effectHost',
    run: checkRequiredRefs,
    reducedMotion: 'no-preference',
  },
]

const SECTIONS = ['all', ...new Set(CHECKS.map((check) => check.section))]

const selectedChecks = () => (onlySection === 'all' ? CHECKS : CHECKS.filter((check) => check.section === onlySection))

const reportUnknownSection = () => {
  console.error(`unknown --only section ${JSON.stringify(onlySection)}: expected one of ${SECTIONS.join(', ')}`)
  console.error('refusing to report a pass for an empty selection')
  process.exitCode = 1
}

const formatEntry = (entry) => `    ${entry[1] ? 'PASS' : 'FAIL'}  ${entry[0]} -> ${JSON.stringify(entry[2])}`

const runCheck = async (browser, baseUrl, check) => {
  const page = await openPage(browser, baseUrl, check.reducedMotion)
  const entries = await check.run(page).catch((error) => [['check threw', false, String(error)]])
  await page.close()
  const failures = entries.filter((entry) => entry[1] !== true)
  console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'}  ${check.id}  ${check.name}`)
  entries.forEach((entry) => console.log(formatEntry(entry)))
  return failures.length
}

const runAll = async (checks) => {
  await access(join(distDirectory, 'rig.js'))
  const server = await startServer()
  const baseUrl = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch()
  console.log(`@conciv/mascot behavior harness\ndist: ${distDirectory}\nsection: ${onlySection}\n`)
  let failures = 0
  for (const check of checks) failures += await runCheck(browser, baseUrl, check)
  await browser.close()
  server.close()
  return failures
}

const summarizeRun = (failures) => (failures === 0 ? 'ALL CHECKS PASS' : `${failures} FAILING ASSERTIONS`)

const main = async () => {
  const checks = selectedChecks()
  if (checks.length === 0) return reportUnknownSection()
  const failures = await runAll(checks)
  console.log(`\n${summarizeRun(failures)}`)
  process.exitCode = Math.min(failures, 1)
}

await main()
