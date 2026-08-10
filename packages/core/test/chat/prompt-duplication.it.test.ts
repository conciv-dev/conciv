import {describe, it, expect, afterEach} from 'vitest'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createTestkit, type Kit} from '@conciv/harness-testkit'
import {bootCoreApp} from '../helpers/boot.js'
import {runTurn} from '../helpers/turns.js'
import {requireClaude} from '../helpers/adapters.js'

const claude = requireClaude()

const dirs: string[] = []

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'conciv-prompt-dup-it-'))
  dirs.push(d)
  return d
}

describe('first turn of a brand new session (IT, real makeApp + fake-claude spawn)', () => {
  const state = {kit: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.kit) await state.kit.cleanup()
    state.kit = undefined
    for (const d of dirs.splice(0)) rmSync(d, {recursive: true, force: true})
  })

  it('sends only the new user text as the prompt, never a duplicated "Previous conversation" preamble', async () => {
    const promptFile = join(tmp(), 'prompt.txt')
    const kit = await createTestkit(
      claude,
      bootCoreApp({fakeClaude: {env: () => ({CONCIV_TEST_PROMPT_FILE: promptFile})}}),
    ).setup()
    state.kit = kit
    const sessionId = await kit.session()
    await runTurn(kit, 'Explain this page', sessionId)
    const sentPrompt = readFileSync(promptFile, 'utf8')
    expect(sentPrompt).not.toContain('Previous conversation:')
    expect(sentPrompt.trim()).toBe('Explain this page')
  })
})
