import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {builtinToolNames} from '@conciv/tools/builtins'

const workspaceRoot = fileURLToPath(new URL('../../..', import.meta.url))

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'test', 'tests', 'e2e'])

const NON_SOURCE_FILE = /\.(test|test-d|stories|browser\.test|it\.test)\.tsx?$/

function isScannedSourcePath(path: string): boolean {
  if (!/\.tsx?$/.test(path) || NON_SOURCE_FILE.test(path)) return false
  return path.split('/').includes('src')
}

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
      continue
    }
    found.push(path)
  }
  return found
}

const sources = [join(workspaceRoot, 'packages'), join(workspaceRoot, 'apps', 'conciv')]
  .flatMap(sourceFiles)
  .map((path) => relative(workspaceRoot, path))
  .filter(isScannedSourcePath)
  .map((path) => ({path, text: readFileSync(join(workspaceRoot, path), 'utf8')}))

const MULTI_SEGMENT_NAME = /^[a-z][a-zA-Z0-9]*[._][a-zA-Z0-9_.]+$/

type Segment = {kind: 'code' | 'single' | 'double' | 'template'; text: string}

type SegmentationState = {
  text: string
  segments: Segment[]
  interpolationDepths: number[]
  kind: Segment['kind']
  current: string
  index: number
}

const STRING_OPENERS: {[delimiter: string]: 'single' | 'double' | 'template'} = {
  "'": 'single',
  '"': 'double',
  '`': 'template',
}

function flushSegment(state: SegmentationState, next: Segment['kind']) {
  state.segments.push({kind: state.kind, text: state.current})
  state.kind = next
  state.current = ''
}

function trackInterpolationBraces(state: SegmentationState, char: string): 'closed' | 'kept' {
  const depthIndex = state.interpolationDepths.length - 1
  const depth = state.interpolationDepths[depthIndex]
  if (depth === undefined) return 'kept'
  if (char === '{') state.interpolationDepths[depthIndex] = depth + 1
  if (char !== '}') return 'kept'
  if (depth > 0) {
    state.interpolationDepths[depthIndex] = depth - 1
    return 'kept'
  }
  state.interpolationDepths.pop()
  return 'closed'
}

function stepCode(state: SegmentationState) {
  const char = state.text[state.index] ?? ''
  const openedKind = STRING_OPENERS[char]
  if (openedKind !== undefined) {
    flushSegment(state, openedKind)
    state.index += 1
    return
  }
  if (trackInterpolationBraces(state, char) === 'closed') {
    flushSegment(state, 'template')
    state.index += 1
    return
  }
  state.current += char
  state.index += 1
}

function stepString(state: SegmentationState) {
  const char = state.text[state.index] ?? ''
  if (char === '\\') {
    state.current += state.text.slice(state.index, state.index + 2)
    state.index += 2
    return
  }
  if (state.kind === 'template' && char === '$' && state.text[state.index + 1] === '{') {
    flushSegment(state, 'code')
    state.interpolationDepths.push(0)
    state.index += 2
    return
  }
  const closer = state.kind === 'single' ? "'" : state.kind === 'double' ? '"' : '`'
  if (char === closer) {
    flushSegment(state, 'code')
    state.index += 1
    return
  }
  state.current += char
  state.index += 1
}

function segmentSource(text: string): Segment[] {
  const state: SegmentationState = {text, segments: [], interpolationDepths: [], kind: 'code', current: '', index: 0}
  while (state.index < state.text.length) {
    if (state.kind === 'code') {
      stepCode(state)
      continue
    }
    stepString(state)
  }
  flushSegment(state, 'code')
  return state.segments
}

const DECLARATION_OPENER = /(?:defineTool|toolDefinition)\s*\(/

const NAME_FIELD_AT_END = /(?:^|[^\w$.])name:\s*$/

function parenthesisDelta(char: string): number {
  if (char === '(') return 1
  if (char === ')') return -1
  return 0
}

function declarationDepthAfter(codeText: string, depthBefore: number, opener: RegExp): number {
  let depth = depthBefore
  let cursor = 0
  while (cursor < codeText.length) {
    if (depth === 0) {
      const opened = opener.exec(codeText.slice(cursor))
      if (!opened) return 0
      cursor += opened.index + opened[0].length
      depth = 1
      continue
    }
    depth += parenthesisDelta(codeText[cursor] ?? '')
    cursor += 1
  }
  return depth
}

function harvestNames(segments: Segment[], opener: RegExp, fieldAtEnd: RegExp, nameOf: (value: string) => string) {
  const names: string[] = []
  let depth = 0
  segments.forEach((segment, segmentIndex) => {
    if (segment.kind !== 'code') return
    depth = declarationDepthAfter(segment.text, depth, opener)
    if (depth === 0) return
    if (!fieldAtEnd.test(segment.text)) return
    const following = segments[segmentIndex + 1]
    if (following?.kind === 'single') names.push(nameOf(following.text))
  })
  return names
}

type DeclarationFactory = {functionName: string; namePrefix: string; specField: string}

const FUNCTION_DECLARATION = /function\s+([A-Za-z_$][\w$]*)/g

const SPEC_FIELD_INTERPOLATION = /^\s*[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)\s*$/

function templatedNameFactoryAt(
  segments: Segment[],
  segmentIndex: number,
  enclosingFunction: string,
): DeclarationFactory | undefined {
  if (enclosingFunction === '') return undefined
  const prefix = segments[segmentIndex + 1]
  if (prefix?.kind !== 'template' || prefix.text === '') return undefined
  const interpolation = segments[segmentIndex + 2]
  if (interpolation?.kind !== 'code') return undefined
  const specField = SPEC_FIELD_INTERPOLATION.exec(interpolation.text)?.[1]
  if (specField === undefined) return undefined
  return {functionName: enclosingFunction, namePrefix: prefix.text, specField}
}

function declarationFactoriesIn(segments: Segment[]): DeclarationFactory[] {
  const factories: DeclarationFactory[] = []
  let depth = 0
  let enclosingFunction = ''
  segments.forEach((segment, segmentIndex) => {
    if (segment.kind !== 'code') return
    for (const declaration of segment.text.matchAll(FUNCTION_DECLARATION)) enclosingFunction = declaration[1] ?? ''
    depth = declarationDepthAfter(segment.text, depth, DECLARATION_OPENER)
    if (depth === 0 || !NAME_FIELD_AT_END.test(segment.text)) return
    const factory = templatedNameFactoryAt(segments, segmentIndex, enclosingFunction)
    if (factory !== undefined) factories.push(factory)
  })
  return factories
}

function factoryCallNames(segments: Segment[], factory: DeclarationFactory): string[] {
  const opener = new RegExp(`(?<![\\w$.])${factory.functionName}\\s*\\(`)
  const fieldAtEnd = new RegExp(`(?:^|[^\\w$.])${factory.specField}:\\s*$`)
  return harvestNames(segments, opener, fieldAtEnd, (verb) => `${factory.namePrefix}${verb}`)
}

function declaredNamesIn(text: string): string[] {
  const segments = segmentSource(text)
  const names = harvestNames(segments, DECLARATION_OPENER, NAME_FIELD_AT_END, (name) => name)
  for (const factory of declarationFactoriesIn(segments)) {
    names.push(...factoryCallNames(segments, factory))
  }
  return names
}

function escapeForPattern(name: string): string {
  return name.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mentionedInProse(prose: string, name: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9_.])${escapeForPattern(name)}(?![A-Za-z0-9_.])`).test(prose)
}

function templateProseOf(text: string): string {
  return segmentSource(text)
    .filter((segment) => segment.kind === 'template')
    .map((segment) => segment.text)
    .join('\n')
}

function foreignNamesIn(
  text: string,
  registeredNames: string[],
  declared: Set<string>,
  templateProseExempt: boolean,
): string[] {
  const stripped = text.replaceAll(/\[\s*'[^']+'\s*\]/g, '[]')
  const prose = templateProseExempt ? '' : templateProseOf(text)
  return registeredNames.filter((name) => {
    if (declared.has(name)) return false
    if (stripped.includes(`'${name}'`) || stripped.includes(`"${name}"`)) return true
    return prose !== '' && mentionedInProse(prose, name)
  })
}

const BUILTIN_DECLARATION_DIRECTORY = 'packages/tools/src/builtins/'

const PROMPT_PROSE_FILES = new Set([
  'packages/extensions/whiteboard/src/shared/meta.ts',
  'packages/extensions/whiteboard/src/tool/canvas/server.ts',
  'packages/extensions/ios/src/server/tools.ts',
])

const declarationsByFile = new Map(sources.map((source) => [source.path, declaredNamesIn(source.text)]))

const builtinNames = builtinToolNames()

const capabilityNames = [...new Set([...builtinNames, ...[...declarationsByFile.values()].flat()])].filter((name) =>
  MULTI_SEGMENT_NAME.test(name),
)

function declaredSetFor(path: string): Set<string> {
  const declared = new Set(declarationsByFile.get(path) ?? [])
  if (!path.startsWith(BUILTIN_DECLARATION_DIRECTORY)) return declared
  for (const name of builtinNames) declared.add(name)
  return declared
}

const VIOLATION_REMEDY =
  'these files enumerate registered capability names outside their declaration sites; ' +
  "permitted escapes: index the declaration map (DECLARATIONS['the.name']) or import the declaration and reference its exported name constant"

describe('capability lists live in the registry declarations only', () => {
  test('the scan is grounded: it sees the builtins, the extension declarations, and the source tree', () => {
    expect(capabilityNames).toContain('server.config')
    expect(capabilityNames).toContain('canvas.draw')
    expect(capabilityNames).toContain('recording_start')
    expect(capabilityNames.length).toBeGreaterThan(80)
    expect(sources.length).toBeGreaterThan(200)
  })

  test('every packages/extensions/* package contributes at least one harvested declaration name', () => {
    const extensionsRoot = join(workspaceRoot, 'packages', 'extensions')
    const extensionPackages = readdirSync(extensionsRoot).filter((entry) =>
      statSync(join(extensionsRoot, entry)).isDirectory(),
    )
    expect(extensionPackages.length).toBeGreaterThan(3)
    const declaring = extensionPackages.filter((extensionPackage) =>
      sources.some(
        (source) =>
          source.path.startsWith(`packages/extensions/${extensionPackage}/`) &&
          segmentSource(source.text).some(
            (segment) => segment.kind === 'code' && DECLARATION_OPENER.test(segment.text),
          ),
      ),
    )
    expect(declaring.length).toBeGreaterThanOrEqual(5)
    const unharvested = declaring.filter(
      (extensionPackage) =>
        ![...declarationsByFile.entries()].some(
          ([path, names]) => path.startsWith(`packages/extensions/${extensionPackage}/`) && names.length > 0,
        ),
    )
    expect(
      unharvested,
      'these extension packages declare tools through a shape the harvest cannot see; teach declaredNamesIn their declaration factory',
    ).toEqual([])
  })

  test('scope: only .ts/.tsx under a src directory inside packages/ and apps/conciv is scanned; .json/.js/.mdx files and other roots are out of scope by design', () => {
    expect(isScannedSourcePath('packages/core/src/chat/runtime.ts')).toBe(true)
    expect(isScannedSourcePath('apps/conciv/src/widget/panel.tsx')).toBe(true)
    expect(isScannedSourcePath('packages/core/src/config.json')).toBe(false)
    expect(isScannedSourcePath('packages/core/scripts/generate.js')).toBe(false)
    expect(isScannedSourcePath('apps/site/content/docs/tools.mdx')).toBe(false)
    expect(isScannedSourcePath('packages/core/vitest.config.ts')).toBe(false)
    expect(sources.some((source) => source.path.startsWith('apps/site/'))).toBe(false)
  })

  test('a file that declares a tool and also carries a parallel quoted-key dispatch table trips on the table', () => {
    const text = [
      "const alphaOneDef = defineTool({name: 'alpha.one', description: 'declares one (and only one) tool'})",
      "const HANDLERS = {'alpha.two': 2, 'alpha.three': 3}",
    ].join('\n')
    expect(declaredNamesIn(text)).toEqual(['alpha.one'])
    expect(
      foreignNamesIn(text, ['alpha.one', 'alpha.two', 'alpha.three'], new Set(declaredNamesIn(text)), false),
    ).toEqual(['alpha.two', 'alpha.three'])
  })

  test('a local declaration factory templating the tool name is harvested at its call sites', () => {
    const text = [
      'function alphaTool(spec: {verb: string; summary: string}) {',
      '  return defineTool({name: `alpha.${spec.verb}`, description: spec.summary})',
      '}',
      "const oneDef = alphaTool({verb: 'one', summary: 'the first tool'})",
      "const twoDef = alphaTool({verb: 'two', summary: 'the second tool'})",
    ].join('\n')
    expect(declaredNamesIn(text)).toEqual(['alpha.one', 'alpha.two'])
  })

  test('a defineTool( mention inside a string exempts nothing', () => {
    const text = [
      "const doc = 'call defineTool( to declare a tool'",
      "const KEYS = {'alpha.one': 1, 'alpha.two': 2}",
    ].join('\n')
    expect(declaredNamesIn(text)).toEqual([])
    expect(foreignNamesIn(text, ['alpha.one', 'alpha.two'], new Set(), false)).toEqual(['alpha.one', 'alpha.two'])
  })

  test('a capability list constructed inside a template literal trips', () => {
    const text = "const list = `alpha.one alpha.two`.split(' ')"
    expect(foreignNamesIn(text, ['alpha.one', 'alpha.two'], new Set(), false)).toEqual(['alpha.one', 'alpha.two'])
  })

  test('indexing the declaration map stays permitted', () => {
    const text = "const one = DECLARATIONS['alpha.one']\nconst two = DECLARATIONS['alpha.two']"
    expect(foreignNamesIn(text, ['alpha.one', 'alpha.two'], new Set(), false)).toEqual([])
  })

  test('a singleton list stays permitted', () => {
    const text = "const only = ['alpha.one']"
    expect(foreignNamesIn(text, ['alpha.one', 'alpha.two'], new Set(), false)).toEqual([])
  })

  test('template prose matching respects name boundaries', () => {
    const text = 'const prompt = `alpha.onemore and alpha.one.extra are different tools`'
    expect(foreignNamesIn(text, ['alpha.one'], new Set(), false)).toEqual([])
  })

  test('prompt-prose files are a visible named allowlist exempting the template channel only, honest while they still teach names in prose', () => {
    for (const path of PROMPT_PROSE_FILES) {
      const source = sources.find((candidate) => candidate.path === path)
      expect(source, `${path} left the tree; remove it from PROMPT_PROSE_FILES`).toBeDefined()
      if (!source) continue
      const prose = templateProseOf(source.text)
      const taught = capabilityNames.filter((name) => mentionedInProse(prose, name))
      expect(
        taught.length,
        `${path} no longer teaches capability names in template prose; remove it from PROMPT_PROSE_FILES`,
      ).toBeGreaterThanOrEqual(2)
    }
  })

  test('no source file outside a declaration site enumerates registered capability names', () => {
    const violations = sources
      .map((source) => ({
        path: source.path,
        names: foreignNamesIn(
          source.text,
          capabilityNames,
          declaredSetFor(source.path),
          PROMPT_PROSE_FILES.has(source.path),
        ),
      }))
      .filter((entry) => entry.names.length >= 2)
    expect(violations, VIOLATION_REMEDY).toEqual([])
  })
})
