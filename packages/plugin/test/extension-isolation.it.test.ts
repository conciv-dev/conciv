import {describe, it, expect} from 'vitest'
import {fileURLToPath} from 'node:url'
import {dirname, join} from 'node:path'
import {splitExtension} from '../src/core/split-extension.js'
import {compileExtensionSolid} from '../src/core/compile-extension.js'
import {loadServerExtensions} from '../src/core/extensions.js'

const here = dirname(fileURLToPath(import.meta.url))

const ID = '/proj/conciv/extensions/iso.tsx'

// The exact CLIENT compile the vite hook runs on an extension file: split for the browser, then Solid.
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
    // The browser half survives...
    expect(client).toContain('data-client-marker')
    // ...but the node import, its binding, and the secret path are gone.
    expect(client).not.toContain('node:fs')
    expect(client).not.toContain('readFileSync')
    expect(client).not.toContain('/etc/secret-token')
  })

  it('the server load never executes the client (Component / .client) halves', async () => {
    // The fixture's Component touches a browser global and its .client() throws; jiti loading the file
    // server-side must still collect iso_tool — proving neither client half runs during the server load.
    const builders = await loadServerExtensions(join(here, 'fixtures', 'iso-extensions'), [])
    expect(builders.flatMap((builder) => (builder.tools ?? []).map((tool) => tool.name))).toContain('iso_tool')
  })
})
