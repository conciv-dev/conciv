import {mkdtempSync, rmSync} from 'node:fs'
import type {IncomingMessage} from 'node:http'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import type {Duplex} from 'node:stream'
import {nodeClient, type NodeClient} from '@conciv/extension/devframe-connection'
import {CONCIV_HOST_SERVICE, type ConcivHost} from '@conciv/extension/devframe-host'
import {SessionId} from '@conciv/protocol/chat-types'
import {serveHono} from '@conciv/serve'
import {initHub, type HubInstance} from '@devframes/hub/initiate'
import {defineDevframe, type DevframeDefinition} from 'devframe'

const HUB_BASE = '/__conciv/'
const TEST_SESSION = SessionId.parse('conciv_test')

export type ServedDevframePlugin = {
  hub: HubInstance
  url: string
  client: NodeClient
  close: () => Promise<void>
}

function testHost(stateDir: string, config: unknown): ConcivHost {
  return {
    cwd: stateDir,
    stateDir,
    basePath: '',
    sessions: {
      resumeToken: async () => null,
      recordToken: async () => {},
      chatBusy: async () => false,
      model: async () => null,
      onChatTurn: () => {},
    },
    harness: {id: 'test'},
    symbolicate: async () => null,
    nativeUrl: () => undefined,
    latestSession: async () => TEST_SESSION,
    config: () => config,
    inSession: (id, run) => run(id ?? TEST_SESSION),
  }
}

function hostDevframe(host: ConcivHost): DevframeDefinition {
  return defineDevframe({
    id: 'conciv-test-host',
    name: 'conciv test host',
    version: '0.0.0',
    packageName: '@conciv/harness-testkit',
    homepage: 'https://conciv.dev',
    description: 'hands conciv:host to one plugin under test',
    setup(ctx) {
      ctx.services.provide(CONCIV_HOST_SERVICE, host)
    },
  })
}

export async function serveDevframePlugin(
  plugin: DevframeDefinition,
  options: {host?: ConcivHost; config?: unknown} = {},
): Promise<ServedDevframePlugin> {
  const stateDir = mkdtempSync(join(tmpdir(), 'conciv-plugin-hub-'))
  const hub = initHub({
    base: HUB_BASE,
    auth: false,
    mcp: false,
    cwd: stateDir,
    devframes: [hostDevframe(options.host ?? testHost(stateDir, options.config)), plugin],
    getStorageDir: (scope) => join(stateDir, scope),
  })
  const abandon = async (error: unknown): Promise<never> => {
    await hub.close().catch(() => {})
    rmSync(stateDir, {recursive: true, force: true})
    throw error
  }
  await hub.ready.catch(abandon)
  const served = await serveHono({
    fetch: hub.handler,
    claimUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (req.url?.split('?')[0] !== `${hub.base}__ws`) return false
      hub.handleUpgrade(req, socket, head)
      return true
    },
  }).catch(abandon)
  const url = `http://127.0.0.1:${served.port}${hub.base}`
  const client = nodeClient({url, transport: 'ws'})
  return {
    hub,
    url,
    client,
    close: async () => {
      client.close()
      try {
        await hub.close()
      } finally {
        await served.close()
        rmSync(stateDir, {recursive: true, force: true})
      }
    },
  }
}
