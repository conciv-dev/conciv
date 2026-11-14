import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {PAGE_TOOL_DEFS, pageVerbOfTool} from '@conciv/extension-page/defs'
import * as Page from '../src/page/rpc.js'
import * as PageSkill from '../src/page/skill.js'

const tabId = `tab_${crypto.randomUUID()}`

function exported(schema: z.ZodType) {
  return schema['~standard'].jsonSchema.input({target: 'draft-2020-12'})
}

const JsonObject = z.looseObject({
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
})

function withoutTab(schema: z.ZodType) {
  const json = JsonObject.parse(exported(schema))
  return {...json, properties: Object.fromEntries(Object.entries(json.properties).filter(([key]) => key !== 'tabId'))}
}

function pairWithOperation<Definition extends (typeof PAGE_TOOL_DEFS)[number]>(definition: Definition) {
  const operation = Page.Operations.find((candidate) => candidate.name === pageVerbOfTool(definition.name))
  if (!operation) throw new Error(`${definition.name} has no page operation`)
  return [definition.name, definition, operation] as const
}

describe('page rpc', () => {
  it('every page operation takes an optional tab ID, the last focused tab serving a call without one', () => {
    for (const operation of Page.Operations) {
      if (operation.name === 'tabs.list') continue
      const {properties, required} = JsonObject.parse(exported(operation.input))
      expect(properties, operation.name).toHaveProperty('tabId')
      expect(required ?? [], operation.name).not.toContain('tabId')
    }
    expect(z.parse(Page.Action, {type: 'tabs.list'})).toEqual({type: 'tabs.list'})
    expect(z.parse(Page.Action, {type: 'route'})).toEqual({type: 'route'})
    expect(z.parse(Page.Action, {type: 'route', tabId})).toEqual({type: 'route', tabId})
  })

  it('page input bounds and optional fields survive the wire', () => {
    const decode = (input: unknown) => z.parse(Page.Action, input)
    expect(decode({type: 'console', tabId})).toEqual({type: 'console', tabId})
    expect(decode({type: 'console', tabId, since: '12'})).toEqual({type: 'console', tabId, since: 12})
    expect(decode({type: 'hmr', tabId})).toEqual({type: 'hmr', tabId, timeout: 5000})
    expect(() => decode({type: 'hmr', tabId, timeout: -1})).toThrow()
    expect(() => decode({type: 'wait', tabId, state: 'gone'})).toThrow()
    expect(() => decode({type: 'click', tabId: 'another-tab', ref: 'v1'})).toThrow()
    expect(decode({type: 'click', tabId, ref: 'v5'})).toMatchObject({ref: 'v5'})
    expect(() => decode({type: 'insert', tabId, html: '<b>', position: 'inside'})).toThrow()
    expect(() => decode({type: 'queue', tabId, actions: []})).toThrow()
    expect(() =>
      decode({type: 'queue', tabId, actions: Array.from({length: 51}, () => ({tool: 'page_click'}))}),
    ).toThrow()
    expect(() => decode({type: 'queue', tabId, actions: [{tool: 'page_eval', code: '1'}]})).toThrow()
  })

  it('page files are bounded bytes, not remote filesystem paths', () => {
    const id = `file_${crypto.randomUUID()}`
    const decode = (input: unknown) => z.parse(Page.File, input)
    expect(decode({id, name: 'file.bin', mime: 'application/octet-stream', data: 'AAEC/w=='}).data).toEqual(
      new Uint8Array([0, 1, 2, 255]),
    )
    expect(() =>
      decode({
        id,
        name: 'file.bin',
        mime: 'application/octet-stream',
        data: Buffer.alloc(Page.MAX_FILE_BYTES + 1).toString('base64'),
      }),
    ).toThrow()
  })

  it('the RPC version is explicit', () => {
    const decode = (input: unknown) => z.parse(Page.Control, input)
    expect(() => decode({type: 'attached', connectionId: 'old-client'})).toThrow()
    expect(() => decode({type: 'attached', connectionId: 'old-client', version: 2})).toThrow()
    expect(decode({type: 'attached', connectionId: 'client', version: 1})).toEqual({
      type: 'attached',
      connectionId: 'client',
      version: 1,
    })
    expect(z.parse(Page.Definition.methods.attach.output, 'replaced')).toBe('replaced')
  })

  it('page ID patterns survive JSON Schema export for model tool definitions', () => {
    expect(exported(Page.TabId)).toMatchObject({type: 'string', pattern: '^tab_[a-f0-9-]{36}$'})
    expect(exported(Page.FileId)).toMatchObject({type: 'string', pattern: '^file_[a-f0-9-]{36}$'})
  })

  it.each(PAGE_TOOL_DEFS.map(pairWithOperation))(
    '%s keeps its input and output schema, mutating and capture as an operation',
    (_name, definition, operation) => {
      expect(withoutTab(operation.input)).toEqual(exported(definition.inputSchema))
      expect(exported(operation.output)).toEqual(exported(definition.outputSchema ?? z.null()))
      expect([operation.mutating, operation.capture]).toEqual([definition.meta?.mutating, definition.meta?.capture])
    },
  )

  it('the operations are the page tools plus tabs.list', () => {
    expect(Page.Operations.map((operation) => operation.name).toSorted()).toEqual(
      ['tabs.list', ...PAGE_TOOL_DEFS.map((definition) => pageVerbOfTool(definition.name))].toSorted(),
    )
  })
})

describe('page skill', () => {
  it('the built-in page skill uses a virtual skill:// URI', () => {
    expect(PageSkill.info.path).toBe('skill://page/SKILL.md')
  })
})
