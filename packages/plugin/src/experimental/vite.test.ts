import {fileURLToPath} from 'node:url'
import {build} from 'vite'
import {describe, expect, it} from 'vitest'
import {experimental} from './vite.js'

describe('building a plugin', () => {
  it('the browser part builds to a CommonJS entry with its declarations and manifest, a chunk per lazy import, and Solid left to the app', async () => {
    const output = await build({
      root: fileURLToPath(new URL('../../test/fixtures/bundles/panel-plugin', import.meta.url)),
      configFile: false,
      logLevel: 'silent',
      plugins: experimental(),
      build: {write: false},
    })

    expect(output).toMatchObject([
      {
        output: expect.arrayContaining([
          expect.objectContaining({
            type: 'chunk',
            fileName: 'plugin-experimental.cjs',
            isEntry: true,
            imports: expect.arrayContaining(['solid-js/web']),
          }),
          expect.objectContaining({
            type: 'chunk',
            fileName: expect.stringMatching(/^lazy-panel-.+\.cjs$/),
            isDynamicEntry: true,
          }),
          expect.objectContaining({type: 'asset', fileName: 'plugin-experimental.d.cts'}),
          expect.objectContaining({type: 'asset', fileName: 'plugin-experimental.cjs.manifest.json'}),
        ]),
      },
    ])
  })

  it('a browser part that bundles its own copy of effect fails the build and names the modules the app provides', async () => {
    await expect(
      build({
        root: fileURLToPath(new URL('../../test/fixtures/bundles/bundles-effect', import.meta.url)),
        configFile: false,
        logLevel: 'silent',
        plugins: experimental(),
        build: {write: false},
      }),
    ).rejects.toThrow(
      'effect/Schema is not a module the conciv app provides to plugins: effect, @conciv/plugin/experimental, @conciv/plugin/rpc, zod, solid-js, solid-js/web, solid-js/store, @conciv/client, @conciv/plugin/experimental/page, @conciv/plugin/experimental/grab',
    )
  })
})
