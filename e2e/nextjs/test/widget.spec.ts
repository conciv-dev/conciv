import {spawn} from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import getPort from 'get-port'
import {z} from 'zod'
import {makeRpcClient} from '@conciv/contract'
import {
  collectFailures,
  expectPluginBundleReloadsInPlace,
  expectWidgetBoots,
  loginWidget,
  trustedEngineBase,
} from '@conciv/e2e-utils/widget'
import {NON_INTERACTIVE_ENV, WORKSPACE_ROOT, run} from '@conciv/vitest-config/pack'
import {stopNext, waitFor, type NextHandle} from '../packed/harness.js'

test('widget boots from dist in a nextjs app with the built-in Terminal tab', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectWidgetBoots(page, failures)
  const chat = page.getByRole('dialog', {name: 'conciv chat agent'})
  await chat.getByRole('tab', {name: 'Terminal'}).click()
  await expect(chat.getByRole('button', {name: 'New terminal'})).toBeVisible()
})

test('the engine started by next.config offers its built-in terminal for a session', async ({page}) => {
  const client = makeRpcClient(await trustedEngineBase(page))
  const {sessionId} = await client.sessions.create()
  expect((await client.meta.models({sessionId})).harness.persistentPty).toBe(true)
})

function writeLinkedApp(appDir: string, enginePort: number): void {
  mkdirSync(join(appDir, 'app'), {recursive: true})
  mkdirSync(join(appDir, 'node_modules/@conciv'), {recursive: true})
  symlinkSync(join(WORKSPACE_ROOT, 'packages/it'), join(appDir, 'node_modules/@conciv/it'))
  symlinkSync(join(import.meta.dirname, '../node_modules/next'), join(appDir, 'node_modules/next'))
  writeFileSync(
    join(appDir, 'next.config.mjs'),
    [
      `import {join} from 'node:path'`,
      `import {withConciv} from '@conciv/it/plugin/nextjs'`,
      `export default withConciv({}, {port: ${z.int().parse(enginePort)}, devEndpointDir: join(import.meta.dirname, 'dev-endpoint')})`,
      ``,
    ].join('\n'),
  )
  writeFileSync(join(appDir, 'instrumentation.js'), `export {register} from '@conciv/it/plugin/nextjs'\n`)
  writeFileSync(
    join(appDir, 'app/layout.jsx'),
    `export default function RootLayout({children}) {\n  return <html lang="en"><body>{children}</body></html>\n}\n`,
  )
  writeFileSync(join(appDir, 'app/page.jsx'), `export default function Home() {\n  return <h1>linked</h1>\n}\n`)
}

function nextBin(appDir: string): string {
  return join(appDir, 'node_modules/next/dist/bin/next')
}

function startLinkedNextDev(appDir: string, devPort: number): NextHandle {
  const logPath = join(appDir, 'next-dev.log')
  const log = openSync(logPath, 'w')
  const child = spawn(process.execPath, [nextBin(appDir), 'dev', '--port', String(devPort)], {
    cwd: appDir,
    detached: true,
    stdio: ['ignore', log, log],
    env: NON_INTERACTIVE_ENV,
  })
  closeSync(log)
  return {child, appDir, devPort, logPath}
}

async function engineAnswers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`)
    return true
  } catch {
    return false
  }
}

async function waitForEngine(handle: NextHandle, port: number): Promise<void> {
  try {
    await waitFor(() => engineAnswers(port), 60_000)
  } catch (error) {
    throw new Error(`the engine never answered on ${port}\n${readFileSync(handle.logPath, 'utf8').slice(-4000)}`, {
      cause: error,
    })
  }
}

function binShimLinksToRealFile(appDir: string): boolean {
  const shim = join(appDir, '.conciv/bin/conciv')
  return lstatSync(shim, {throwIfNoEntry: false}) !== undefined && existsSync(shim)
}

test.describe('a workspace-linked @conciv/it under next dev and then next build', () => {
  test('next dev boots the engine without a dangling conciv bin link, and next build passes', async () => {
    const appDir = test.info().outputPath('linked-app')
    const enginePort = await getPort()
    const devPort = await getPort()
    let handle: NextHandle | undefined
    try {
      writeLinkedApp(appDir, enginePort)
      handle = startLinkedNextDev(appDir, devPort)
      await waitForEngine(handle, enginePort)
      expect(binShimLinksToRealFile(appDir), '.conciv/bin/conciv exists and links to a file that exists').toBe(true)
      expect(readFileSync(handle.logPath, 'utf8')).not.toContain('too dynamic')
      await stopNext(handle, enginePort)
      handle = undefined
      await run(process.execPath, [nextBin(appDir), 'build'], appDir)
    } finally {
      if (handle !== undefined) await stopNext(handle, enginePort)
      rmSync(appDir, {recursive: true, force: true})
    }
  })
})

test('a rebuilt project plugin bundle reloads in the open widget without a page reload', async ({page}) => {
  const failures = collectFailures(page)
  await loginWidget(page)
  await expectPluginBundleReloadsInPlace(
    page,
    failures,
    join(import.meta.dirname, '../conciv/plugins/live-line/plugin-experimental.js'),
  )
})
