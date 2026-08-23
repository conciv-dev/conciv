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

const VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT = 15
const BELOW_EXCHANGES = Math.floor((VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT - 1) / 2)
const ABOVE_EXCHANGES = Math.ceil(VIRTUALIZE_THRESHOLD_MIRRORED_FROM_UI_KIT_CHAT / 2)

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

  const rowCount = await page.locator('[data-message-id]').count()
  return {rowCount}
}

test.describe('virtualize threshold cliff', () => {
  test('a transcript just below the virtualize threshold mounts every turn; crossing it bounds the DOM again', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const below = await measureSwitch(page, BELOW_EXCHANGES)
    console.log(`BELOW THRESHOLD (${BELOW_EXCHANGES * 2} turns, flat mode) rendered row count`, below.rowCount)

    const at = await measureSwitch(page, ABOVE_EXCHANGES)
    console.log(`AT THRESHOLD (${ABOVE_EXCHANGES * 2} turns, virtual mode) rendered row count`, at.rowCount)

    expect(below.rowCount, 'below the threshold every turn is mounted unvirtualized').toBe(BELOW_EXCHANGES * 2)
    expect(
      at.rowCount,
      'at/above the threshold the virtualizer bounds the mounted rows to a window smaller than the transcript',
    ).toBeLessThan(ABOVE_EXCHANGES * 2)
  })
})
