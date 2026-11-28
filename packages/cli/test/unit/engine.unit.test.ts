import {cpSync, readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {tempDir} from '@internal/vitest-config/temp-dir'
import type {InitContext} from '../../src/init/pipeline.js'
import {nextjsStep} from '../../src/init/steps/framework/nextjs.js'
import {viteStep} from '../../src/init/steps/framework/vite.js'
import {webpackFamilyStep} from '../../src/init/steps/framework/webpack-family.js'

describe('config shapes', () => {
  it.each([
    {
      shape: 'vite-import',
      step: viteStep({framework: 'vite', configFile: 'vite.config.mjs', packageManager: 'npm'}),
      outcome: {status: 'done'},
      written: {
        'vite.config.mjs': `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'

export default defineConfig({
  plugins: [react(), conciv()],
})
`,
      },
      wired: 'present',
    },
    {
      shape: 'next-wrapped',
      step: nextjsStep({framework: 'nextjs', configFile: 'next.config.mjs', packageManager: 'npm'}),
      outcome: {status: 'done'},
      written: {
        'next.config.mjs': `import {withConciv} from '@conciv/it/plugin/nextjs'
const nextConfig = {
  reactStrictMode: true,
}

export default withConciv(nextConfig)
`,
        'instrumentation.ts': `export {register} from '@conciv/it/plugin/nextjs'\n`,
        'instrumentation-client.ts': `import '@conciv/it/plugin/nextjs/widget'\n`,
      },
      wired: 'present',
    },
    {
      shape: 'webpack-require',
      step: webpackFamilyStep({framework: 'webpack', configFile: 'webpack.config.js', packageManager: 'npm'}),
      outcome: {status: 'done'},
      written: {
        'webpack.config.js': `const conciv = require('@conciv/it/plugin/webpack')
const path = require('node:path')

module.exports = {
  output: {path: path.resolve('dist')},
  plugins: [conciv.default()],
}
`,
      },
      wired: 'present',
    },
    {
      shape: 'rspack-import',
      step: webpackFamilyStep({framework: 'rspack', configFile: 'rspack.config.js', packageManager: 'npm'}),
      outcome: {status: 'done'},
      written: {
        'rspack.config.js': `import {defineConfig} from '@rspack/cli'
import {rspack} from '@rspack/core'
import conciv from '@conciv/it/plugin/rspack'

export default defineConfig({
  plugins: [
    new rspack.HtmlRspackPlugin({template: './index.html', title: 'rspack shop'}),
    new rspack.CopyRspackPlugin({patterns: [{from: 'public'}]}),
    conciv(),
  ],
})
`,
      },
      wired: 'present',
    },
    {
      shape: 'webpack-factory',
      step: webpackFamilyStep({framework: 'webpack', configFile: 'webpack.config.js', packageManager: 'npm'}),
      outcome: {
        status: 'manual',
        cards: [
          {
            title: 'Wire the conciv webpack plugin',
            body: 'conciv could not prove the shape of your webpack config. Add the plugin yourself. Full steps: https://conciv.dev/docs/bundlers/webpack',
            snippet: `const conciv = require('@conciv/it/plugin/webpack')

module.exports = {
  plugins: [conciv.default()],
}`,
          },
        ],
      },
      written: {},
      wired: 'missing',
    },
  ])(
    '$shape is wired once, and a shape init cannot prove gets a manual card',
    async ({shape, step, outcome, written, wired}) => {
      const fixture = join(import.meta.dirname, '..', 'fixtures', 'config-shapes', shape)
      const project = tempDir(`${shape}-`)
      cpSync(fixture, project, {recursive: true})
      const ctx: InitContext = {
        cwd: project,
        yes: true,
        dryRun: false,
        signal: new AbortController().signal,
        backup: () => {},
        report: () => {},
        note: () => {},
        feed: () => {},
      }
      const expected = {
        ...Object.fromEntries(readdirSync(fixture).map((name) => [name, readFileSync(join(fixture, name), 'utf8')])),
        ...written,
      }

      expect(await step.detect(ctx)).toBe('missing')
      expect(await step.apply(ctx)).toEqual(outcome)
      expect(
        Object.fromEntries(readdirSync(project).map((name) => [name, readFileSync(join(project, name), 'utf8')])),
      ).toEqual(expected)
      expect(await step.detect(ctx)).toBe(wired)
      expect(await step.apply(ctx)).toEqual(outcome)
      expect(
        Object.fromEntries(readdirSync(project).map((name) => [name, readFileSync(join(project, name), 'utf8')])),
      ).toEqual(expected)
    },
  )
})
