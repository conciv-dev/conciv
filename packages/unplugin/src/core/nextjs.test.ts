import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'
import type {ConcivConfig} from '@conciv/protocol/config-types'
import {withConciv} from './nextjs.js'

describe('withConciv', () => {
  test.each([
    {
      name: 'an empty Next config gets the widget port, the engine options and the engine packages kept on the server',
      nextConfig: {},
      options: {},
      expected: {
        env: {NEXT_PUBLIC_CONCIV_PORT: '24170', CONCIV_OPTIONS: '{"port":24170}'},
        serverExternalPackages: ['@conciv/it', '@conciv/unplugin', '@conciv/core', '@conciv/db', '@conciv/harness'],
        turbopack: {},
        webpack: expect.any(Function),
      },
    },
    {
      name: "the user's env, server packages and turbopack settings stay, with no package listed twice",
      nextConfig: {
        env: {API_URL: 'https://api.example.test'},
        serverExternalPackages: ['sharp', '@conciv/core'],
        turbopack: {resolveAlias: {lodash: 'lodash-es'}},
      },
      options: {port: 3999},
      expected: {
        env: {API_URL: 'https://api.example.test', NEXT_PUBLIC_CONCIV_PORT: '3999', CONCIV_OPTIONS: '{"port":3999}'},
        serverExternalPackages: [
          'sharp',
          '@conciv/core',
          '@conciv/it',
          '@conciv/unplugin',
          '@conciv/db',
          '@conciv/harness',
        ],
        turbopack: {resolveAlias: {lodash: 'lodash-es'}},
        webpack: expect.any(Function),
      },
    },
    {
      name: 'widget false gives the page no widget port, even one the user set',
      nextConfig: {env: {NEXT_PUBLIC_CONCIV_PORT: '1234'}},
      options: {widget: false} satisfies ConcivConfig,
      expected: {
        env: {CONCIV_OPTIONS: '{"widget":false,"port":24170}'},
        serverExternalPackages: ['@conciv/it', '@conciv/unplugin', '@conciv/core', '@conciv/db', '@conciv/harness'],
        turbopack: {},
        webpack: expect.any(Function),
      },
    },
    {
      name: 'enabled false adds only the engine packages kept on the server',
      nextConfig: {env: {API_URL: 'https://api.example.test'}},
      options: {enabled: false},
      expected: {
        env: {API_URL: 'https://api.example.test'},
        serverExternalPackages: ['@conciv/it', '@conciv/unplugin', '@conciv/core', '@conciv/db', '@conciv/harness'],
      },
    },
  ])('$name', ({nextConfig, options, expected}) => {
    expect(withConciv(nextConfig, options)).toEqual(expected)
  })

  test('the webpack hook keeps the engine out of edge bundles, compiles instrumentation first in node dev, and runs the user hook after', async () => {
    const project = tempDir('next-app-')
    mkdirSync(join(project, 'src'))
    writeFileSync(join(project, 'src', 'instrumentation.ts'), '')
    const config = withConciv({
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
