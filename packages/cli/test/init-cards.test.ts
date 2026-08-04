import {describe, expect, it} from 'vitest'
import {renderCard} from '../src/init/cards.js'
import {renderOutro} from '../src/init/outro.js'
import type {LedgerEntry} from '../src/init/pipeline.js'

describe('renderCard', () => {
  it('renders a bordered box with title, body, and fenced snippet', () => {
    const rendered = renderCard({
      title: 'Wire vite manually',
      body: 'Add the conciv plugin to vite.config.ts',
      snippet: "import conciv from '@conciv/it/plugin/vite'",
    })
    expect(rendered).toContain('Wire vite manually')
    expect(rendered).toContain('Add the conciv plugin to vite.config.ts')
    expect(rendered).toContain("import conciv from '@conciv/it/plugin/vite'")
    expect(rendered).toContain('```')
    expect(rendered).toContain('┌')
    expect(rendered).toContain('└')
  })
  it('renders multi-line bodies line by line inside the border', () => {
    const rendered = renderCard({title: 'Two lines', body: 'first line\nsecond line'})
    expect(rendered).toContain('first line')
    expect(rendered).toContain('second line')
    expect(rendered).not.toContain('first line\nsecond line')
  })
  it('omits the fence when the card has no snippet', () => {
    const rendered = renderCard({title: 'Plain', body: 'No snippet here'})
    expect(rendered).not.toContain('```')
  })
})

describe('renderOutro', () => {
  it('groups statuses with counts, prints every card body, then next steps', () => {
    const entries: LedgerEntry[] = [
      {id: 'install', title: 'Install @conciv/it', status: 'done', cards: []},
      {
        id: 'framework',
        title: 'Wire vite',
        status: 'manual',
        cards: [
          {title: 'First card', body: 'first card body'},
          {title: 'Second card', body: 'second card body'},
        ],
      },
      {id: 'agents', title: 'Teach harnesses', status: 'skipped', cards: []},
    ]
    const rendered = renderOutro(entries, ['pnpm dev', 'ask your agent to run conciv tools --help'])
    expect(rendered).toContain('1 done')
    expect(rendered).toContain('1 manual')
    expect(rendered).toContain('1 skipped')
    expect(rendered).toContain('first card body')
    expect(rendered).toContain('second card body')
    expect(rendered).toContain('Next steps:')
    expect(rendered).toContain('pnpm dev')
    expect(rendered).toContain('ask your agent to run conciv tools --help')
  })
  it('omits status groups with no entries and next steps when empty', () => {
    const entries: LedgerEntry[] = [{id: 'install', title: 'Install @conciv/it', status: 'already', cards: []}]
    const rendered = renderOutro(entries, [])
    expect(rendered).toContain('1 already')
    expect(rendered).not.toContain('done')
    expect(rendered).not.toContain('Next steps:')
  })
})
