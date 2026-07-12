import type {TestProject} from 'vitest/node'
import {spawnPaintHarness, startTerminalServer} from './helpers.js'

declare module 'vitest' {
  interface ProvidedContext {
    terminalBase: string
    terminalSpawnPaintBase: string
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const server = await startTerminalServer()
  const spawnPaint = await startTerminalServer(spawnPaintHarness)
  project.provide('terminalBase', server.base)
  project.provide('terminalSpawnPaintBase', spawnPaint.base)
  return async () => {
    await server.close()
    await spawnPaint.close()
  }
}
