import getPort from 'get-port'
import type {BrowserCommand} from 'vitest/node'
import {clickByRole, listenUi, typeInto, type UiDriver} from '@conciv/simulation/frontend'

type DriveCommands = {
  driveListen: () => Promise<string>
  driveTypeInto: (role: string, label: string, text: string) => Promise<boolean>
  driveClickByRole: (role: string, label: string) => Promise<void>
  driveMatches: (text: string) => Promise<boolean>
  driveClose: () => Promise<void>
}

declare module 'vitest/browser' {
  interface BrowserCommands extends DriveCommands {}
}

export function driveCommands() {
  const listening: {driver: Promise<UiDriver> | undefined} = {driver: undefined}
  const driver = (): Promise<UiDriver> => {
    if (listening.driver === undefined) throw new Error('driveListen was not called')
    return listening.driver
  }
  const driveListen: BrowserCommand<[]> = async () => {
    const endpoint = `ws://127.0.0.1:${await getPort({host: '127.0.0.1'})}`
    listening.driver = listenUi(endpoint)
    return endpoint
  }
  const driveTypeInto: BrowserCommand<[string, string, string]> = async (_context, role, label, text) => {
    const state = await typeInto((await driver()).client, role, label, text)
    return state.focused.editor
  }
  const driveClickByRole: BrowserCommand<[string, string]> = async (_context, role, label) => {
    await clickByRole((await driver()).client, role, label)
  }
  const driveMatches: BrowserCommand<[string]> = async (_context, text) => (await driver()).client.ui.matches({text})
  const driveClose: BrowserCommand<[]> = async () => {
    const started = listening.driver
    listening.driver = undefined
    await (await started)?.close()
  }
  return {driveListen, driveTypeInto, driveClickByRole, driveMatches, driveClose}
}
