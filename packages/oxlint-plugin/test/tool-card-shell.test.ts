import {describe, expect, test} from 'vitest'
import {lintDiagnostics} from './run-lint.js'

async function lintFixture(fixture: string): Promise<string[]> {
  const diagnostics = await lintDiagnostics('test/oxlintrc-tool-card-shell.json', `test/fixtures/${fixture}`)
  return diagnostics
    .filter((diagnostic) => diagnostic.code === 'conciv(tool-card-shell)')
    .map((diagnostic) => String(diagnostic.message))
}

describe('tool-card-shell', () => {
  test('flags a CollapsibleCard import from outside @conciv/ui-kit-chat', async () => {
    const findings = await lintFixture('packages/ui-kit-chat-tools/src/styled/tools/bash.tsx')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toContain('CollapsibleCard')
    expect(findings[0]).toContain('CardShell')
  })

  test('leaves an unrelated import from the same forbidden package alone', async () => {
    expect(await lintFixture('packages/ui-kit-chat-tools/src/styled/tools/other-import.tsx')).toEqual([])
  })

  test('accepts CollapsibleCard imports inside the kit itself', async () => {
    expect(await lintFixture('packages/ui-kit-chat/src/tools/styled/consumer.tsx')).toEqual([])
  })

  test('accepts CollapsibleCard imports from chat-domain components inside ui-kit-chat', async () => {
    expect(await lintFixture('packages/ui-kit-chat/src/styled/reasoning.tsx')).toEqual([])
  })
})
