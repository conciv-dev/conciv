import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {splitExtension} from '../src/split-extension.js'
import {compileExtensionSolid} from '../src/compile-extension.js'
import {loadServerExtensions} from '../src/extensions.js'

const here = dirname(fileURLToPath(import.meta.url))

const ID = '/proj/conciv/extensions/iso.tsx'

async function compileClient(source: string): Promise<string> {
  const split = await splitExtension(source, ID, 'browser')
  const compiled = await compileExtensionSolid(split?.code ?? source, ID, false)
  if (!compiled) throw new Error('compile produced no output')
  return compiled.code
}

describe('extension client/server isolation', () => {
  it('server code + its node imports never reach the client bundle', async () => {
    const client = await compileClient(
      `import {readFileSync} from 'node:fs'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
const tool = defineTool({name: 'iso_tool', description: 'd', inputSchema: z.object({})})
  .server(() => readFileSync('/etc/secret-token', 'utf8'))
const iso = defineExtension({name: 'iso', Component: Surface, tools: [tool]})
  .server(() => ({systemPrompt: readFileSync('/etc/secret-token', 'utf8')}))
export default iso
function Surface() {
  return <button data-client-marker>Go</button>
}`,
    )

    expect(client).toContain('data-client-marker')

    expect(client).not.toContain('node:fs')
    expect(client).not.toContain('readFileSync')
    expect(client).not.toContain('/etc/secret-token')
  })

  it('the server load never executes the client (Component / .client) halves', async () => {
    const builders = await loadServerExtensions(join(here, 'fixtures', 'iso-extensions'), [])
    expect(builders.flatMap((builder) => (builder.tools ?? []).map((tool) => tool.name))).toContain('iso_tool')
  })
})
