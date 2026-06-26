import {describe, it, expect} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {loadServerExtensions, extensionsModuleSource} from '../src/core/extensions.js'

describe('built-in whiteboard extension', () => {
  it('loadServerExtensions includes the whiteboard built-in when a project has no extensions', async () => {
    const emptyProject = mkdtempSync(join(tmpdir(), 'mandarax-noext-'))
    const builders = await loadServerExtensions(emptyProject)
    expect(builders.map((builder) => builder.name)).toContain('whiteboard')
  })

  it('the client entry imports the whiteboard client view and hands it to mountWidget', () => {
    const source = extensionsModuleSource()
    expect(source).toContain("from '@mandarax/extension-whiteboard/client'")
    expect(source).toContain('whiteboard')
    expect(source).toContain('mountWidget([')
  })
})
