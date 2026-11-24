import * as NodeServices from '@effect/platform-node/NodeServices'
import type {PlopTypes} from '@turbo/gen'
import {Effect, FileSystem, Path, Schema} from 'effect'
import {ChildProcess, ChildProcessSpawner} from 'effect/process'

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ONE_LINE = /^[^\n]*\S[^\n]*$/
const TEST_KINDS = ['unit', 'it', 'e2e', 'fixtures']
const VERSION_SOURCE = 'packages/it/package.json'
const GUARDS = 'packages/publish/src/guards.ts'
const FALLOW_CONFIG = '.fallowrc.json'
const REPOSITORY_URL = 'git+https://github.com/conciv-dev/conciv.git'

const Kind = Schema.Literals(['published', 'private', 'internal'])
const Runtime = Schema.Literals(['node', 'browser', 'both'])

const Answers = Schema.Struct({
  kind: Kind,
  name: Schema.String.check(Schema.isPattern(KEBAB)),
  description: Schema.String.check(Schema.isPattern(ONE_LINE)),
  runtime: Runtime,
  turbo: Schema.Struct({paths: Schema.Struct({root: Schema.String})}),
})

const SharedVersion = Schema.fromJsonString(Schema.Struct({version: Schema.String}))

const CommandFailed = Schema.TaggedStruct('CommandFailed', {command: Schema.String, exitCode: Schema.Number})

const ListNotFound = Schema.TaggedStruct('ListNotFound', {path: Schema.String, marker: Schema.String})

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
    case 'private':
      return `@conciv/${spec.name}`
  }
}

function directory(spec: Spec): string {
  switch (spec.kind) {
    case 'internal':
      return `packages/${spec.name}-internal`
    case 'published':
    case 'private':
      return `packages/${spec.name}`
  }
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
  switch (spec.runtime) {
    case 'node':
      return {extends: '@conciv/tsconfig/tsconfig.base.json', compilerOptions: {types: ['node']}}
    case 'browser':
      return {extends: '@conciv/tsconfig/tsconfig.web.json'}
    case 'both':
      return {extends: '@conciv/tsconfig/tsconfig.web.json', compilerOptions: {types: ['node']}}
  }
}

function devDependencies(spec: Spec, build: Record<string, string>): Record<string, string> {
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
    main: entry,
    types: entry,
    exports: {'.': `./${entry}`},
    scripts: {typecheck: 'tsc -p tsconfig.json --noEmit', lint: 'oxlint'},
    devDependencies: devDependencies(spec, {}),
  }
}

type BuiltFields = {visibility: object; publish: object; publishScripts: object}

function builtFields(kind: 'published' | 'private'): BuiltFields {
  switch (kind) {
    case 'published':
      return {
        visibility: {},
        publish: {publishConfig: {access: 'public'}},
        publishScripts: {publint: 'publint', attw: 'attw --pack . --profile esm-only'},
      }
    case 'private':
      return {visibility: {private: true}, publish: {}, publishScripts: {}}
  }
}

function builtManifest(spec: Spec, version: string, fields: BuiltFields): object {
  return {
    name: packageName(spec),
    version,
    ...fields.visibility,
    description: spec.description,
    keywords: ['conciv'],
    homepage: 'https://conciv.dev',
    bugs: 'https://github.com/conciv-dev/conciv/issues',
    license: 'MIT',
    repository: {type: 'git', url: REPOSITORY_URL, directory: directory(spec)},
    files: ['dist'],
    type: 'module',
    exports: {'.': {types: `./dist/${spec.name}.d.ts`, import: `./dist/${spec.name}.js`}},
    ...fields.publish,
    scripts: {
      build: 'tsdown && tsc -p tsconfig.build.json',
      typecheck: 'tsc -p tsconfig.json --noEmit',
      lint: 'oxlint',
      ...fields.publishScripts,
    },
    devDependencies: devDependencies(spec, {tsdown: 'catalog:'}),
  }
}

function manifest(spec: Spec, version: string): object {
  switch (spec.kind) {
    case 'internal':
      return sourceOnlyManifest(spec, version)
    case 'published':
    case 'private':
      return builtManifest(spec, version, builtFields(spec.kind))
  }
}

function templatedFiles(spec: Spec): Array<[string, string]> {
  const shared: Array<[string, string]> = [
    [`src/${spec.name}.ts`, 'entry.ts'],
    ['vite.config.ts', 'vite.config.ts'],
    ['README.md', 'README.md'],
  ]
  switch (spec.kind) {
    case 'internal':
      return shared
    case 'published':
    case 'private':
      return [...shared, ['tsdown.config.ts', 'tsdown.config.ts']]
  }
}

function jsonFiles(spec: Spec, version: string): Array<[string, object]> {
  const shared: Array<[string, object]> = [
    ['package.json', manifest(spec, version)],
    ['tsconfig.json', tsconfig(spec)],
  ]
  switch (spec.kind) {
    case 'internal':
      return shared
    case 'published':
    case 'private':
      return [
        ...shared,
        ['tsconfig.build.json', {extends: ['./tsconfig.json', '@conciv/tsconfig/tsconfig.build.json']}],
      ]
  }
}

function templateData(spec: Spec): object {
  return {...spec, packageName: packageName(spec), directory: directory(spec), sourceOnly: spec.kind === 'internal'}
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

const writePackage = Effect.fn('writePackage')(function* (context: GeneratorContext, spec: Spec) {
  const fs = yield* FileSystem.FileSystem
  const paths = yield* Path.Path
  const folder = paths.join(context.root, directory(spec))
  const {version} = yield* Schema.decodeUnknownEffect(SharedVersion)(
    yield* fs.readFileString(paths.join(context.root, VERSION_SOURCE)),
  )
  for (const [file, template] of templatedFiles(spec)) {
    yield* writeFile(paths.join(folder, file), yield* renderTemplate(context, template, spec))
  }
  for (const [file, value] of jsonFiles(spec, version)) {
    yield* writeFile(paths.join(folder, file), `${JSON.stringify(value, null, 2)}\n`)
  }
  for (const kind of TEST_KINDS) {
    yield* writeFile(paths.join(folder, 'test', kind, '.gitkeep'), '')
  }
  return `${directory(spec)}: written`
})

const appendToList = Effect.fn('appendToList')(function* (path: string, marker: string, item: string) {
  const fs = yield* FileSystem.FileSystem
  const source = yield* fs.readFileString(path)
  const start = source.indexOf(marker)
  if (start === -1) return yield* Effect.fail(ListNotFound.make({path, marker}))
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
      return yield* registerPublished(context, spec)
    case 'private':
    case 'internal':
      return `${packageName(spec)}: ${spec.kind}, so no shared file changes`
  }
})

function writtenPaths(spec: Spec): string[] {
  switch (spec.kind) {
    case 'published':
      return [directory(spec), GUARDS, FALLOW_CONFIG, changesetPath(spec)]
    case 'private':
    case 'internal':
      return [directory(spec)]
  }
}

const run = Effect.fn('run')(function* (root: string, command: string, args: string[]) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const exitCode = yield* spawner.exitCode(
    ChildProcess.make(command, args, {cwd: root, extendEnv: true, stdout: 'inherit', stderr: 'inherit'}),
  )
  if (exitCode !== 0) return yield* Effect.fail(CommandFailed.make({command: [command, ...args].join(' '), exitCode}))
})

const installAndFormat = Effect.fn('installAndFormat')(function* (context: GeneratorContext, spec: Spec) {
  yield* run(context.root, 'pnpm', ['install'])
  yield* run(context.root, 'pnpm', ['exec', 'oxfmt', '--write', ...writtenPaths(spec)])
  return `${packageName(spec)}: pnpm install and oxfmt done`
})

type Step<Failure> = (
  context: GeneratorContext,
  spec: Spec,
) => Effect.Effect<string, Failure, NodeServices.NodeServices>

function describeFailure(failure: unknown): Error {
  return failure instanceof Error ? failure : new Error(JSON.stringify(failure))
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
          'published (@conciv/*, on npm), private (@conciv/*, built, not on npm) or internal (@internal/*, source only)',
        choices: [...Kind.literals],
      },
      {
        type: 'input',
        name: 'name',
        message: 'Package name in kebab-case, without the scope',
        validate: validateName,
      },
      {type: 'input', name: 'description', message: 'One-line description', validate: validateDescription},
      {type: 'list', name: 'runtime', message: 'Where its code runs', choices: [...Runtime.literals]},
    ],
    actions: [action(writePackage), action(registerShared), action(installAndFormat)],
  })
}
