import {Schema} from 'effect'
import * as Agent from './agent.js'
import * as Bundler from './bundler.js'
import * as Credential from './credential.js'
import * as Event from './event.js'
import * as Form from './form.js'
import * as Integration from './integration.js'
import * as Permission from './permission.js'
import * as Plugin from './plugin.js'
import * as Skill from './skill.js'
import * as SessionEvent from './session-event.js'
import * as BrowserTabEvent from './browser-tab-event.js'

const coreDefinitions = Event.inventory(...SessionEvent.Definitions, ...BrowserTabEvent.Definitions)

const foundationDefinitions = Event.inventory(...Agent.Event.Definitions, ...coreDefinitions)

const featureDefinitions = Event.inventory(
  ...Bundler.Event.Definitions,
  ...Credential.Event.Definitions,
  ...Integration.Event.Definitions,
  ...Form.Event.Definitions,
  ...Permission.Event.Definitions,
  ...Plugin.Event.Definitions,
  ...Skill.Event.Definitions,
)

export const ServerDefinitions = Event.inventory(...foundationDefinitions, ...featureDefinitions)
export const Server = Event.latest(ServerDefinitions)
export type ServerEvent = Schema.Schema.Type<(typeof ServerDefinitions)[number]>
export const isServer = (event: {readonly type: string}): event is ServerEvent => Server.has(event.type)
