import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const mount = readFileSync(fileURLToPath(new URL('../dist/mount.js', import.meta.url)), 'utf8')

const externalized = (specifier: string) => new RegExp(`from\\s*["']${specifier.replace('/', '\\/')}`).test(mount)

describe('widget mount build shares one Ark environment instance with extensions', () => {
  it('externalizes ui-kit-system so shell EnvironmentProvider and extension Combobox read the same context', () => {
    expect(externalized('@conciv/ui-kit-system')).toBe(true)
  })

  it('externalizes ui-kit-chat so the model selector context is shared', () => {
    expect(externalized('@conciv/ui-kit-chat')).toBe(true)
  })

  it('externalizes @ark-ui rather than bundling a second copy', () => {
    expect(externalized('@ark-ui/')).toBe(true)
  })
})
