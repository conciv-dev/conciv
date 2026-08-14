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

export function createFabRobotRig({head, eyes, antenna}: RigLayers): FabRobotRig {
  const parts = [head, eyes, antenna]
  let workTimeline: gsap.core.Timeline | undefined
  let previous: RigState | undefined
  let gazePointerMove: ((event: PointerEvent) => void) | undefined

  gsap.set(head, {transformOrigin: '50% 80%'})
  gsap.set(eyes, {transformOrigin: '49.6% 58.6%'})
  gsap.set(antenna, {transformOrigin: '50% 32.8%'})

  const detachGaze = () => {
    if (gazePointerMove === undefined) return
    window.removeEventListener('pointermove', gazePointerMove)
    gazePointerMove = undefined
  }

  const resetGaze = () => {
    detachGaze()
    gsap.killTweensOf(eyes, gazeProperties)
    gsap.set(eyes, {x: 0, y: 0})
  }

  const stopGaze = () => {
    detachGaze()
    gsap.killTweensOf(eyes, gazeProperties)
    gsap.to(eyes, {x: 0, y: 0, duration: 0.25, ease: 'power2.out'})
  }

  const startGaze = () => {
    if (reduceMotion() || gazePointerMove !== undefined) return
    gsap.killTweensOf(eyes, gazeProperties)
    const moveX = gsap.quickTo(eyes, 'x', {duration: 0.6, ease: 'power3.out'})
    const moveY = gsap.quickTo(eyes, 'y', {duration: 0.6, ease: 'power3.out'})
    gazePointerMove = (event) => {
      const bounds = eyes.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const offsetX = event.clientX - (bounds.left + bounds.width / 2)
      const offsetY = event.clientY - (bounds.top + bounds.height / 2)
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY)
      const reach = Math.min(1, distance / gazeFalloffPixels) * gazeRangePixels
      const angle = Math.atan2(offsetY, offsetX)
      moveX(Math.cos(angle) * reach)
      moveY(Math.sin(angle) * reach)
    }
    window.addEventListener('pointermove', gazePointerMove)
  }

  const setClosed = () => gsap.set(parts, {clearProps: 'transform'})

  const setOpenPose = () => {
    resetGaze()
    gsap.set(head, {yPercent: -2, rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyes, {scaleX: 1, scaleY: 1.06})
    gsap.set(antenna, {rotation: -4})
  }

  const stopWork = () => {
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
      .to(antenna, {rotation: 0, duration: 0.22, ease: 'power2.out'}, '<')
    startGaze()
  }

  const startWork = () => {
    if (reduceMotion()) return setOpenPose()
    resetGaze()
    stopWork()
    gsap.killTweensOf(parts, posedProperties)
    setClosed()
    workTimeline = gsap
      .timeline({repeat: -1})
      .to(head, {yPercent: -5, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: 1}, 0)
      .to(antenna, {rotation: 3, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: 1}, 0)
      .to(eyes, {scaleY: 0.1, duration: 0.07, ease: 'power2.in'}, 1.15)
      .to(eyes, {scaleY: 1.06, duration: 0.18, ease: 'power2.out'})
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
      gsap.to(antenna, {rotation: -4, duration: 0.3, ease: 'power2.out'})
      return
    }
    playOpen()
  }

  const destroy = () => {
    detachGaze()
    stopWork()
    gsap.killTweensOf(parts)
  }

  startGaze()

  return {apply, destroy}
}
