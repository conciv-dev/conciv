import {describe, expect, it} from 'vitest'
import {
  FinishParamsSchema,
  HandshakeParamsSchema,
  NotificationSchema,
  SemanticSnapshotSchema,
  ToolFailParamsSchema,
  ToolFinishParamsSchema,
  ToolRegisterParamsSchema,
  ToolUpdateParamsSchema,
  UiActionSchema,
  type HandshakeParams,
} from '../../src/simulation.js'

describe('simulation protocol', () => {
  const registration = {
    name: 'lookup',
    description: 'Look up a value',
    inputSchema: {
      type: 'object',
      properties: {query: {type: 'string'}},
      required: ['query'],
      additionalProperties: false,
    },
    outputSchema: {type: 'object'},
    permission: 'lookup',
    options: {codemode: false},
  }

  it('decodes the backend messages: finish, notifications and the simulated tool lifecycle', () => {
    expect(FinishParamsSchema.parse({id: 'inv_1'})).toEqual({id: 'inv_1', reason: 'stop'})
    const cancel = {method: 'tool.cancel', params: {id: 'tool_1', reason: 'interrupted'}}
    expect(NotificationSchema.parse(cancel)).toEqual(cancel)
    expect(() => NotificationSchema.parse({...cancel, params: {id: 'tool_1', reason: 'unknown'}})).toThrow()
    expect(ToolRegisterParamsSchema.parse({tools: [registration]})).toEqual({tools: [registration]})
    expect(ToolUpdateParamsSchema.parse({id: 'tool_1', sequence: 0, update: {phase: 'searching'}})).toMatchObject({
      sequence: 0,
    })
    const output = {structured: {answer: 42}, content: [{type: 'text', text: '42'}]}
    expect(ToolFinishParamsSchema.parse({id: 'tool_1', output})).toEqual({id: 'tool_1', output})
    expect(ToolFailParamsSchema.parse({id: 'tool_2', message: 'lookup failed'})).toMatchObject({
      message: 'lookup failed',
    })
    expect(() => ToolRegisterParamsSchema.parse({tools: [registration, registration]})).toThrow()
    for (const invalid of [
      {...registration, name: '1lookup'},
      {...registration, options: {namespace: 'bad group', codemode: false}},
      {...registration, name: 'execute', options: {codemode: false}},
      {...registration, options: {namespace: 'a'.repeat(64), codemode: false}},
    ]) {
      expect(() => ToolRegisterParamsSchema.parse({tools: [invalid]})).toThrow()
    }
    const colliding = [
      {...registration, name: 'b_c', options: {namespace: 'a', codemode: false}},
      {...registration, name: 'c', options: {namespace: 'a.b', codemode: false}},
    ]
    expect(() => ToolRegisterParamsSchema.parse({tools: colliding})).toThrow()
  })
})

describe('simulation handshake params', () => {
  const params: HandshakeParams = {
    client: {name: 'conciv-drive', version: 'test'},
    expectedRole: 'backend',
    offeredVersions: [1],
    requiredCapabilities: ['llm.subscribe'],
    optionalCapabilities: ['tool.register', 'future.capability'],
  }

  it('decodes a handshake and rejects invalid role, version and capability declarations', () => {
    expect(HandshakeParamsSchema.parse(params)).toEqual(params)
    for (const invalid of [
      {...params, expectedRole: 'driver'},
      {...params, offeredVersions: []},
      {...params, requiredCapabilities: ['llm.subscribe', 'llm.subscribe']},
      {...params, optionalCapabilities: ['']},
    ]) {
      expect(() => HandshakeParamsSchema.parse(invalid)).toThrow()
    }
  })
})

describe('simulation ui schemas', () => {
  it('decodes ui actions and refuses a semantic tree with a repeated id, a dangling parent or a cycle', () => {
    expect(UiActionSchema.parse({type: 'ui.press', key: 'k', modifiers: {ctrl: true}})).toEqual({
      type: 'ui.press',
      key: 'k',
      modifiers: {ctrl: true},
    })
    expect(() => UiActionSchema.parse({type: 'ui.arrow', direction: 'sideways'})).toThrow()
    const node = {id: 'composer', role: 'textbox', element: 1}
    expect(SemanticSnapshotSchema.parse({format: 'conciv-ui-snapshot-v1', nodes: [node]})).toEqual({
      format: 'conciv-ui-snapshot-v1',
      nodes: [node],
    })
    for (const nodes of [
      [node, {...node, element: 2}],
      [{...node, parent: 'missing'}],
      [
        {...node, parent: 'send'},
        {id: 'send', role: 'button', element: 2, parent: 'composer'},
      ],
    ]) {
      expect(() => SemanticSnapshotSchema.parse({format: 'conciv-ui-snapshot-v1', nodes})).toThrow()
    }
  })
})
