import {readdirSync, readFileSync, realpathSync, symlinkSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {describe} from 'vitest'
import {expect} from '@playwright/test'
import {test} from '@conciv/browser-fixture'
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

      await widget.kit.callTool('test_runner_run', {}).then(
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
      const run = widget.kit.callTool('test_runner_run', {})
      await expect(panel.getByRole('status')).toHaveText(/^Running tests/, {timeout: 60_000})
      await expect(panel.getByText('one plus one', {exact: true})).toBeVisible({timeout: 60_000})
      await expect(panel.getByText('this fails on purpose', {exact: true}).first()).toBeVisible({timeout: 60_000})
      await expect(panel.getByText('waits for the release file', {exact: true})).toBeVisible()

      await page.reload({waitUntil: 'domcontentloaded'})
      await openTests()
      await expect(panel.getByRole('status')).toHaveText(/^Running tests/, {timeout: 30_000})
      await expect(panel.getByText('one plus one', {exact: true})).toBeVisible()
      await expect(panel.getByText('this fails on purpose', {exact: true}).first()).toBeVisible()

      widget.kit.writeProjectFile('release', '')
      await expect(panel.getByRole('status')).toHaveText(/^Test run finished: 4 passed, 1 failed, 0 skipped/, {
        timeout: 60_000,
      })
      await run

      await panel.getByRole('button', {name: 'Open fail.test.ts:4', exact: true}).click()
      const opened = await observer.completed({path: ['editor', 'open'], input: {file: /fail\.test\.ts$/, line: 4}})
      expect(opened.status).toBe(200)

      await panel.getByRole('button', {name: 'Fix this', exact: true}).click()
      await expect(page.getByRole('tab', {name: 'Chat', exact: true, selected: true})).toBeVisible()
      await expect(page.getByRole('textbox', {name: 'Message the conciv agent'})).toContainText(
        'The test "this fails on purpose" in fail.test.ts is failing',
      )
    } finally {
      await widget.close()
    }
  }, 240_000)
})
