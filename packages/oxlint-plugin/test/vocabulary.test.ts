import {describe, expect, test} from 'vitest'
import {lintDiagnostics} from './run-lint.js'

type Finding = {message: string}

async function lintFixture(fixture: string, code: string): Promise<Finding[]> {
  const diagnostics = await lintDiagnostics('test/oxlintrc-vocabulary.json', `test/fixtures/${fixture}`)
  return diagnostics
    .filter((diagnostic) => diagnostic.code === code)
    .map((diagnostic) => ({
      message: String(diagnostic.message),
    }))
}

function flaggedNames(findings: Finding[]): string[] {
  return findings.flatMap((finding) => {
    const match = finding.message.match(/^'([^']+)'/)
    return match?.[1] === undefined ? [] : [match[1]]
  })
}

describe('banned-vocabulary', () => {
  test('flags every declaration carrying a banned rewrite term', async () => {
    const findings = await lintFixture('vocabulary/violations.ts', 'conciv(banned-vocabulary)')
    expect(flaggedNames(findings).toSorted()).toEqual(
      [
        'holdAndFlushQueue',
        'SnapshotKey',
        'runEpoch',
        'adoptSession',
        'sessionManager',
        'sendWhenAvailable',
        'forceSendNow',
        'externalRevCounter',
        'presenceFlag',
        'attach',
        'vetoResult',
        'bridgeToServer',
        'pipelineStage',
        'maintenanceWindow',
      ].toSorted(),
    )
  })

  test('leaves attachment, adoption, and BundlerBridge vocabulary alone', async () => {
    expect(await lintFixture('vocabulary/allowed.ts', 'conciv(banned-vocabulary)')).toEqual([])
  })

  test('allows the bridge option field in the whitelisted core files but still flags other terms there', async () => {
    const findings = await lintFixture('vocabulary/packages/core/src/app.ts', 'conciv(banned-vocabulary)')
    expect(flaggedNames(findings)).toEqual(['epochCount'])
  })

  test('exempts the pre-existing claude bridge module entirely', async () => {
    expect(
      await lintFixture('vocabulary/packages/harness-init/src/claude/bridge.ts', 'conciv(banned-vocabulary)'),
    ).toEqual([])
  })
})

describe('core-purity', () => {
  test('flags terminal and verdict vocabulary where the rule is enabled', async () => {
    const findings = await lintFixture('core-purity/impure.ts', 'conciv(core-purity)')
    expect(flaggedNames(findings).toSorted()).toEqual(['terminalPane', 'verdict'].toSorted())
  })

  test('accepts purity-clean declarations including attachment vocabulary', async () => {
    expect(await lintFixture('core-purity/pure.ts', 'conciv(core-purity)')).toEqual([])
  })
})
