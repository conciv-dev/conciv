import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessId} from '../../harness-detect.js'
import {captureFile} from '../../interrupt.js'
import type {ManualCard} from '../../ledger.js'
import type {InitContext, InitStep} from '../../pipeline.js'

const startMarker = '<!-- conciv:start -->'
const endMarker = '<!-- conciv:end -->'

export function agentsSection(consented: HarnessId[]): string {
  const setUpFor = consented.length > 0 ? ['', `Set up for: ${consented.join(', ')}.`] : []
  return [
    startMarker,
    '',
    '## conciv',
    '',
    'conciv connects coding agents to the app running in the browser.',
    '',
    'Run `conciv tools --help` to discover every command. The CLI finds the running dev server itself: no config, no addresses.',
    '',
    '- `conciv tools page` - read and drive the live page; `--help` lists every capability',
    '- `conciv tools react` - inspect and edit live React components',
    '- `conciv tools server` - inspect and nudge the dev server; `--help` lists every capability',
    '',
    'These commands need the dev server running.',
    ...setUpFor,
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

function currentSpan(file: string): string | null {
  if (!existsSync(file)) return null
  const content = readFileSync(file, 'utf8')
  const span = markerSpan(content)
  if (span.kind !== 'block') return null
  return content.slice(span.start, span.end)
}

function upsertSection(file: string, section: string): void {
  if (!existsSync(file)) {
    writeFileSync(file, `${section}\n`)
    return
  }
  const content = readFileSync(file, 'utf8')
  const span = markerSpan(content)
  if (span.kind === 'mismatched') return
  if (span.kind === 'absent') {
    const separator = content.endsWith('\n') ? '\n' : '\n\n'
    writeFileSync(file, `${content}${separator}${section}\n`)
    return
  }
  writeFileSync(file, `${content.slice(0, span.start)}${section}${content.slice(span.end)}`)
}

function mismatchedTargets(cwd: string): string[] {
  return targets(cwd).filter((file) => existsSync(file) && markerSpan(readFileSync(file, 'utf8')).kind === 'mismatched')
}

function targets(cwd: string): string[] {
  const agentsFile = join(cwd, 'AGENTS.md')
  const claudeFile = join(cwd, 'CLAUDE.md')
  if (existsSync(claudeFile)) return [agentsFile, claudeFile]
  return [agentsFile]
}

function sectionCurrent(cwd: string, section: string): boolean {
  return targets(cwd).every((file) => currentSpan(file) === section)
}

export function agentsMdStep(consented: () => HarnessId[]): InitStep {
  const detect = async (ctx: InitContext): Promise<'missing' | 'present'> =>
    sectionCurrent(ctx.cwd, agentsSection(consented())) ? 'present' : 'missing'
  return {
    id: 'agents',
    title: 'Teach agents the conciv CLI',
    running: 'Teaching agents the conciv CLI…',
    completed: 'Wrote the conciv section to AGENTS.md',
    detect,
    plan: async (ctx) => ({
      summary: 'add a marked conciv section to AGENTS.md teaching the conciv tools CLI',
      wouldEdit: targets(ctx.cwd).map((file) => file.slice(ctx.cwd.length + 1)),
    }),
    apply: async (ctx) => {
      const mismatched = mismatchedTargets(ctx.cwd)
      if (mismatched.length > 0) {
        return {
          status: 'manual',
          cards: [manualCard(consented())],
          detail: `${mismatched.map((file) => file.slice(ctx.cwd.length + 1)).join(', ')} has unpaired conciv markers`,
        }
      }
      const section = agentsSection(consented())
      for (const file of targets(ctx.cwd)) {
        ctx.backup(captureFile(file))
        upsertSection(file, section)
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
