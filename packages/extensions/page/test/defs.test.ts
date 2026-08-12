import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  PAGE_ACT_TOOL_NAMES,
  PAGE_TOOL_DEFS,
  pageToolMetaOf,
  pageVerbGerund,
  pageVerbMirrors,
  pageVerbMutates,
  pageVerbOfTool,
} from '../src/shared/defs.js'

const MUTATING_VERBS = [
  'addclass',
  'check',
  'click',
  'css',
  'effect',
  'eval',
  'fill',
  'hover',
  'insert',
  'override',
  'press',
  'remove',
  'removeattr',
  'removeclass',
  'scroll',
  'select',
  'setattr',
  'sethtml',
  'setstyle',
  'settext',
  'submit',
  'uncheck',
] as const

const MIRROR_VERBS = [
  'check',
  'click',
  'effect',
  'fill',
  'hover',
  'press',
  'scroll',
  'select',
  'submit',
  'uncheck',
] as const

describe('page tool declarations', () => {
  it('declares 37 verbs, every one registry-grade with meta, output, icon and label', () => {
    expect(PAGE_TOOL_DEFS).toHaveLength(37)
    for (const def of PAGE_TOOL_DEFS) {
      expect(def.name.startsWith('page.')).toBe(true)
      expect(def.meta?.summary).toBeTruthy()
      expect(def.outputSchema).toBeDefined()
      expect(def.meta?.icon).toBeTruthy()
      expect(def.meta?.label?.running).toBeTruthy()
      expect(def.meta?.label?.done).toBeTruthy()
    }
  })

  it('gives every declared input field its own help text', () => {
    const missing: string[] = []
    for (const def of PAGE_TOOL_DEFS) {
      const schema = z.toJSONSchema(def.inputSchema, {io: 'input'})
      const properties = schema.properties ?? {}
      for (const [field, definition] of Object.entries(properties)) {
        const described = typeof definition === 'object' && definition !== null && 'description' in definition
        if (!described) missing.push(`${def.name}.${field}`)
      }
    }
    expect(missing).toEqual([])
  })

  it("never uses a tool's own command path as its help text", () => {
    const echoes = PAGE_TOOL_DEFS.filter((def) => {
      const summary = def.meta?.summary ?? ''
      const verb = pageVerbOfTool(def.name)
      return summary === def.name || summary === `page ${verb}` || summary === verb
    })
    expect(echoes.map((def) => def.name)).toEqual([])
  })

  it('declaration meta is the single source of the mutating and mirroring sets', () => {
    const verbsWhere = (pick: (meta: {mutating?: boolean; mirrors?: boolean}) => boolean): string[] =>
      PAGE_TOOL_DEFS.filter((def) => pick(def.meta ?? {}))
        .map((def) => pageVerbOfTool(def.name))
        .toSorted()
    expect(verbsWhere((meta) => meta.mutating === true)).toEqual([...MUTATING_VERBS])
    expect(verbsWhere((meta) => meta.mirrors === true)).toEqual([...MIRROR_VERBS])
    expect(pageVerbMutates('fill')).toBe(true)
    expect(pageVerbMutates('text')).toBe(false)
    expect(pageVerbMirrors('click')).toBe(true)
    expect(pageVerbMirrors('setattr')).toBe(false)
    expect(pageToolMetaOf('nothing')).toBeUndefined()
  })

  it('gives every act verb a running gerund distinct from the raw verb', () => {
    for (const name of PAGE_ACT_TOOL_NAMES) {
      const verb = pageVerbOfTool(name)
      const gerund = pageVerbGerund(verb)
      expect(gerund, name).not.toBe(verb)
      expect(gerund, name).toMatch(/ing$/)
    }
    expect(pageVerbGerund('hover')).toBe('Hovering')
    expect(pageVerbGerund('nothing')).toBe('nothing')
  })

  it('derives the act tool-name set from mutating meta', () => {
    expect(PAGE_ACT_TOOL_NAMES.has('page.click')).toBe(true)
    expect(PAGE_ACT_TOOL_NAMES.has('page.fill')).toBe(true)
    expect(PAGE_ACT_TOOL_NAMES.has('page.snapshot')).toBe(false)
    expect(PAGE_ACT_TOOL_NAMES.has('page.route')).toBe(false)
    expect([...PAGE_ACT_TOOL_NAMES].toSorted()).toEqual(MUTATING_VERBS.map((verb) => `page.${verb}`))
  })
})
