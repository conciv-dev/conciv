import {execFileSync} from 'node:child_process'
import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {PlopTypes} from '@turbo/gen'

const NAME = /^@(conciv|internal)\/[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const RUNTIMES = ['node', 'browser', 'both']
const VISIBILITIES = ['public', 'private']
const TEST_KINDS = ['unit', 'it', 'e2e', 'fixtures']
const VERSION_SOURCE = 'packages/it/package.json'
const GUARDS = 'packages/publish/src/guards.ts'
const FALLOW_CONFIG = '.fallowrc.json'
const REPOSITORY_URL = 'git+https://github.com/conciv-dev/conciv.git'

type Runtime = 'node' | 'browser' | 'both'

type PackageSpec = {
  root: string
  name: string
  kebab: string
  directory: string
  description: string
  isPublic: boolean
  isInternal: boolean
  runtime: Runtime
  changeset: string
}

function validateName(input: string): true | string {
  return NAME.test(input) || 'use @conciv/<kebab-case> or @internal/<kebab-case>'
}

function validateDescription(input: string): true | string {
  if (input.trim().length === 0) return 'write one line that says what the package is for'
  return !input.includes('\n') || 'keep the description on one line'
}

function validateVisibility(name: string, visibility: string): true | string {
  if (!VISIBILITIES.includes(visibility)) return `visibility must be public or private, got ${visibility}`
  return !(name.startsWith('@internal/') && visibility === 'public') || 'an @internal package is always private'
}

function readRuntime(value: string): Runtime {
  if (value === 'node' || value === 'browser' || value === 'both') return value
  throw new Error(`runtime must be one of ${RUNTIMES.join(', ')}, got ${value}`)
}

function assertValid(name: string, description: string, visibility: string): void {
  const failed = [validateName(name), validateDescription(description), validateVisibility(name, visibility)].find(
    (check) => check !== true,
  )
  if (failed) throw new Error(`${name}: ${failed}`)
}

function readSpec(answers: PlopTypes.Answers): PackageSpec {
  const name = String(answers.name)
  const description = String(answers.description).trim()
  const visibility = String(answers.visibility)
  assertValid(name, description, visibility)
  const isInternal = name.startsWith('@internal/')
  const kebab = name.slice(name.indexOf('/') + 1)
  return {
    root: String(answers.turbo.paths.root),
    name,
    kebab,
    directory: isInternal ? `packages/${kebab}-internal` : `packages/${kebab}`,
    description,
    isPublic: visibility === 'public',
    isInternal,
    runtime: readRuntime(String(answers.runtime)),
    changeset: `.changeset/add-${kebab}-package.md`,
  }
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function readSharedVersion(root: string): string {
  const {version} = JSON.parse(readFileSync(join(root, VERSION_SOURCE), 'utf8'))
  if (typeof version !== 'string') throw new Error(`${VERSION_SOURCE} has no version`)
  return version
}

function repository(spec: PackageSpec): Record<string, string> {
  return {type: 'git', url: REPOSITORY_URL, directory: spec.directory}
}

function nodeTypes(spec: PackageSpec): Record<string, string> {
  return spec.runtime === 'browser' ? {} : {'@types/node': 'catalog:'}
}

function privateField(spec: PackageSpec): Record<string, boolean> {
  return spec.isPublic ? {} : {private: true}
}

function publishConfig(spec: PackageSpec): Record<string, unknown> {
  return spec.isPublic ? {publishConfig: {access: 'public'}} : {}
}

function publishScripts(spec: PackageSpec): Record<string, string> {
  return spec.isPublic ? {publint: 'publint', attw: 'attw --pack . --profile esm-only'} : {}
}

function devDependencies(spec: PackageSpec, build: Record<string, string>): Record<string, string> {
  return {
    '@conciv/harness-testkit': 'workspace:*',
    '@conciv/plugin-testkit': 'workspace:*',
    '@conciv/tsconfig': 'workspace:*',
    ...nodeTypes(spec),
    ...build,
    typescript: 'catalog:',
    vite: 'catalog:',
    vitest: 'catalog:',
  }
}

function sourceOnlyManifest(spec: PackageSpec, version: string): Record<string, unknown> {
  return {
    name: spec.name,
    version,
    private: true,
    description: spec.description,
    homepage: 'https://conciv.dev',
    license: 'MIT',
    repository: repository(spec),
    type: 'module',
    main: 'src/index.ts',
    types: 'src/index.ts',
    exports: {'.': './src/index.ts'},
    scripts: {typecheck: 'tsc -p tsconfig.json --noEmit', lint: 'oxlint'},
    devDependencies: devDependencies(spec, {}),
  }
}

function builtManifest(spec: PackageSpec, version: string): Record<string, unknown> {
  return {
    name: spec.name,
    version,
    ...privateField(spec),
    description: spec.description,
    keywords: ['conciv'],
    homepage: 'https://conciv.dev',
    bugs: 'https://github.com/conciv-dev/conciv/issues',
    license: 'MIT',
    repository: repository(spec),
    files: ['dist'],
    type: 'module',
    exports: {'.': {types: './dist/index.d.ts', import: './dist/index.js'}},
    ...publishConfig(spec),
    scripts: {
      build: 'tsdown && tsc -p tsconfig.build.json',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      lint: 'oxlint',
      ...publishScripts(spec),
    },
    devDependencies: devDependencies(spec, {tsdown: 'catalog:'}),
  }
}

function tsconfig(spec: PackageSpec): Record<string, unknown> {
  if (spec.runtime === 'node')
    return {extends: '@conciv/tsconfig/tsconfig.base.json', compilerOptions: {types: ['node']}}
  if (spec.runtime === 'both')
    return {extends: '@conciv/tsconfig/tsconfig.web.json', compilerOptions: {types: ['node']}}
  return {extends: '@conciv/tsconfig/tsconfig.web.json'}
}

function writeSourceOnlyManifests(answers: PlopTypes.Answers): string {
  const spec = readSpec(answers)
  const folder = join(spec.root, spec.directory)
  writeJson(join(folder, 'package.json'), sourceOnlyManifest(spec, readSharedVersion(spec.root)))
  writeJson(join(folder, 'tsconfig.json'), tsconfig(spec))
  return `${spec.directory}: package.json, tsconfig.json`
}

function writeBuiltManifests(answers: PlopTypes.Answers): string {
  const spec = readSpec(answers)
  const folder = join(spec.root, spec.directory)
  writeJson(join(folder, 'package.json'), builtManifest(spec, readSharedVersion(spec.root)))
  writeJson(join(folder, 'tsconfig.json'), tsconfig(spec))
  writeJson(join(folder, 'tsconfig.build.json'), {extends: ['./tsconfig.json', '@conciv/tsconfig/tsconfig.build.json']})
  return `${spec.directory}: package.json, tsconfig.json, tsconfig.build.json`
}

function appendToList(path: string, listStart: string, item: string): void {
  const source = readFileSync(path, 'utf8')
  const start = source.indexOf(listStart)
  if (start === -1) throw new Error(`${path}: cannot find ${listStart}`)
  const end = source.lastIndexOf('\n', source.indexOf(']', start))
  writeFileSync(path, `${source.slice(0, end)}${item}${source.slice(end)}`)
}

function registerPublicPackage(answers: PlopTypes.Answers): string {
  const spec = readSpec(answers)
  appendToList(join(spec.root, GUARDS), 'export const PUBLIC_PACKAGES = [', `\n  '${spec.name}',`)
  appendToList(join(spec.root, FALLOW_CONFIG), '"publicPackages": [', `,\n    "${spec.name}"`)
  return `${spec.name}: added to PUBLIC_PACKAGES and ${FALLOW_CONFIG} publicPackages`
}

function installAndFormat(answers: PlopTypes.Answers): string {
  const spec = readSpec(answers)
  const written = spec.isPublic ? [spec.directory, GUARDS, FALLOW_CONFIG, spec.changeset] : [spec.directory]
  execFileSync('pnpm', ['install'], {cwd: spec.root, stdio: 'inherit'})
  execFileSync('pnpm', ['exec', 'oxfmt', '--write', ...written], {cwd: spec.root, stdio: 'inherit'})
  return `${spec.name}: pnpm install and oxfmt done`
}

function addFromTemplate(path: string, template: string, spec: PackageSpec): PlopTypes.ActionType {
  return {type: 'add', path: `{{turbo.paths.root}}/${path}`, templateFile: `templates/${template}.hbs`, data: spec}
}

function sharedFileActions(spec: PackageSpec): PlopTypes.ActionType[] {
  if (!spec.isPublic) return []
  return [addFromTemplate(spec.changeset, 'changeset.md', spec), registerPublicPackage]
}

function packageActions(answers: PlopTypes.Answers | undefined): PlopTypes.ActionType[] {
  if (!answers) return []
  const spec = readSpec(answers)
  const build = spec.isInternal
    ? [writeSourceOnlyManifests]
    : [addFromTemplate(`${spec.directory}/tsdown.config.ts`, 'tsdown.config.ts', spec), writeBuiltManifests]
  return [
    addFromTemplate(`${spec.directory}/src/index.ts`, 'index.ts', spec),
    addFromTemplate(`${spec.directory}/vite.config.ts`, 'vite.config.ts', spec),
    addFromTemplate(`${spec.directory}/README.md`, 'README.md', spec),
    ...TEST_KINDS.map((kind) => ({
      type: 'add',
      path: `{{turbo.paths.root}}/${spec.directory}/test/${kind}/.gitkeep`,
      template: '',
    })),
    ...build,
    ...sharedFileActions(spec),
    installAndFormat,
  ]
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('package', {
    description: 'A new workspace package under packages/, set up the way every conciv package is',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Package name (@conciv/<kebab-case> or @internal/<kebab-case>)',
        validate: validateName,
      },
      {type: 'input', name: 'description', message: 'One-line description', validate: validateDescription},
      {
        type: 'list',
        name: 'visibility',
        message: 'Published to npm, or private to this repo (@internal/* is always private)',
        choices: VISIBILITIES,
      },
      {type: 'list', name: 'runtime', message: 'Where its code runs', choices: RUNTIMES},
    ],
    actions: packageActions,
  })
}
