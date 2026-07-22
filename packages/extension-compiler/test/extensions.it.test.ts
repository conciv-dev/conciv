import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {extensionsModuleSource, loadServerExtensions} from '../src/extensions.js'

const fixture = defineExtension({name: 'fixture-ext'})

describe('generic extension wiring', () => {
  it('returns the injected built-in server extensions when a project has no user extensions', async () => {
    const emptyProject = mkdtempSync(join(tmpdir(), 'conciv-noext-'))
    const builders = await loadServerExtensions(emptyProject, [fixture])
    expect(builders.map((builder) => builder.name)).toEqual(['fixture-ext'])
  })

  it('imports each client entry and hands them all to mountConciv', () => {
    const source = extensionsModuleSource(['/abs/a/client.js', '/abs/b/client.js'])
    expect(source).toContain('import builtin0 from "/abs/a/client.js"')
    expect(source).toContain('import builtin1 from "/abs/b/client.js"')
    expect(source).toContain(
      "const builtinEntries = [{extension: builtin0, source: 'builtin:0'}, {extension: builtin1, source: 'builtin:1'}]",
    )
    expect(source).toContain('mountConciv(picked.extensions)')
  })
})
