import gsap from 'gsap'

export {robotLayers} from './layers.gen.js'

export type RigState = 'closed' | 'open' | 'work'

export type RigLayers = {head: HTMLElement; eyes: HTMLElement; antenna: HTMLElement}

export type FabRobotRig = {apply: (state: RigState) => void; destroy: () => void}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

const posedProperties = 'yPercent,rotation,scaleX,scaleY'

const gazeProperties = 'x,y'

const gazeFalloffPixels = 220

const gazeRangePixels = 3

const leanRangeDegrees = 10

const antennaOrigin = '50% 32.8%'

const antennaTipFractionX = 0.5

const antennaTipFractionY = 0.15625

const emitterDigitIndexes = [0, 1, 2, 3, 4]

const emitterRisePixels = -54

const emitterColor = 'var(--pw-accent, #e0218a)'

type Emitter = {element: HTMLElement; timeline: gsap.core.Timeline}

function sharedParent(head: HTMLElement, eyes: HTMLElement): HTMLElement | null {
  if (head.parentElement !== null && head.parentElement === eyes.parentElement) return head.parentElement
  return eyes.parentElement
}

function wrapForLean(antenna: HTMLElement): HTMLElement | undefined {
  const parent = antenna.parentElement
  if (parent === null) return undefined
  const wrapper = document.createElement('span')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = 'position:absolute;inset:0;pointer-events:none;will-change:transform'
  parent.insertBefore(wrapper, antenna)
  wrapper.appendChild(antenna)
  gsap.set(wrapper, {transformOrigin: antennaOrigin})
  return wrapper
}

function tipOffset(stage: HTMLElement, antenna: HTMLElement): {x: number; y: number} {
  const stageBounds = stage.getBoundingClientRect()
  const antennaBounds = antenna.getBoundingClientRect()
  return {
    x: antennaBounds.left - stageBounds.left + antennaBounds.width * antennaTipFractionX,
    y: antennaBounds.top - stageBounds.top + antennaBounds.height * antennaTipFractionY,
  }
}

function buildEmitter(stage: HTMLElement, tip: {x: number; y: number}): Emitter {
  const element = document.createElement('span')
  element.setAttribute('aria-hidden', 'true')
  element.style.cssText = `position:absolute;left:${tip.x}px;top:${tip.y}px;width:0;height:0;pointer-events:none;color:${emitterColor};font-family:ui-monospace,SFMono-Regular,monospace;font-size:9px;font-weight:700;line-height:1;will-change:transform,opacity`
  const digits = emitterDigitIndexes.map((index) => {
    const digit = document.createElement('span')
    digit.textContent = index % 2 === 0 ? '1' : '0'
    digit.style.cssText = `position:absolute;left:${index % 2 === 0 ? -1 : -7}px;top:-12px`
    element.append(digit)
    return digit
  })
  stage.append(element)
  const timeline = gsap.timeline().fromTo(
    digits,
    {y: 0, opacity: 0},
    {
      y: emitterRisePixels,
      duration: 2.2,
      ease: 'none',
      stagger: {each: 0.42, repeat: -1},
      keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
    },
    0,
  )
  return {element, timeline}
}

export function createFabRobotRig({head, eyes, antenna}: RigLayers): FabRobotRig {
  const parts = [head, eyes, antenna]
  const stage = sharedParent(head, eyes)
  const leanWrapper = wrapForLean(antenna)
  let workTimeline: gsap.core.Timeline | undefined
  let previous: RigState | undefined
  let gazePointerMove: ((event: PointerEvent) => void) | undefined
  let emitter: Emitter | undefined
  let emitterExit: gsap.core.Tween | undefined

  gsap.set(head, {transformOrigin: '50% 80%'})
  gsap.set(eyes, {transformOrigin: '49.6% 58.6%'})
  gsap.set(antenna, {transformOrigin: antennaOrigin})

  const detachGaze = () => {
    if (gazePointerMove === undefined) return
    window.removeEventListener('pointermove', gazePointerMove)
    gazePointerMove = undefined
  }

  const killGazeTweens = () => {
    gsap.killTweensOf(eyes, gazeProperties)
    if (leanWrapper !== undefined) gsap.killTweensOf(leanWrapper)
  }

  const resetGaze = () => {
    detachGaze()
    killGazeTweens()
    gsap.set(eyes, {x: 0, y: 0})
    if (leanWrapper !== undefined) gsap.set(leanWrapper, {rotation: 0})
  }

  const stopGaze = () => {
    detachGaze()
    killGazeTweens()
    gsap.to(eyes, {x: 0, y: 0, duration: 0.25, ease: 'power2.out'})
    if (leanWrapper !== undefined) gsap.to(leanWrapper, {rotation: 0, duration: 0.25, ease: 'power2.out'})
  }

  const startGaze = () => {
    if (reduceMotion() || gazePointerMove !== undefined) return
    killGazeTweens()
    const moveX = gsap.quickTo(eyes, 'x', {duration: 0.6, ease: 'power3.out'})
    const moveY = gsap.quickTo(eyes, 'y', {duration: 0.6, ease: 'power3.out'})
    const leanTo =
      leanWrapper === undefined ? undefined : gsap.quickTo(leanWrapper, 'rotation', {duration: 0.5, ease: 'power3.out'})
    gazePointerMove = (event) => {
      const bounds = eyes.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const offsetX = event.clientX - (bounds.left + bounds.width / 2)
      const offsetY = event.clientY - (bounds.top + bounds.height / 2)
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
      const reach = Math.min(1, distance / gazeFalloffPixels)
      const angle = Math.atan2(offsetY, offsetX)
      moveX(Math.cos(angle) * reach * gazeRangePixels)
      moveY(Math.sin(angle) * reach * gazeRangePixels)
      leanTo?.(Math.cos(angle) * reach * leanRangeDegrees)
    }
    window.addEventListener('pointermove', gazePointerMove)
  }

  const removeEmitter = () => {
    emitterExit?.kill()
    emitterExit = undefined
    if (emitter === undefined) return
    gsap.killTweensOf(emitter.element)
    emitter.timeline.kill()
    emitter.element.remove()
    emitter = undefined
  }

  const startEmitter = () => {
    if (stage === null) return
    emitterExit?.kill()
    emitterExit = undefined
    if (emitter !== undefined) {
      gsap.to(emitter.element, {scale: 1, opacity: 1, duration: 0.36, ease: 'back.out(2.2)'})
      return
    }
    emitter = buildEmitter(stage, tipOffset(stage, antenna))
    gsap.fromTo(
      emitter.element,
      {scale: 0.2, opacity: 0},
      {scale: 1, opacity: 1, duration: 0.36, ease: 'back.out(2.2)'},
    )
  }

  const stopEmitter = () => {
    if (emitter === undefined || emitterExit !== undefined) return
    emitterExit = gsap.to(emitter.element, {
      opacity: 0,
      scale: 0.2,
      duration: 0.5,
      ease: 'power2.in',
      onComplete: removeEmitter,
    })
  }

  const setClosed = () => gsap.set(parts, {clearProps: 'transform'})

  const setOpenPose = () => {
    resetGaze()
    gsap.set(head, {yPercent: -2, rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: 1.06})
    gsap.set(antenna, {rotation: -4})
  }

  const stopWork = () => {
    stopEmitter()
    workTimeline?.kill()
    workTimeline = undefined
  }

  const playOpen = () => {
    if (reduceMotion()) return setOpenPose()
    stopGaze()
    gsap.killTweensOf(parts, posedProperties)
    gsap
      .timeline()
      .to(head, {yPercent: 6, scaleX: 1.05, scaleY: 0.92, duration: 0.08, ease: 'power2.in'})
      .to(antenna, {rotation: 9, duration: 0.08, ease: 'power2.in'}, '<')
      .to(head, {yPercent: -7, scaleX: 0.98, scaleY: 1.08, rotation: -4, duration: 0.2, ease: 'expo.out'})
      .to(eyes, {scaleY: 1.28, scaleX: 1.12, duration: 0.14, ease: 'expo.out'}, '<')
      .to(antenna, {rotation: -11, duration: 0.2, ease: 'expo.out'}, '<0.04')
      .to(head, {yPercent: -2, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.26, ease: 'power3.out'})
      .to(eyes, {scaleY: 1.06, scaleX: 1, duration: 0.22, ease: 'power2.out'}, '<')
      .to(antenna, {rotation: -4, duration: 0.34, ease: 'power2.out'}, '<')
  }

  const playClose = () => {
    if (reduceMotion()) return setClosed()
    gsap.killTweensOf(parts, posedProperties)
    gsap
      .timeline()
      .to(head, {yPercent: 4, scaleY: 0.95, duration: 0.07, ease: 'power2.in'})
      .to(head, {yPercent: 0, scaleX: 1, scaleY: 1, rotation: 0, duration: 0.2, ease: 'power3.out'})
      .to(eyes, {scaleX: 1, scaleY: 1, duration: 0.16, ease: 'power2.out'}, '<')
      .to(antenna, {rotation: 0, scaleX: 1, scaleY: 1, duration: 0.22, ease: 'power2.out'}, '<')
    startGaze()
  }

  const startWork = () => {
    if (reduceMotion()) return setOpenPose()
    resetGaze()
    workTimeline?.kill()
    gsap.killTweensOf(parts, posedProperties)
    setClosed()
    startEmitter()
    workTimeline = gsap
      .timeline({repeat: -1})
      .to(head, {yPercent: -5, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: 1}, 0)
      .to(antenna, {scaleY: 1.3, scaleX: 0.88, duration: 0.3, ease: 'power2.out'}, 0)
      .to(antenna, {scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)'}, 0.3)
      .to(antenna, {scaleY: 1.3, scaleX: 0.88, duration: 0.3, ease: 'power2.out'}, 1.15)
      .to(antenna, {scaleY: 1, scaleX: 1, duration: 0.55, ease: 'elastic.out(1, 0.5)'}, 1.45)
      .to(eyes, {scaleY: 0.1, duration: 0.07, ease: 'power2.in'}, 1.15)
      .to(eyes, {scaleY: 1.06, duration: 0.18, ease: 'power2.out'}, 1.22)
  }

  const applyFirst = (state: RigState) => {
    if (state === 'work') return startWork()
    if (state === 'open') return setOpenPose()
    setClosed()
    startGaze()
  }

  const apply = (state: RigState) => {
    if (previous === undefined) {
      applyFirst(state)
      previous = state
      return
    }
    if (state === previous) return
    const fromWork = previous === 'work'
    previous = state
    if (state === 'work') return startWork()
    if (state === 'closed') {
      stopWork()
      return playClose()
    }
    if (fromWork) {
      stopWork()
      if (reduceMotion()) return setOpenPose()
      gsap.killTweensOf(parts, posedProperties)
      gsap.to(head, {yPercent: -2, rotation: 0, scaleX: 1, scaleY: 1, duration: 0.3, ease: 'power2.out'})
      gsap.to(eyes, {scaleX: 1, scaleY: 1.06, duration: 0.3, ease: 'power2.out'})
      gsap.to(antenna, {rotation: -4, scaleX: 1, scaleY: 1, duration: 0.3, ease: 'power2.out'})
      return
    }
    playOpen()
  }

  const destroy = () => {
    detachGaze()
    workTimeline?.kill()
    workTimeline = undefined
    removeEmitter()
    gsap.killTweensOf(parts)
    if (leanWrapper === undefined) return
    gsap.killTweensOf(leanWrapper)
    leanWrapper.replaceWith(antenna)
  }

  startGaze()

  return {apply, destroy}
}
