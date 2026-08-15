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
  import * as mascot from '/rig.js'

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

  const requireDigit = (emitter, index) => {
    const digit = emitter.children[index]
    if (!(digit instanceof HTMLElement)) throw new Error('the emitter has no digit at index ' + index)
    return digit
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

  const digitFlightOf = (emitter, index) => {
    const digit = requireDigit(emitter, index)
    return {
      left: parseFloat(emitter.style.left) + property(emitter, 'x') + property(digit, 'x'),
      top: parseFloat(emitter.style.top) + property(emitter, 'y') + property(digit, 'y'),
    }
  }

  const requireFlatDigit = (emitter, index) => {
    const digit = requireDigit(emitter, index)
    if (digit.firstElementChild === null) return digit
    throw new Error(
      'emitterGeometry reads the straight emitter placement, but digit ' + index +
        ' is a curve rider: read curvedDigitPlacement instead',
    )
  }

  const emitterGeometry = (emitter) => ({
    fontSizePx: parseFloat(emitter.style.fontSize),
    leadingLeft: parseFloat(requireFlatDigit(emitter, 0).style.left),
    trailingLeft: parseFloat(requireFlatDigit(emitter, 1).style.left),
    top: parseFloat(requireFlatDigit(emitter, 0).style.top),
  })

  const curvedDigitPlacement = (emitter, index) => {
    const rider = requireDigit(emitter, index)
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
    mascot,
    buildStage,
    buildBareStage,
    buildScrollStage,
    applyStyle,
    leanWrappers,
    emitters,
    requireEmitter,
    requireLeanWrapper,
    requireDigit,
    requireCanvas,
    canvasSignature,
    canvasInk,
    tickerListenerCount,
    pendingFrameCount,
    settleFrames,
    loadEffect,
    emitterGeometry,
    curvedDigitPlacement,
    countingEffect,
    countingEffectTotals,
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
    digitFlightOf,
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
