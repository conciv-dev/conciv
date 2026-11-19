import {readdirSync, readFileSync, realpathSync, symlinkSync} from 'node:fs'
import {createRequire} from 'node:module'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from '@playwright/test'
import {test} from '@conciv/browser-fixture'
import {connectMcpClient} from '@conciv/harness-testkit'
import {openPluginWidget} from '@conciv/plugin-testkit/widget-suite'
import {rpcObserverFor} from '@conciv/plugin-testkit/rpc-observer'
import {rpcSocketFor} from '@conciv/plugin-testkit/rpc-socket'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
const WIDGET_BUNDLE = join(dirname(createRequire(import.meta.url).resolve('@conciv/embed')), 'conciv-widget.global.js')

const GATED_VITEST_TEST = `import {existsSync, watch} from 'node:fs'
import {join} from 'node:path'
import {test} from 'vitest'

test('waits for the release file', async () => {
  const watcher = watch(process.cwd())
  const released = new Promise((resolve) => {
    watcher.on('change', (_event, name) => {
      if (name === 'release') resolve(undefined)
    })
  })
  if (!existsSync(join(process.cwd(), 'release'))) await released
  watcher.close()
}, 120_000)
`

async function runTests(base: string): Promise<unknown> {
  const mcp = await connectMcpClient(`${base}/api/mcp`)
  try {
    const tool = (await mcp.tools()).find((entry) => entry.name === 'test_runner_run')
    if (!tool) throw new Error('test_runner_run is not a direct tool on /api/mcp')
    return await tool.execute({})
  } finally {
    await mcp.close()
  }
}

function fixtureFiles(): Record<string, string> {
  const directory = join(PACKAGE_DIR, 'test', 'fixtures', 'vitest-app')
  return Object.fromEntries(readdirSync(directory).map((file) => [file, readFileSync(join(directory, file), 'utf8')]))
}

describe('the Tests panel of the test-runner plugin', () => {
  test('lists the Tests tab, shows a failed start, a run the agent starts live, the run so far after a reload, its summary, opens a failing test and prefills a fix', async ({
    browser,
  }) => {
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      files: {...fixtureFiles(), 'gate.test.ts': GATED_VITEST_TEST},
      stateRoot: realpathSync(tempDir('conciv-test-runner-panel-')),
    })
    try {
      const page = widget.page
      const observer = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})

      const testsTab = page.getByRole('tab', {name: 'Tests', exact: true})
      const panel = page.getByRole('tabpanel', {name: 'Tests'})
      const openTests = async () => {
        await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
        await expect(testsTab).toBeVisible({timeout: 30_000})
        await testsTab.click()
        await expect(page.getByRole('tab', {name: 'Tests', exact: true, selected: true})).toBeVisible()
      }
      await openTests()
      await expect(panel.getByRole('status')).toHaveText('No test run yet')

      await runTests(widget.kit.base).then(
        () => undefined,
        () => undefined,
      )
      await expect(panel.getByRole('status')).toHaveText('The test runner is unavailable', {timeout: 60_000})
      await expect(panel.getByText(/vitest unavailable/)).toBeVisible()
      await page.getByRole('tab', {name: 'Chat', exact: true}).click()
      await expect(page.getByRole('tab', {name: 'Chat', exact: true, selected: true})).toBeVisible()
      await testsTab.click()
      await expect(panel.getByRole('status')).toHaveText('The test runner is unavailable')
      await expect(panel.getByText(/vitest unavailable/)).toBeVisible()

      symlinkSync(join(PACKAGE_DIR, 'node_modules'), join(widget.kit.stateRoot, 'node_modules'), 'dir')
      const run = runTests(widget.kit.base)
      await expect(panel.getByRole('status')).toHaveText(/^Running tests/, {timeout: 60_000})
      await expect(panel.getByText('one plus one', {exact: true})).toBeVisible({timeout: 60_000})
      await expect(panel.getByText('this fails on purpose', {exact: true}).first()).toBeVisible({timeout: 60_000})
      await expect(panel.getByRole('listitem').filter({hasText: /^Finished: pass\.test\.ts/})).toBeVisible()

      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible({timeout: 30_000})
      await testsTab.click()
      await expect(page.getByRole('tab', {name: 'Tests', exact: true, selected: true})).toBeVisible()
      await expect(panel.getByRole('status')).toHaveText(/^Running tests/, {timeout: 30_000})
      await expect(panel.getByText('one plus one', {exact: true})).toBeVisible()
      await expect(panel.getByText('this fails on purpose', {exact: true}).first()).toBeVisible()
      await expect(panel.getByRole('listitem').filter({hasText: /^Finished: pass\.test\.ts/})).toBeVisible()

      widget.kit.writeProjectFile('release', '')
      await expect(panel.getByRole('status')).toHaveText(/^Test run finished: 4 passed, 1 failed, 0 skipped/, {
        timeout: 60_000,
      })
      await run

      await panel.getByRole('button', {name: 'Open fail.test.ts:4', exact: true}).click()
      const opened = await observer.completed({
        path: ['plugin', 'call'],
        input: {rpcId: 'server', method: 'open', input: {file: /fail\.test\.ts$/, line: 4}},
      })
      expect(opened.status).toBe(200)

      await panel.getByRole('button', {name: 'Fix this', exact: true}).click()
      await expect(page.getByRole('tab', {name: 'Chat', exact: true, selected: true})).toBeVisible()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toContainText(
        'The test "this fails on purpose" in fail.test.ts is failing',
      )

      await page.setViewportSize({width: 360, height: 800})
      await expect(testsTab).toBeVisible()
    } finally {
      await widget.close()
    }
  }, 240_000)
})

describe('the test card of the test-runner plugin', () => {
  test('draws a finished run in the thread: the summary, the files as disclosures the keyboard toggles, the failure that opens its file and prefills a fix', async ({
    browser,
  }) => {
    const stateRoot = realpathSync(tempDir('conciv-test-runner-card-'))
    const failure = {
      file: join(stateRoot, 'fail.test.ts'),
      name: 'this fails on purpose',
      message: 'expected 200 to be 401 // Object.is equality',
      stack: 'at fail.test.ts:4:15',
      line: 4,
    }
    const result = {
      summary: {passed: 1, failed: 1, skipped: 1, durationMs: 638},
      failures: [failure],
      tests: [
        {id: 'pass-1', file: join(stateRoot, 'pass.test.ts'), name: 'one plus one', state: 'pass', durationMs: 2},
        {id: 'pass-2', file: join(stateRoot, 'pass.test.ts'), name: 'a later idea', state: 'skip', durationMs: 0},
        {id: 'fail-1', file: failure.file, name: failure.name, state: 'fail', durationMs: 4, error: failure},
      ],
    }
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      files: fixtureFiles(),
      stateRoot,
    })
    try {
      const page = widget.page
      const observer = rpcObserverFor(page)
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})
      widget.kit.harness.script.scriptTurn({
        toolCalls: [{name: 'test_runner_run', input: {}, result}],
        text: 'The run has one failing test',
      })

      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.click()
      await composer.pressSequentially('run the tests')
      await composer.press('Enter')
      await expect(page.getByText('The run has one failing test', {exact: true})).toBeVisible({timeout: 30_000})

      await expect(page.getByText('1 passed', {exact: true})).toBeVisible()
      await expect(page.getByText('1 failed', {exact: true})).toBeVisible()
      await expect(page.getByText('1 skipped', {exact: true})).toBeVisible()
      await expect(
        page.getByRole('status').getByText('Test run finished: 1 passed, 1 failed, 1 skipped', {exact: true}),
      ).toBeAttached()
      const folder = basename(stateRoot)
      const passFile = page.getByRole('group', {name: `${folder}/pass.test.ts`, exact: true})
      const failFile = page.getByRole('group', {name: `${folder}/fail.test.ts`, exact: true})
      const failingTest = failFile.getByRole('group', {name: 'this fails on purpose', exact: true})
      const failureText = failFile.getByText('expected 200 to be 401 // Object.is equality')
      await expect(passFile.getByText('one plus one', {exact: true})).toBeVisible()
      await expect(passFile.getByText('a later idea', {exact: true})).toBeVisible()
      await expect(failingTest).toBeVisible()
      await expect(failureText).toBeHidden()

      await failingTest.getByText('this fails on purpose', {exact: true}).click()
      await expect(failureText).toBeVisible()

      await failFile.getByRole('button', {name: `Open ${folder}/fail.test.ts:4`, exact: true}).click()
      const opened = await observer.completed({
        path: ['plugin', 'call'],
        input: {rpcId: 'server', method: 'open', input: {file: /fail\.test\.ts$/, line: 4}},
      })
      expect(opened.status).toBe(200)

      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Enter')
      await expect(failingTest).toBeHidden()
      await expect(failureText).toBeHidden()
      await page.keyboard.press('Space')
      await expect(failingTest).toBeVisible()
      await expect(failureText).toBeVisible()

      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect(failureText).toBeHidden()
      await page.keyboard.press('Enter')
      await expect(failureText).toBeVisible()

      await failFile.getByRole('button', {name: 'Fix this', exact: true}).click()
      await expect(composer).toContainText('The test "this fails on purpose" in fail.test.ts is failing')
    } finally {
      await widget.close()
    }
  }, 240_000)

  test('streams the run the agent starts into its card: the run in progress with each finished test, then the finished run', async ({
    browser,
  }) => {
    const stateRoot = realpathSync(tempDir('conciv-test-runner-card-live-'))
    const failure = {
      file: join(stateRoot, 'fail.test.ts'),
      name: 'this fails on purpose',
      message: 'expected 200 to be 401 // Object.is equality',
      stack: 'at fail.test.ts:4:15',
      line: 4,
    }
    const result = {
      summary: {passed: 4, failed: 1, skipped: 0, durationMs: 900},
      failures: [failure],
      tests: [
        {id: 'pass-1', file: join(stateRoot, 'pass.test.ts'), name: 'one plus one', state: 'pass', durationMs: 2},
        {
          id: 'gate-1',
          file: join(stateRoot, 'gate.test.ts'),
          name: 'waits for the release file',
          state: 'pass',
          durationMs: 800,
        },
        {id: 'fail-1', file: failure.file, name: failure.name, state: 'fail', durationMs: 4, error: failure},
      ],
    }
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      files: {...fixtureFiles(), 'gate.test.ts': GATED_VITEST_TEST},
      stateRoot,
    })
    try {
      const page = widget.page
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})
      symlinkSync(join(PACKAGE_DIR, 'node_modules'), join(stateRoot, 'node_modules'), 'dir')
      const script = widget.kit.harness.script
      script.holdResults()
      script.scriptTurn({
        toolCalls: [{name: 'test_runner_run', input: {}, result}],
        text: 'The run has one failing test',
      })

      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.click()
      await composer.pressSequentially('run the tests')
      await composer.press('Enter')

      const run = runTests(widget.kit.base)
      await expect(page.getByRole('status').getByText(/^Test run in progress: /)).toBeAttached({timeout: 60_000})
      await expect(page.getByText('one plus one', {exact: true})).toBeVisible({timeout: 60_000})
      await expect(page.getByText('this fails on purpose', {exact: true})).toBeVisible({timeout: 60_000})
      await expect(
        page.getByRole('status').getByText('Test run in progress: 3 passed, 1 failed, 0 skipped', {exact: true}),
      ).toBeAttached({timeout: 60_000})
      await expect(page.getByText('The run has one failing test', {exact: true})).toBeHidden()
      const failureText = page.getByText('expected 200 to be 401 // Object.is equality')
      await page.getByText('this fails on purpose', {exact: true}).click()
      await expect(failureText).toBeVisible()

      widget.kit.writeProjectFile('release', '')
      await run
      await expect(
        page.getByRole('status').getByText('Test run finished: 4 passed, 1 failed, 0 skipped', {exact: true}),
      ).toBeAttached({timeout: 60_000})
      await expect(failureText).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(failureText).toBeHidden()

      const oldChatRequests: string[] = []
      const recordOldChatPath = (url: URL) => {
        if (url.pathname.endsWith('/chat-ws') || url.pathname.endsWith('/chat-sse')) oldChatRequests.push(url.href)
        return false
      }
      await page.routeWebSocket(recordOldChatPath, (route) => route.close())
      await page.route(recordOldChatPath, (route) => route.abort())
      const slowJoin = Promise.withResolvers<void>()
      const holdJoin = rpcSocketFor(page).rule((call) => {
        if (call.path.join('.') !== 'chat.join') return 'pass'
        void slowJoin.promise.then(call.forward)
        return 'handled'
      })
      await page.reload({waitUntil: 'domcontentloaded'})
      await expect(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible({timeout: 30_000})
      await expect(
        page.getByRole('status').getByText('Test run finished: 4 passed, 1 failed, 0 skipped', {exact: true}),
      ).toBeAttached({timeout: 30_000})
      holdJoin()
      slowJoin.resolve()
      expect(oldChatRequests).toEqual([])
      await expect(page.getByText('this fails on purpose', {exact: true})).toBeVisible()
      await expect(page.getByText('The run has one failing test', {exact: true})).toBeHidden()

      script.releaseResults()
      await expect(page.getByText('The run has one failing test', {exact: true})).toBeVisible({timeout: 30_000})
      await expect(
        page.getByRole('status').getByText('Test run finished: 4 passed, 1 failed, 0 skipped', {exact: true}),
      ).toBeAttached()
      await expect(page.getByText('waits for the release file', {exact: true})).toBeVisible()
      await expect(page.getByRole('group', {name: 'this fails on purpose', exact: true})).toBeVisible()
    } finally {
      await widget.close()
    }
  }, 240_000)

  test('prefills a fix that names the project-relative file when two failing files share their last two segments', async ({
    browser,
  }) => {
    const stateRoot = realpathSync(tempDir('conciv-test-runner-card-paths-'))
    const failureIn = (area: string) => ({
      file: join(stateRoot, area, 'src', 'check.test.ts'),
      name: `the ${area} check fails`,
      message: `expected ${area} to pass`,
      stack: 'at check.test.ts:3:9',
      line: 3,
    })
    const web = failureIn('web')
    const api = failureIn('api')
    const result = {
      summary: {passed: 0, failed: 2, skipped: 0, durationMs: 120},
      failures: [web, api],
      tests: [
        {id: 'web-1', file: web.file, name: web.name, state: 'fail', durationMs: 3, error: web},
        {id: 'api-1', file: api.file, name: api.name, state: 'fail', durationMs: 3, error: api},
      ],
    }
    const widget = await openPluginWidget(browser, {
      id: 'fake',
      plugins: [PACKAGE_DIR],
      widgetBundle: WIDGET_BUNDLE,
      files: fixtureFiles(),
      stateRoot,
    })
    try {
      const page = widget.page
      await rpcSocketFor(page).installed
      await page.reload({waitUntil: 'domcontentloaded'})
      widget.kit.harness.script.scriptTurn({
        toolCalls: [{name: 'test_runner_run', input: {}, result}],
        text: 'Two checks fail',
      })

      await page.getByRole('button', {name: 'Open conciv chat'}).click({timeout: 30_000})
      const composer = page.getByRole('textbox', {name: 'Message the conciv agent'})
      await composer.click()
      await composer.pressSequentially('run the tests')
      await composer.press('Enter')
      await expect(page.getByText('Two checks fail', {exact: true})).toBeVisible({timeout: 30_000})

      const webTest = page.getByRole('group', {name: web.name, exact: true})
      await webTest.getByText(web.name, {exact: true}).click()
      await webTest.getByRole('button', {name: 'Fix this', exact: true}).click()
      await expect(composer).toContainText(`The test "${web.name}" in web/src/check.test.ts is failing`)

      await composer.click()
      await composer.press('ControlOrMeta+a')
      await composer.press('Delete')
      await expect(composer).not.toContainText(web.name)

      const apiTest = page.getByRole('group', {name: api.name, exact: true})
      await apiTest.getByText(api.name, {exact: true}).click()
      await apiTest.getByRole('button', {name: 'Fix this', exact: true}).click()
      await expect(composer).toContainText(`The test "${api.name}" in api/src/check.test.ts is failing`)
    } finally {
      await widget.close()
    }
  }, 240_000)
})
