import {groupBy, words} from 'es-toolkit'
import {getTsconfig} from 'get-tsconfig'

export function frameworksOf(visited: Map<string, Visited>): (file: string) => string | null {
  const importers = groupBy(
    [...visited.entries()].flatMap(([from, visit]) =>
      [...visit.resolved.values()].map((target) => ({from, to: target.path})),
    ),
    (edge) => edge.to,
  )
  const tsconfigs = new Map()
  const known = new Map<string, string | null>()
  const frameworkOf = (file: string): string | null => {
    const found = known.get(file)
    if (found !== undefined) return found
    known.set(file, null)
    const visit = visited.get(file)
    const framework =
      ownFramework(visit) ??
      configuredFramework({file, tsconfigs}) ??
      pluginFramework(visit) ??
      (importers[file] ?? []).map((edge) => frameworkOf(edge.from)).find((each) => each !== null) ??
      null
    known.set(file, framework)
    return framework
  }
  return frameworkOf
}

type Visited = {
  parsed: {imports: string[]; reexports: string[]} | null
  resolved: Map<string, {path: string}>
  plugins: string[]
}

const SCOPE_MARK = '@'
const RELATIVE_MARKS = ['.', '/']
const TSCONFIG = 'tsconfig.json'
const FRAMEWORKS = new Map([
  ['solid-js', 'solid'],
  ['react', 'react'],
  ['react-dom', 'react'],
  ['preact', 'preact'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
])
const REACT = 'react'
const REACT_JSX = new Set(['react', 'react-jsx', 'react-jsxdev', 'react-native'])
const PLUGIN_FRAMEWORKS = new Set(FRAMEWORKS.values())

function ownFramework(visit: Visited | undefined): string | null {
  const parsed = visit?.parsed
  if (parsed === null || parsed === undefined) return null
  const named = [...parsed.imports, ...parsed.reexports].filter(bare).map(packageName)
  return named.map((name) => FRAMEWORKS.get(name)).find((framework) => framework !== undefined) ?? null
}

function configuredFramework(input: {file: string; tsconfigs: Map<string, unknown>}): string | null {
  const options = getTsconfig(input.file, TSCONFIG, input.tsconfigs, true)?.config.compilerOptions
  const source = options?.jsxImportSource
  if (source !== undefined) return FRAMEWORKS.get(packageName(source)) ?? null
  const jsx = options?.jsx
  return jsx !== undefined && REACT_JSX.has(jsx) ? REACT : null
}

function pluginFramework(visit: Visited | undefined): string | null {
  const named = (visit?.plugins ?? []).flatMap((plugin) => words(plugin.toLowerCase()))
  return named.find((word) => PLUGIN_FRAMEWORKS.has(word)) ?? null
}

function packageName(request: string): string {
  const parts = request.split('/')
  return (request.startsWith(SCOPE_MARK) ? parts.slice(0, 2) : parts.slice(0, 1)).join('/')
}

function bare(request: string): boolean {
  return !RELATIVE_MARKS.some((mark) => request.startsWith(mark))
}
