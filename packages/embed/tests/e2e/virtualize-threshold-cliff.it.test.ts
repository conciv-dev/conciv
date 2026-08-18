import {expect, test} from '@playwright/test'
import {setupWidgetSuite} from './helpers/suite.js'
import {openPanel, switchToSessionByTitle} from './helpers/panel.js'

const MARKDOWN_HEAVY_REPLY = [
  '## Findings',
  '',
  'Here is a **detailed** breakdown with `inline code` and a fenced block:',
  '',
  '```ts',
  'function reconcileSnapshotToolCalls(snapshot: UIMessage[]): UIMessage[] {',
  '  const prevToolCalls = new Map<string, ToolCallPart>()',
  '  for (const msg of snapshot) for (const part of msg.parts) {',
  '    if (part.type === "tool-call") prevToolCalls.set(part.id, part)',
  '  }',
  '  return snapshot',
  '}',
  '```',
  '',
  '- first bullet point with some explanation',
  '- second bullet point that is a bit longer to force line wrapping in the estimator',
  '- third bullet point',
  '',
  '> a blockquote noting a caveat worth remembering',
].join('\n')

const suite = setupWidgetSuite({text: MARKDOWN_HEAVY_REPLY})

async function seedExchanges(sessionId: string, exchanges: number): Promise<void> {
  const kit = suite.kit()
  const keeper = await kit.attach(sessionId)
  for (let index = 0; index < exchanges; index += 1) {
    await kit.chat(`question number ${index} about the reconciliation logic`, sessionId)
    await keeper.done({hangGuardMs: 10_000})
  }
}

async function measureSwitch(page: import('@playwright/test').Page, exchanges: number): Promise<{rowCount: number}> {
  const {sessionId} = await suite.kit().rpc.sessions.create()
  const title = `cliff ${exchanges} ${sessionId.slice(-8)}`
  await suite.kit().rpc.sessions.rename({sessionId, title})
  await seedExchanges(sessionId, exchanges)

  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await openPanel(page)
  await switchToSessionByTitle(page, title)
  await expect(page.getByText(`question number ${exchanges - 1}`).first()).toBeVisible({timeout: 30_000})

  await page.waitForTimeout(500)

  const virtualRowCount = await page.locator('[data-index]').count()
  const flatRowCount = await page.getByText(/^question number \d+ about the reconciliation logic$/).count()
  const rowCount = virtualRowCount > 0 ? virtualRowCount : flatRowCount
  return {rowCount}
}

test.describe('virtualize threshold cliff', () => {
  test('a transcript just below the virtualize threshold mounts every turn; crossing it bounds the DOM again', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const below = await measureSwitch(page, 24)
    console.log('BELOW THRESHOLD (48 turns, flat mode) rendered row count', below.rowCount)

    const at = await measureSwitch(page, 25)
    console.log('AT THRESHOLD (50 turns, virtual mode) rendered row count', at.rowCount)

    expect(below.rowCount, 'below the threshold every turn is mounted unvirtualized').toBeGreaterThanOrEqual(24)
    expect(
      at.rowCount,
      'at/above the threshold the virtualizer bounds the mounted rows regardless of transcript size',
    ).toBeLessThan(below.rowCount)
  })
})
