import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import type {JSX} from 'solid-js'
import {defineExtension, defineTool, collectServerContributions, collectClientContributions} from '../src/index.js'

function Card(): JSX.Element {
  return null
}

const ext = defineExtension({
  id: 'acme',
  tools: [
    defineTool({
      name: 'acme_deploy',
      description: 'Deploy',
      inputSchema: z.object({env: z.string()}),
      promptSnippet: 'Use acme_deploy to deploy.',
    })
      .server(({env}) => ({url: `https://${env}`}))
      .render(Card),
  ],
})

describe('co-located tool: server execute + client renderer from one definition', () => {
  it('server contribution carries the executable tool + its prompt snippet', async () => {
    const {tools, systemPrompt} = collectServerContributions([ext])
    expect(tools.map((t) => t.name)).toContain('acme_deploy')
    expect(systemPrompt).toContain('Use acme_deploy to deploy.')
    const deploy = tools.find((t) => t.name === 'acme_deploy')
    expect(deploy).toBeDefined()
    expect(await deploy?.execute({env: 'staging'})).toEqual({url: 'https://staging'})
  })

  it('client contribution carries the renderer keyed by the same name', () => {
    const {toolRenderers} = collectClientContributions([ext])
    expect(toolRenderers).toHaveLength(1)
    expect(toolRenderers[0]?.name).toBe('acme_deploy')
    expect(toolRenderers[0]?.render).toBe(Card)
  })

  it('a render-only tool (no .server) wires a renderer but registers no MCP tool', () => {
    const override = defineExtension({
      id: 'compact-bash',
      tools: [defineTool({name: 'Bash', description: '', inputSchema: z.object({}).passthrough()}).render(Card)],
    })
    expect(collectServerContributions([override]).tools).toHaveLength(0)
    expect(collectClientContributions([override]).toolRenderers[0]?.name).toBe('Bash')
  })
})
