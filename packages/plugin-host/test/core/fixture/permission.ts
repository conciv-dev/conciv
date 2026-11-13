import {Context, Effect, Layer} from 'effect'
import {openDb} from '@conciv/db'
import {Agent} from '../../../src/core/agent.js'
import {Bus} from '../../../src/core/bus.js'
import {Database} from '../../../src/core/database/database.js'
import {Location} from '../../../src/core/location.js'
import {Permission} from '../../../src/core/permission.js'
import {PermissionSaved} from '../../../src/core/permission/saved.js'
import {PluginHooks} from '../../../src/core/plugin/hooks.js'
import {ProjectId} from '../../../src/schema/project-id.js'
import {AbsolutePath} from '../../../src/schema/schema.js'
import {Session} from '../../../src/schema/session.js'
import {tmpdirScoped} from './tmpdir'

const SessionMap = Context.Service<Map<Session.Id, Permission.SessionRules>>('@conciv/test/PermissionSessionMap')

const sessionMapLayer = Layer.sync(SessionMap, () => new Map<Session.Id, Permission.SessionRules>())

const sessionsLayer = Layer.effect(
  Permission.PermissionSessions,
  Effect.gen(function* () {
    const sessions = yield* SessionMap
    return Permission.PermissionSessions.of({get: (id) => Effect.sync(() => sessions.get(id))})
  }),
)

const databaseLayer = Layer.unwrap(
  Effect.gen(function* () {
    const tmp = yield* tmpdirScoped()
    const db = openDb(tmp.path)
    const file = db.$client.location()
    db.$client.close()
    if (!file) return yield* Effect.die(new Error('openDb returned an in-memory database'))
    return Database.layer({path: file})
  }),
)

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of({directory: AbsolutePath.make('/project'), project: {id: ProjectId.global}}),
)

export const permissionLayer = Permission.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(PermissionSaved.layer, Agent.layer, PluginHooks.layer, sessionsLayer)),
  Layer.provideMerge(Layer.mergeAll(Bus.layer, locationLayer, sessionMapLayer)),
  Layer.provideMerge(databaseLayer),
)

export const sessionId = Session.Id.make('conciv_test')
export const testAgent = Agent.Id.make('test')

export function setRules(rules: Permission.Ruleset) {
  return Effect.gen(function* () {
    const agents = yield* Agent.Service
    yield* agents.transform((editor) =>
      editor.update(testAgent, (agent) => {
        agent.permissions = [...rules]
      }),
    )
  })
}

export function setup(rules: Permission.Ruleset = [], id = sessionId) {
  return Effect.gen(function* () {
    const sessions = yield* SessionMap
    if (!sessions.has(id)) sessions.set(id, {agent: testAgent})
    yield* setRules(rules)
  })
}

export function setSession(rules: Partial<Permission.SessionRules>, id = sessionId) {
  return Effect.gen(function* () {
    const sessions = yield* SessionMap
    sessions.set(id, {...sessions.get(id), ...rules})
  })
}

export function removeSession(id: Session.Id) {
  return Effect.gen(function* () {
    const sessions = yield* SessionMap
    sessions.delete(id)
  })
}
