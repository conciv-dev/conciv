import type {FullConfig} from '@playwright/test'
import {e2eConfigDir, emptyE2eState} from './config.js'

export default function packedGlobalSetup(config: FullConfig): void {
  emptyE2eState(e2eConfigDir(config.configFile))
}
