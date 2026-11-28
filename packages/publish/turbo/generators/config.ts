import * as NodeServices from '@effect/platform-node/NodeServices'
import type {PlopTypes} from '@turbo/gen'
import {Effect, FileSystem, Path, Schema} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'
import {generatorErrors} from './errors.ts'

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ONE_LINE = /^[^\n]*\S[^\n]*$/
const VERSION_SOURCE = 'packages/it/package.json'
const GUARDS = 'packages/publish/src/guards.ts'
const FALLOW_CONFIG = '.fallowrc.json'
const REPOSITORY_URL = 'git+https://github.com/conciv-dev/conciv.git'
const TEST_FOLDERS = ['unit', 'it', 'e2e', 'fixtures', 'utils']

const Kind = Schema.Literals(['published', 'internal', 'plugin'])
const Runtime = Schema.Literals(['node', 'browser', 'both'])
const Install = Schema.Literals(['install', 'skip'])

const Answers = Schema.Struct({
  kind: Kind,
  name: Schema.String.check(Schema.isPattern(KEBAB)),
  description: Schema.String.check(Schema.isPattern(ONE_LINE)),
  runtime: Runtime,
  install: Install,
  turbo: Schema.Struct({paths: Schema.Struct({root: Schema.String})}),
})

const SharedVersion = Schema.fromJsonString(
  Schema.Struct({version: Schema.String, engines: Schema.Struct({node: Schema.String})}),
)

const WorkspacePackages = Schema.fromJsonString(
  Schema.Struct({
    packages: Schema.Struct({items: Schema.Array(Schema.Struct({name: Schema.String, path: Schema.String}))}),
  }),
)

type Spec = Omit<typeof Answers.Type, 'turbo'>

type GeneratorContext = {root: string; plopfileDirectory: string; render: (template: string, data: object) => string}

function validateName(input: string): true | string {
  return KEBAB.test(input) || 'use kebab-case: lower-case letters and digits, words joined by "-"'
}

function validateDescription(input: string): true | string {
  return ONE_LINE.test(input) || 'write one line that says what the package is for'
}

function packageName(spec: Spec): string {
  switch (spec.kind) {
    case 'internal':
      return `@internal/${spec.name}`
    case 'published':
      return `@conciv/${spec.name}`
    case 'plugin':
      return `@conciv/plugin-${spec.name}`
  }
}

function directory(spec: Spec): string {
  return spec.kind === 'plugin' ? `packages/plugins/${spec.name}` : `packages/${spec.name}`
}

function hasEngine(spec: Spec): boolean {
  return spec.runtime !== 'browser'
}

function hasBrowserPart(spec: Spec): boolean {
  return spec.runtime !== 'node'
}

function changesetPath(spec: Spec): string {
  return `.changeset/add-${spec.name}-package.md`
}

function nodeTypes(spec: Spec): Record<string, string> {
  switch (spec.runtime) {
    case 'browser':
      return {}
    case 'node':
    case 'both':
      return {'@types/node': 'catalog:'}
  }
}

function tsconfig(spec: Spec): object {
  if (spec.kind === 'plugin' && hasBrowserPart(spec)) {
    return {extends: '@internal/tsconfig/tsconfig.solid.json', compilerOptions: {types: ['node']}}
  }
  switch (spec.runtime) {
    case 'node':
      return {extends: '@internal/tsconfig/tsconfig.base.json', compilerOptions: {types: ['node']}}
    case 'browser':
      return {extends: '@internal/tsconfig/tsconfig.web.json'}
    case 'both':
      return {extends: '@internal/tsconfig/tsconfig.web.json', compilerOptions: {types: ['node']}}
  }
}

function devDependencies(spec: Spec, build: Record<string, string>): Record<string, string> {
  return {
    '@internal/tsconfig': 'workspace:*',
    '@internal/vitest-config': 'workspace:*',
    ...nodeTypes(spec),
    ...build,
    typescript: 'catalog:',
    vite: 'catalog:',
    vitest: 'catalog:',
  }
}

function sourceOnlyManifest(spec: Spec, version: string): object {
  const entry = `src/${spec.name}.ts`
  return {
    name: packageName(spec),
    version,
    private: true,
    description: spec.description,
    homepage: 'https://conciv.dev',
    license: 'MIT',
    repository: {type: 'git', url: REPOSITORY_URL, directory: directory(spec)},
    type: 'module',
    exports: {'.': `./${entry}`},
    scripts: {typecheck: 'tsc -p tsconfig.json --noEmit'},
    devDependencies: devDependencies(spec, {}),
  }
}

function publishedManifest(spec: Spec, version: string, node: string): object {
  return {
    name: packageName(spec),
    version,
    description: spec.description,
    keywords: ['conciv'],
    homepage: 'https://conciv.dev',
    bugs: 'https://github.com/conciv-dev/conciv/issues',
    license: 'MIT',
    repository: {type: 'git', url: REPOSITORY_URL, directory: directory(spec)},
    files: ['dist'],
    type: 'module',
    exports: {'.': {types: `./dist/${spec.name}.d.ts`, import: `./dist/${spec.name}.js`}},
    publishConfig: {access: 'public'},
    scripts: {
      build: 'tsdown',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      publint: 'publint',
      attw: 'attw --pack . --profile esm-only',
    },
    devDependencies: devDependencies(spec, {tsdown: 'catalog:'}),
    ...(spec.runtime === 'browser' ? {} : {engines: {node}}),
  }
}

function pluginExports(spec: Spec): object {
  const engine = {types: `./dist/${spec.name}.d.ts`, import: `./dist/${spec.name}.js`}
  return {
    ...(hasEngine(spec) ? {'.': engine, './server': engine} : {}),
    ...(hasBrowserPart(spec)
      ? {
          './plugin-experimental': {
            types: './dist/plugin-experimental.d.cts',
            default: './dist/plugin-experimental.cjs',
          },
        }
      : {}),
    './package.json': './package.json',
  }
}

function pluginBuild(spec: Spec): Record<string, string> {
  return hasBrowserPart(spec)
    ? {'build:css': 'node scripts/build-css.ts', build: 'pnpm run build:css && tsdown && vite build'}
    : {build: 'tsdown'}
}

function pluginPeers(spec: Spec): Record<string, string> {
  return {
    ...(hasEngine(spec) ? {'@conciv/backend-plugin-api': 'workspace:^'} : {}),
    ...(hasBrowserPart(spec) ? {'@conciv/frontend-plugin-api': 'workspace:^'} : {}),
  }
}

function pluginManifest(spec: Spec, version: string, node: string): object {
  const browser: Record<string, string> = hasBrowserPart(spec)
    ? {
        '@internal/uno-preset': 'workspace:*',
        'solid-js': 'catalog:',
        unocss: 'catalog:',
        'unplugin-solid': 'catalog:',
      }
    : {}
  return {
    name: packageName(spec),
    version,
    description: spec.description,
    keywords: ['conciv', 'conciv-plugin', 'plugin'],
    homepage: 'https://conciv.dev',
    bugs: 'https://github.com/conciv-dev/conciv/issues',
    license: 'MIT',
    repository: {type: 'git', url: REPOSITORY_URL, directory: directory(spec)},
    files: ['dist'],
    type: 'module',
    exports: pluginExports(spec),
    publishConfig: {access: 'public'},
    scripts: {
      ...pluginBuild(spec),
      typecheck: 'tsc -p tsconfig.json --noEmit',
      publint: 'publint',
      attw: 'attw --pack . --profile esm-only',
    },
    ...(hasEngine(spec) ? {dependencies: {effect: 'catalog:'}} : {}),
    devDependencies: devDependencies(spec, {...pluginPeers(spec), ...browser, tsdown: 'catalog:'}),
    peerDependencies: pluginPeers(spec),
    engines: {node},
  }
}

function manifest(spec: Spec, version: string, node: string): object {
  switch (spec.kind) {
    case 'internal':
      return sourceOnlyManifest(spec, version)
    case 'published':
      return publishedManifest(spec, version, node)
    case 'plugin':
      return pluginManifest(spec, version, node)
  }
}

function pluginFiles(spec: Spec): Array<[string, string]> {
  return [
    ...(hasEngine(spec) ? [[`src/${spec.name}.ts`, 'plugin-engine.ts'] as [string, string]] : []),
    ...(hasBrowserPart(spec)
      ? [
          ['src/plugin-experimental.tsx', 'plugin-browser.tsx'] as [string, string],
          ['scripts/build-css.ts', 'build-css.ts'] as [string, string],
          ['uno.config.ts', 'uno.config.ts'] as [string, string],
          ['vite.config.ts', 'plugin-vite.config.ts'] as [string, string],
        ]
      : [['vitest.config.ts', 'vitest.config.ts'] as [string, string]]),
    ['tsdown.config.ts', 'plugin-tsdown.config.ts'],
    ['README.md', 'README.md'],
  ]
}

function templatedFiles(spec: Spec): Array<[string, string]> {
  if (spec.kind === 'plugin') return pluginFiles(spec)
  const shared: Array<[string, string]> = [
    [`src/${spec.name}.ts`, 'entry.ts'],
    ['vitest.config.ts', 'vitest.config.ts'],
    ['README.md', 'README.md'],
  ]
  switch (spec.kind) {
    case 'internal':
      return shared
    case 'published':
      return [...shared, ['tsdown.config.ts', 'tsdown.config.ts']]
  }
}

function jsonFiles(spec: Spec, version: string, node: string): Array<[string, object]> {
  const shared: Array<[string, object]> = [
    ['package.json', manifest(spec, version, node)],
    ['tsconfig.json', tsconfig(spec)],
  ]
  switch (spec.kind) {
    case 'internal':
      return shared
    case 'published':
    case 'plugin':
      return [
        ...shared,
        ['tsconfig.build.json', {extends: ['./tsconfig.json', '@internal/tsconfig/tsconfig.build.json']}],
      ]
  }
}

function templateData(spec: Spec): object {
  return {
    ...spec,
    packageName: packageName(spec),
    directory: directory(spec),
    sourceOnly: spec.kind === 'internal',
    browserTests: spec.runtime !== 'node',
    plugin: spec.kind === 'plugin',
    engine: hasEngine(spec),
    browserPart: hasBrowserPart(spec),
    camelName: spec.name.replaceAll(/-([a-z0-9])/g, (_match, letter: string) => letter.toUpperCase()),
    platform: {node: 'node', browser: 'browser', both: 'neutral'}[spec.runtime],
    nodePlatform: spec.runtime === 'node',
  }
}

const readSpec = Effect.fn('readSpec')(function* (answers: PlopTypes.Answers) {
  const {turbo, ...spec} = yield* Schema.decodeUnknownEffect(Answers)(answers)
  return {root: turbo.paths.root, spec}
})

const writeFile = Effect.fn('writeFile')(function* (path: string, content: string) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* Path.Path
  yield* fs.makeDirectory(paths.dirname(path), {recursive: true})
  yield* fs.writeFileString(path, content)
})

const renderTemplate = Effect.fn('renderTemplate')(function* (context: GeneratorContext, template: string, spec: Spec) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* Path.Path
  const source = yield* fs.readFileString(paths.join(context.plopfileDirectory, 'templates', `${template}.hbs`))
  return context.render(source, templateData(spec))
})

const assertNewPackage = Effect.fn('assertNewPackage')(function* (context: GeneratorContext, spec: Spec) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const listing = yield* spawner.string(
    ChildProcess.make(paths.join(context.root, 'node_modules/.bin/turbo'), ['ls', '--output=json'], {
      cwd: context.root,
      extendEnv: true,
    }),
  )
  const {packages} = yield* Schema.decodeUnknownEffect(WorkspacePackages)(listing)
  const owner = packages.items.find((item) => item.name === packageName(spec))
  if (owner) {
    return yield* Effect.fail(
      generatorErrors.PACKAGE_EXISTS({reason: `${packageName(spec)} is already declared by ${owner.path}`}),
    )
  }
  if (yield* fs.exists(paths.join(context.root, directory(spec)))) {
    return yield* Effect.fail(generatorErrors.PACKAGE_EXISTS({reason: `${directory(spec)} already exists`}))
  }
})

const writePackage = Effect.fn('writePackage')(function* (context: GeneratorContext, spec: Spec) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* Path.Path
  const folder = paths.join(context.root, directory(spec))
  yield* assertNewPackage(context, spec)
  const {version, engines} = yield* Schema.decodeUnknownEffect(SharedVersion)(
    yield* fs.readFileString(paths.join(context.root, VERSION_SOURCE)),
  )
  for (const [file, template] of templatedFiles(spec)) {
    yield* writeFile(paths.join(folder, file), yield* renderTemplate(context, template, spec))
  }
  for (const [file, value] of jsonFiles(spec, version, engines.node)) {
    yield* writeFile(paths.join(folder, file), `${JSON.stringify(value, null, 2)}\n`)
  }
  for (const testFolder of TEST_FOLDERS) {
    yield* writeFile(paths.join(folder, 'test', testFolder, '.gitkeep'), '')
  }
  return `${directory(spec)}: written`
})

const appendToList = Effect.fn('appendToList')(function* (path: string, marker: string, item: string) {
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(path)
  const start = source.indexOf(marker)
  if (start === -1) return yield* Effect.fail(generatorErrors.LIST_NOT_FOUND({path, marker}))
  const end = source.lastIndexOf('\n', source.indexOf(']', start))
  yield* fs.writeFileString(path, `${source.slice(0, end)}${item}${source.slice(end)}`)
})

const registerPublished = Effect.fn('registerPublished')(function* (context: GeneratorContext, spec: Spec) {
  const paths = yield* Path.Path
  const name = packageName(spec)
  yield* writeFile(paths.join(context.root, changesetPath(spec)), yield* renderTemplate(context, 'changeset.md', spec))
  yield* appendToList(paths.join(context.root, GUARDS), 'export const PUBLIC_PACKAGES = [', `\n  '${name}',`)
  yield* appendToList(paths.join(context.root, FALLOW_CONFIG), '"publicPackages": [', `,\n    "${name}"`)
  return `${name}: changeset, PUBLIC_PACKAGES and ${FALLOW_CONFIG} publicPackages`
})

const registerShared = Effect.fn('registerShared')(function* (context: GeneratorContext, spec: Spec) {
  switch (spec.kind) {
    case 'published':
    case 'plugin':
      return yield* registerPublished(context, spec)
    case 'internal':
      return `${packageName(spec)}: internal, so no shared file changes`
  }
})

function writtenPaths(spec: Spec): string[] {
  switch (spec.kind) {
    case 'published':
    case 'plugin':
      return [directory(spec), GUARDS, FALLOW_CONFIG, changesetPath(spec)]
    case 'internal':
      return [directory(spec)]
  }
}

const run = Effect.fn('run')(function* (root: string, command: string, args: string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(command, args, {cwd: root, extendEnv: true, stdout: 'inherit', stderr: 'inherit'}),
  )
  if (exitCode !== 0)
    return yield* Effect.fail(generatorErrors.COMMAND_FAILED({command: [command, ...args].join(' '), exitCode}))
})

const installAndFormat = Effect.fn('installAndFormat')(function* (context: GeneratorContext, spec: Spec) {
  const paths = yield* Path.Path
  if (spec.install === 'install') yield* run(context.root, 'pnpm', ['install'])
  yield* run(context.root, paths.join(context.root, 'node_modules/.bin/oxfmt'), ['--write', ...writtenPaths(spec)])
  return `${packageName(spec)}: ${spec.install === 'install' ? 'pnpm install and oxfmt' : 'oxfmt'} done`
})

type Step<Failure> = (
  context: GeneratorContext,
  spec: Spec,
) => Effect.Effect<string, Failure, NodeServices.NodeServices>

function describeFailure(failure: unknown): Error {
  return failure instanceof Error ? failure : generatorErrors.GENERATOR_FAILED({failure: JSON.stringify(failure)})
}

function action<Failure>(step: Step<Failure>): PlopTypes.CustomActionFunction {
  return (answers, _config, plop) =>
    Effect.runPromise(
      readSpec(answers).pipe(
        Effect.flatMap(({root, spec}) =>
          step(
            {
              root,
              plopfileDirectory: plop.getPlopfilePath(),
              render: (template, data) => plop.renderString(template, data),
            },
            spec,
          ),
        ),
        Effect.provide(NodeServices.layer),
        Effect.mapError(describeFailure),
      ),
    )
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('package', {
    description: 'A new workspace package under packages/, set up the way every conciv package is',
    prompts: [
      {
        type: 'list',
        name: 'kind',
        message:
          'published (@conciv/*, built, on npm), internal (@internal/*, private, source only) or plugin (@conciv/plugin-*, packages/plugins)',
        choices: [...Kind.literals],
      },
      {
        type: 'input',
        name: 'name',
        message: 'Package name in kebab-case, without the scope',
        validate: validateName,
      },
      {type: 'input', name: 'description', message: 'One-line description', validate: validateDescription},
      {
        type: 'list',
        name: 'runtime',
        message: 'Where its code runs (a plugin: node = engine part, browser = browser part, both = both)',
        choices: [...Runtime.literals],
      },
      {
        type: 'list',
        name: 'install',
        message: 'Run pnpm install now, or skip it to make several packages and install once after',
        choices: [...Install.literals],
        default: 'install',
      },
    ],
    actions: [action(writePackage), action(registerShared), action(installAndFormat)],
  })
}
