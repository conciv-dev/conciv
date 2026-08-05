import {describe, expect, it} from 'vitest'
import type {LedgerEntry} from '../src/init/ledger.js'
import {emitOutro} from '../src/init/outro.js'
import {recorderOutput} from './support/init-output.js'

const nextSteps = ['start your app: pnpm dev', 'ask your agent to run conciv tools --help']

function emitted(entries: LedgerEntry[], next: string[] = nextSteps): string[] {
  const events: string[] = []
  emitOutro(recorderOutput(events), entries, next)
  return events
}

describe('emitOutro', () => {
  it('emits every manual card as a note carrying its title, body, and snippet', () => {
    const events = emitted([
      {id: 'install', title: 'Install @conciv/it', status: 'done', cards: []},
      {
        id: 'framework',
        title: 'Wire the vite config',
        status: 'manual',
        cards: [
          {title: 'Wire the conciv vite plugin', body: 'add the plugin yourself', snippet: "import conciv from 'x'"},
          {title: 'Inject the widget', body: 'serve the bundle'},
        ],
      },
    ])
    expect(events).toContain("note:Wire the conciv vite plugin:add the plugin yourself\n\nimport conciv from 'x'")
    expect(events).toContain('note:Inject the widget:serve the bundle')
    expect(events.join('\n')).not.toMatch(/[┌└│]/)
  })

  it('warns the summary and points at the docs in the outro when a card printed', () => {
    const events = emitted([
      {id: 'install', title: 'Install @conciv/it', status: 'done', cards: []},
      {id: 'agents', title: 'Teach agents', status: 'done', cards: []},
      {
        id: 'framework',
        title: 'Wire the vite config',
        status: 'manual',
        cards: [{title: 'Wire it', body: 'by hand'}],
      },
      {id: 'claude', title: 'Install the conciv claude plugin', status: 'skipped', cards: []},
    ])
    expect(events).toContain('warn:2 wired · 1 manual step below · 1 skipped')
    const outro = events.filter((event) => event.startsWith('outro:'))
    expect(outro).toHaveLength(1)
    expect(outro[0]).toContain('pnpm dev')
    expect(outro[0]).toContain('conciv tools --help')
    expect(outro[0]).toContain('https://conciv.dev/docs/quick-start')
  })

  it('reports success with no docs link when nothing needs a manual step', () => {
    const events = emitted([{id: 'install', title: 'Install @conciv/it', status: 'done', cards: []}])
    expect(events).toContain('success:1 wired')
    expect(events.some((event) => event.startsWith('warn:'))).toBe(false)
    const outro = events.filter((event) => event.startsWith('outro:'))
    expect(outro[0]).toContain('pnpm dev')
    expect(outro[0]).not.toContain('https://conciv.dev/docs/quick-start')
  })

  it('says every step was already wired on a re-run', () => {
    const events = emitted([
      {id: 'install', title: 'Install @conciv/it', status: 'already', cards: []},
      {id: 'framework', title: 'Wire the vite config', status: 'already', cards: []},
    ])
    expect(events).toContain('success:2 already wired')
  })

  it('pluralises manual steps and drops next steps when there are none', () => {
    const events = emitted(
      [
        {id: 'framework', title: 'Wire the vite config', status: 'manual', cards: [{title: 'a', body: 'b'}]},
        {id: 'claude', title: 'Install the conciv claude plugin', status: 'manual', cards: [{title: 'c', body: 'd'}]},
      ],
      [],
    )
    expect(events).toContain('warn:2 manual steps below')
    expect(events.filter((event) => event.startsWith('outro:'))).toHaveLength(1)
  })
})
