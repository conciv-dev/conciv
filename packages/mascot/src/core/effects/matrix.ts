import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const MATRIX_GLYPHS = ['0', '1', '7', '4', '9', '2']

const MATRIX_COLOR = '#4ade80'

const MATRIX_FONT_FAMILY = 'ui-monospace, monospace'

const MATRIX_FONT_SIZE_PX = 8

const MATRIX_GLYPH_LEFT_BASE_PX = -12

const MATRIX_GLYPH_LEFT_STEP_PX = 5

const MATRIX_GLYPH_TOP_PX = 0

const MATRIX_DRIP_START_Y_PX = -58

const MATRIX_DRIP_END_Y_PX = -6

const MATRIX_DRIP_DURATION_S = 1.9

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

function createDripTimeline(glyphs: HTMLElement[], factor: number): gsap.core.Timeline {
  const startY = MATRIX_DRIP_START_Y_PX * factor
  const endY = MATRIX_DRIP_END_Y_PX * factor
  gsap.set(glyphs, {y: startY, opacity: 0})
  return gsap.timeline().fromTo(
    glyphs,
    {y: startY, opacity: 0},
    {
      y: endY,
      duration: MATRIX_DRIP_DURATION_S,
      ease: 'none',
      stagger: {each: MATRIX_DRIP_STAGGER_S, repeat: -1},
      keyframes: {opacity: [0, 1, 0.8, 0], easeEach: 'none'},
    },
    0,
  )
}

function createMatrixEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), glyphShellStyle(factor))
  const glyphs = GLYPH_INDEXES.map((index) => createGlyph(factor, index))
  element.append(...glyphs)
  host.append(element)
  const timeline = createDripTimeline(glyphs, factor)
  return createTimelineEmitter(element, timeline)
}

export const matrixEffect: EffectMount = (context) => createMatrixEmitter(context)
