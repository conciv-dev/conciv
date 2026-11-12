import {execFileSync} from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {afterAll, describe, expect, test} from 'vitest'

const packageRoot = resolve(import.meta.dirname, '../..')
const mascotRoot = realpathSync(join(packageRoot, 'node_modules/@conciv/mascot'))

const REACT_PROBE = `import {Mascot} from '@conciv/mascot-react'
import {createElement} from 'react'
import {renderToString} from 'react-dom/server'

const markup = renderToString(createElement(Mascot, null))

const rendered = ['root', 'head', 'antenna', 'eyes', 'effect'].filter((part) =>
  markup.includes('data-part="' + part + '"'),
)

const installedFrameworks = ['solid-js', 'react', 'react-dom'].filter((name) => {
  try {
    import.meta.resolve(name)
    return true
  } catch {
    return false
  }
})

process.stdout.write(
  JSON.stringify({
    Mascot: typeof Mascot,
    parts: Object.keys(Mascot).toSorted(),
    rendered,
    frameworks: installedFrameworks,
  }),
)
`

describe.skip('packed install', () => {
  const consumerRoots: string[] = []

  function packTarball(root: string, destination: string): string {
    const output = execFileSync('pnpm', ['pack', '--pack-destination', destination], {cwd: root, encoding: 'utf8'})
    const tarball = output.trim().split('\n').at(-1)
    if (tarball === undefined || !existsSync(tarball)) throw new Error(`pnpm pack produced no tarball:\n${output}`)
    return tarball
  }

  function installPacked(consumerRoot: string, root: string, name: string): void {
    const target = join(consumerRoot, 'node_modules', name)
    mkdirSync(target, {recursive: true})
    execFileSync('tar', ['-xzf', packTarball(root, consumerRoot), '-C', target, '--strip-components=1'])
  }

  function linkDependency(consumerRoot: string, from: string, name: string): void {
    const source = dirname(createRequire(join(from, 'package.json')).resolve(`${name}/package.json`))
    symlinkSync(source, join(consumerRoot, 'node_modules', name), 'dir')
  }

  afterAll(() => {
    for (const root of consumerRoots) rmSync(root, {recursive: true, force: true})
  })

  test('a packed install with only react present imports and renders the react mascot', () => {
    const consumerRoot = mkdtempSync(join(tmpdir(), 'conciv-mascot-react-packed-'))
    consumerRoots.push(consumerRoot)
    installPacked(consumerRoot, mascotRoot, '@conciv/mascot')
    installPacked(consumerRoot, packageRoot, '@conciv/mascot-react')
    linkDependency(consumerRoot, mascotRoot, 'gsap')
    linkDependency(consumerRoot, packageRoot, 'react')
    linkDependency(consumerRoot, packageRoot, 'react-dom')
    writeFileSync(join(consumerRoot, 'probe.mjs'), REACT_PROBE)
    const result: unknown = JSON.parse(
      execFileSync(process.execPath, ['probe.mjs'], {cwd: consumerRoot, encoding: 'utf8'}),
    )
    expect(result).toEqual({
      Mascot: 'function',
      parts: ['Antenna', 'Binary', 'Effect', 'Eyes', 'Head'],
      rendered: ['root', 'head', 'antenna', 'eyes', 'effect'],
      frameworks: ['react', 'react-dom'],
    })
  }, 60_000)
})

describe('publish surface', () => {
  const SOLID_PATTERN = /(?:from|import)\s*["']solid-js(?:\/[^"']*)?["']/
  const PACKAGE_IMPORT_PATTERN = /(?:from|import)\s*["'](@conciv\/mascot[^"']*)["']/g

  function emittedModules(): string[] {
    const distRoot = join(packageRoot, 'dist')
    return execFileSync('find', [distRoot, '-name', '*.js'], {encoding: 'utf8'}).trim().split('\n')
  }

  test('the react entry never reaches solid', () => {
    expect(emittedModules().filter((file) => SOLID_PATTERN.test(readFileSync(file, 'utf8')))).toEqual([])
  })

  test('the react entry reaches @conciv/mascot only through its published subpaths', () => {
    const published = ['@conciv/mascot', '@conciv/mascot/adapter', '@conciv/mascot/effects/binary']
    const specifiers = emittedModules().flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(PACKAGE_IMPORT_PATTERN)].flatMap((match) => match[1] ?? []),
    )
    expect(specifiers.length).toBeGreaterThan(0)
    expect(specifiers.filter((specifier) => !published.includes(specifier))).toEqual([])
  })
})
