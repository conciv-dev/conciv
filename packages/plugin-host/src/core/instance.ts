import {Layer} from 'effect'
import {Agent} from './agent.js'
import {App} from './app.js'
import {Bus} from './bus.js'
import {ConfigAgentPlugin} from './config/plugin/agent.js'
import {ConfigPluginSource} from './config/plugin/source.js'
import {Database} from './database/database.js'
import {Node} from './effect/app-node.js'
import {LayerNode} from './effect/layer-node.js'
import {Platform} from './effect/platform.js'
import {FileSystem} from './filesystem.js'
import * as FileSystemSearch from './filesystem/search.js'
import {Watcher} from './filesystem/watcher.js'
import {Image} from './image.js'
import {KV} from './kv.js'
import {Location} from './location.js'
import {ManagedPolicy} from './managed-policy.js'
import {Model} from './model.js'
import {Permission} from './permission.js'
import {PermissionSaved} from './permission/saved.js'
import {Plugin} from './plugin.js'
import {PluginHooks} from './plugin/hooks.js'
import {PluginHost} from './plugin/host.js'
import {InstancePlugins} from './plugin/instance.js'
import {SdkPlugins} from './plugin/sdk.js'
import {PluginUpdate} from './plugin/update.js'
import * as Ripgrep from './ripgrep.js'
import * as RipgrepBinary from './ripgrep/binary.js'
import {Rpc} from './rpc.js'
import {Session} from './session.js'
import {SessionInbox} from './session/inbox.js'
import {InstructionEntry} from './session/instruction-entry.js'
import {SessionProjector} from './session/projector.js'
import {Skill} from './skill.js'
import {SkillInstructions} from './skill/instructions.js'
import {Tool} from './tool.js'
import {EffectFlock} from '../util/effect-flock.js'
import {FSUtil} from '../util/fs-util.js'
import {Global} from '../util/global.js'
import {Npm} from '../util/npm.js'

export * as Instance from './instance.js'

const nodes = [
  App.node,
  Location.node,
  Agent.node,
  Rpc.node,
  Plugin.node,
  PluginHooks.node,
  InstancePlugins.node,
  SdkPlugins.node,
  PluginUpdate.node,
  ConfigPluginSource.configuredNode,
  ConfigPluginSource.node,
  ConfigAgentPlugin.configuredNode,
  ManagedPolicy.configuredNode,
  PluginHost.serversNode,
  PluginHost.bundlerNode,
  PluginHost.editorNode,
  FileSystemSearch.node,
  FileSystem.node,
  Ripgrep.node,
  RipgrepBinary.node,
  Skill.node,
  SkillInstructions.node,
  Permission.sessionsNode,
  PermissionSaved.node,
  Permission.node,
  Tool.node,
  Image.node,
  Model.node,
  Session.node,
  SessionInbox.node,
  SessionProjector.node,
  InstructionEntry.node,
  KV.node,
  Bus.node,
  Database.node,
  Watcher.node,
  Npm.node,
  EffectFlock.node,
  FSUtil.node,
  Global.node,
  Platform.fileSystem,
  Platform.path,
  Platform.spawner,
  Platform.httpClient,
] as const satisfies readonly Node.LocationGraph<never, unknown>[]

export const graph = LayerNode.group(nodes)

export type Services = LayerNode.Output<typeof graph>

export interface Options {
  readonly replacements?: LayerNode.Replacements
}

export function layer(options: Options = {}): Layer.Layer<Services, LayerNode.Error<typeof graph>> {
  return LayerNode.compile(graph, {replacements: options.replacements ?? [], shared: Node.tags.values.global})
}
