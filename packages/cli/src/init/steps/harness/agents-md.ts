import {writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {CONCIV_BIN, CONCIV_COMMAND_GUIDE, CONCIV_RANKING_SENTENCE} from '@conciv/harness-init/agent-guide'
import {harnessAgentsMdNote, type HarnessId} from '../../harness-detect.js'
import {captureFile, pathExists, readOptionalText} from '../../interrupt.js'
import type {ManualCard} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'

const startMarker = '<!-- conciv:start -->'
const endMarker = '<!-- conciv:end -->'

export function agentsSection(consented: HarnessId[]): string {
  const setUpFor =
    consented.length > 0
      ? ['', `Set up for: ${consented.join(', ')}.`]
      : ['', 'No harness was connected; install one and re-run `npx @conciv/cli@latest init` to finish setup.']
  const notes = consented.flatMap((id) => {
    const note = harnessAgentsMdNote(id)
    return note === undefined ? [] : ['', note]
  })
  return [
    startMarker,
    '',
    '## conciv',
    '',
    CONCIV_RANKING_SENTENCE,
    '',
    CONCIV_COMMAND_GUIDE,
    '',
    `Run \`${CONCIV_BIN} tools --help\` for every command. Every command needs the project's conciv dev server running; it puts \`${CONCIV_BIN}\` in place when it starts.`,
    '',
    '### MCP sandbox',
    '',
    'conciv is also connected via MCP. Capabilities are discovered with the `discover_tools` tool, never a static list.',
    ...setUpFor,
    ...notes,
    '',
    endMarker,
  ].join('\n')
}

type MarkerSpan = {kind: 'absent'} | {kind: 'block'; start: number; end: number} | {kind: 'mismatched'}

function occurrences(content: string, marker: string): number {
  return content.split(marker).length - 1
}

function markerSpan(content: string): MarkerSpan {
  const starts = occurrences(content, startMarker)
  const ends = occurrences(content, endMarker)
  if (starts === 0 && ends === 0) return {kind: 'absent'}
  if (starts !== 1 || ends !== 1) return {kind: 'mismatched'}
  const start = content.indexOf(startMarker)
  const end = content.indexOf(endMarker)
  if (end < start) return {kind: 'mismatched'}
  return {kind: 'block', start, end: end + endMarker.length}
}

async function currentSpan(file: string): Promise<string | null> {
  const content = await readOptionalText(file)
  if (content === null) return null
  const span = markerSpan(content)
  if (span.kind !== 'block') return null
  return content.slice(span.start, span.end)
}

async function upsertSection(file: string, section: string): Promise<void> {
  const content = await readOptionalText(file)
  if (content === null) {
    await writeFile(file, `${section}\n`)
    return
  }
  const span = markerSpan(content)
  if (span.kind === 'mismatched') return
  if (span.kind === 'absent') {
    const separator = content.endsWith('\n') ? '\n' : '\n\n'
    await writeFile(file, `${content}${separator}${section}\n`)
    return
  }
  await writeFile(file, `${content.slice(0, span.start)}${section}${content.slice(span.end)}`)
}

async function mismatchedTargets(cwd: string): Promise<string[]> {
  const found = await Promise.all(
    (await targets(cwd)).map(async (file) => {
      const content = await readOptionalText(file)
      return content !== null && markerSpan(content).kind === 'mismatched' ? file : null
    }),
  )
  return found.filter((file) => file !== null)
}

const CLAUDE_IMPORT = '@AGENTS.md'

function resolveClaudeFile(cwd: string): string {
  return join(cwd, 'CLAUDE.md')
}

function importsAgents(content: string): boolean {
  return content.split('\n').some((line) => line.trim() === CLAUDE_IMPORT)
}

async function targets(cwd: string): Promise<string[]> {
  const agentsFile = join(cwd, 'AGENTS.md')
  const claudeFile = resolveClaudeFile(cwd)
  const claude = await readOptionalText(claudeFile)
  if (claude !== null && !importsAgents(claude)) return [agentsFile, claudeFile]
  return [agentsFile]
}

async function needsClaudeImport(cwd: string, consented: HarnessId[]): Promise<boolean> {
  return consented.includes('claude') && !(await pathExists(resolveClaudeFile(cwd)))
}

async function sectionCurrent(cwd: string, section: string, consented: HarnessId[]): Promise<boolean> {
  if (await needsClaudeImport(cwd, consented)) return false
  const spans = await Promise.all((await targets(cwd)).map(currentSpan))
  return spans.every((span) => span === section)
}

async function wouldEdit(cwd: string, consented: HarnessId[]): Promise<string[]> {
  const found = await targets(cwd)
  const files = (await needsClaudeImport(cwd, consented)) ? [...found, resolveClaudeFile(cwd)] : found
  return files.map((file) => file.slice(cwd.length + 1))
}

export function agentsMdStep(consented: () => HarnessId[]): InitStep {
  const detect = async (ctx: InitContext): Promise<'missing' | 'present'> =>
    (await sectionCurrent(ctx.cwd, agentsSection(consented()), consented())) ? 'present' : 'missing'
  return {
    id: 'agents',
    title: 'Teach agents the conciv CLI',
    running: 'Teaching agents the conciv CLI…',
    completed: 'Wrote the conciv section to AGENTS.md',
    detect,
    plan: async (ctx) => ({
      summary: 'add a marked conciv section to AGENTS.md teaching the conciv tools CLI',
      wouldEdit: await wouldEdit(ctx.cwd, consented()),
    }),
    apply: async (ctx) => {
      const mismatched = await mismatchedTargets(ctx.cwd)
      if (mismatched.length > 0) {
        return {
          status: 'manual',
          cards: [manualCard(consented())],
          detail: `${mismatched.map((file) => file.slice(ctx.cwd.length + 1)).join(', ')} has unpaired conciv markers`,
        }
      }
      const section = agentsSection(consented())
      for (const file of await targets(ctx.cwd)) {
        ctx.backup(await captureFile(file))
        await upsertSection(file, section)
      }
      if (await needsClaudeImport(ctx.cwd, consented())) {
        const claudeFile = resolveClaudeFile(ctx.cwd)
        ctx.backup(await captureFile(claudeFile))
        await writeFile(claudeFile, `${CLAUDE_IMPORT}\n`)
      }
      return {status: 'done'}
    },
    verify: async (ctx) => (await detect(ctx)) === 'present',
    manualCard: () => manualCard(consented()),
  }
}

function manualCard(consented: HarnessId[]): ManualCard {
  return {
    title: 'Teach your agents the conciv CLI',
    body: 'Paste this section into AGENTS.md (and CLAUDE.md if you keep one). Full steps: https://conciv.dev/docs/quick-start/agents',
    snippet: agentsSection(consented),
  }
}
