
import {getDevframeRpcClient, type DevframeRpcClient} from 'devframe/client'
import {createPageScriptChannel} from 'devframe/in-page-channel'

const loadA11y = () => import('@devframes/plugin-a11y/client-script')

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function connectWithRetry(baseURL: string): Promise<DevframeRpcClient> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDevframeRpcClient({baseURL})
    } catch (error) {
      if (attempt >= 30) throw error
      await delay(Math.min(100 * 2 ** attempt, 1_000))
    }
  }
}

async function reconnectingClient(baseURL: string, onClient: (client: DevframeRpcClient) => void): Promise<void> {
  const client = await connectWithRetry(baseURL)
  onClient(client)
  client.events.on('connection:status', (status) => {
    if (status !== 'disconnected' && status !== 'error') return
    client.close?.()
    void reconnectingClient(baseURL, onClient)
  })
}

Object.assign(window, {getDevframeRpcClient, createPageScriptChannel, loadA11y, reconnectingClient})
