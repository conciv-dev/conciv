import {describe, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createFakeEngine, FakeLLM} from '@internal/test-utils'
import {watchCalm} from '../fixtures/calm-watch.js'
import {mountShell, shellEngine} from '../utils/mount-shell.js'
import {seededSession} from '../utils/sample-data.js'

describe('the calm chat plane', () => {
  test('a multi-tool run streams without dropped frames', async ({task}) => {
    const diffBefore =
      'export function total(items: Item[]): number {\n  let sum = 0\n  for (const item of items) sum += item.price\n  return sum\n}'
    const diffAfter =
      'export function total(items: readonly Item[]): number {\n  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)\n}'
    const inputs = {
      Bash: (index: number) => ({command: `probe step ${index}`}),
      Read: (index: number) => ({filePath: `step-${index}.tsx`}),
      Edit: (index: number) => ({file_path: `step-${index}.tsx`, old_string: diffBefore, new_string: diffAfter}),
    }
    const twenty: Array<keyof typeof inputs> = [
      'Bash',
      'Read',
      'Bash',
      'Read',
      'Bash',
      'Edit',
      'Bash',
      'Read',
      'Bash',
      'Read',
      'Edit',
      'Read',
      'Bash',
      'Read',
      'Bash',
      'Edit',
      'Bash',
      'Read',
      'Bash',
      'Read',
    ]
    const steps = [...twenty, ...twenty, ...twenty]
    const engine = shellEngine()
    const held = engine.gate()
    engine.reply(
      ...steps.map((name, index) => FakeLLM.toolCall(`step-${index}`, name, inputs[name](index))),
      FakeLLM.text('All sixty steps are done.'),
    )
    await mountShell({engine})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})

    await input.fill('run sixty tools then answer')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('article', {name: 'You: run sixty tools then answer'})).toBeVisible()
    await held.started
    const watch = watchCalm(task.name)
    await watch.checkpoint()
    const end = watch.endWhenDrawn('All sixty steps are done.')
    held.release()
    await end
    await expect.element(page.getByText('All sixty steps are done.', {exact: true})).toBeVisible()

    watch.expectSmooth()
  })

  test('a long thread at the virtualization boundary streams a run without dropped frames', async ({task}) => {
    const engine = shellEngine(createFakeEngine({sessions: [seededSession([0, 1, 2, 3, 4])], tokensPerSecond: 20}))
    const held = engine.gate()
    engine.reply(
      FakeLLM.toolCall('fill', 'Edit', {file_path: 'form.tsx', old_string: 'name', new_string: 'Ada'}),
      FakeLLM.toolCall('save', 'Bash', {command: 'save the form'}),
      FakeLLM.text('The long thread is done.'),
    )
    await mountShell({engine, initialEntries: ['/panel/ses_seeded?open=true']})
    await expect.element(page.getByRole('article', {name: 'You: seeded exchange 4'})).toBeVisible()
    await expect.element(page.getByRole('article', {name: 'You: seeded exchange 0'})).toBeInTheDocument()
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})

    await input.fill('fill and save the form')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('article', {name: 'You: fill and save the form'})).toBeVisible()
    await held.started
    const watch = watchCalm(task.name)
    await watch.checkpoint()
    const end = watch.endWhenDrawn('The long thread is done.')
    held.release()
    await end
    await expect.element(page.getByText('The long thread is done.', {exact: true})).toBeVisible()

    watch.expectSmooth()
  })

  test('a streamed code block streams without dropped frames', async ({task}) => {
    const codeLines = Array.from(
      {length: 40},
      (_, index) => `  const step${index} = await resolve(input.steps[${index}], {retries: ${index % 4}})`,
    )
    const engine = shellEngine(createFakeEngine({tokensPerSecond: 100}))
    const held = engine.gate()
    engine.reply(
      FakeLLM.text(
        [
          'Here is the helper you asked for.',
          '',
          '```ts',
          'export async function resolveEveryStep(input: PipelineInput): Promise<StepResult[]> {',
          ...codeLines,
          '  return [step0]',
          '}',
          '```',
          '',
          'That is the whole helper.',
        ].join('\n'),
      ),
    )
    await mountShell({engine})
    const input = page.getByRole('textbox', {name: 'Message the conciv agent'})

    await input.fill('write the helper that resolves every step')
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('article', {name: 'You: write the helper that resolves every step'}))
      .toBeVisible()
    await held.started
    const watch = watchCalm(task.name)
    await watch.checkpoint()
    const end = watch.endWhenDrawn('That is the whole helper.')
    held.release()
    await expect.element(page.getByRole('button', {name: /^\d+ more lines?$/})).toBeVisible()
    await expect.element(page.getByRole('button', {name: /^[2-9]\d more lines$/})).toBeVisible()
    await end
    await expect.element(page.getByText('That is the whole helper.', {exact: true})).toBeVisible()

    watch.expectSmooth()
  })

  test('Latest from far up in a long chat glides to the end without dropped frames', async ({task}) => {
    const exchanges = Array.from({length: 25}, (_, index) => index)
    await mountShell({
      engine: shellEngine(createFakeEngine({sessions: [seededSession(exchanges)]})),
      initialEntries: ['/panel/ses_seeded?open=true'],
    })
    const last = page.getByRole('article', {name: 'You: seeded exchange 24'})
    const latest = page.getByRole('button', {name: 'Scroll to bottom', includeHidden: true})
    await expect.element(last).toBeVisible()
    await userEvent.click(last)
    await userEvent.keyboard('{Home}')
    await expect.element(page.getByRole('article', {name: 'You: seeded exchange 0'})).toBeVisible()
    await expect.element(latest).toBeEnabled()

    const watch = watchCalm(task.name)
    await watch.checkpoint()
    const end = watch.endWhenScrolledToEnd()
    await latest.click()
    await end
    await expect.element(last).toBeInViewport()
    await expect.element(latest).toBeDisabled()

    watch.expectSmooth()
  })
})
