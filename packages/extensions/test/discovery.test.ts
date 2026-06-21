import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {JSX} from 'solid-js'
import {
  defineExtension,
  defineTool,
  defineEffect,
  collectServerContributions,
  collectClientContributions,
} from '../src/index.js'

function Card(): JSX.Element {
  return null
}

const ext = defineExtension({
  id: 'acme',
  tools: [
    defineTool({
      name: 'acme_deploy',
      label: 'Deploy',
      description: 'Deploy',
      parameters: z.object({env: z.string()}),
      promptSnippet: 'Use acme_deploy to deploy.',
      execute: ({env}) => ({url: `https://${env}`}),
      renderResult: Card,
    }),
  ],
  effects: [defineEffect({name: 'glow', label: 'Glow', description: 'A glow', render: Card})],
})

describe('collectServerContributions', () => {
  it('wraps an executable tool into the wire shape + collects its prompt snippet', async () => {
    const {tools, systemPrompt} = collectServerContributions([ext])
    expect(tools.map((t) => t.name)).toEqual(['acme_deploy'])
    expect(systemPrompt).toContain('Use acme_deploy to deploy.')
    expect(await tools[0]?.execute({env: 'staging'})).toEqual({url: 'https://staging'})
  })

  it('the wire execute re-parses args at the boundary and rejects a bad call', async () => {
    const deploy = collectServerContributions([ext]).tools.find((t) => t.name === 'acme_deploy')
    await expect(deploy?.execute({})).rejects.toThrow()
  })

  it('a render-only tool (no execute) registers no MCP tool', () => {
    const override = defineExtension({
      id: 'compact-bash',
      tools: [
        defineTool({
          name: 'Bash',
          label: 'Bash',
          description: '',
          parameters: z.object({}).passthrough(),
          renderResult: Card,
        }),
      ],
    })
    expect(collectServerContributions([override]).tools).toHaveLength(0)
  })

  it('drains an imperative serverFn (registerTool + systemPrompt.append)', () => {
    const imperative = defineExtension({id: 'imp'}).server((mx) => {
      mx.systemPrompt.append('Imperative prompt line.')
      mx.registerTool(
        defineTool({
          name: 'imp_do',
          label: 'Do',
          description: 'd',
          parameters: z.object({}),
          execute: () => ({ok: true}),
        }),
      )
    })
    const {tools, systemPrompt} = collectServerContributions([imperative])
    expect(tools.map((t) => t.name)).toContain('imp_do')
    expect(systemPrompt).toContain('Imperative prompt line.')
  })
})

describe('collectClientContributions', () => {
  it('gathers tools that carry a renderer + the effects', () => {
    const c = collectClientContributions([ext])
    expect(c.tools.map((t) => t.name)).toEqual(['acme_deploy'])
    expect(c.effects.map((e) => e.name)).toEqual(['glow'])
  })

  it('skips a server-only tool (no renderCall/renderResult)', () => {
    const serverOnly = defineExtension({
      id: 'so',
      tools: [
        defineTool({name: 'so_do', label: 'Do', description: 'd', parameters: z.object({}), execute: () => null}),
      ],
    })
    expect(collectClientContributions([serverOnly]).tools).toHaveLength(0)
  })
})
