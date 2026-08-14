import type {JSX} from 'solid-js'
import {page} from 'vitest/browser'
import {expect} from 'vitest'
import {useThread} from '../src/store/chat-context.js'

const RUN_TIMEOUT_MS = 3000

export function RunSettledIndicator(): JSX.Element {
  const thread = useThread()
  return <span>{thread.isRunning ? 'run live' : 'run settled'}</span>
}

export async function startRun(): Promise<void> {
  await page.getByRole('button', {name: 'ask'}).click()
  await expect.element(page.getByText('run live'), {timeout: RUN_TIMEOUT_MS}).toBeVisible()
}

export async function waitForRunSettled(): Promise<void> {
  await expect.element(page.getByText('run settled'), {timeout: RUN_TIMEOUT_MS}).toBeVisible()
}

export async function haltRun(): Promise<void> {
  await page.getByRole('button', {name: 'halt'}).click()
  await waitForRunSettled()
}
