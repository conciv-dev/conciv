import {describe, expect, expectTypeOf, test} from 'vitest'
import {Cause, Deferred, Effect, Fiber, Predicate, Schema} from 'effect'
import type {SessionRecord} from '@conciv/protocol/chat-types'
import {Agent} from '../../src/core/agent.js'
import {Database} from '../../src/core/database/database.js'
import {Bus} from '../../src/core/bus.js'
import {Permission} from '../../src/core/permission.js'
import {PermissionTable} from '../../src/core/permission/sql.js'
import {PermissionSaved} from '../../src/core/permission/saved.js'
import {ProjectId} from '../../src/schema/project-id.js'
import {Session} from '../../src/schema/session.js'
import {eq} from 'drizzle-orm'
import {permissionLayer, removeSession, sessionId, setRules, setSession, setup} from './fixture/permission'
import {testEffect} from './lib/effect'

const it = testEffect(permissionLayer)

function assertion(input: Partial<Permission.AssertInput> = {}) {
  return {
    id: Permission.Id.create('per_test'),
    sessionId,
    action: 'read',
    resources: ['src/index.ts'],
    ...input,
  } satisfies Permission.AssertInput
}

function waitForRequest(input: Partial<Permission.AssertInput> = {}) {
  return Effect.gen(function* () {
    const value = assertion(input)
    const service = yield* Permission.Service
    const bus = yield* Bus.Service
    const asked = yield* Deferred.make<Permission.Request>()
    const unsubscribe = yield* bus.listen((event) => {
      if (event.type !== Permission.Event.Asked.type) return Effect.void
      const request = event.data as Permission.Request
      return request.id === value.id ? Deferred.succeed(asked, request).pipe(Effect.asVoid) : Effect.void
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    const fiber = yield* service.assert(value).pipe(Effect.forkScoped)
    const request = yield* Deferred.await(asked)
    return {service, fiber, request}
  })
}

describe('Permission', () => {
  it.effect('returns the evaluated effect and only queues prompts', () =>
    Effect.gen(function* () {
      yield* setup([{action: 'read', resource: '*', effect: 'allow'}])
      const service = yield* Permission.Service
      expect(yield* service.ask(assertion())).toEqual({id: Permission.Id.create('per_test'), effect: 'allow'})
      expect(yield* service.list()).toEqual([])
      yield* setRules([{action: 'read', resource: '*', effect: 'deny'}])
      expect(yield* service.ask(assertion())).toEqual({id: Permission.Id.create('per_test'), effect: 'deny'})
      expect(yield* service.list()).toEqual([])
      yield* setRules([])
      expect(yield* service.ask(assertion())).toEqual({id: Permission.Id.create('per_test'), effect: 'ask'})
      expect(yield* service.get(Permission.Id.create('per_test'))).toBeDefined()
    }),
  )

  it.effect('evaluates against an explicit agent', () =>
    Effect.gen(function* () {
      yield* setup([{action: 'read', resource: '*', effect: 'allow'}])
      const agents = yield* Agent.Service
      yield* agents.transform((editor) =>
        editor.update(Agent.Id.make('reviewer'), (agent) => {
          agent.permissions.push({action: 'read', resource: '*', effect: 'deny'})
        }),
      )
      const service = yield* Permission.Service

      expect(yield* service.ask(assertion())).toMatchObject({effect: 'allow'})
      expect(yield* service.ask(assertion({agent: Agent.Id.make('reviewer')}))).toMatchObject({effect: 'deny'})
      yield* agents.transform((editor) =>
        editor.update(Agent.Id.make('reviewer'), (agent) => {
          agent.permissions = []
        }),
      )
      expect(yield* service.ask(assertion({agent: Agent.Id.make('reviewer')}))).toMatchObject({effect: 'ask'})
      expect(yield* service.get(Permission.Id.create('per_test'))).not.toHaveProperty('agent')
    }),
  )

  it.effect('allows and denies from explicit rules without asking', () =>
    Effect.gen(function* () {
      yield* setup([{action: 'read', resource: '*', effect: 'allow'}])
      const service = yield* Permission.Service
      yield* service.assert(assertion())
      yield* setRules([{action: 'read', resource: '*', effect: 'deny'}])
      const blocked = yield* service.assert(assertion()).pipe(Effect.flip)
      expect(blocked).toMatchObject({_tag: 'Permission.BlockedError'})
      expect(yield* service.list()).toEqual([])
    }),
  )

  it.effect('checks for a deny without asking', () =>
    Effect.gen(function* () {
      yield* setup([])
      const service = yield* Permission.Service
      yield* service.assertNotDenied(assertion())
      expect(yield* service.list()).toEqual([])
      yield* setRules([{action: 'read', resource: '*', effect: 'deny'}])
      expect(yield* service.assertNotDenied(assertion()).pipe(Effect.flip)).toMatchObject({
        _tag: 'Permission.BlockedError',
      })
    }),
  )

  it.effect('reports whether a request is already allowed without asking', () =>
    Effect.gen(function* () {
      yield* setup([])
      const service = yield* Permission.Service
      expect(yield* service.allows(assertion())).toBe(false)
      expect(yield* service.list()).toEqual([])
      yield* setRules([{action: 'read', resource: '*', effect: 'allow'}])
      expect(yield* service.allows(assertion())).toBe(true)
      yield* setRules([{action: 'read', resource: '*', effect: 'deny'}])
      expect(yield* service.allows(assertion())).toBe(false)
    }),
  )

  test('matches Windows rule resources against slash-normalized file access resources', () => {
    const rules: Permission.Ruleset = [
      {action: 'external_directory', resource: 'C:\\Users\\x\\proj\\*', effect: 'allow'},
    ]
    expect(Permission.evaluate('external_directory', 'C:/Users/x/proj/src/*', rules).effect).toBe('allow')
    expect(Permission.evaluate('external_directory', 'C:/Users/x/other/*', rules).effect).toBe('ask')
  })

  it.effect('allows managed output reads without granting external directory access', () =>
    Effect.gen(function* () {
      yield* setup([
        {action: '*', resource: '*', effect: 'deny'},
        {action: 'read', resource: '*', effect: 'allow'},
      ])
      const service = yield* Permission.Service

      expect(yield* service.ask(assertion({resources: ['tool_123']}))).toMatchObject({effect: 'allow'})
      expect(
        yield* service.ask(assertion({action: 'external_directory', resources: ['/tmp/tool-output/*']})),
      ).toMatchObject({effect: 'deny'})
    }),
  )

  it.effect('uses build permissions when the Session agent is omitted', () =>
    Effect.gen(function* () {
      yield* setup()
      yield* setSession({agent: undefined})
      const agents = yield* Agent.Service
      yield* agents.transform((editor) =>
        editor.update(Agent.Id.make('build'), (agent) => {
          agent.permissions = [{action: 'custom', resource: '*', effect: 'allow'}]
        }),
      )

      const service = yield* Permission.Service
      expect(yield* service.ask(assertion({action: 'custom', resources: ['*']}))).toEqual({
        id: Permission.Id.create('per_test'),
        effect: 'allow',
      })
      expect(yield* service.list()).toEqual([])
    }),
  )

  it.effect('denies omitted-agent permissions when no primary default agent exists', () =>
    Effect.gen(function* () {
      yield* setup()
      yield* setSession({agent: undefined})
      const agents = yield* Agent.Service
      yield* agents.transform((editor) => {
        editor.remove(Agent.Id.make('test'))
        editor.remove(Agent.Id.make('build'))
      })

      const service = yield* Permission.Service
      expect(yield* service.ask(assertion())).toEqual({id: Permission.Id.create('per_test'), effect: 'deny'})
      expect(yield* service.list()).toEqual([])
    }),
  )

  it.effect('evaluates bash with the normal configured-rule semantics', () =>
    Effect.gen(function* () {
      yield* setup([{action: '*', resource: '*', effect: 'allow'}])
      const service = yield* Permission.Service
      const bash = assertion({action: 'bash', resources: ['pwd']})
      expect(yield* service.ask(bash)).toEqual({id: Permission.Id.create('per_test'), effect: 'allow'})

      yield* setRules([])
      expect(yield* service.ask(bash)).toEqual({id: Permission.Id.create('per_test'), effect: 'ask'})
      expect(yield* service.get(Permission.Id.create('per_test'))).toBeDefined()
    }),
  )

  it.effect('merges session rules after agent rules and before saved approvals', () =>
    Effect.gen(function* () {
      yield* setup([{action: '*', resource: '*', effect: 'allow'}])
      const service = yield* Permission.Service

      yield* setSession({permissions: [{action: 'edit', resource: '/original/**', effect: 'deny'}]})
      expect(yield* service.ask(assertion({action: 'edit', resources: ['/original/src/index.ts']}))).toMatchObject({
        effect: 'deny',
      })

      yield* setRules([])
      const saved = yield* PermissionSaved.Service
      yield* saved.add({projectId: ProjectId.global, action: 'bash', resources: ['pwd']})
      yield* setSession({permissions: [{action: 'bash', resource: '*', effect: 'deny'}]})
      expect(yield* service.ask(assertion({action: 'bash', resources: ['pwd']}))).toMatchObject({effect: 'deny'})
      yield* setSession({permissions: [{action: 'bash', resource: '*', effect: 'ask'}]})
      expect(yield* service.ask(assertion({action: 'bash', resources: ['pwd']}))).toMatchObject({effect: 'allow'})
    }),
  )

  it.effect('uses saved bash approvals while preserving configured deny precedence', () =>
    Effect.gen(function* () {
      yield* setup()
      const saved = yield* PermissionSaved.Service
      yield* saved.add({projectId: ProjectId.global, action: 'bash', resources: ['pwd']})

      const service = yield* Permission.Service
      expect(yield* service.ask(assertion({action: 'bash', resources: ['pwd']}))).toEqual({
        id: Permission.Id.create('per_test'),
        effect: 'allow',
      })
      expect(yield* service.list()).toEqual([])

      yield* setRules([{action: 'bash', resource: '*', effect: 'deny'}])
      expect(yield* service.ask(assertion({action: 'bash', resources: ['pwd']}))).toEqual({
        id: Permission.Id.create('per_test'),
        effect: 'deny',
      })
    }),
  )

  it.effect('resolves an asked permission once', () =>
    Effect.gen(function* () {
      yield* setup()
      const {service, fiber, request} = yield* waitForRequest()
      expect(yield* service.list()).toEqual([request])
      expect(yield* service.forSession(request.sessionId)).toEqual([request])
      expect(yield* service.forSession(Session.Id.make('conciv_other'))).toEqual([])
      expect(yield* service.get(request.id)).toEqual(request)
      yield* service.reply({requestId: request.id, reply: 'once'})
      yield* Fiber.join(fiber)
      expect(yield* service.list()).toEqual([])
      expect(yield* service.get(request.id)).toBeUndefined()
    }),
  )

  it.effect('drops undefined metadata values so pending requests encode as JSON', () =>
    Effect.gen(function* () {
      yield* setup()
      const {service, request} = yield* waitForRequest({
        action: 'glob',
        resources: ['/project'],
        metadata: {root: '/project', path: undefined, hidden: undefined, limit: undefined},
      })
      expect(request.metadata).toStrictEqual({root: '/project'})
      expect(yield* service.forSession(request.sessionId)).toEqual([request])
      const encode = Schema.encodeEffect(Schema.toCodecJson(Schema.Struct({data: Schema.Array(Permission.Request)})))
      expect(yield* encode({data: yield* service.forSession(request.sessionId)})).toEqual({
        data: [
          {
            id: request.id,
            sessionId: request.sessionId,
            action: 'glob',
            resources: ['/project'],
            metadata: {root: '/project'},
          },
        ],
      })
    }),
  )

  it.effect('defects when an asked permission is declined', () =>
    Effect.gen(function* () {
      yield* setup()
      const {service, fiber, request} = yield* waitForRequest()
      yield* service.reply({requestId: request.id, reply: 'reject'})
      const exit = yield* Fiber.await(fiber)

      expect(exit._tag).toBe('Failure')
      if (exit._tag === 'Failure')
        expect(
          exit.cause.reasons.some(
            (reason) => Cause.isDieReason(reason) && Predicate.isTagged(reason.defect, 'Permission.DeclinedError'),
          ),
        ).toBe(true)
      expect(yield* service.list()).toEqual([])
    }),
  )

  it.effect('stores and removes saved resources for a project', () =>
    Effect.gen(function* () {
      yield* setup()
      const service = yield* Permission.Service
      const asked = yield* Deferred.make<Permission.Request>()
      const bus = yield* Bus.Service
      const unsubscribe = yield* bus.listen((event) =>
        event.type === Permission.Event.Asked.type
          ? Deferred.succeed(asked, event.data as Permission.Request).pipe(Effect.asVoid)
          : Effect.void,
      )
      yield* Effect.addFinalizer(() => unsubscribe)
      const fiber = yield* service.assert(assertion({save: ['src/*']})).pipe(Effect.forkScoped)
      const request = yield* Deferred.await(asked)
      yield* service.reply({requestId: request.id, reply: 'always'})
      yield* Fiber.join(fiber)

      const {db} = yield* Database.Service
      expect(
        yield* db.select().from(PermissionTable).where(eq(PermissionTable.project_id, ProjectId.global)).all(),
      ).toMatchObject([{action: 'read', resource: 'src/*'}])
      const saved = yield* PermissionSaved.Service
      const id = (yield* saved.list())[0]!.id
      expect(yield* saved.list()).toMatchObject([{id, projectId: ProjectId.global, action: 'read', resource: 'src/*'}])
      yield* service.assert(assertion({id: Permission.Id.create('per_next'), resources: ['src/next.ts']}))
      yield* saved.remove(id)
      expect(yield* saved.list()).toEqual([])
    }),
  )

  it.effect('edits saved approvals and enforces the edited rule', () =>
    Effect.gen(function* () {
      yield* setup()
      const saved = yield* PermissionSaved.Service
      const service = yield* Permission.Service
      yield* saved.add({projectId: ProjectId.global, action: 'read', resources: ['src/*', 'docs/*']})
      const src = (yield* saved.list()).find((item) => item.resource === 'src/*')

      expect(yield* saved.update({id: src!.id, resource: 'src/allowed.ts'})).toMatchObject({
        id: src!.id,
        projectId: ProjectId.global,
        action: 'read',
        resource: 'src/allowed.ts',
      })
      expect(
        yield* service.ask(assertion({id: Permission.Id.create('per_allowed'), resources: ['src/allowed.ts']})),
      ).toMatchObject({effect: 'allow'})
      expect(
        yield* service.ask(assertion({id: Permission.Id.create('per_other'), resources: ['src/other.ts']})),
      ).toMatchObject({effect: 'ask'})

      expect(yield* saved.update({id: src!.id, resource: 'docs/*'}).pipe(Effect.flip)).toMatchObject({
        _tag: 'PermissionSaved.ConflictError',
        id: src!.id,
        resource: 'docs/*',
      })
      expect(
        yield* saved.update({id: PermissionSaved.Id.make('psv_missing'), action: 'edit'}).pipe(Effect.flip),
      ).toMatchObject({_tag: 'PermissionSaved.NotFoundError'})
    }),
  )

  for (const guard of ['configured deny', 'missing Session'] as const) {
    it.effect(`skips pending auto-approval after always for ${guard}`, () =>
      Effect.gen(function* () {
        yield* setup()
        yield* setup([], Session.Id.make('conciv_other'))
        const agents = yield* Agent.Service
        yield* agents.transform((editor) =>
          editor.update(Agent.Id.make('reviewer'), (agent) => {
            agent.permissions = []
          }),
        )
        const selected = yield* waitForRequest({save: ['src/*']})
        const other = yield* waitForRequest({
          id: Permission.Id.create('per_other'),
          sessionId: Session.Id.make('conciv_other'),
          agent: Agent.Id.make('reviewer'),
        })
        if (guard === 'configured deny') {
          yield* agents.transform((editor) =>
            editor.update(Agent.Id.make('reviewer'), (agent) => {
              agent.permissions = [{action: 'read', resource: '*', effect: 'deny'}]
            }),
          )
        }
        if (guard === 'missing Session') {
          yield* removeSession(other.request.sessionId)
        }
        yield* selected.service.reply({requestId: selected.request.id, reply: 'always'})
        yield* Fiber.join(selected.fiber)
        expect(yield* selected.service.list()).toEqual([other.request])
        expect(other.fiber.pollUnsafe()).toBeUndefined()
        yield* Fiber.interrupt(other.fiber)
        expect(yield* selected.service.list()).toEqual([])
      }),
    )
  }
})

describe('session permissions on the conciv session row', () => {
  test('the row schema output and Permission.Rule are assignable both ways', () => {
    type SessionRule = NonNullable<SessionRecord['permissions']>[number]
    expectTypeOf<SessionRule>().toExtend<Permission.Rule>()
    expectTypeOf<Permission.Rule>().toExtend<SessionRule>()
  })
})
