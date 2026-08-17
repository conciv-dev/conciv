import {describe, expect, it} from 'vitest'
import {concivExtensionsToolDef} from '../src/extensions-tool.js'

describe('conciv_extensions tool description', () => {
  it('tells the authoring agent to add @conciv/ui-kit-chat to package.json for composer scaffolds', () => {
    expect(concivExtensionsToolDef.description).toContain('@conciv/ui-kit-chat')
    expect(concivExtensionsToolDef.description).toContain('package.json')
  })
})
