import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {z} from 'zod'

describe('the built mount chunk shares one Solid, one Ark and one copy of each ui kit with the plugins it mounts', () => {
  test('the mount chunk imports solid-js, @ark-ui/solid and the ui kits as externals, and no built chunk carries a copy of them', () => {
    const dist = fileURLToPath(new URL('../../dist/', import.meta.url))
    const files = readdirSync(dist)
    const mountChunk =
      /import\(\s*["']\.\/(mount-impl-[\w-]+\.js)["']\s*\)/.exec(readFileSync(join(dist, 'mount.js'), 'utf8'))?.[1] ??
      'mount.js imports no mount-impl chunk'
    const imported = [...readFileSync(join(dist, mountChunk), 'utf8').matchAll(/\bfrom\s*"([^"]+)"/g)].map(
      (match) => match[1],
    )
    expect(imported).toEqual(
      expect.arrayContaining([
        'solid-js',
        'solid-js/web',
        'solid-js/store',
        '@ark-ui/solid/locale',
        '@conciv/ui-kit-system',
        '@conciv/ui-kit-chat',
        '@conciv/ui-kit-chat-tools',
        '@conciv/ui-kit-tap',
      ]),
    )
    const bundledSources = files
      .filter((name) => name.endsWith('.js.map'))
      .flatMap(
        (name) =>
          z.object({sources: z.array(z.string())}).parse(JSON.parse(readFileSync(join(dist, name), 'utf8'))).sources,
      )
      .filter((source) => /node_modules\/(solid-js|@ark-ui\/solid)\/|ui-kit-[\w-]+\/(dist|src)\//.test(source))
    expect(bundledSources).toEqual([])
  })
})
