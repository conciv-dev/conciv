import {describe, expect} from 'vitest'
import {NodeFileSystem} from '@effect/platform-node'
import {Deferred, Effect, Fiber, Layer, Stream} from 'effect'
import {FSUtil} from '../../src/util/fs-util.js'
import {Bus} from '../../src/core/bus.js'
import {AbsolutePath} from '../../src/schema/schema.js'
import {Skill} from '../../src/core/skill.js'
import {permissionLayer} from './fixture/permission'
import {testEffect} from './lib/effect'

const it = testEffect(
  Layer.mergeAll(Skill.layer, FSUtil.layer.pipe(Layer.provide(NodeFileSystem.layer))).pipe(
    Layer.provideMerge(permissionLayer),
  ),
)

const info = (id: string, description: string) =>
  Skill.Info.make({
    id: Skill.Id.make(id),
    name: Skill.Name.make(id),
    description,
    path: AbsolutePath.make(`/skills/${id}/SKILL.md`),
    content: `# ${id}`,
  })

describe('Skill', () => {
  it.effect('reads the current editor entry by ID', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* skill.transform((editor) => editor.add(info('review', 'Initial')))
      yield* skill.transform((editor) => {
        expect(editor.get('review')).toBe(editor.list()[0])
        expect(editor.get('missing')).toBeUndefined()
        editor.update('review', (value) => {
          value.description = 'Updated'
        })
        expect(editor.get('review')?.description).toBe('Updated')
        editor.remove('review')
        expect(editor.get('review')).toBeUndefined()
      })

      expect(yield* skill.list()).toEqual([])
    }),
  )

  it.effect('registers values with last-write-wins precedence', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* skill.transform((editor) => {
        editor.add(info('review', 'First'))
        editor.add(info('deploy', 'Deploy'))
        editor.add(info('review', 'Second'))
        expect(editor.list().map((item) => item.id)).toEqual([Skill.Id.make('review'), Skill.Id.make('deploy')])
      })

      expect(yield* skill.list()).toEqual([info('review', 'Second'), info('deploy', 'Deploy')])
      expect(yield* skill.get(Skill.Id.make('review'))).toEqual(info('review', 'Second'))
      expect(yield* skill.get(Skill.Id.make('missing'))).toBeUndefined()
    }),
  )

  it.effect('updates and removes registered values', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      yield* skill.transform((editor) => {
        editor.add(info('review', 'Initial'))
        editor.update('review', (value) => {
          value.description = 'Updated'
          value.id = Skill.Id.make('ignored')
        })
        editor.update('missing', () => {
          throw new Error('unreachable')
        })
        editor.add(info('deploy', 'Deploy'))
        editor.remove('deploy')
      })

      expect(yield* skill.list()).toEqual([info('review', 'Updated')])
    }),
  )

  it.effect('restores earlier values when an updating transform is disposed', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const original = info('review', 'Initial')
      yield* skill.transform((editor) => editor.add(original))
      const updated = yield* skill.transform((editor) =>
        editor.update('review', (value) => {
          value.description = 'Updated'
        }),
      )

      expect((yield* skill.list())[0]?.description).toBe('Updated')
      yield* updated.dispose
      expect((yield* skill.list())[0]?.description).toBe('Initial')
      expect(original.description).toBe('Initial')
    }),
  )

  it.live('publishes updates after committed values are visible', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const bus = yield* Bus.Service
      const updated = yield* Deferred.make<Skill.Info[]>()
      const fiber = yield* bus.subscribe(Skill.Event.Updated).pipe(
        Stream.runForEach(() => skill.list().pipe(Effect.flatMap((values) => Deferred.succeed(updated, values)))),
        Effect.forkScoped,
      )
      yield* Effect.yieldNow

      yield* skill.transform((editor) => editor.add(info('review', 'Visible')))
      expect(yield* Deferred.await(updated).pipe(Effect.timeout('1 second'))).toEqual([info('review', 'Visible')])
      yield* Fiber.interrupt(fiber)
    }),
  )

  it.effect(
    'stores virtual skill files, notifies when they change, and prepares skill:// output without disk scans',
    () =>
      Effect.gen(function* () {
        const skill = yield* Skill.Service
        const bus = yield* Bus.Service
        const virtual = Skill.Info.make({
          ...info('review', 'Review'),
          path: AbsolutePath.make(Skill.uri('review', 'SKILL.md')),
        })
        let extra: Record<string, string> = {'SKILL.md': 'ignored', 'references/b.md': 'B', 'references/a.md': 'A'}
        yield* skill.transform((editor) => {
          editor.add(virtual, extra)
          editor.update('review', (draft) => {
            draft.description = 'Updated'
          })
        })

        const files = yield* skill.files(Skill.Id.make('review'))
        expect(Array.from(files ?? [])).toEqual([
          ['references/a.md', 'A'],
          ['references/b.md', 'B'],
        ])
        const fs = yield* FSUtil.Service
        const prepared = yield* Skill.prepare(
          {...fs, scan: () => Effect.die(new Error('unexpected disk scan'))},
          virtual,
          files,
        )
        expect(prepared).toEqual({
          directory: 'skill://review',
          output: Skill.toModelOutput(virtual, ['skill://review/references/a.md', 'skill://review/references/b.md']),
        })

        let updates = 0
        yield* bus.listen((event) =>
          Effect.sync(() => {
            if (event.type === Skill.Event.Updated.type) updates++
          }),
        )
        extra = {'references/a.md': 'Changed'}
        yield* skill.reload()
        expect(updates).toBe(1)

        yield* skill.transform((editor) => editor.remove('review'))
        expect(yield* skill.files(Skill.Id.make('review'))).toBeUndefined()
      }),
  )
})
