import fs from 'fs/promises'
import path from 'path'
import {describe, expect, test} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Fiber, Layer, Stream} from 'effect'
import {ConfigSkillPlugin} from '../../../src/core/config/plugin/skill.js'
import {SkillFile} from '../../../src/core/config/plugin/skill-file.js'
import {SkillScan} from '../../../src/core/config/plugin/skill-scan.js'
import {Watcher} from '../../../src/core/filesystem/watcher.js'
import {Bus} from '../../../src/core/bus.js'
import {FSUtil} from '../../../src/util/fs-util.js'
import {Global} from '../../../src/util/global.js'
import {Location} from '../../../src/core/location.js'
import {AbsolutePath} from '@conciv/plugin/schema/schema'
import {Project} from '../../../src/schema/project.js'
import {Skill} from '../../../src/core/skill.js'
import {permissionLayer} from '../fixture/permission'
import {tmpdir} from '../fixture/tmpdir'
import {testEffect} from '../lib/effect'
import {host} from '../plugin/host'

const it = testEffect(
  Layer.mergeAll(Skill.layer, FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer)), Watcher.testLayer).pipe(
    Layer.provideMerge(permissionLayer),
  ),
)

function write(directory: string, name: string, description: string) {
  return fs.writeFile(
    path.join(directory, name, 'SKILL.md'),
    `---
name: ${name}
description: ${description}
---
# ${name}`,
  )
}

const location = (directory: string) =>
  Location.Service.of(
    Location.Info.make({
      directory: AbsolutePath.make(directory),
      project: {
        id: Project.Id.global,
        directory: AbsolutePath.make(directory),
        canonical: AbsolutePath.make(directory),
      },
    }),
  )

const start = Effect.fnUntraced(function* (directory: string, home: string) {
  const service = yield* Skill.Service
  yield* ConfigSkillPlugin.Plugin.effect(
    host({
      skill: {
        list: () => Effect.die('unused skill.list'),
        transform: service.transform,
        reload: service.reload,
      },
    }),
  ).pipe(
    Effect.provideService(Global.Service, Global.Service.of({cache: home, config: home, state: home, log: home})),
    Effect.provideService(Location.Service, location(directory)),
  )
  return service
})

const projectSkills = (directory: string) => path.join(directory, 'conciv', 'skills')

function emitAndWait(directory: string, update: Watcher.Update) {
  return Effect.gen(function* () {
    const watcher = yield* Watcher.Test
    const bus = yield* Bus.Service
    const deferred = yield* Deferred.make<void>()
    const fiber = yield* bus.subscribe(Skill.Event.Updated).pipe(
      Stream.runForEach(() => Deferred.succeed(deferred, undefined).pipe(Effect.asVoid)),
      Effect.provideService(Location.Service, location(directory)),
      Effect.forkScoped,
    )
    yield* Effect.yieldNow
    yield* watcher.emit(update)
    yield* Deferred.await(deferred).pipe(Effect.timeout('2 seconds'))
    yield* Fiber.interrupt(fiber)
  })
}

describe('SkillFile.parse', () => {
  test('reads disable-model-invocation as autoinvoke', () => {
    const parse = (frontmatter: string) =>
      SkillFile.parse('/repo/skills', '/repo/skills/deploy/SKILL.md', `---\n${frontmatter}\n---\n# deploy`)
    expect(parse('disable-model-invocation: true')).toMatchObject({skill: {autoinvoke: false}})
    expect(parse('disable-model-invocation: yes')).toMatchObject({skill: {autoinvoke: false}})
    expect(parse('disable-model-invocation: false')).not.toMatchObject({skill: {autoinvoke: expect.anything()}})
    expect(parse('disable-model-invocation: maybe')).not.toMatchObject({skill: {autoinvoke: expect.anything()}})
    expect(parse('disable-model-invocation: true\nmetadata:\n  conciv/autoinvoke: true')).toMatchObject({
      skill: {autoinvoke: true},
    })
  })

  test('parses root and nested skill ids and metadata flags', () => {
    const directory = '/repo/skills'
    expect(
      SkillFile.parse(
        directory,
        '/repo/skills/manual/SKILL.md',
        `---
name: Manual
description: Manual only
metadata:
  conciv/autoinvoke: false
---
# manual`,
      ),
    ).toEqual({
      _tag: 'Parsed',
      skill: {
        id: Skill.Id.make('manual'),
        name: Skill.Name.make('Manual'),
        description: 'Manual only',
        autoinvoke: false,
        path: AbsolutePath.make('/repo/skills/manual/SKILL.md'),
        content: '# manual',
      },
    })
    expect(SkillFile.parse(directory, '/repo/skills/foo.md', '# foo')).toMatchObject({
      _tag: 'Parsed',
      skill: {id: Skill.Id.make('foo')},
    })
    expect(SkillFile.parse('/repo/skills/manual', '/repo/skills/manual/SKILL.md', '# manual')).toMatchObject({
      _tag: 'Parsed',
      skill: {id: Skill.Id.make('manual'), name: Skill.Name.make('manual')},
    })
    expect(
      SkillFile.parse(directory, '/repo/skills/broken.md', '---\ndescription: foo: bar\nmetadata: [\n---\n# broken'),
    ).toEqual({_tag: 'Skipped', reason: 'markdown'})
  })
})

describe('ConfigSkillPlugin.Plugin', () => {
  it.live('maps the conciv home and the project conciv folder to skill directories', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const home = path.join(tmp.path, 'home')
          const directory = path.join(tmp.path, 'project')
          const expected = [
            path.join(home, 'skill'),
            path.join(home, 'skills'),
            path.join(directory, 'conciv', 'skill'),
            path.join(directory, 'conciv', 'skills'),
          ]
          yield* Effect.promise(() => Promise.all(expected.map((item) => fs.mkdir(item, {recursive: true}))))

          yield* start(directory, home)
          const watcher = yield* Watcher.Test
          expect(yield* watcher.subscriptions()).toEqual(
            expected.map((item) => ({path: item, type: 'directory', ignore: SkillScan.ignore.toSorted()})),
          )
        }),
      ),
    ),
  )

  it.live('loads directory skill roots with later-source precedence', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const home = path.join(tmp.path, 'home')
          const first = path.join(home, 'skills')
          const second = projectSkills(tmp.path)
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(first, 'review'), {recursive: true})
            await fs.mkdir(path.join(second, 'deploy'), {recursive: true})
            await fs.mkdir(path.join(second, 'review'), {recursive: true})
            await write(first, 'review', 'First')
            await write(second, 'deploy', 'Deploy')
            await write(second, 'review', 'Second')
          })

          const skill = yield* start(tmp.path, home)
          expect((yield* skill.list()).map((item) => item.id).toSorted()).toEqual([
            Skill.Id.make('deploy'),
            Skill.Id.make('review'),
          ])
          expect((yield* skill.list()).find((item) => item.id === 'deploy')?.description).toBe('Deploy')
          expect((yield* skill.list()).find((item) => item.id === 'review')?.description).toBe('Second')
        }),
      ),
    ),
  )

  it.live('rescans directory sources when watched files change', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const source = projectSkills(tmp.path)
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(source, 'deploy'), {recursive: true})
            await write(source, 'deploy', 'Initial')
          })
          const skill = yield* start(tmp.path, path.join(tmp.path, 'home'))
          expect((yield* skill.list()).find((item) => item.id === 'deploy')?.description).toBe('Initial')

          const deploy = path.join(source, 'deploy', 'SKILL.md')
          yield* Effect.promise(() => write(source, 'deploy', 'Updated'))
          yield* emitAndWait(tmp.path, {type: 'update', path: deploy})
          expect((yield* skill.list()).find((item) => item.id === 'deploy')?.description).toBe('Updated')

          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(source, 'review'), {recursive: true})
            await write(source, 'review', 'Review')
          })
          yield* emitAndWait(tmp.path, {type: 'create', path: path.join(source, 'review', 'SKILL.md')})
          expect((yield* skill.list()).map((item) => item.id)).toEqual([
            Skill.Id.make('deploy'),
            Skill.Id.make('review'),
          ])

          yield* Effect.promise(() => fs.rm(path.join(source, 'review'), {recursive: true}))
          yield* emitAndWait(tmp.path, {type: 'delete', path: path.join(source, 'review', 'SKILL.md')})
          expect((yield* skill.list()).map((item) => item.id)).toEqual([Skill.Id.make('deploy')])
        }),
      ),
    ),
  )

  it.live('watches canonical files behind symlinked skills', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const source = projectSkills(tmp.path)
          const target = path.join(tmp.path, 'target', 'bro')
          const file = path.join(target, 'SKILL.md')
          yield* Effect.promise(async () => {
            await fs.mkdir(source, {recursive: true})
            await fs.mkdir(target, {recursive: true})
            await fs.writeFile(file, '---\nname: bro\ndescription: Initial\n---\n# bro')
            await fs.symlink(target, path.join(source, 'bro'), process.platform === 'win32' ? 'junction' : undefined)
          })

          const skill = yield* start(tmp.path, path.join(tmp.path, 'home'))
          const watcher = yield* Watcher.Test
          expect((yield* skill.list()).find((item) => item.id === 'bro')?.description).toBe('Initial')
          expect(yield* watcher.subscriptions()).toContainEqual({path: file, type: 'file'})

          yield* Effect.promise(() => fs.writeFile(file, '---\nname: bro\ndescription: Updated\n---\n# bro'))
          yield* emitAndWait(tmp.path, {type: 'update', path: file})
          expect((yield* skill.list()).find((item) => item.id === 'bro')?.description).toBe('Updated')
        }),
      ),
    ),
  )

  it.live('reloads symlinked sources when their target changes', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const home = path.join(tmp.path, 'home')
          const source = path.join(home, 'skills')
          const first = path.join(tmp.path, 'first')
          const second = path.join(tmp.path, 'second')
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(home, 'skill'), {recursive: true})
            await fs.mkdir(path.join(first, 'bro'), {recursive: true})
            await fs.mkdir(path.join(second, 'bro'), {recursive: true})
            await fs.mkdir(path.join(tmp.path, 'conciv', 'skill'), {recursive: true})
            await fs.mkdir(projectSkills(tmp.path), {recursive: true})
            await write(first, 'bro', 'First')
            await write(second, 'bro', 'Second')
            await fs.symlink(first, source, process.platform === 'win32' ? 'junction' : undefined)
          })
          const directories = [path.join(tmp.path, 'conciv', 'skill'), projectSkills(tmp.path)].map((item) => ({
            path: item,
            type: 'directory',
            ignore: SkillScan.ignore.toSorted(),
          }))
          const homeSkill = {path: path.join(home, 'skill'), type: 'directory', ignore: SkillScan.ignore.toSorted()}

          const skill = yield* start(tmp.path, home)
          const watcher = yield* Watcher.Test
          expect((yield* skill.list()).find((item) => item.id === 'bro')?.description).toBe('First')
          expect(yield* watcher.subscriptions()).toEqual([
            homeSkill,
            {path: first, type: 'directory', ignore: SkillScan.ignore.toSorted()},
            {path: source, type: 'file'},
            ...directories,
          ])

          yield* Effect.promise(async () => {
            await fs.unlink(source)
            await fs.symlink(second, source, process.platform === 'win32' ? 'junction' : undefined)
          })
          yield* emitAndWait(tmp.path, {type: 'update', path: source})

          expect((yield* skill.list()).find((item) => item.id === 'bro')?.description).toBe('Second')
          expect(yield* watcher.subscriptions()).toEqual([
            homeSkill,
            {path: first, type: 'directory', ignore: SkillScan.ignore.toSorted()},
            {path: source, type: 'file'},
            ...directories,
            homeSkill,
            {path: second, type: 'directory', ignore: SkillScan.ignore.toSorted()},
            {path: source, type: 'file'},
            ...directories,
          ])
        }),
      ),
    ),
  )

  it.live('follows missing source directories as their parents appear', () =>
    Effect.acquireDisposable(Effect.promise(() => tmpdir())).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const home = path.join(tmp.path, 'home')
          const source = projectSkills(tmp.path)
          yield* Effect.promise(() => fs.mkdir(home))
          const skill = yield* start(tmp.path, home)
          const watcher = yield* Watcher.Test
          expect(yield* skill.list()).toEqual([])
          expect(yield* watcher.subscriptions()).toEqual([
            {path: path.join(home, 'skill'), type: 'file'},
            {path: path.join(home, 'skills'), type: 'file'},
            {path: path.join(tmp.path, 'conciv'), type: 'file'},
          ])

          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, 'conciv')))
          yield* watcher.emit({type: 'create', path: path.join(tmp.path, 'conciv')})
          while ((yield* watcher.subscriptions()).at(-1)?.path !== source) yield* Effect.sleep('10 millis')
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(source, 'deploy'), {recursive: true})
            await write(source, 'deploy', 'Deploy')
          })
          yield* emitAndWait(tmp.path, {type: 'create', path: source})
          expect((yield* skill.list()).map((item) => item.id)).toEqual([Skill.Id.make('deploy')])
        }),
      ),
    ),
  )
})
