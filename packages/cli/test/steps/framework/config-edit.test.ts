import {mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {stripVTControlCharacters} from 'node:util'
import {describe, expect, it} from 'vitest'
import {writeConfigChange} from '../../../src/init/steps/framework/config-edit.js'
import {stepContext} from './step-context.js'

function renderChange(before: string, after: string): string {
  const cwd = mkdtempSync(join(tmpdir(), 'conciv-config-edit-'))
  const path = join(cwd, 'vite.config.ts')
  writeFileSync(path, before)
  const {notes, ctx} = stepContext(cwd)
  writeConfigChange(ctx, {name: 'vite.config.ts', path, content: before}, after)
  expect(notes.map((note) => note.title)).toEqual(['vite.config.ts'])
  return stripVTControlCharacters(notes.map((note) => note.body).join('\n'))
}

const middle = Array.from({length: 20}, (value, index) => `const middle${index} = ${index}`).join('\n')

const before = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
${middle}
export default defineConfig({
  plugins: [react()],
})
`

const after = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
${middle}
export default defineConfig({
  plugins: [react(), conciv()],
})
`

describe('writeConfigChange diff rendering', () => {
  it('renders two disjoint edits as two small hunks with context, never the whole file', () => {
    const rendered = renderChange(before, after)
    const hunkHeaders = rendered.split('\n').filter((line) => line.startsWith('@@'))
    expect(hunkHeaders).toHaveLength(2)
    expect(rendered).not.toContain('const middle9 = 9')
    expect(rendered).toContain("+import conciv from '@conciv/it/plugin/vite'")
    expect(rendered).toContain('-  plugins: [react()],')
    expect(rendered).toContain('+  plugins: [react(), conciv()],')
  })

  it('renders an insertion-only change as one hunk of at most inserted plus context lines', () => {
    const inserted = `import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import conciv from '@conciv/it/plugin/vite'
${middle}
export default defineConfig({
  plugins: [react()],
})
`
    const rendered = renderChange(before, inserted)
    const bodyLines = rendered.split('\n').filter((line) => !line.startsWith('---') && !line.startsWith('+++'))
    const hunkHeaders = bodyLines.filter((line) => line.startsWith('@@'))
    expect(hunkHeaders).toHaveLength(1)
    expect(bodyLines.length).toBeLessThanOrEqual(6)
    expect(bodyLines).toContain(" import react from '@vitejs/plugin-react'")
    expect(rendered).not.toContain('const middle9 = 9')
    expect(rendered).not.toContain('export default defineConfig({')
  })

  it('keeps the filename header lines', () => {
    const rendered = renderChange(before, after)
    expect(rendered).toContain('--- vite.config.ts')
    expect(rendered).toContain('+++ vite.config.ts')
  })
})
