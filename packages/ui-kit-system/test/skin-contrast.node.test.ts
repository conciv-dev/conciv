import {describe, expect, test} from 'vitest'
import {SKINS, type SkinName} from '../src/skins.js'
import type {SchemePair, Skin, SkinSchemeAnchorName} from '../src/skin-contract.js'
import {contrastRatio} from './wcag.js'

const SCHEMES = ['light', 'dark'] as const

const BODY_TEXT_MINIMUM = 4.5
const NON_TEXT_MINIMUM = 3

const BODY_INK: SkinSchemeAnchorName[] = ['chat-text', 'chat-text-hi', 'chat-text-2']
const FAINT_INK: SkinSchemeAnchorName[] = ['chat-text-3', 'chat-dim']
const STATUS: SkinSchemeAnchorName[] = ['chat-accent', 'chat-danger', 'chat-success', 'chat-warn']
const BACKDROPS: SkinSchemeAnchorName[] = ['chat-panel', 'chat-ground']

const skinNames = Object.keys(SKINS).filter((name): name is SkinName => name in SKINS)

function half(pair: SchemePair, scheme: (typeof SCHEMES)[number]): string {
  return scheme === 'light' ? pair.light : pair.dark
}

function ratio(
  skin: Skin,
  scheme: (typeof SCHEMES)[number],
  ink: SkinSchemeAnchorName,
  surface: SkinSchemeAnchorName,
): number {
  return contrastRatio(half(skin.pairs[ink], scheme), half(skin.pairs[surface], scheme))
}

describe.each(skinNames)('the %s skin meets WCAG contrast on every colour pair', (name) => {
  const skin = SKINS[name]

  describe.each(SCHEMES)('in the %s scheme', (scheme) => {
    test.each(BODY_INK.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
      'body ink %s reads on %s',
      (ink, surface) => {
        expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(BODY_TEXT_MINIMUM)
      },
    )

    test.each(FAINT_INK.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
      'faint ink %s reads on %s',
      (ink, surface) => {
        expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
      },
    )

    test.each(STATUS.flatMap((ink) => BACKDROPS.map((surface) => [ink, surface] as const)))(
      'status colour %s is distinguishable on %s',
      (ink, surface) => {
        expect(ratio(skin, scheme, ink, surface)).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
      },
    )

    test('ink on an accent fill reads', () => {
      expect(ratio(skin, scheme, 'chat-on-accent', 'chat-accent')).toBeGreaterThanOrEqual(BODY_TEXT_MINIMUM)
    })

    test('the focus ring separates from the panel it floats over', () => {
      expect(ratio(skin, scheme, 'chat-accent', 'chat-panel')).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    })
  })
})
