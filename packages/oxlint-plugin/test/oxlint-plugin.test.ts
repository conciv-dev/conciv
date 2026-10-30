import {describe, expect, test} from 'vitest'
import {lintDiagnostics, lintFix, isRecord} from './run-lint.js'

describe('lucide per icon', () => {
  async function lintFixture(fixture: string): Promise<string[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc-lucide-per-icon.json', `test/fixtures/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(lucide-per-icon)')
      .map((diagnostic) => String(diagnostic.message))
  }

  describe('lucide-per-icon', () => {
    test('flags a barrel value import', async () => {
      const findings = await lintFixture('lucide-per-icon/barrel-value-import.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('lucide-solid/icons/arrow-up')
    })

    test('flags a barrel import mixed with a type-only name', async () => {
      const findings = await lintFixture('lucide-per-icon/mixed-value-and-type.tsx')
      expect(findings).toHaveLength(1)
    })

    test('reports an unresolvable legacy alias without promising a fix', async () => {
      const findings = await lintFixture('lucide-per-icon/unresolvable-legacy-alias.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('MoreHorizontal')
      expect(findings[0]).toContain('more-horizontal')
    })

    test('leaves a type-only barrel import alone', async () => {
      expect(await lintFixture('lucide-per-icon/type-only-import.tsx')).toEqual([])
    })

    test('leaves an already-converted per-icon import alone', async () => {
      expect(await lintFixture('lucide-per-icon/already-per-icon.tsx')).toEqual([])
    })

    test('autofix rewrites a plain value import to its per-icon entry point', async () => {
      const fixed = await lintFix(
        'test/oxlintrc-lucide-per-icon.json',
        'test/fixtures/lucide-per-icon/barrel-value-import.tsx',
      )
      expect(fixed).toContain("import ArrowUp from 'lucide-solid/icons/arrow-up'")
      expect(fixed).toContain("import Close from 'lucide-solid/icons/x'")
      expect(fixed).not.toContain("from 'lucide-solid'\n")
    })

    test('autofix keeps type-only names in a separate type import', async () => {
      const fixed = await lintFix(
        'test/oxlintrc-lucide-per-icon.json',
        'test/fixtures/lucide-per-icon/mixed-value-and-type.tsx',
      )
      expect(fixed).toContain("import Circle from 'lucide-solid/icons/circle'")
      expect(fixed).toContain("import type {LucideIcon} from 'lucide-solid'")
    })

    test('autofix leaves an unresolvable legacy alias untouched', async () => {
      const fixed = await lintFix(
        'test/oxlintrc-lucide-per-icon.json',
        'test/fixtures/lucide-per-icon/unresolvable-legacy-alias.tsx',
      )
      expect(fixed).toContain("import {MoreHorizontal} from 'lucide-solid'")
    })
  })
})

describe('no signal ref', () => {
  async function lintFixture(fixture: string) {
    const diagnostics = await lintDiagnostics('test/oxlintrc-signal-ref.json', `test/fixtures/signal-ref/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(no-signal-ref)')
      .map((diagnostic) => String(diagnostic.message))
  }

  describe('conciv/no-signal-ref', () => {
    test('flags a signal whose getter is only read inside a named JSX-handler-only function', async () => {
      const findings = await lintFixture('handler-only-ref.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('box')
      expect(findings[0]).toContain('setBox')
      expect(findings[0]).toContain('let box')
    })

    test('flags a signal whose getter is only read inside an inline JSX event handler', async () => {
      const findings = await lintFixture('inline-handler-ref.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('box')
    })

    test('leaves a signal alone when the getter is read inside createEffect', async () => {
      expect(await lintFixture('tracked-effect-ref.tsx')).toEqual([])
    })

    test('leaves a signal alone when the getter is passed bare to a primitive', async () => {
      expect(await lintFixture('primitive-passed-ref.tsx')).toEqual([])
    })
  })
})

describe('router idioms', () => {
  type Finding = {message: string; line: number}

  function firstLine(diagnostic: Record<string, unknown>): number {
    const labels = diagnostic.labels
    if (!Array.isArray(labels)) return 0
    const [label] = labels
    if (!isRecord(label) || !isRecord(label.span) || typeof label.span.line !== 'number') return 0
    return label.span.line
  }

  async function lintFixture(fixture: string): Promise<Finding[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc.json', `test/fixtures/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(router-idioms)')
      .map((diagnostic) => ({message: String(diagnostic.message), line: firstLine(diagnostic)}))
  }

  describe('bare router hooks in route files', () => {
    test('flags every bare route-scoped hook imported from @tanstack/react-router', async () => {
      const findings = await lintFixture('src/routes/bare-hooks.tsx')
      expect(findings.map((finding) => finding.message)).toEqual([
        expect.stringContaining('useNavigate'),
        expect.stringContaining('useSearch'),
      ])
      expect(findings[0]?.message).toContain('getRouteApi')
    })

    test('accepts route-scoped access through getRouteApi', async () => {
      expect(await lintFixture('src/routes/route-scoped.tsx')).toEqual([])
    })

    test('leaves shared components outside src/routes alone', async () => {
      expect(await lintFixture('src/components/shared-search.tsx')).toEqual([])
    })
  })

  describe('useRouterState matches mining', () => {
    test('flags a select body that reads .matches', async () => {
      const findings = await lintFixture('src/components/matches-mining.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]?.message).toContain('matchRoutes')
      expect(findings[0]?.line).toBe(4)
    })
  })

  describe('validateSearch schemas', () => {
    test('flags an inline field that cannot fall back', async () => {
      const findings = await lintFixture('src/routes/inline-search.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]?.message).toContain('page')
      expect(findings[0]?.message).toContain('.catch(')
    })

    test('reports a locally declared schema once, not once per reference', async () => {
      const findings = await lintFixture('src/routes/local-schema.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]?.message).toContain('page')
    })

    test('checks search schemas declared outside src/routes', async () => {
      const findings = await lintFixture('src/lib/loose-search-schemas.ts')
      expect(findings).toHaveLength(1)
      expect(findings[0]?.message).toContain('token')
    })

    test('accepts fields that carry .catch()', async () => {
      expect(await lintFixture('src/lib/search-schemas.ts')).toEqual([])
    })
  })
})

describe('solid test render', () => {
  async function lintFixture(fixture: string): Promise<string[]> {
    const diagnostics = await lintDiagnostics(
      'test/oxlintrc-solid-test-render.json',
      `test/fixtures/solid-test-render/${fixture}`,
    )
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(solid-test-render)')
      .map((diagnostic) => String(diagnostic.message))
  }

  async function lintOutsideFixture(fixture: string): Promise<string[]> {
    const diagnostics = await lintDiagnostics(
      'test/oxlintrc-solid-test-render.json',
      `fixtures/solid-test-render-outside/${fixture}`,
    )
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(solid-test-render)')
      .map((diagnostic) => String(diagnostic.message))
  }

  describe('solid-test-render', () => {
    test('flags render imported from solid-js/web in a test file', async () => {
      const findings = await lintFixture('render-violation.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('render')
      expect(findings[0]).toContain('@solidjs/testing-library')
    })

    test('flags hydrate imported from solid-js/web in a test file', async () => {
      const findings = await lintFixture('hydrate-violation.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('hydrate')
    })

    test('leaves render imported from @solidjs/testing-library alone', async () => {
      expect(await lintFixture('clean-testing-library.tsx')).toEqual([])
    })

    test('leaves an unrelated solid-js/web import alone', async () => {
      expect(await lintFixture('unrelated-import.tsx')).toEqual([])
    })

    test('exempts the app fixture that boots a host under test/fixtures', async () => {
      expect(await lintFixture('test/fixtures/host/main.tsx')).toEqual([])
    })

    test('flags render imported from solid-js/web in a .spec.tsx file outside a test directory', async () => {
      const findings = await lintOutsideFixture('spec-violation.spec.tsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('render')
    })

    test('flags render imported from solid-js/web in a .test.jsx file outside a test directory', async () => {
      const findings = await lintOutsideFixture('jsx-violation.test.jsx')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toContain('render')
    })
  })
})

describe('tool card shell', () => {
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

    test('leaves a CollapsibleCard import from an unrelated package alone', async () => {
      expect(await lintFixture('packages/ui-kit-chat-tools/src/styled/tools/unrelated-collapsible.tsx')).toEqual([])
    })

    test('accepts CollapsibleCard imports inside the kit itself', async () => {
      expect(await lintFixture('packages/ui-kit-chat/src/tools/styled/consumer.tsx')).toEqual([])
    })

    test('accepts CollapsibleCard imports from chat-domain components inside ui-kit-chat', async () => {
      expect(await lintFixture('packages/ui-kit-chat/src/styled/reasoning.tsx')).toEqual([])
    })
  })
})

describe('vocabulary', () => {
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
})

describe('wait rules', () => {
  type Finding = {code: string; message: string}

  async function lintFixture(fixture: string): Promise<Finding[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc-waits.json', `test/fixtures/waits/${fixture}`)
    return diagnostics.map((diagnostic) => ({code: String(diagnostic.code), message: String(diagnostic.message)}))
  }

  describe('conciv/no-timers-in-tests', () => {
    test('flags every timer a test schedules for itself', async () => {
      const reported = (await lintFixture('timers-fixture.ts')).filter(
        (finding) => finding.code === 'conciv(no-timers-in-tests)',
      )
      expect(reported).toHaveLength(3)
      expect(reported.map((finding) => finding.message.split(' ')[0])).toEqual([
        'setTimeout',
        'setInterval',
        'setImmediate',
      ])
      expect(reported[0]?.message).toContain('Await the async surface')
    })

    test('leaves a wait that awaits a registered callback alone', async () => {
      const reported = (await lintFixture('honest-fixture.ts')).filter(
        (finding) => finding.code === 'conciv(no-timers-in-tests)',
      )
      expect(reported).toEqual([])
    })
  })

  describe('conciv/no-predicate-waits', () => {
    test('flags exported functions and types that take a boolean-returning callback', async () => {
      const reported = (await lintFixture('testkit-fixture.ts')).filter(
        (finding) => finding.code === 'conciv(no-predicate-waits)',
      )
      expect(reported).toHaveLength(2)
      expect(reported[0]?.message).toContain('turns an assertion into a wait')
    })

    test('leaves value-returning waits and unexported predicates alone', async () => {
      const reported = (await lintFixture('honest-fixture.ts')).filter(
        (finding) => finding.code === 'conciv(no-predicate-waits)',
      )
      expect(reported).toEqual([])
    })
  })
})
