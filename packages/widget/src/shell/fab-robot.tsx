import {onMount, onCleanup, createEffect} from 'solid-js'
import gsap from 'gsap'

// Rigged FAB mascot. Three registered layers (head, eyes, antenna) animated as parts by GSAP. Motion
// only on state change + while working — idle is dead still. Easing is expo/power with single
// overshoots (no bounce/elastic). Principles: anticipation (dip before the pop), overshoot-then-
// settle, antenna follow-through (secondary motion), fast-close/slow-open blink.
type RigState = 'closed' | 'open' | 'work'

export function FabRobot(props: {open: () => boolean; working: () => boolean}) {
  let headEl: HTMLSpanElement | undefined
  let eyesEl: HTMLSpanElement | undefined
  let antEl: HTMLSpanElement | undefined
  let workTl: gsap.core.Timeline | undefined
  let prev: RigState | undefined

  const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const parts = () => [headEl, eyesEl, antEl] as HTMLSpanElement[]

  // resting poses (absolute transforms); open = a subtle "alert" lift, closed = neutral
  const setClosed = () => gsap.set(parts(), {clearProps: 'all'})
  const setOpenPose = () => {
    gsap.set(headEl as HTMLSpanElement, {yPercent: -2, rotation: 0, scaleX: 1, scaleY: 1})
    gsap.set(eyesEl as HTMLSpanElement, {scaleX: 1, scaleY: 1.06})
    gsap.set(antEl as HTMLSpanElement, {rotation: -4})
  }

  const stopWork = () => {
    workTl?.kill()
    workTl = undefined
  }

  // snappy entrance: anticipation dip -> pop up with overshoot + slight tilt -> settle; antenna and
  // eyes follow through a beat late (secondary motion), each with a single overshoot then settle.
  const playOpen = () => {
    if (reduce()) return setOpenPose()
    gsap.killTweensOf(parts())
    const tl = gsap.timeline()
    tl.to(headEl as HTMLSpanElement, {yPercent: 6, scaleX: 1.05, scaleY: 0.92, duration: 0.08, ease: 'power2.in'})
      .to(antEl as HTMLSpanElement, {rotation: 9, duration: 0.08, ease: 'power2.in'}, '<')
      .to(headEl as HTMLSpanElement, {
        yPercent: -7,
        scaleX: 0.98,
        scaleY: 1.08,
        rotation: -4,
        duration: 0.2,
        ease: 'expo.out',
      })
      .to(eyesEl as HTMLSpanElement, {scaleY: 1.28, scaleX: 1.12, duration: 0.14, ease: 'expo.out'}, '<')
      .to(antEl as HTMLSpanElement, {rotation: -11, duration: 0.2, ease: 'expo.out'}, '<0.04')
      .to(headEl as HTMLSpanElement, {
        yPercent: -2,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        duration: 0.26,
        ease: 'power3.out',
      })
      .to(eyesEl as HTMLSpanElement, {scaleY: 1.06, scaleX: 1, duration: 0.22, ease: 'power2.out'}, '<')
      .to(antEl as HTMLSpanElement, {rotation: -4, duration: 0.34, ease: 'power2.out'}, '<')
  }

  // faster than the entrance (~70%): a small dip, then settle back to neutral. No overshoot.
  const playClose = () => {
    if (reduce()) return setClosed()
    gsap.killTweensOf(parts())
    const tl = gsap.timeline()
    tl.to(headEl as HTMLSpanElement, {yPercent: 4, scaleY: 0.95, duration: 0.07, ease: 'power2.in'})
      .to(headEl as HTMLSpanElement, {
        yPercent: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        duration: 0.2,
        ease: 'power3.out',
      })
      .to(eyesEl as HTMLSpanElement, {scaleX: 1, scaleY: 1, duration: 0.16, ease: 'power2.out'}, '<')
      .to(antEl as HTMLSpanElement, {rotation: 0, duration: 0.22, ease: 'power2.out'}, '<')
  }

  // "thinking" loop around the open pose: head bob + antenna sway (sine), with a fast-close/slow-open
  // blink once per cycle. Glow is CSS (filter) via [data-working], so it never fights these transforms.
  const startWork = () => {
    if (reduce()) return setClosed()
    stopWork()
    gsap.killTweensOf(parts())
    setClosed() // think-loop bobs from neutral, so it reads the same whether the panel is open or closed
    workTl = gsap.timeline({repeat: -1})
    workTl
      .to(headEl as HTMLSpanElement, {yPercent: -5, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: 1}, 0)
      .to(antEl as HTMLSpanElement, {rotation: 3, duration: 1, ease: 'sine.inOut', yoyo: true, repeat: 1}, 0)
      .to(eyesEl as HTMLSpanElement, {scaleY: 0.1, duration: 0.07, ease: 'power2.in'}, 1.15)
      .to(eyesEl as HTMLSpanElement, {scaleY: 1.06, duration: 0.18, ease: 'power2.out'})
  }

  const apply = (s: RigState) => {
    if (prev === undefined) {
      // first paint: no animation, just rest in the right state
      if (s === 'work') startWork()
      else if (s === 'open') setOpenPose()
      else setClosed()
      prev = s
      return
    }
    if (s === prev) return
    if (s === 'work') {
      // working takes priority and can begin whether the panel is open or closed — never a pop
      startWork()
    } else if (s === 'closed') {
      stopWork()
      playClose()
    } else {
      // open + not working: pop in from a closed panel, or settle up after working finishes
      if (prev === 'work') {
        stopWork()
        gsap.to(parts(), {duration: 0.3, ease: 'power2.out', onStart: setOpenPose})
      } else playOpen()
    }
    prev = s
  }

  onMount(() => {
    gsap.set(headEl as HTMLSpanElement, {transformOrigin: '50% 80%'})
    gsap.set(eyesEl as HTMLSpanElement, {transformOrigin: '49.6% 58.6%'})
    gsap.set(antEl as HTMLSpanElement, {transformOrigin: '50% 32.8%'})
  })
  onCleanup(() => {
    stopWork()
    gsap.killTweensOf(parts())
  })

  createEffect(() => {
    // working wins over open, so a closed panel still "thinks" while the agent runs
    apply(props.working() ? 'work' : props.open() ? 'open' : 'closed')
  })

  return (
    <span class="pw-fab-rig" data-working={props.working()} aria-hidden="true">
      <span class="pw-rig-layer pw-rig-head" ref={(el) => (headEl = el)} />
      <span class="pw-rig-layer pw-rig-antenna" ref={(el) => (antEl = el)} />
      <span class="pw-rig-layer pw-rig-eyes" ref={(el) => (eyesEl = el)} />
    </span>
  )
}
