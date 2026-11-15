export * as EventManifest from './event-manifest.js'

import {Schema} from 'effect'
import {Agent} from './agent.js'
import {Event} from './event.js'
import {Permission} from './permission.js'
import {Plugin} from './plugin.js'
import {Skill} from './skill.js'
import {SessionEvent} from './session-event.js'

const coreDefinitions = Event.inventory(...SessionEvent.Definitions)

const foundationDefinitions = Event.inventory(...Agent.Event.Definitions, ...coreDefinitions)

const featureDefinitions = Event.inventory(
  ...Permission.Event.Definitions,
  ...Plugin.Event.Definitions,
  ...Skill.Event.Definitions,
)

export const ServerDefinitions = Event.inventory(...foundationDefinitions, ...featureDefinitions)
export const Server = Event.latest(ServerDefinitions)
export type ServerEvent = Schema.Schema.Type<(typeof ServerDefinitions)[number]>
export const isServer = (event: {readonly type: string}): event is ServerEvent => Server.has(event.type)
