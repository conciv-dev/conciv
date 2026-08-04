import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import type {HarnessId} from '../../harness-detect.js'
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
    '- `conciv tools page` — read and drive the live page: snapshot, click, fill, edit, eval',
    '- `conciv tools react` — inspect and edit live React components',
    '- `conciv tools server` — inspect and nudge the dev server: config, urls, resolve, reload',
    '',
    'These commands need the dev server running.',
    ...setUpFor,
    '',
    endMarker,
  ].join('\n')
}

function currentSpan(file: string): string | null {
  if (!existsSync(file)) return null
  const content = readFileSync(file, 'utf8')
  const start = content.indexOf(startMarker)
  if (start === -1) return null
  const end = content.indexOf(endMarker, start)
  if (end === -1) return null
  return content.slice(start, end + endMarker.length)
}

function upsertSection(file: string, section: string): void {
  if (!existsSync(file)) {
    writeFileSync(file, `${section}\n`)
    return
  }
  const content = readFileSync(file, 'utf8')
  const start = content.indexOf(startMarker)
  const end = start === -1 ? -1 : content.indexOf(endMarker, start)
  if (start === -1 || end === -1) {
    const separator = content.endsWith('\n') ? '\n' : '\n\n'
    writeFileSync(file, `${content}${separator}${section}\n`)
    return
  }
  writeFileSync(file, `${content.slice(0, start)}${section}${content.slice(end + endMarker.length)}`)
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
      const section = agentsSection(consented())
      for (const file of targets(ctx.cwd)) {
        upsertSection(file, section)
      }
      return {status: 'done'}
    },
    verify: async (ctx) => (await detect(ctx)) === 'present',
    manualCard: () => ({
      title: 'Teach your agents the conciv CLI',
      body: 'Paste this section into AGENTS.md (and CLAUDE.md if you keep one). Full steps: https://conciv.dev/docs/quick-start/agents',
      snippet: agentsSection(consented()),
    }),
  }
}
