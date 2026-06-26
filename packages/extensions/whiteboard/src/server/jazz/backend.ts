import {createJazzContext, type Db} from 'jazz-tools/backend'
import {whiteboardApp, whiteboardPermissions} from '../../shared/schema.js'

export type BackendDb = {
  db: Db
  shutdown: () => Promise<void>
}

export type BackendDbOptions = {
  appId: string
  serverUrl: string
  backendSecret: string
}

export const createBackendDb = ({appId, serverUrl, backendSecret}: BackendDbOptions): BackendDb => {
  const context = createJazzContext({
    appId,
    app: whiteboardApp,
    permissions: whiteboardPermissions,
    driver: {type: 'memory'},
    serverUrl,
    backendSecret,
  })
  return {db: context.asBackend(), shutdown: () => context.shutdown()}
}
