import {test, expect} from '@playwright/test'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

// Live-agent screenshot capture for the docs site. Drives the real aidx widget + claude.
// Run explicitly: `CAPTURE=1 npx playwright test screenshots.spec.ts`. Skipped otherwise.
// Captured at deviceScaleFactor 2 for crisp retina output.
const here = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.resolve(here, '../../../site/public/screenshots')
const shot = (name: string) => path.join(OUT, `${name}.png`)

const FAB = '[aria-label="Open aidx chat"]'
const PANEL = '[role="dialog"][aria-label="aidx chat agent"]'
const INPUT = '.pw-chat-input'
const SEND = '[aria-label="Send"]'

const captured: string[] = []
const missed: string[] = []

type Page = import('@playwright/test').Page

test.describe.configure({mode: 'serial'})

test('capture widget screenshots', async ({browser}) => {
  test.skip(!process.env.CAPTURE, 'set CAPTURE=1 to run live capture')
  test.setTimeout(1_200_000)

  const newCtx = () => browser.newContext({viewport: {width: 1280, height: 900}, deviceScaleFactor: 2})

  // Full-page shot (FAB in context).
  {
    const ctx = await newCtx()
    const page = await ctx.newPage()
    await page.goto('http://localhost:3000/')
    await page.locator(FAB).waitFor({state: 'visible', timeout: 60_000})
    await page.waitForTimeout(800)
    await page.screenshot({path: shot('widget-fab')})
    captured.push('widget-fab')
    await ctx.close()
  }

  // Drive a prompt, wait for a target, screenshot the panel close-up.
  const phase = async (name: string, prompt: string, target: string, timeout = 180_000) => {
    let ctx
    try {
      ctx = await newCtx()
      const page: Page = await ctx.newPage()
      await page.goto('http://localhost:3000/')
      await page.locator(FAB).waitFor({state: 'visible', timeout: 60_000})
      await page.locator(FAB).click()
      await page.locator(PANEL).waitFor({state: 'visible', timeout: 15_000})
      await page.locator(INPUT).fill(prompt)
      await page.locator(SEND).click()
      await page.locator(target).first().waitFor({state: 'visible', timeout})
      await page.waitForTimeout(1500)
      await page.locator(PANEL).screenshot({path: shot(name)})
      captured.push(name)
    } catch {
      missed.push(name)
    } finally {
      await ctx?.close()
    }
  }

  await phase(
    'chat-thread',
    'What does this page do? Keep it short.',
    '.pw-chat-tool-head, .pw-chat-msg-assistant',
    150_000,
  )
  await phase('test-card', 'Run the test suite now.', '.pw-test', 200_000)

  // Force the exact aidx ui commands so the cards render deterministically.
  await phase(
    'gen-ui-choices',
    'Run this exact shell command and nothing else: aidx ui choices --question "Which test file should I run?" --option "cn.test.ts" --option "nav.test.ts" --option "All tests"',
    '.pw-genui-choices',
  )
  await phase(
    'gen-ui-confirm',
    'Run this exact shell command and nothing else: aidx ui confirm --question "Delete the build cache?" --detail "Removes .vite and forces a rebuild."',
    '.pw-genui-actions',
  )
  await phase(
    'gen-ui-diff',
    'Run this exact shell command and nothing else: aidx ui diff --file src/routes/index.tsx --before "Start simple, ship quickly." --after "Build it live."',
    '.pw-genui-diff-file',
  )
  await phase(
    'gen-ui-form',
    'Run this exact shell command and nothing else: aidx ui form --title "New component" --field "name:Component name:text" --field "kind:Kind:select:page,layout,widget"',
    '.pw-genui-field',
  )
  await phase(
    'approval-card',
    'Install the npm package named is-odd by running: npm install is-odd',
    '.pw-genui-actions',
    150_000,
  )

  console.log('CAPTURED:', captured.join(', ') || 'none')
  console.log('MISSED:', missed.join(', ') || 'none')
  expect(captured).toContain('widget-fab')
})
