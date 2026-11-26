import {mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import getPort from 'get-port'
import type {SemanticSnapshot, UiState} from '@conciv/protocol/simulation'
import {connectDriver, text} from '@conciv/simulation/driver'
import {clickByRole, connectUi, typeInto} from '@conciv/simulation/frontend'

export type EngineDrive = {
  answer: (value: string) => Promise<void>
  typeInto: (role: string, label: string, value: string) => Promise<UiState>
  clickByRole: (role: string, label: string) => Promise<UiState>
  snapshot: () => Promise<SemanticSnapshot>
}

export type DriveEndpoints = {ui: string; backend: string}

const INSTANCE = 'engine-kit'

async function loopbackEndpoint(): Promise<string> {
  return `ws://127.0.0.1:${await getPort({host: '127.0.0.1'})}`
}

export async function writeDriveManifest(
  stateDir: string,
): Promise<{env: Record<string, string>; endpoints: DriveEndpoints}> {
  const directory = join(stateDir, 'drive')
  const endpoints = {ui: await loopbackEndpoint(), backend: await loopbackEndpoint()}
  mkdirSync(directory, {recursive: true})
  writeFileSync(join(directory, `${INSTANCE}.json`), JSON.stringify({endpoints}))
  return {env: {CONCIV_DRIVE: INSTANCE, DRIVE_REGISTRY_DIR: directory}, endpoints}
}

export async function connectDrive(endpoints: DriveEndpoints): Promise<EngineDrive & {close: () => Promise<void>}> {
  const backend = await connectDriver(endpoints.backend)
  const ui = await connectUi(endpoints.ui).catch(async (error: unknown) => {
    await backend.close()
    throw error
  })
  return {
    answer: async (value) => backend.serve(() => text(value)),
    typeInto: (role, label, value) => typeInto(ui.client, role, label, value),
    clickByRole: (role, label) => clickByRole(ui.client, role, label),
    snapshot: () => ui.client.ui.snapshot(),
    close: async () => {
      ui.close()
      await backend.close()
    },
  }
}
