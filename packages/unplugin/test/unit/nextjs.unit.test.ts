import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect} from 'vitest'
import {z} from 'zod'
import {tempDir} from '@internal/vitest-config/temp-dir'
import type {ConcivConfig} from '@conciv/types/config-types'
import {concivStateDir} from '@conciv/types/state-types'
import {withConciv} from '../../src/core/nextjs.js'
import {test} from '../utils/unplugin-test.js'

describe('withConciv', () => {
  const EngineOptionsSchema = z.object({port: z.number()})
  const enginePort = (config: {env: Record<string, string | undefined>}) =>
    EngineOptionsSchema.parse(JSON.parse(config.env['CONCIV_OPTIONS'] ?? '{}')).port

  test('two projects whose asked port is held get two different free ports, and a later config load in the same project reuses the first port, so the widget port always equals the engine port', async ({
    holdPort,
    nextEnv,
  }) => {
    const asked = await holdPort()

    const first = await withConciv({}, {port: asked})
    const firstPort = enginePort(first)
    expect(firstPort).not.toBe(asked)
    expect(first.env['NEXT_PUBLIC_CONCIV_PORT']).toBe(String(firstPort))

    await holdPort(firstPort)
    const reloaded = await withConciv({}, {port: asked})
    expect(enginePort(reloaded)).toBe(firstPort)
    expect(reloaded.env['NEXT_PUBLIC_CONCIV_PORT']).toBe(String(firstPort))

    nextEnv.forget()
    const otherProject = await withConciv({}, {port: asked})
    const otherPort = enginePort(otherProject)
    expect(otherPort).not.toBe(asked)
    expect(otherPort).not.toBe(firstPort)
    expect(otherProject.env['NEXT_PUBLIC_CONCIV_PORT']).toBe(String(otherPort))
  })

  test('with no port asked, each project prefers its own port, the same on every load, a recorded engine port first, and an asked port over both', async ({
    nextConfigPort,
    nextEnv,
  }) => {
    const firstProject = {stateRoot: '/conciv-unplugin-test/first-project'}
    const secondProject = {stateRoot: '/conciv-unplugin-test/second-project'}

    const first = await nextConfigPort(firstProject)
    expect(await nextConfigPort(firstProject)).toBe(first)
    const second = await nextConfigPort(secondProject)
    expect(second).not.toBe(first)

    const recordedProject = tempDir('next-recorded-')
    mkdirSync(concivStateDir(recordedProject))
    writeFileSync(
      join(concivStateDir(recordedProject), 'server.json'),
      JSON.stringify({port: first, token: 'recorded'}),
    )
    expect(enginePort(await withConciv({}, {stateRoot: recordedProject}))).toBe(first)

    nextEnv.forget()
    expect(enginePort(await withConciv({}, {stateRoot: recordedProject, port: second}))).toBe(second)
  })

  test.each([
    {
      name: 'an empty Next config gets the widget port, the engine options and the engine packages kept on the server',
      nextConfig: {},
      options: {},
      expected: (port: number) => ({
        env: {NEXT_PUBLIC_CONCIV_PORT: String(port), CONCIV_OPTIONS: `{"port":${port}}`},
        serverExternalPackages: [
          '@conciv/it',
          '@conciv/unplugin',
          '@conciv/backend',
          '@conciv/home',
          '@conciv/harness',
        ],
        turbopack: {},
        webpack: expect.any(Function),
      }),
    },
    {
      name: "the user's env, server packages and turbopack settings stay, with no package listed twice",
      nextConfig: {
        env: {API_URL: 'https://api.example.test'},
        serverExternalPackages: ['sharp', '@conciv/backend'],
        turbopack: {resolveAlias: {lodash: 'lodash-es'}},
      },
      options: {port: 3999},
      expected: (port: number) => ({
        env: {
          API_URL: 'https://api.example.test',
          NEXT_PUBLIC_CONCIV_PORT: String(port),
          CONCIV_OPTIONS: `{"port":${port}}`,
        },
        serverExternalPackages: [
          'sharp',
          '@conciv/backend',
          '@conciv/it',
          '@conciv/unplugin',
          '@conciv/home',
          '@conciv/harness',
        ],
        turbopack: {resolveAlias: {lodash: 'lodash-es'}},
        webpack: expect.any(Function),
      }),
    },
    {
      name: 'widget false gives the page no widget port, even one the user set',
      nextConfig: {env: {NEXT_PUBLIC_CONCIV_PORT: '1234'}},
      options: {widget: false} satisfies ConcivConfig,
      expected: (port: number) => ({
        env: {CONCIV_OPTIONS: `{"widget":false,"port":${port}}`},
        serverExternalPackages: [
          '@conciv/it',
          '@conciv/unplugin',
          '@conciv/backend',
          '@conciv/home',
          '@conciv/harness',
        ],
        turbopack: {},
        webpack: expect.any(Function),
      }),
    },
  ])('$name', async ({nextConfig, options, expected}) => {
    const config = await withConciv(nextConfig, options)
    expect(config).toEqual(expected(enginePort(config)))
  })

  test('enabled false adds only the engine packages kept on the server', async () => {
    await expect(withConciv({env: {API_URL: 'https://api.example.test'}}, {enabled: false})).resolves.toEqual({
      env: {API_URL: 'https://api.example.test'},
      serverExternalPackages: ['@conciv/it', '@conciv/unplugin', '@conciv/backend', '@conciv/home', '@conciv/harness'],
    })
  })

  test('the webpack hook keeps the engine out of edge bundles, compiles instrumentation first in node dev, and runs the user hook after', async () => {
    const project = tempDir('next-app-')
    mkdirSync(join(project, 'src'))
    writeFileSync(join(project, 'src', 'instrumentation.ts'), '')
    const config = await withConciv({
      webpack: (webpackConfig: {resolve?: {alias?: Record<string, string | false>}}) => ({
        ...webpackConfig,
        resolve: {alias: {...webpackConfig.resolve?.alias, user: 'kept'}},
      }),
    })

    const edge = config.webpack?.({resolve: {alias: {}}}, {nextRuntime: 'edge'})
    expect(edge?.resolve?.alias).toEqual({
      '@conciv/it/plugin/nextjs': false,
      '@conciv/unplugin/nextjs': false,
      user: 'kept',
    })

    const node = config.webpack?.(
      {entry: async () => ({main: './main.js'})},
      {nextRuntime: 'nodejs', dev: true, dir: project, config: {pageExtensions: ['tsx', 'ts']}},
    )
    expect(node?.resolve?.alias).toEqual({user: 'kept'})
    await expect(node?.entry?.()).resolves.toEqual({
      main: './main.js',
      instrumentation: {
        import: join(project, 'src', 'instrumentation.ts'),
        filename: 'instrumentation.js',
        layer: 'instrument',
      },
    })
  })
})
