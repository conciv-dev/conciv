import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {test} from '@playwright/test'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/client'
import {concivStateDir} from '@conciv/types/state-types'

const RecordedEngineSchema = z.object({port: z.number().int().min(1).max(65535), token: z.string().min(1)})

export type RecordedEngine = {base: string; token: string}

async function issuedCode(engine: RecordedEngine): Promise<string> {
  return (await makeRpcClient(engine.base, {token: engine.token}).auth.issueCode()).code
}

export async function magicLink(engine: RecordedEngine, pageUrl: string): Promise<string> {
  return `${pageUrl}#conciv_otp=${await issuedCode(engine)}`
}

function refuseOtherEngine(stateFile: string, recordedPort: number, servedOrigin: string): void {
  const servedPort = Number(new URL(servedOrigin).port)
  if (servedPort === recordedPort) return
  throw new Error(
    `the page talks to the conciv engine on port ${servedPort}, but ${stateFile} records port ${recordedPort}; a stale server.json or another dev server is answering, so a login code from it would never unlock this page`,
  )
}

export function recordedEngineBase(projectDir: string, servedOrigin?: string): RecordedEngine {
  const stateFile = join(concivStateDir(projectDir), 'server.json')
  const recorded = RecordedEngineSchema.parse(JSON.parse(readFileSync(stateFile, 'utf8')))
  if (servedOrigin !== undefined) refuseOtherEngine(stateFile, recorded.port, servedOrigin)
  return {base: `http://127.0.0.1:${recorded.port}`, token: recorded.token}
}

export function testProjectDir(): string {
  const projectDir: unknown = test.info().project.metadata['projectDir']
  return typeof projectDir === 'string' ? projectDir : process.cwd()
}
