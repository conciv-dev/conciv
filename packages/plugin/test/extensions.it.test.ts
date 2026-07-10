import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {defineExtension} from '@conciv/extension'
import {extensionsModuleSource, loadServerExtensions} from '../src/core/extensions.js'

const fixture = defineExtension({name: 'fixture-ext'})

describe('generic extension wiring', () => {
  it('returns the injected built-in server extensions when a project has no user extensions', async () => {
    const emptyProject = mkdtempSync(join(tmpdir(), 'conciv-noext-'))
    const builders = await loadServerExtensions(emptyProject, [fixture])
    expect(builders.map((builder) => builder.name)).toEqual(['fixture-ext'])
  })

  it('reports the idle client entries in the stub module until the conciv app ships', () => {
    const source = extensionsModuleSource(['/abs/a/client.js', '/abs/b/client.js'])
    expect(source).toContain('2 extension client entries idle')
  })
})
