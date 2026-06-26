import {startLocalJazzServer} from 'jazz-tools/dev'

export type JazzRunner = {
  appId: string
  serverUrl: string
  backendSecret: string
  stop: () => Promise<void>
}

export type JazzRunnerOptions = {
  dataDir?: string
  inMemory?: boolean
}

export const startJazzRunner = async (options: JazzRunnerOptions = {}): Promise<JazzRunner> => {
  const server = await startLocalJazzServer({
    dataDir: options.dataDir,
    inMemory: options.inMemory,
    allowLocalFirstAuth: true,
  })
  return {
    appId: server.appId,
    serverUrl: server.url,
    backendSecret: server.backendSecret,
    stop: () => server.stop(),
  }
}
