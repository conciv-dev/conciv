import {describe, expect, it, test, afterAll} from 'vitest'
import {
  EXTENSIONS_VIRTUAL_ID,
  extensionsModuleSource,
  loadServerExtensions,
  loadExtensionPackages,
  listExtensionFiles,
} from '../src/extensions.js'
import {isClientEntry, transformConcivModule, concivSolidConfig} from '../src/vite-plumbing.js'
import {fileURLToPath} from 'node:url'
import {dedupeExtensions} from '../src/dedupe-extensions.js'
import {isExtension} from '../src/extension-guard.js'
import {dirname, join} from 'node:path'
import {splitExtension} from '../src/split-extension.js'
import {compileExtensionSolid} from '../src/compile-extension.js'
import {chmodSync, mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {defineExtension} from '@conciv/extension'
import {addSourceToJsx} from '../src/inject-source.js'
import {parseSync, Visitor, type JSXAttributeItem, type JSXElementName} from 'oxc-parser'
import {scaffold} from '@conciv/extension/catalog'

describe('client entry inject', () => {
  const CTX = {root: '/app', keys: null}

  describe('client-entry module-graph injection', () => {
    it('matches framework client-entry ids, not ordinary modules', () => {
      expect(isClientEntry('virtual:tanstack-start-dev-client-entry')).toBe(true)
      expect(isClientEntry('\0virtual:tanstack-start-client-entry')).toBe(true)
      expect(isClientEntry('/src/main.tsx')).toBe(false)
      expect(isClientEntry('/src/routes/__root.tsx')).toBe(false)
    })

    it('appends a dynamic import of the extensions module to the client entry (not hoisted above the preamble)', () => {
      const out = transformConcivModule(
        'await import("/entry.client.tsx")',
        'virtual:tanstack-start-dev-client-entry',
        false,
        CTX,
      )
      expect(out).not.toBeNull()
      const code = (out as {code: string}).code
      expect(code).toContain(`import(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})`)
      expect(code).not.toMatch(new RegExp(`^\\s*import\\s+['"]${EXTENSIONS_VIRTUAL_ID}`, 'm'))
    })

    it('does not inject on the SSR pass (the entry is client-only)', () => {
      const out = transformConcivModule(
        'await import("/entry.client.tsx")',
        'virtual:tanstack-start-dev-client-entry',
        true,
        CTX,
      )
      if (out && 'code' in out) expect(out.code).not.toContain(EXTENSIONS_VIRTUAL_ID)
    })

    it('does not double-inject when the entry already imports the extensions module (HMR re-transform)', () => {
      const already = `await import("/entry.client.tsx")\nimport(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})\n`
      const out = transformConcivModule(already, 'virtual:tanstack-start-dev-client-entry', false, CTX)
      expect(out).toBeNull()
    })

    it('bakes the engine origin into the extensions module as the window global (Next-style seam)', () => {
      const source = extensionsModuleSource(['/abs/a/client.js'], 'http://127.0.0.1:41700')
      expect(source).toContain('window.__CONCIV_API_BASE__ = "http://127.0.0.1:41700"')
    })

    it('exports a dock renderer instead of mounting on the page when the surface is dock', () => {
      const source = extensionsModuleSource(['/abs/a/client.js'], undefined, undefined, undefined, 'dock')
      expect(source).toContain('export default function concivDockRenderer')
      expect(source).toContain('createConciv')
      expect(source).not.toContain('mountConciv')
    })

    it('omits the window global when no api base is known (classic path uses the meta tag)', () => {
      const source = extensionsModuleSource(['/abs/a/client.js'])
      expect(source).not.toContain('__CONCIV_API_BASE__')
    })
  })
})

describe('dedupe extensions', () => {
  test('isExtension requires an object with a non-empty string name', () => {
    expect(isExtension({name: 'a'})).toBe(true)
    expect(isExtension({name: ''})).toBe(false)
    expect(isExtension({})).toBe(false)
    expect(isExtension(null)).toBe(false)
    expect(isExtension(() => {})).toBe(false)
  })

  test('built-ins win over folder on name collision; deterministic order; provenance in dropped', () => {
    const r = dedupeExtensions([
      {extension: {name: 'terminal'}, source: 'builtin:0'},
      {extension: {name: 'tanstack'}, source: '/app/conciv/extensions/tanstack.tsx'},
      {extension: {name: 'terminal'}, source: '/app/conciv/extensions/terminal.tsx'},
      {extension: {name: ''}, source: '/app/conciv/extensions/broken.tsx'},
      {extension: 42, source: '/app/conciv/extensions/notext.tsx'},
    ])
    expect(r.extensions.map((e) => e.name)).toEqual(['terminal', 'tanstack'])
    expect(r.dropped).toEqual([
      {source: '/app/conciv/extensions/terminal.tsx', reason: 'duplicate-name:terminal'},
      {source: '/app/conciv/extensions/broken.tsx', reason: 'invalid-extension'},
      {source: '/app/conciv/extensions/notext.tsx', reason: 'invalid-extension'},
    ])
  })

  test('toSortedLoaders sorts glob keys and drops .d.ts (client ordering)', async () => {
    const {loadExtensions, toSortedLoaders} = await import('../src/dedupe-extensions.js')
    const loaders = toSortedLoaders({
      '/conciv/extensions/z.tsx': async () => ({default: {name: 'z'}}),
      '/conciv/extensions/a.tsx': async () => ({default: {name: 'a'}}),
      '/conciv/extensions/types.d.ts': async () => ({default: {name: 'skip'}}),
    })
    expect(loaders.map((loader) => loader.source)).toEqual(['/conciv/extensions/a.tsx', '/conciv/extensions/z.tsx'])
    const picked = await loadExtensions(loaders)
    expect(picked.extensions.map((extension) => extension.name)).toEqual(['a', 'z'])
  })

  test('an extension module that fails to load is skipped and reported, the rest still load', async () => {
    const {loadExtensions} = await import('../src/dedupe-extensions.js')
    const picked = await loadExtensions([
      {source: '/abs/extension-recorder/dist/client.js', load: () => Promise.reject(new TypeError('boom'))},
      {source: '/conciv/extensions/notes.tsx', load: async () => ({default: {name: 'notes'}})},
    ])
    expect(picked.extensions.map((extension) => extension.name)).toEqual(['notes', 'conciv-load-failures'])
  })
})

describe('extension isolation', () => {
  const here = dirname(fileURLToPath(import.meta.url))

  const ID = '/proj/conciv/extensions/iso.tsx'

  async function compileClient(source: string): Promise<string> {
    const split = splitExtension(source, ID, 'browser')
    const compiled = await compileExtensionSolid(split?.code ?? source, ID, false)
    if (!compiled) throw new Error('compile produced no output')
    return compiled.code
  }

  describe('extension client/server isolation', () => {
    it('server code + its node imports never reach the client bundle', async () => {
      const client = await compileClient(
        `import {readFileSync} from 'node:fs'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
const tool = defineTool({name: 'iso_tool', description: 'd', inputSchema: z.object({})})
  .server(() => readFileSync('/etc/secret-token', 'utf8'))
const iso = defineExtension({name: 'iso', Component: Surface, tools: [tool]})
  .server(() => ({systemPrompt: readFileSync('/etc/secret-token', 'utf8')}))
export default iso
function Surface() {
  return <button data-client-marker>Go</button>
}`,
      )

      expect(client).toContain('data-client-marker')

      expect(client).not.toContain('node:fs')
      expect(client).not.toContain('readFileSync')
      expect(client).not.toContain('/etc/secret-token')
    }, 30_000)

    it('the server load never executes the client (Component / .client) halves', async () => {
      const builders = await loadServerExtensions(join(here, 'fixtures', 'iso-extensions'), [])
      expect(builders.flatMap((builder) => (builder.tools ?? []).map((tool) => tool.name))).toContain('iso_tool')
    }, 30_000)

    it('a capability declared in an imported module is split on the server too', async () => {
      const builders = await loadServerExtensions(join(here, 'fixtures', 'nested-extensions'), [])
      expect(builders.flatMap((builder) => (builder.tools ?? []).map((tool) => tool.name))).toContain('nested_tool')
    }, 30_000)
  })
})

describe('extensions', () => {
  const fixture = defineExtension({name: 'fixture-ext'})

  describe('generic extension wiring', () => {
    it('returns the injected built-in server extensions when a project has no user extensions', async () => {
      const emptyProject = mkdtempSync(join(tmpdir(), 'conciv-noext-'))
      const builders = await loadServerExtensions(emptyProject, [fixture])
      expect(builders.map((builder) => builder.name)).toEqual(['fixture-ext'])
    })

    it('loads each client entry independently and hands them all to mountConciv', () => {
      const source = extensionsModuleSource(['/abs/a/client.js', '/abs/b/client.js'])
      expect(source).toContain(
        'const builtinLoaders = [{source: "/abs/a/client.js", load: () => import("/abs/a/client.js")}, {source: "/abs/b/client.js", load: () => import("/abs/b/client.js")}]',
      )
      expect(source).toContain('toSortedLoaders(import.meta.glob("/conciv/extensions/*.{ts,tsx,js,jsx}"))')
      expect(source).toContain('const picked = await loadExtensions([...builtinLoaders, ...folderLoaders])')
      expect(source).toContain('mountConciv(picked.extensions)')
    })

    it('imports dedupe from the bare specifier when no resolved entry is threaded', () => {
      const source = extensionsModuleSource(['/abs/a/client.js'])
      expect(source).toContain('import {loadExtensions, toSortedLoaders} from "@conciv/extension-compiler/dedupe"')
    })

    it('imports dedupe from the resolved absolute entry so consumer apps resolve it in dist mode', () => {
      const source = extensionsModuleSource(
        ['/abs/a/client.js'],
        undefined,
        '/abs/embed/mount.js',
        '/abs/pkg/dist/dedupe-extensions.js',
      )
      expect(source).toContain('import {loadExtensions, toSortedLoaders} from "/abs/pkg/dist/dedupe-extensions.js"')
      expect(source).not.toContain('@conciv/extension-compiler/dedupe')
    })
  })
})

describe('inject source', () => {
  const ROOT = '/proj'

  const sourceValues = (code: string): string[] =>
    [...code.matchAll(/data-conciv-source="([^"]+)"/g)].map((m) => m[1] ?? '')

  const keyValues = (code: string): string[] => [...code.matchAll(/data-conciv-key="([^"]+)"/g)].map((m) => m[1] ?? '')

  describe('addSourceToJsx', () => {
    it('stamps a host element with data-conciv-source="<relpath>:<line>:<col>"', () => {
      const code = `export const A = () => <div className="x">hi</div>\n`
      const out = addSourceToJsx({code, id: `${ROOT}/src/App.tsx`, root: ROOT, keys: new Map()})
      expect(out).not.toBeNull()
      expect(out!.code).toContain('data-conciv-source="src/App.tsx:1:24"')
      expect(out!.code).toContain('className="x"')
    })

    it('handles self-closing elements', () => {
      const code = `export const B = () => <img src="a.png" />\n`
      const out = addSourceToJsx({code, id: `${ROOT}/src/B.tsx`, root: ROOT, keys: new Map()})
      expect(out!.code).toMatch(
        /<img src="a\.png"\s+data-conciv-source="src\/B\.tsx:1:\d+"\s+data-conciv-key="[\w-]{6}" \/>/,
      )
    })

    it('skips Fragments', () => {
      const code = `export const C = () => <><span>x</span></>\n`
      const out = addSourceToJsx({code, id: `${ROOT}/src/C.tsx`, root: ROOT, keys: new Map()})

      expect(out!.code).toContain('<span data-conciv-source=')
      expect(out!.code).not.toContain('<> data-conciv-source')
    })

    it('returns null for non-JSX files', () => {
      expect(
        addSourceToJsx({code: 'export const x = 1', id: `${ROOT}/src/util.ts`, root: ROOT, keys: new Map()}),
      ).toBeNull()
    })

    it('returns null when there is no JSX', () => {
      expect(
        addSourceToJsx({code: 'export const x = 1', id: `${ROOT}/src/util.tsx`, root: ROOT, keys: new Map()}),
      ).toBeNull()
    })

    it('does not double-stamp an element that already has the attribute', () => {
      const code = `export const D = () => <div data-conciv-source="x">y</div>\n`
      const out = addSourceToJsx({code, id: `${ROOT}/src/D.tsx`, root: ROOT, keys: new Map()})
      expect(out).toBeNull()
    })

    it('JSON-escapes the path so a quote cannot break out of the attribute', () => {
      const code = `export const E = () => <div>q</div>\n`
      const out = addSourceToJsx({code, id: `${ROOT}/src/we"ird.tsx`, root: ROOT, keys: new Map()})

      expect(out!.code).toContain('\\"')
      expect(out!.code).not.toContain('data-conciv-source="src/we"ird')
    })

    it('stamps line numbers from the on-disk source, stable across per-environment line shifts', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-inject-'))
      const raw = [
        'export function Root() {',
        '  return (',
        '    <html lang="en">',
        '      <head><title>x</title></head>',
        '      <body>hi</body>',
        '    </html>',
        '  )',
        '}',
        '',
      ].join('\n')
      const file = join(dir, 'App.tsx')
      writeFileSync(file, raw)

      const client = addSourceToJsx({code: raw, id: file, root: dir, keys: new Map()})
      const server = addSourceToJsx({
        code: '// injected by SSR transform\n'.repeat(12) + raw,
        id: file,
        root: dir,
        keys: new Map(),
      })

      expect(client).not.toBeNull()
      expect(server).not.toBeNull()

      expect(sourceValues(server!.code)).toEqual(sourceValues(client!.code))
      expect(sourceValues(client!.code)).toContain('App.tsx:5:7')
    })

    it('serves a fresh data-conciv-key without writing the source file, and the same file serves the same key again', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Card.tsx')
      const raw = 'export const Card = () => <section className="card"><h3>Pricing</h3></section>\n'
      writeFileSync(file, raw)
      const writtenAt = statSync(file).mtimeMs

      const first = keyValues(addSourceToJsx({code: raw, id: file, root: dir, keys: new Map()})?.code ?? '')
      const second = keyValues(addSourceToJsx({code: raw, id: file, root: dir, keys: new Map()})?.code ?? '')

      expect(first).toHaveLength(2)
      expect(first.filter((key) => key.length !== 6)).toEqual([])
      expect(new Set(first).size).toBe(2)
      expect(second).toEqual(first)
      expect(readFileSync(file, 'utf8')).toBe(raw)
      expect(statSync(file).mtimeMs).toBe(writtenAt)
    })

    it('keeps a data-conciv-key the source already carries', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Kept.tsx')
      const raw = 'export const Kept = () => <div data-conciv-key="kept01" className="a">x</div>\n'
      writeFileSync(file, raw)

      const out = addSourceToJsx({code: raw, id: file, root: dir, keys: new Map()})

      expect(keyValues(out?.code ?? '')).toEqual(['kept01'])
      expect(sourceValues(out?.code ?? '')).toEqual(['Kept.tsx:1:27'])
      expect(readFileSync(file, 'utf8')).toBe(raw)
    })

    it('serves keys and leaves the file alone when the file on disk changed since the code was read', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Moved.tsx')
      const code = 'export const Moved = () => <main><p>a</p></main>\n'
      const edited = 'export const Moved = () => <main><p>a</p><p>b</p></main>\n'
      writeFileSync(file, edited)

      const keys = keyValues(addSourceToJsx({code, id: file, root: dir, keys: new Map()})?.code ?? '')

      expect(readFileSync(file, 'utf8')).toBe(edited)
      expect(keys).toHaveLength(2)
      expect(keys.filter((key) => key.length !== 6)).toEqual([])
    })

    it('stamps a component imported from outside the framework with its call site, a framework or local component with nothing, a host element with key and source', () => {
      const code = [
        "import {Show} from 'solid-js'",
        "import {Chip} from '@conciv/ui-kit-chat'",
        "import {Tabs} from './tabs'",
        '',
        'export function Panel(props: {open: boolean}) {',
        '  const label = props.open ? "open" : "closed"',
        '  return (',
        '    <section>',
        '      <Show when={props.open}>',
        '        <Tabs.List>',
        '          <h3>{label}</h3>',
        '          <Chip tone="x" />',
        '          <Local />',
        '        </Tabs.List>',
        '      </Show>',
        '    </section>',
        '  )',
        '}',
        '',
        'function Local() {',
        '  return null',
        '}',
        '',
      ].join('\n')
      const out = addSourceToJsx({code, id: `${ROOT}/src/Panel.tsx`, root: ROOT, keys: null})
      expect(stampsOf(out?.code ?? '')).toEqual([
        {tag: 'section', site: null, source: 'src/Panel.tsx:8:5', keyed: true},
        {tag: 'Show', site: null, source: null, keyed: false},
        {tag: 'Tabs.List', site: 'src/Panel.tsx:10', source: null, keyed: false},
        {tag: 'h3', site: null, source: 'src/Panel.tsx:11:11', keyed: true},
        {tag: 'Chip', site: 'src/Panel.tsx:12', source: null, keyed: false},
        {tag: 'Local', site: null, source: null, keyed: false},
      ])
    })

    it('serves keys and leaves the file alone with no key memory', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Built.tsx')
      const raw = 'export const Built = () => <main><p>a</p></main>\n'
      writeFileSync(file, raw)

      const keys = keyValues(addSourceToJsx({code: raw, id: file, root: dir, keys: null})?.code ?? '')

      expect(readFileSync(file, 'utf8')).toBe(raw)
      expect(keys).toHaveLength(2)
      expect(keys.filter((key) => key.length !== 6)).toEqual([])
    })

    it('does not hand a deleted element its key back after the file lost all its JSX', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Gone.tsx')
      const memory = new Map()
      const serve = (code: string): string[] => {
        writeFileSync(file, code)
        return keyValues(addSourceToJsx({code, id: file, root: dir, keys: memory})?.code ?? '')
      }

      const [before] = serve('export const Gone = () => <button>a</button>\n')
      serve('export const Gone = () => null\n')
      const [after] = serve('export const Gone = () => (\n  <button>a</button>\n)\n')

      expect(before).toBeDefined()
      expect(after).toBeDefined()
      expect(after).not.toBe(before)
    })

    it('stamps a root-relative source for a file whose name starts with two dots', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, '..panel.tsx')
      const code = 'export const Panel = () => <div>x</div>\n'
      writeFileSync(file, code)

      const out = addSourceToJsx({code, id: file, root: dir, keys: null})

      expect(sourceValues(out?.code ?? '')).toEqual(['..panel.tsx:1:28'])
    })

    it('surfaces a source file it is not allowed to read instead of stamping from the transformed code', () => {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-key-'))
      const file = join(dir, 'Locked.tsx')
      const code = 'export const Locked = () => <div>x</div>\n'
      writeFileSync(file, code)
      chmodSync(file, 0o000)

      expect(() => addSourceToJsx({code, id: file, root: dir, keys: null})).toThrow(/EACCES/)
      chmodSync(file, 0o644)
    })
  })
})

function stampsOf(code: string): {tag: string; site: string | null; source: string | null; keyed: boolean}[] {
  const found: {tag: string; site: string | null; source: string | null; keyed: boolean}[] = []
  const program = parseSync('out.tsx', code, {sourceType: 'module', lang: 'tsx'}).program
  new Visitor({
    JSXOpeningElement(opening) {
      const value = (name: string): string | null => attributeValue({attributes: opening.attributes, name})
      found.push({
        tag: tagName(opening.name),
        site: value('data-conciv-site'),
        source: value('data-conciv-source'),
        keyed: value('data-conciv-key') !== null,
      })
    },
  }).visit(program)
  return found
}

function tagName(name: JSXElementName): string {
  if (name.type === 'JSXIdentifier') return name.name
  if (name.type === 'JSXMemberExpression') return `${tagName(name.object)}.${name.property.name}`
  if (name.type === 'JSXNamespacedName') return `${name.namespace.name}:${name.name.name}`
  return 'this'
}

function attributeValue(input: {attributes: JSXAttributeItem[]; name: string}): string | null {
  const found = input.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' &&
      attribute.name.type === 'JSXIdentifier' &&
      attribute.name.name === input.name,
  )
  if (found?.type !== 'JSXAttribute' || found.value?.type !== 'Literal') return null
  return typeof found.value.value === 'string' ? found.value.value : null
}

describe('load extension packages', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const roots: string[] = []

  afterAll(() => {
    for (const root of roots) rmSync(root, {recursive: true, force: true})
  })

  function serverEntry(body: string): string {
    const root = mkdtempSync(join(here, 'conciv-pkg-'))
    roots.push(root)
    writeFileSync(join(root, 'package.json'), JSON.stringify({type: 'module'}))
    const file = join(root, 'server.js')
    writeFileSync(file, body)
    return file
  }

  test('loads each server entry by its absolute path and keys its options by the extension name', async () => {
    const first = serverEntry("export default {name: 'first'}\n")
    const second = serverEntry("export default {name: 'second'}\n")
    const loaded = await loadExtensionPackages([
      {server: first, client: '/unused/client.js', config: {flag: true}},
      {server: second, client: '/unused/client.js', config: undefined},
    ])
    expect(loaded.extensions.map((extension) => extension.name)).toEqual(['first', 'second'])
    expect(loaded.config).toEqual({first: {flag: true}, second: undefined})
  })

  test('no packages load nothing', async () => {
    expect(await loadExtensionPackages()).toEqual({extensions: [], config: {}})
  })

  test('a server entry without an extension default export is fatal and names the entry', async () => {
    const server = serverEntry('export const notDefault = 1\n')
    await expect(loadExtensionPackages([{server, client: '/unused/client.js', config: undefined}])).rejects.toThrow(
      server,
    )
  })
})

describe('load server extensions', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const roots: string[] = []

  afterAll(() => {
    for (const root of roots) rmSync(root, {recursive: true, force: true})
  })

  function mkRoot(): string {
    const root = mkdtempSync(join(here, 'conciv-ext-'))
    roots.push(root)
    return root
  }

  const EXT = "import {defineExtension} from '@conciv/extension'\nexport default defineExtension"

  function fixture(files: Record<string, string>, dirs: string[] = []): string {
    const root = mkRoot()
    const base = join(root, 'conciv/extensions')
    mkdirSync(base, {recursive: true})
    for (const d of dirs) mkdirSync(join(base, d), {recursive: true})
    for (const [name, body] of Object.entries(files)) writeFileSync(join(base, name), body)
    return root
  }

  test('listExtensionFiles: sorted basenames, files only, .d.ts and non-matching excluded, [] on missing dir', () => {
    const root = fixture({'b.tsx': '', 'a.ts': '', 'types.d.ts': '', 'notes.md': '', 'bad.ts.bak': ''}, ['nested.ts'])
    expect(listExtensionFiles(root)).toEqual(['a.ts', 'b.tsx'])
    expect(listExtensionFiles(join(root, 'nowhere'))).toEqual([])
  })

  test('listExtensionFiles: a non-ENOENT fs failure is fatal, not "no extensions"', () => {
    const root = mkRoot()
    mkdirSync(join(root, 'conciv'), {recursive: true})
    writeFileSync(join(root, 'conciv/extensions'), 'not a directory')
    expect(() => listExtensionFiles(root)).toThrow()
  })

  test('ignores a directory whose name matches the extension pattern', async () => {
    const root = fixture({'a.tsx': `${EXT}({name:'a'})`}, ['nested.ts'])
    const out = await loadServerExtensions(root, [])
    expect(out.map((e) => e.name)).toEqual(['a'])
  })

  test('ignores .d.ts declaration files', async () => {
    const root = fixture({'a.tsx': `${EXT}({name:'a'})`, 'types.d.ts': 'export type X = 1'})
    const out = await loadServerExtensions(root, [])
    expect(out.map((e) => e.name)).toEqual(['a'])
  })

  test('a discovered module with no default export is fatal and names the file', async () => {
    const root = fixture({'x.tsx': 'export const notDefault = 1'})
    await expect(loadServerExtensions(root, [])).rejects.toThrow(/x\.tsx/)
  })

  const CLIENT_HEAVY = `import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const ping = defineTool({
  name: 'ping',
  description: 'ping',
  inputSchema: z.object({message: z.string()}),
}).server((input) => ({echo: input.message}))

const extension = defineExtension({name: 'client-heavy', Component, tools: [ping]})

export default extension

function Component() {
  return (
    <ComposerActions.ActionButton priority={10} tooltip="Do" onClick={() => {}} />
  )
}`

  test('an extension whose Component imports a client-only package still loads on the server', async () => {
    const root = fixture({'client-heavy.tsx': CLIENT_HEAVY})
    const out = await loadServerExtensions(root, [])
    expect(out.map((extension) => extension.name)).toEqual(['client-heavy'])
    expect(out[0]?.tools?.map((tool) => tool.name)).toEqual(['ping'])
  })

  test('built-in wins over a folder file of the same name', async () => {
    const builtin = defineExtension({name: 'terminal'})
    const root = fixture({'terminal.tsx': `${EXT}({name:'terminal'})`, 'a.tsx': `${EXT}({name:'a'})`})
    const out = await loadServerExtensions(root, [builtin])
    expect(out.filter((e) => e.name === 'terminal').length).toBe(1)
    expect(out[0]).toBe(builtin)
  })

  test('the same-name winner is the built-in regardless of folder enumeration order', async () => {
    const builtin = defineExtension({name: 'z'})
    const root = fixture({'z.tsx': `${EXT}({name:'z'})`, 'a.tsx': `${EXT}({name:'a'})`})
    const out = await loadServerExtensions(root, [builtin])
    expect(out[0]).toBe(builtin)
    expect(out.map((e) => e.name)).toEqual(['z', 'a'])
  })
})

describe('optimize deps', () => {
  describe('vite optimizeDeps for the extension graph', () => {
    it('excludes the Solid singletons and extension runtime, force-includes nothing', () => {
      const {optimizeDeps} = concivSolidConfig()
      expect(optimizeDeps.exclude).toEqual([
        'solid-js',
        'solid-js/web',
        'solid-js/store',
        '@tanstack/solid-router',
        '@ark-ui/solid',
        '@conciv/extension',
      ])
      expect(optimizeDeps.include).toEqual([])
    })
  })
})

describe('split declaration', () => {
  const ID = '/proj/conciv/extensions/capability.tsx'

  const CAPABILITY_ONLY = `import {readFileSync} from 'node:fs'
import {defineTool, defineAttachment} from '@conciv/extension'
import {Card} from './card.js'
import {Preview} from './preview.js'

export const draw = defineTool({name: 'draw'})
  .server(() => readFileSync('/etc/SECRET_TOKEN'))
  .render(Card)

export const shot = defineAttachment({mime: 'image/png'})
  .card(Preview)
  .server(() => ({expanded: globalThis.process.env.SECRET_TOKEN}))`

  const RECEIVERS = `import {defineExtension} from '@conciv/extension'

const view = {render: () => 'VIEW_RENDER'}
const printer = {client: () => 'PRINTER_CLIENT'}
const socket = {server: () => 'SOCKET_SERVER'}
const deck = {card: () => 'DECK_CARD'}

export const values = [view.render(), printer.client(), socket.server(), deck.card()]

export default defineExtension({name: 'plain'})
  .client(() => ({selection: 'CLIENT_BODY'}))
  .server(() => ({systemPrompt: 'SERVER_BODY'}))`

  const EXTENSION_GLOBALS = `import {defineExtension} from '@conciv/extension'

export default defineExtension({name: 'globals'})
  .client(() => ({selection: document.title + navigator.userAgent}))
  .server(() => ({systemPrompt: 'SERVER_BODY'}))`

  const CAPABILITY_GLOBALS = `import {defineAttachment} from '@conciv/extension'

export const shot = defineAttachment({mime: 'image/png'})
  .card(() => document.title + navigator.userAgent)
  .server(() => ({expanded: 'SERVER_BODY'}))`

  const REASSIGNED_RECEIVER = `import {defineTool} from '@conciv/extension'
import {foreignBuilder} from './foreign.js'

let receiver = defineTool({name: 'shifty'})
receiver = foreignBuilder

export const out = receiver.server(() => 'FOREIGN_SERVER_BODY')`

  const FOREIGN_IMPORT = `import {defineTool} from 'other-builders'
import {defineAttachment} from '@conciv/extension'

export const foreign = defineTool({name: 'foreign'}).server(() => 'FOREIGN_SERVER_BODY')

export const ours = defineAttachment({mime: 'image/png'}).server(() => ({expanded: 'OURS_SERVER_BODY'}))`

  const ALIASED_IMPORT = `import {defineTool as makeTool} from '@conciv/extension/tool'

export const aliased = makeTool({name: 'aliased'}).server(() => 'ALIAS_SERVER_BODY')`

  describe('splitExtension declaration matching', () => {
    it('processes a module that declares capabilities without declaring an extension', () => {
      const browser = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const node = splitExtension(CAPABILITY_ONLY, ID, 'node')
      expect(browser).not.toBeNull()
      expect(node).not.toBeNull()
    })

    it('browser: a capability-only module keeps its browser handlers and loses every server handler', () => {
      const out = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('node:fs')
      expect(code).not.toContain('readFileSync')
      expect(code).not.toContain('SECRET_TOKEN')
      expect(code).toContain('.render(Card)')
      expect(code).toContain('.card(Preview)')
    })

    it('node: a capability-only module keeps its server handlers and loses render and card', () => {
      const out = splitExtension(CAPABILITY_ONLY, ID, 'node')
      const code = out?.code ?? ''
      expect(code).not.toContain('.render(')
      expect(code).not.toContain('.card(')
      expect(code).not.toContain('./card.js')
      expect(code).not.toContain('./preview.js')
      expect(code).toContain('.server(')
      expect(code).toContain('node:fs')
      expect(code).toContain('SECRET_TOKEN')
    })

    it('keeps every declaration alive in both outputs', () => {
      const browser = splitExtension(CAPABILITY_ONLY, ID, 'browser')
      const node = splitExtension(CAPABILITY_ONLY, ID, 'node')
      for (const code of [browser?.code ?? '', node?.code ?? '']) {
        expect(code).toContain('defineTool(')
        expect(code).toContain("name: 'draw'")
        expect(code).toContain('defineAttachment(')
        expect(code).toContain("mime: 'image/png'")
      }
    })

    it('leaves a render, client, server or card call on an unrelated receiver untouched in both outputs', () => {
      const browser = splitExtension(RECEIVERS, ID, 'browser')
      const node = splitExtension(RECEIVERS, ID, 'node')
      for (const code of [browser?.code ?? '', node?.code ?? '']) {
        expect(code).toContain('view.render()')
        expect(code).toContain('printer.client()')
        expect(code).toContain('socket.server()')
        expect(code).toContain('deck.card()')
      }
    })

    it('leaves a terminator alone when its receiver binding is reassigned', () => {
      const out = splitExtension(REASSIGNED_RECEIVER, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).toContain('receiver.server(')
      expect(code).toContain('FOREIGN_SERVER_BODY')
    })

    it('recognizes a declaration call only when it is imported from @conciv/extension', () => {
      const out = splitExtension(FOREIGN_IMPORT, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).toContain('FOREIGN_SERVER_BODY')
      expect(code).not.toContain('OURS_SERVER_BODY')
    })

    it('follows an aliased declaration import from a @conciv/extension subpath', () => {
      const out = splitExtension(ALIASED_IMPORT, ID, 'browser')
      const code = out?.code ?? ''
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('ALIAS_SERVER_BODY')
    })

    it('drops the handler instead of emptying it, leaving no reference to browser-only globals on the server', () => {
      for (const source of [EXTENSION_GLOBALS, CAPABILITY_GLOBALS]) {
        const out = splitExtension(source, ID, 'node')
        const code = out?.code ?? ''
        expect(code).not.toContain('document')
        expect(code).not.toContain('navigator')
        expect(code).toContain('SERVER_BODY')
      }
    })
  })
})

describe('split extension', () => {
  const ID = '/proj/conciv/extensions/canvas.tsx'

  function splitCode(out: ReturnType<typeof splitExtension>): string {
    if (out === null) throw new Error('splitExtension returned null')
    return out.code
  }

  const SOURCE = `import {readFileSync} from 'node:fs'
import {defineExtension, defineTool} from '@conciv/extension'
import {Card} from './card.js'

const draw = defineTool({name: 'draw'})
  .server((input) => readFileSync(String(input)))
  .render(Card)

export default defineExtension({name: 'canvas', tools: [draw]})
  .client(() => ({selection: CLIENT_BODY}))
  .server(() => ({systemPrompt: SERVER_BODY}))`

  const SURFACE_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({
  name: 'surface',
  Component,
  Surface,
  views: [{id: 'panel', label: 'Panel', render: Panel}],
})

export default extension

function Component() {
  return <ComposerActions.Action priority={10} />
}

function Surface() {
  return <ComposerActions.ActionButton tooltip="b" />
}

function Panel() {
  return <ComposerActions.ActionMenuItem label="c" />
}`

  const METHOD_SURFACE_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const extension = defineExtension({
  name: 'method-surface',
  Component() {
    return <ComposerActions.Action priority={10} />
  },
  Surface() {
    return <ComposerActions.ActionButton tooltip="b" />
  },
})

export default extension`

  const ASSIGN_SOURCE = `import {defineExtension} from '@conciv/extension'
import {ComposerActions} from '@conciv/ui-kit-chat'

const deploy = defineExtension({name: 'deploy'})

function DeployButton() {
  return <ComposerActions.Action priority={10} />
}

export default Object.assign(deploy, {Component: DeployButton})`

  describe('splitExtension', () => {
    it('browser: collapses .server(), keeps .client()/.render(), drops node-only imports', async () => {
      const out = splitExtension(SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).not.toContain('.server(')
      expect(code).not.toContain('SERVER_BODY')
      expect(code).not.toContain('node:fs')
      expect(code).not.toContain('readFileSync')
      expect(code).toContain('.client(')
      expect(code).toContain('.render(Card)')
      expect(code).toContain('CLIENT_BODY')
    })

    it('node: collapses .client()/.render(), keeps .server(), drops client-only imports', async () => {
      const out = splitExtension(SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('.client(')
      expect(code).not.toContain('.render(')
      expect(code).not.toContain('CLIENT_BODY')
      expect(code).not.toContain('./card.js')
      expect(code).toContain('.server(')
      expect(code).toContain('SERVER_BODY')
      expect(code).toContain('node:fs')
    })

    it('returns null for a file that does not use defineExtension', async () => {
      const out = splitExtension(`export const x = api.server(() => 1)`, ID, 'browser')
      expect(out).toBeNull()
    })

    it('node: drops Component/Surface/views and the client-only imports they hold alive', async () => {
      const out = splitExtension(SURFACE_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('Component')
      expect(code).not.toContain('Surface')
      expect(code).not.toContain('views')
      expect(code).not.toContain('Panel')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'surface'")
    })

    it('browser: keeps Component/Surface/views intact', async () => {
      const out = splitExtension(SURFACE_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('Component')
      expect(code).toContain('Surface')
      expect(code).toContain('views')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it('node: drops an object-method Component/Surface and the client-only imports they hold alive', async () => {
      const out = splitExtension(METHOD_SURFACE_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('Component')
      expect(code).not.toContain('Surface')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'method-surface'")
    })

    it('browser: keeps an object-method Component/Surface intact', async () => {
      const out = splitExtension(METHOD_SURFACE_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('Component')
      expect(code).toContain('Surface')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it('node: strips Component from the Object.assign(extension, {Component}) form and its client-only imports', async () => {
      const out = splitExtension(ASSIGN_SOURCE, ID, 'node')
      const code = splitCode(out)
      expect(code).not.toContain('DeployButton')
      expect(code).not.toContain('Component')
      expect(code).not.toContain('@conciv/ui-kit-chat')
      expect(code).toContain("name: 'deploy'")
    })

    it('browser: keeps Component from the Object.assign(extension, {Component}) form intact', async () => {
      const out = splitExtension(ASSIGN_SOURCE, ID, 'browser')
      const code = splitCode(out)
      expect(code).toContain('DeployButton')
      expect(code).toContain('Component')
      expect(code).toContain('@conciv/ui-kit-chat')
    })

    it.each(['composer-action', 'full'] as const)(
      'node: the %s scaffold keeps no client-only package import',
      async (kind) => {
        const source = scaffold(kind, {name: 'demo'})
        expect(source).toContain('@conciv/ui-kit-chat')
        const node = splitExtension(source, ID, 'node')
        expect(node).not.toBeNull()
        expect(node!.code).not.toContain('@conciv/ui-kit-chat')
        expect(splitExtension(source, ID, 'browser')!.code).toContain('@conciv/ui-kit-chat')
      },
    )

    it('round-trips a scaffolded full extension through both sides', async () => {
      const source = scaffold('full', {name: 'demo'})
      const browser = splitExtension(source, ID, 'browser')
      const node = splitExtension(source, ID, 'node')
      expect(browser).not.toBeNull()
      expect(node).not.toBeNull()
      expect(browser!.code).not.toContain('.server(')
      expect(browser!.code).toContain('.client(')
      expect(browser!.code).toContain('.render(')
      expect(node!.code).not.toContain('.client(')
      expect(node!.code).not.toContain('.render(')
      expect(node!.code).toContain('.server(')
    })
  })
})
