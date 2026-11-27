import {createORPCClient} from '@orpc/client'
import {RPCLink} from '@orpc/client/websocket'
import type {RouterContractClient} from '@orpc/contract'
import {WebSocket} from 'ws'
import {
  PROTOCOL_VERSION,
  simulationErrors,
  uiContract,
  type SemanticNode,
  type SemanticSnapshot,
  type UiState,
} from '@conciv/protocol/simulation'

export type UiClient = RouterContractClient<typeof uiContract>

export type UiDriver = {
  readonly client: UiClient
  readonly close: () => void
}

const REQUIRED_CAPABILITIES = ['ui.snapshot', 'ui.state', 'ui.click.semantic', 'ui.focus', 'ui.type', 'ui.press']

function opened(endpoint: string, signal: AbortSignal | undefined): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint)
    const settle = (): void => {
      socket.off('open', open)
      socket.off('error', failed)
      signal?.removeEventListener('abort', aborted)
    }
    const open = (): void => {
      settle()
      resolve(socket)
    }
    const failed = (error: Error): void => {
      settle()
      reject(simulationErrors.UI_ENDPOINT_UNREACHABLE({endpoint, cause: error}))
    }
    const aborted = (): void => {
      settle()
      socket.terminate()
      reject(signal?.reason)
    }
    socket.once('open', open)
    socket.once('error', failed)
    signal?.addEventListener('abort', aborted, {once: true})
  })
}

export async function connectUi(endpoint: string, signal?: AbortSignal): Promise<UiDriver> {
  const socket = await opened(endpoint, signal)
  const close = (): void => socket.close()
  try {
    const client: UiClient = createORPCClient(new RPCLink({connect: () => socket}))
    await client.handshake(
      {
        client: {name: 'conciv-simulation-driver', version: String(PROTOCOL_VERSION)},
        expectedRole: 'ui',
        offeredVersions: [PROTOCOL_VERSION],
        requiredCapabilities: REQUIRED_CAPABILITIES,
        optionalCapabilities: [],
      },
      {signal},
    )
    return {client, close}
  } catch (error) {
    close()
    throw error
  }
}

export function byRole(snapshot: SemanticSnapshot, role: string, label: string): SemanticNode {
  const found = snapshot.nodes.find((node) => node.role === role && node.label === label)
  if (found === undefined) throw simulationErrors.NO_SUCH_NODE({role, label})
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
