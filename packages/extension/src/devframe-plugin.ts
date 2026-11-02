import {defineDevframe, type DevframeDefinition} from 'devframe'
import type {DevframeDockDefaults, DevframeNodeContext} from 'devframe/types'
import type {z} from 'zod'
import type {AnyAttachmentBuilder} from './define-attachment.js'
import {
  defineExtension,
  parseExtensionConfig,
  type AnyToolBuilder,
  type ClientExtension,
  type ExtensionMeta,
} from './define-extension.js'
import {CONCIV_HOST_SERVICE, type ConcivHost} from './devframe-host.js'
import type {ConfigOf, ConnectGate, SystemPromptFactory} from './types.js'

export type ConcivPluginMeta<Id extends string, Schema extends z.ZodType> = {
  id: Id
  title: string
  configSchema?: Schema
  systemPrompt?: string | SystemPromptFactory<Exclude<ConfigOf<Schema>, undefined>>
  approval?: readonly string[]
  connectGate?: ConnectGate
  dock?: DevframeDockDefaults
}

export type ConcivPluginClient = Pick<
  ExtensionMeta<string, z.ZodType, readonly AnyToolBuilder[], readonly AnyAttachmentBuilder[]>,
  'views' | 'Surface' | 'Component' | 'attachments'
>

export type ConcivPluginServer<Config> = (
  ctx: DevframeNodeContext,
  host: ConcivHost,
  config: Config,
) => void | Promise<void>

export type ConcivPlugin<Id extends string = string, Schema extends z.ZodType = z.ZodType> = ClientExtension & {
  id: Id
  title: string
  approval?: readonly string[]
  devframe: DevframeDefinition
  server: (factory: ConcivPluginServer<ConfigOf<Schema>>) => ConcivPlugin<Id, Schema>
  client: (half: ConcivPluginClient) => ConcivPlugin<Id, Schema>
}

export function defineConcivPlugin<const Id extends string, Schema extends z.ZodType = z.ZodNever>(
  meta: ConcivPluginMeta<Id, Schema>,
): ConcivPlugin<Id, Schema> {
  const parts: {server?: ConcivPluginServer<ConfigOf<Schema>>} = {}
  const extension = defineExtension({
    name: meta.id,
    configSchema: meta.configSchema,
    systemPrompt: meta.systemPrompt,
    connectGate: meta.connectGate,
  })
  const plugin: ConcivPlugin<Id, Schema> = {
    ...extension,
    id: meta.id,
    title: meta.title,
    approval: meta.approval,
    devframe: defineDevframe({
      id: meta.id,
      name: meta.title,
      version: '0.0.0',
      packageName: `conciv-plugin-${meta.id}`,
      homepage: 'https://conciv.dev',
      description: meta.title,
      dock: meta.dock,
      setup: async (ctx) => {
        const host = ctx.services.get(CONCIV_HOST_SERVICE)
        if (!host) throw new Error(`conciv plugin "${meta.id}" needs the conciv:host service`)
        try {
          await parts.server?.(ctx, host, parseExtensionConfig(meta.configSchema, host.config(meta.id)))
        } catch (error) {
          console.error(`[conciv] plugin "${meta.id}" failed to start: ${String(error)}`)
        }
      },
    }),
    server: (factory) => {
      parts.server = factory
      return plugin
    },
    client: (half) => Object.assign(plugin, half),
  }
  return plugin
}

export function isConcivPlugin(value: object): value is ConcivPlugin {
  return 'devframe' in value
}
