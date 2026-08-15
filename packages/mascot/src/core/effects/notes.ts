import gsap from 'gsap'
import {antennaTipAnchor} from '../tip-anchor.js'
import {antennaScaleFactor, createTimelineEmitter, createTipShell, WILL_CHANGE_STYLE} from './effect-support.js'
import type {EffectContext, EffectHandle, EffectMount} from './effect.js'

const NOTE_GLYPHS = ['♪', '♫', '♩']
const NOTE_LEFT_PX = -4
const NOTE_TOP_PX = -14
const NOTE_FONT_SIZE_PX = 11
const NOTE_COLOR = 'var(--pw-accent, #e0218a)'
const NOTE_RISE_PX = 52
const NOTE_RISE_DURATION_S = 2.6
const NOTE_RISE_EASE = 'sine.out'
const NOTE_STAGGER_S = 0.75
const NOTE_START_ROTATION_DEG = -8
const NOTE_END_ROTATION_DEG = 10
const NOTE_DRIFT_EVEN_PX = 12
const NOTE_DRIFT_ODD_PX = -10

function createNote(factor: number, glyph: string): HTMLElement {
  const note = document.createElement('span')
  note.textContent = glyph
  const left = NOTE_LEFT_PX * factor
  const top = NOTE_TOP_PX * factor
  note.style.cssText =
    `position:absolute;left:${left}px;top:${top}px;font-size:${NOTE_FONT_SIZE_PX * factor}px;` +
    `line-height:1;color:${NOTE_COLOR}`
  return note
}

function createRiseTimeline(notes: HTMLElement[], factor: number): gsap.core.Timeline {
  return gsap.timeline().fromTo(
    notes,
    {y: 0, x: 0, rotation: NOTE_START_ROTATION_DEG, opacity: 0},
    {
      y: -NOTE_RISE_PX * factor,
      x: (index: number) => (index % 2 === 0 ? NOTE_DRIFT_EVEN_PX : NOTE_DRIFT_ODD_PX) * factor,
      rotation: NOTE_END_ROTATION_DEG,
      duration: NOTE_RISE_DURATION_S,
      ease: NOTE_RISE_EASE,
      stagger: {each: NOTE_STAGGER_S, repeat: -1},
      keyframes: {opacity: [0, 1, 1, 0], easeEach: 'none'},
    },
    0,
  )
}

function createNotesEmitter(context: EffectContext): EffectHandle {
  const {host, antenna, skin} = context
  const factor = antennaScaleFactor(antenna, skin.referenceAntennaPx)
  const element = createTipShell(antennaTipAnchor(host, antenna, skin), WILL_CHANGE_STYLE)
  const notes = NOTE_GLYPHS.map((glyph) => createNote(factor, glyph))
  element.append(...notes)
  host.append(element)
  const timeline = createRiseTimeline(notes, factor)
  return createTimelineEmitter(element, timeline)
}

export const notesEffect: EffectMount = (context) => createNotesEmitter(context)
