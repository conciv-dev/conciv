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

  const layerStyle = (insetPx) =>
    'position:absolute;inset:' + insetPx + 'px;background-repeat:no-repeat;background-position:center;' +
    'background-size:contain;image-rendering:pixelated;will-change:transform'

  const DEFAULT_STAGE_SIZE_PX = 120

  const stageStyle = (sizePx) =>
    'position:absolute;left:560px;top:300px;display:block;width:' + sizePx + 'px;height:' + sizePx + 'px'

  const makeLayer = (image, insetPx) => {
    const layer = document.createElement('div')
    layer.style.cssText = layerStyle(insetPx) + ";background-image:url('" + image + "')"
    return layer
  }

  const buildStage = (sizePx = DEFAULT_STAGE_SIZE_PX, layerInsetPx = 0) => {
    const root = document.createElement('div')
    root.style.cssText = stageStyle(sizePx)
    const head = makeLayer(mascot.robotLayers.head, layerInsetPx)
    const eyes = makeLayer(mascot.robotLayers.eyes, layerInsetPx)
    const antenna = makeLayer(mascot.robotLayers.antenna, layerInsetPx)
    root.append(head, eyes, antenna)
    document.body.append(root)
    return {root, head, eyes, antenna}
  }

  const buildBareStage = (sizePx = DEFAULT_STAGE_SIZE_PX) => {
    const root = document.createElement('div')
    root.style.cssText = stageStyle(sizePx)
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
    const run = {starts: 0, stops: 0, removes: 0, element}
    effectRuns.push(run)
    let exit
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
          remove()
          onRemoved()
        },
      })
    }
    return {start, stop, remove}
  }

  const countingEffectTotals = () =>
    effectRuns.reduce(
      (total, run) => ({
        starts: total.starts + run.starts,
        stops: total.stops + run.stops,
        removes: total.removes + run.removes,
        live: total.live + (run.element.isConnected ? 1 : 0),
      }),
      {starts: 0, stops: 0, removes: 0, live: 0},
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

  const property = (element, name) => Number(gsap.getProperty(element, name))

  const stageCenter = (root) => {
    const bounds = root.getBoundingClientRect()
    return {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2}
  }

  const globalTweenCount = () => gsap.globalTimeline.getChildren(true, true, true).length

  const activeWritersOf = (element) => gsap.getTweensOf(element).filter((tween) => tween.isActive()).length

  const boxOf = (element) => ({left: element.offsetLeft, top: element.offsetTop})

  const anchorOf = (element) => ({left: parseFloat(element.style.left), top: parseFloat(element.style.top)})

  const emitterGeometry = (emitter) => ({
    fontSizePx: parseFloat(emitter.style.fontSize),
    leadingLeft: parseFloat(requireDigit(emitter, 0).style.left),
    trailingLeft: parseFloat(requireDigit(emitter, 1).style.left),
    top: parseFloat(requireDigit(emitter, 0).style.top),
  })

  const repeatingTimeline = () =>
    gsap.globalTimeline.getChildren(false, false, true).find((child) => child.repeat() === -1)

  window.mascotHarness = {
    mascot,
    buildStage,
    buildBareStage,
    applyStyle,
    leanWrappers,
    emitters,
    requireEmitter,
    requireLeanWrapper,
    requireDigit,
    emitterGeometry,
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
    globalTweenCount,
    activeWritersOf,
    boxOf,
    anchorOf,
    repeatingTimeline,
  }
  document.documentElement.dataset.harness = 'ready'
`

export const harnessPage = (): string =>
  `<!doctype html><html><head>
    <meta charset="utf-8" />
    <title>@conciv/mascot behavior harness</title>
    <style>html,body{margin:0;height:100%;background:#101014}</style>
    <script type="importmap">{"imports":{"gsap":"/gsap/index.js"}}</script>
  </head><body>
    <script type="module">${HARNESS_SCRIPT}</script>
  </body></html>`
