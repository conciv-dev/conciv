import {join} from 'node:path'
import {e2eStateDir} from './state-dir.js'

export function e2eDevEndpointDir(configDir: string): string {
  return join(e2eStateDir(configDir), 'dev-endpoint')
}
