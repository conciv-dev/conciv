import {execSync} from 'node:child_process'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'
import type {FullConfig} from '@playwright/test'
import {e2eConfigDir} from './config.js'

export default async function prepareRun(config: FullConfig): Promise<void> {
  const prepare = config.metadata['prepare']
  if (typeof prepare !== 'string') throw new Error('the Playwright config sets no prepare command in its metadata')
  execSync(prepare, {stdio: 'inherit'})
  if (process.env.CI) {
    await rm(join(e2eConfigDir(config.configFile), 'node_modules', '.vite'), {recursive: true, force: true})
  }
}
