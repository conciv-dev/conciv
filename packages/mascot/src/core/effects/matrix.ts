import gsap from 'gsap'
import type {EmitterPoint} from '../path.js'
import {createParticleNozzleEmitter, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectMount} from './effect.js'

export const MATRIX_GLYPHS = ['0', '1', '7', '4', '9', '2']

const MATRIX_COLOR = '#4ade80'

const MATRIX_FONT_FAMILY = 'ui-monospace, monospace'

const MATRIX_FONT_SIZE_PX = 8

const MATRIX_GLYPH_LEFT_BASE_PX = -12

const MATRIX_GLYPH_LEFT_STEP_PX = 5

const MATRIX_GLYPH_TOP_PX = 0

export const MATRIX_DRIP_START_Y_PX = -58

export const MATRIX_DRIP_END_Y_PX = -6

export const MATRIX_DRIP_DURATION_S = 1.9

const MATRIX_DRIP_STAGGER_S = 0.32

const GLYPH_INDEXES = MATRIX_GLYPHS.map((_, index) => index)

function createGlyph(factor: number, index: number): HTMLElement {
  const glyph = document.createElement('span')
  glyph.textContent = MATRIX_GLYPHS[index] ?? ''
  const left = (MATRIX_GLYPH_LEFT_BASE_PX + index * MATRIX_GLYPH_LEFT_STEP_PX) * factor
  glyph.style.cssText = `position:absolute;left:${left}px;top:${MATRIX_GLYPH_TOP_PX * factor}px`
  return glyph
}

const glyphShellStyle = (factor: number): string =>
  `color:${MATRIX_COLOR};font-family:${MATRIX_FONT_FAMILY};` +
  `font-size:${MATRIX_FONT_SIZE_PX * factor}px;line-height:1;${WILL_CHANGE_STYLE}`

const dripLaunch = (nozzle: EmitterPoint, startY: number): gsap.TweenVars => ({
  x: () => nozzle.x,
  y: () => nozzle.y + startY,
  opacity: 0,
})

const dripTravel = (nozzle: EmitterPoint, endY: number): gsap.TweenVars => ({
  x: () => nozzle.x,
  y: () => nozzle.y + endY,
  duration: MATRIX_DRIP_DURATION_S,
  ease: 'none',
  repeat: -1,
  repeatRefresh: true,
  immediateRender: false,
  keyframes: {opacity: [0, 1, 0.8, 0], easeEach: 'none'},
})

function createDripTimeline(glyphs: HTMLElement[], factor: number, nozzle: EmitterPoint): gsap.core.Timeline {
  const startY = MATRIX_DRIP_START_Y_PX * factor
  const endY = MATRIX_DRIP_END_Y_PX * factor
  gsap.set(glyphs, {x: 0, y: startY, opacity: 0})
  const timeline = gsap.timeline()
  glyphs.forEach((glyph, index) => {
    timeline.fromTo(glyph, dripLaunch(nozzle, startY), dripTravel(nozzle, endY), index * MATRIX_DRIP_STAGGER_S)
  })
  return timeline
}

export const matrixEffect: EffectMount = (context) =>
  createParticleNozzleEmitter({
    context,
    shellStyle: glyphShellStyle,
    createParticles: (factor) => GLYPH_INDEXES.map((index) => createGlyph(factor, index)),
    buildTimeline: createDripTimeline,
  })
