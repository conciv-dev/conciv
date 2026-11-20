import {spawnSync} from 'node:child_process'
import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {expect, test} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PLUGIN = fileURLToPath(new URL('plugin.js', import.meta.url))
const OXLINT = fileURLToPath(new URL('../node_modules/.bin/oxlint', import.meta.url))
const RULE = 'conciv(playwright-test-in-e2e)'
const PLAYWRIGHT_IMPORT = "import {test} from '@playwright/test'\n"
const SOURCES = ['e2e/app/widget.spec.ts', 'packages/kit/test/kit.test.ts', 'packages/kit/test/e2e/kit.config.ts']

function writeWorkspace(root: string): void {
  writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages: ['e2e/*', 'packages/*']\n")
  const config = {jsPlugins: [PLUGIN], rules: {'conciv/playwright-test-in-e2e': 'error'}}
  writeFileSync(join(root, 'oxlintrc.json'), JSON.stringify(config))
  for (const source of SOURCES) {
    mkdirSync(dirname(join(root, source)), {recursive: true})
    writeFileSync(join(root, source), PLAYWRIGHT_IMPORT)
  }
}

function reportedFiles(root: string): string[] {
  const {stdout} = spawnSync(OXLINT, ['-c', 'oxlintrc.json', '-f', 'unix', '.'], {cwd: root, encoding: 'utf8'})
  return stdout
    .split('\n')
    .filter((line) => line.includes(RULE))
    .map((line) => line.slice(0, line.indexOf(':')))
    .toSorted()
}

test("an @playwright/test import is allowed only under the workspace's e2e apps", () => {
  const root = tempDir('playwright-test-in-e2e-')
  writeWorkspace(root)
  expect(reportedFiles(root)).toEqual(['packages/kit/test/e2e/kit.config.ts', 'packages/kit/test/kit.test.ts'])
})
