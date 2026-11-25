export * as ConfigSkillPlugin from './skill.js'

import {define} from '@conciv/backend-plugin-api/effect/plugin'
import {FSUtil} from '@conciv/backend-app-api/util/fs-util'
import {Global} from '@conciv/backend-app-api/util/global'
import path from 'path'
import {Effect, FiberMap, PubSub, Semaphore, Stream} from 'effect'
import {Watcher} from '@conciv/backend-app-api/core/filesystem/watcher'
import {Location} from '@conciv/backend-app-api/core/location'
import {AbsolutePath} from '@conciv/protocol/schema/schema'
import {Skill} from '@conciv/backend-app-api/core/skill'
import {SkillFile} from './skill-file.js'
import {SkillScan} from './skill-scan.js'

type Source = Skill.DirectorySource

export const Plugin = define({
  id: 'conciv.config.skill',
  effect: Effect.fn(function* (ctx) {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const watcher = yield* Watcher.Service
    const loaded: {skills: Skill.Info[]} = {skills: []}
    const watches = yield* FiberMap.make<string>()
    const changes = yield* PubSub.sliding<string>(1)
    const lock = Semaphore.makeUnsafe(1)

    const watch = Effect.fn('ConfigSkillPlugin.watch')(function* (directory: string, type: 'file' | 'directory') {
      const target = path.resolve(directory)
      const updates = yield* watcher.subscribe(
        type === 'directory' ? {path: target, type, ignore: SkillScan.ignore} : {path: target, type},
      )
      yield* FiberMap.run(
        watches,
        `${type}:${target}`,
        updates.pipe(Stream.runForEach((update) => PubSub.publish(changes, update.path).pipe(Effect.asVoid))),
        {onlyIfMissing: true, startImmediately: true},
      )
    })

    function firstMissing(target: string): Effect.Effect<string | undefined> {
      const parent = path.dirname(target)
      if (parent === target) return Effect.undefined
      return fs.isDir(parent).pipe(Effect.flatMap((exists) => (exists ? Effect.succeed(target) : firstMissing(parent))))
    }

    const watchDirectory: (directory: string) => Effect.Effect<string[]> = Effect.fn(
      'ConfigSkillPlugin.watchDirectory',
    )(function* (directory: string) {
      const target = path.resolve(directory)
      const resolved = yield* fs.realPath(directory).pipe(Effect.orElseSucceed(() => undefined))
      if (resolved) {
        yield* watch(resolved, 'directory')
        if (resolved !== target) yield* watch(target, 'file')
        return resolved === target ? [target] : [target, resolved]
      }
      const missing = yield* firstMissing(target)
      if (missing) yield* watch(missing, 'file')
      if (
        yield* fs.realPath(directory).pipe(
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        )
      ) {
        if (missing) yield* FiberMap.remove(watches, `file:${path.resolve(missing)}`)
        return yield* watchDirectory(directory)
      }
      return [target]
    })

    const sources = () => {
      const result: Source[] = []
      const add = (source: Source) => {
        if (result.some((item) => Skill.Source.equals(item, source))) return
        result.push(source)
      }
      const directories = [global.config, path.join(location.directory, 'conciv')]
      for (const directory of directories) {
        add(Skill.DirectorySource.make({type: 'directory', path: AbsolutePath.make(path.join(directory, 'skill'))}))
        add(Skill.DirectorySource.make({type: 'directory', path: AbsolutePath.make(path.join(directory, 'skills'))}))
      }
      return result
    }

    const load = Effect.fn('ConfigSkillPlugin.load')(function* (source: Source) {
      const directories = [source.path]
      const roots = (yield* Effect.forEach(directories, watchDirectory)).flat()
      const skills: Skill.Info[] = []
      for (const directory of directories) {
        for (const filepath of yield* SkillScan.scan(directory)) {
          const resolved = yield* fs.realPath(filepath).pipe(Effect.orElseSucceed(() => filepath))
          if (!roots.some((root) => FSUtil.contains(root, resolved))) yield* watch(resolved, 'file')
          const content = yield* fs.readFileStringSafe(filepath).pipe(Effect.orElseSucceed(() => undefined))
          if (!content) continue
          const parsed = SkillFile.parse(directory, filepath, content)
          if (parsed._tag === 'Skipped') {
            yield* Effect.logDebug('skill file skipped', {
              filepath,
              reason: parsed.reason,
              ...(parsed.reason === 'frontmatter' ? {issue: parsed.issue} : {}),
            })
            continue
          }
          skills.push(parsed.skill)
        }
      }
      yield* Effect.logDebug('skill source loaded', {
        source: Skill.Source.key(source),
        type: source.type,
        directories,
        skills: skills.map((skill) => skill.id),
      })
      return skills
    })

    const refresh = Effect.fn('ConfigSkillPlugin.refresh')(
      function* (file?: string) {
        yield* FiberMap.clear(watches)
        const skills = new Map<Skill.Id, Skill.Info>()
        const current = sources()
        for (const source of current) {
          for (const skill of yield* load(source)) skills.set(skill.id, skill)
        }
        loaded.skills = Array.from(skills.values())
        if (file) {
          yield* Effect.logInfo('skills rescanned', {
            file,
            sources: current.map(Skill.Source.key),
            skills: loaded.skills.map((skill) => skill.id),
          })
        }
      },
      (effect, ..._args: [file?: string]) => lock.withPermit(effect),
    )

    const updates = yield* PubSub.subscribe(changes)
    yield* Stream.fromSubscription(updates).pipe(
      Stream.debounce('100 millis'),
      Stream.runForEach((file) => refresh(file).pipe(Effect.andThen(ctx.skill.reload()))),
      Effect.forkScoped({startImmediately: true}),
    )
    yield* refresh()
    yield* ctx.skill.transform((editor) => {
      for (const skill of loaded.skills) editor.add(skill)
    })
  }),
})
