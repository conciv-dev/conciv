import {describe, it, expect} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {loadServerExtensions, extensionsModuleSource} from '../src/core/extensions.js'

// The test-runner ships as the first built-in extension: present on the server side for a project
// with no user extensions, and wired into the client entry the plugin serves.

describe('built-in test-runner extension', () => {
  it('loadServerExtensions includes the test-runner built-in when a project has no extensions', async () => {
    const emptyProject = mkdtempSync(join(tmpdir(), 'mandarax-noext-'))
    const builders = await loadServerExtensions(emptyProject)
    expect(builders.map((builder) => builder.name)).toContain('test-runner')
    expect(builders.flatMap((builder) => (builder.tools ?? []).map((tool) => tool.name))).toContain('test_runner')
  })

  it('the client entry imports the test-runner client view and hands it to mountWidget', () => {
    const source = extensionsModuleSource()
    expect(source).toContain("import testRunner from '@mandarax/extension-test-runner/client'")
    expect(source).toContain('mountWidget([testRunner')
  })
})
