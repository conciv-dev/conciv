import {createGenerator} from 'unocss'
import {describe, expect, it} from 'vitest'
import {animation} from '../src/animation.js'
import {colors} from '../src/colors.js'
import {ease} from '../src/easing.js'
import {effects} from '../src/effects.js'
import {font} from '../src/fonts.js'
import {presetConciv} from '../src/index.js'
import {motion} from '../src/motion.js'
import {radius} from '../src/radius.js'
import {shadows} from '../src/shadow.js'
import {shortcuts} from '../src/shortcuts.js'

const uno = await createGenerator({presets: [presetConciv()]})

const allShortcuts = {...shortcuts, ...motion, ...effects, ...shadows}

async function generate(tokens: string | string[]) {
  return uno.generate(Array.isArray(tokens) ? tokens.join(' ') : tokens, {preflights: false})
}

describe('shortcuts', () => {
  it.each(Object.keys(allShortcuts))('%s expands to css', async (name) => {
    const {css, matched} = await generate(name)
    expect(matched.has(name)).toBe(true)
    expect(css.length).toBeGreaterThan(0)
  })

  it.each(Object.entries(allShortcuts))('%s has no unresolvable utilities', async (_name, body) => {
    for (const token of body.split(/\s+/)) {
      const {matched} = await generate(token)
      expect(matched.has(token), `utility "${token}" did not match any rule`).toBe(true)
    }
  })
})

describe('keyframes', () => {
  const referenced = [
    ...new Set(
      Object.values(motion)
        .flatMap((body) => body.match(/animate-pw-[\w-]+?(?=\s|$)/g) ?? [])
        .map((token) => token.replace('animate-', '')),
    ),
  ]

  it('motion shortcuts reference at least one pw keyframe', () => {
    expect(referenced.length).toBeGreaterThan(0)
  })

  it.each(referenced)('%s is declared and emits @keyframes', async (name) => {
    expect(animation.keyframes).toHaveProperty(name)
    const {css} = await generate(`animate-${name}`)
    expect(css).toContain(`@keyframes ${name}`)
  })

  it.each(Object.keys(animation.keyframes))('%s is reachable from a motion shortcut', (name) => {
    expect(referenced).toContain(name)
  })
})

describe('theme tokens', () => {
  const groups: [string, Record<string, string>][] = [
    ['text', colors],
    ['rounded', radius],
    ['font', font],
    ['ease', ease],
  ]

  describe.each(groups)('%s', (prefix, tokens) => {
    it.each(Object.entries(tokens))('%s resolves to its css value', async (name, value) => {
      const {css, matched} = await uno.generate(`${prefix}-${name}`, {preflights: true})
      expect(matched.has(`${prefix}-${name}`)).toBe(true)
      expect(css).toContain(value)
    })
  })
})

describe('typography', () => {
  it('prose-pw generates prose css', async () => {
    const {css, matched} = await generate('prose-pw')
    expect(matched.has('prose-pw')).toBe(true)
    expect(css).toContain('.prose')
  })
})
