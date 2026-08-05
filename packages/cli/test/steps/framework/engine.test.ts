import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {
  addToPluginsArray,
  addToPluginsArrayRequire,
  defaultExportWrapped,
  pluginCallWired,
  wrapDefaultExport,
} from '../../../src/init/steps/framework/engine.js'

const fixturesDir = join(import.meta.dirname, '..', '..', 'fixtures')

function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8')
}

const vitePluginImport = "import conciv from '@conciv/it/plugin/vite'"

function addConciv(source: string) {
  return addToPluginsArray(source, 'conciv', '@conciv/it/plugin/vite', 'conciv()', {importStyle: 'default'})
}

function preservedLines(source: string, marker: string): string[] {
  return source.split('\n').filter((line) => !line.includes(marker))
}

const matchedViteFixtures = [
  {name: 'vite.config.react.ts', appended: 'plugins: [react(), conciv()]'},
  {name: 'vite.config.vanilla.ts', appended: 'plugins: [conciv()]'},
  {name: 'vite.config.solid-start.ts', appended: 'nitro(),\n    conciv(),\n  ]'},
  {name: 'vite.config.svelte.ts', appended: '}),\n    conciv(),\n  ]'},
  {name: 'vite.config.tanstack-start.ts', appended: 'viteReact(),\n    conciv(),\n  ]'},
  {name: 'astro.config.mjs', appended: 'plugins: [conciv()]'},
  {name: 'vite.config.spread.ts', appended: 'plugins: [...base, react(), conciv()]'},
]

describe('addToPluginsArray', () => {
  it.each(matchedViteFixtures)('appends conciv() and the default import in $name', ({name, appended}) => {
    const source = fixture(name)
    const result = addConciv(source)
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain(vitePluginImport)
    expect(result.output).toContain(appended)
    const outputLines = result.output.split('\n')
    for (const line of preservedLines(source, 'plugins')) {
      expect(outputLines).toContain(line)
    }
  })

  it.each(matchedViteFixtures)('is idempotent over its own output for $name', ({name}) => {
    const first = addConciv(fixture(name))
    if (first.output === null) throw new Error('matched transform must carry output')
    const second = addConciv(first.output)
    expect(second.matched).toBe(true)
    expect(second.output).toBe(first.output)
  })

  it('refuses a config without a plugins array', () => {
    expect(addConciv(fixture('vite.config.no-plugins.ts'))).toEqual({matched: false, output: null})
  })

  it('refuses the function-form defineConfig', () => {
    expect(addConciv(fixture('vite.config.function.ts'))).toEqual({matched: false, output: null})
  })

  it('refuses a plugins array that is not part of the exported config', () => {
    expect(addConciv(fixture('vite.config.foreign-plugins.ts'))).toEqual({matched: false, output: null})
  })

  it('adds the missing call when only the plugin import is present', () => {
    const source = fixture('vite.config.import-only.ts')
    const result = addConciv(source)
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain('plugins: [conciv()]')
    expect(result.output.split(vitePluginImport)).toHaveLength(2)
  })

  it('adds the missing call when only the plugin require is present', () => {
    const source = fixture('webpack.config.cjs-require-only.js')
    const result = addToPluginsArrayRequire(source, 'conciv', '@conciv/it/plugin/webpack', 'conciv.default()')
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain('plugins: [conciv.default()]')
    expect(result.output.split("require('@conciv/it/plugin/webpack')")).toHaveLength(2)
  })

  it('supports named import style', () => {
    const result = addToPluginsArray(fixture('vite.config.react.ts'), 'conciv', '@conciv/it/plugin/vite', 'conciv()', {
      importStyle: 'named',
    })
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain("import {conciv} from '@conciv/it/plugin/vite'")
  })
})

describe('pluginCallWired', () => {
  it('is false while only the import is present and true once the call lands', () => {
    const source = fixture('vite.config.import-only.ts')
    expect(pluginCallWired(source, '@conciv/it/plugin/vite', 'conciv()')).toBe(false)
    const result = addConciv(source)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(pluginCallWired(result.output, '@conciv/it/plugin/vite', 'conciv()')).toBe(true)
  })

  it('is false while only the require is present and true once the call lands', () => {
    const source = fixture('webpack.config.cjs-require-only.js')
    const module = '@conciv/it/plugin/webpack'
    expect(pluginCallWired(source, module, 'conciv.default()')).toBe(false)
    const result = addToPluginsArrayRequire(source, 'conciv', module, 'conciv.default()')
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(pluginCallWired(result.output, module, 'conciv.default()')).toBe(true)
  })

  it('is false for a plugins array outside the exported config', () => {
    expect(pluginCallWired(fixture('vite.config.foreign-plugins.ts'), '@conciv/it/plugin/vite', 'conciv()')).toBe(false)
  })
})

const nextPluginImport = "import {withConciv} from '@conciv/it/plugin/nextjs'"

function wrapConciv(source: string) {
  return wrapDefaultExport(source, 'withConciv', '@conciv/it/plugin/nextjs')
}

const wrapFixtures = [
  {name: 'next.config.ts', wrapped: 'export default withConciv(nextConfig)'},
  {name: 'next.config.wrapped.ts', wrapped: 'export default withConciv(withSentry(nextConfig))'},
  {name: 'next.config.mjs-default.mjs', wrapped: 'export default withConciv(nextConfig)'},
]

describe('wrapDefaultExport', () => {
  it.each(wrapFixtures)('wraps the default export of $name', ({name, wrapped}) => {
    const source = fixture(name)
    const result = wrapConciv(source)
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain(nextPluginImport)
    expect(result.output).toContain(wrapped)
    const outputLines = result.output.split('\n')
    for (const line of preservedLines(source, 'export default')) {
      expect(outputLines).toContain(line)
    }
  })

  it.each(wrapFixtures)('is idempotent over its own output for $name', ({name}) => {
    const first = wrapConciv(fixture(name))
    if (first.output === null) throw new Error('matched transform must carry output')
    const second = wrapConciv(first.output)
    expect(second.matched).toBe(true)
    expect(second.output).toBe(first.output)
  })

  it('wraps the export when only the wrapper import is present', () => {
    const source = fixture('next.config.import-only.ts')
    const result = wrapConciv(source)
    expect(result.matched).toBe(true)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(result.output).toContain('export default withConciv(nextConfig)')
    expect(result.output.split(nextPluginImport)).toHaveLength(2)
  })
})

describe('defaultExportWrapped', () => {
  it('is false while only the import is present and true once the export is wrapped', () => {
    const source = fixture('next.config.import-only.ts')
    expect(defaultExportWrapped(source, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(false)
    const result = wrapConciv(source)
    if (result.output === null) throw new Error('matched transform must carry output')
    expect(defaultExportWrapped(result.output, 'withConciv', '@conciv/it/plugin/nextjs')).toBe(true)
  })
})
