import gsap from 'gsap'
import {ENTER_DURATION_S, ENTER_EASE, EXIT_DURATION_S, EXIT_EASE} from './config.js'

const TIP_SCALE = 0.2

export function enterFromTip(element: HTMLElement): gsap.core.Tween {
  return gsap.fromTo(
    element,
    {scale: TIP_SCALE, opacity: 0},
    {scale: 1, opacity: 1, duration: ENTER_DURATION_S, ease: ENTER_EASE},
  )
}

export function exitIntoTip(element: HTMLElement, onComplete: () => void): gsap.core.Tween {
  return gsap.to(element, {
    scale: TIP_SCALE,
    opacity: 0,
    duration: EXIT_DURATION_S,
    ease: EXIT_EASE,
    onComplete,
  })
}
