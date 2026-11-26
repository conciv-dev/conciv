import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import type {ContractRouterClient} from '@orpc/contract'
import {WebSocketServer, type WebSocket} from 'ws'
import {
  PROTOCOL_VERSION,
  uiContract,
  type SemanticNode,
  type SemanticSnapshot,
  type UiState,
} from '@conciv/protocol/simulation'

export type UiClient = ContractRouterClient<typeof uiContract>

export type UiDriver = {
  readonly client: UiClient
  readonly close: () => Promise<void>
}

const REQUIRED_CAPABILITIES = ['ui.snapshot', 'ui.state', 'ui.click.semantic', 'ui.focus', 'ui.type', 'ui.press']

function listening(endpoint: URL): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({host: endpoint.hostname, port: Number(endpoint.port)})
    server.once('listening', () => {
      server.off('error', reject)
      resolve(server)
    })
    server.once('error', reject)
  })
}

function closeServer(server: WebSocketServer): Promise<void> {
  server.clients.forEach((socket) => socket.terminate())
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
}

function firstWidget(server: WebSocketServer): Promise<WebSocket> {
  return new Promise((resolve) => server.once('connection', resolve))
}

export async function listenUi(endpoint: string): Promise<UiDriver> {
  const server = await listening(new URL(endpoint))
  const close = (): Promise<void> => closeServer(server)
  try {
    const socket = await firstWidget(server)
    const client: UiClient = createORPCClient(new RPCLink({websocket: socket}))
    await client.handshake({
      client: {name: 'conciv-simulation-driver', version: String(PROTOCOL_VERSION)},
      expectedRole: 'ui',
      offeredVersions: [PROTOCOL_VERSION],
      requiredCapabilities: REQUIRED_CAPABILITIES,
      optionalCapabilities: [],
    })
    return {client, close}
  } catch (error) {
    await close()
    throw error
  }
}

export function byRole(snapshot: SemanticSnapshot, role: string, label: string): SemanticNode {
  const found = snapshot.nodes.find((node) => node.role === role && node.label === label)
  if (found === undefined) throw new Error(`the widget shows no ${role} named ${label}`)
  return found
}

export async function clickByRole(client: UiClient, role: string, label: string): Promise<UiState> {
  const node = byRole(await client.ui.snapshot(), role, label)
  const semantic =
    node.instance === undefined
      ? {id: node.id, element: node.element}
      : {id: node.id, instance: node.instance, element: node.element}
  return client.ui.click({target: node.element, x: 0, y: 0, semantic})
}

export async function typeInto(client: UiClient, role: string, label: string, text: string): Promise<UiState> {
  const node = byRole(await client.ui.snapshot(), role, label)
  await client.ui.focus({target: node.element})
  return client.ui.type({text})
}
