import {describe, expect, test} from 'vitest'
import {lintDiagnostics, lintFix, isRecord} from './run-lint.js'

function firstLine(diagnostic: Record<string, unknown>): number {
  const labels = diagnostic.labels
  if (!Array.isArray(labels)) return 0
  const [label] = labels
  if (!isRecord(label) || !isRecord(label.span) || typeof label.span.line !== 'number') return 0
  return label.span.line
}

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

describe('plugin view reads through query', () => {
  type Finding = {message: string; line: number}

  async function lintFixture(fixture: string): Promise<Finding[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc.json', `test/fixtures/plugin-view/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(plugin-view-reads-through-query)')
      .map((diagnostic) => ({message: String(diagnostic.message), line: firstLine(diagnostic)}))
  }

  test.each([
    {
      fixture: 'plain-calls.tsx',
      reason: 'createResource, a destructured client, and every plain method call on a client held, made or returned',
      lines: [1, 9, 10, 11, 12, 13],
      messages: [
        expect.stringContaining('never uses createResource'),
        expect.stringContaining("'search'"),
        expect.stringContaining('takes methods out of an rpc client'),
        expect.stringContaining("'save'"),
        expect.stringContaining("'items.list'"),
        expect.stringContaining("'reset'"),
      ],
    },
    {
      fixture: 'raw-calls.tsx',
      reason: 'the raw plugin.call wire, on the client held or read, and through rpc.call',
      lines: [6, 7, 8],
      messages: [
        expect.stringContaining('raw plugin call'),
        expect.stringContaining('raw plugin call'),
        expect.stringContaining('raw plugin call'),
      ],
    },
    {
      fixture: 'aliased-methods.tsx',
      reason: 'a method read into a name or destructured, then called',
      lines: [8, 9, 10, 11],
      messages: [
        expect.stringContaining('takes methods out of an rpc client'),
        expect.stringContaining("'search'"),
        expect.stringContaining("'save'"),
        expect.stringContaining("'reset'"),
      ],
    },
    {
      fixture: 'namespace-solid.tsx',
      reason: 'createResource through a solid-js namespace import or a renamed import',
      lines: [2, 5],
      messages: [
        expect.stringContaining('never uses createResource'),
        expect.stringContaining('never uses createResource'),
      ],
    },
    {
      fixture: 'query-reads.tsx',
      reason: 'nothing in reads through queryOptions, writes through mutationOptions, and event invalidation by key',
      lines: [],
      messages: [],
    },
  ])('flags $reason ($fixture)', async ({fixture, lines, messages}) => {
    const findings = await lintFixture(fixture)
    expect(findings.map((finding) => finding.line)).toEqual(lines)
    expect(findings.map((finding) => finding.message)).toEqual(messages)
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

describe('no delegated focus', () => {
  async function lintFixture(fixture: string): Promise<string[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc-delegated-focus.json', `test/fixtures/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(no-delegated-focus)')
      .map((diagnostic) => String(diagnostic.message))
  }

  test('flags every casing of a delegated focusin or focusout prop and names the direct listener', async () => {
    const findings = await lintFixture('delegated-focus/delegated.tsx')
    expect(findings).toHaveLength(3)
    expect(findings[0]).toContain('on:focusin')
    expect(findings[0]).toContain('nativeFocusPart')
  })

  test('leaves direct on:focusin, on:focusout, onFocus and onBlur alone', async () => {
    expect(await lintFixture('delegated-focus/native.tsx')).toEqual([])
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

  describe('no-of-suffix', () => {
    test('flags every declared name ending in Of, including types, members and parameters', async () => {
      const findings = await lintFixture('of-suffix/violations.ts', 'conciv(no-of-suffix)')
      expect(flaggedNames(findings).toSorted()).toEqual(
        ['approvalAskOf', 'modelOf', 'ConfigOf', 'harnessOf', 'parentOf'].toSorted(),
      )
    })

    test('leaves language built-ins, JSON Schema keywords and library calls alone', async () => {
      expect(await lintFixture('of-suffix/allowed.ts', 'conciv(no-of-suffix)')).toEqual([])
    })

    test('exempts the ported files, which keep the names of the code they were ported from', async () => {
      expect(await lintFixture('of-suffix/packages/plugin-host/src/copied.ts', 'conciv(no-of-suffix)')).toEqual([])
      expect(await lintFixture('of-suffix/packages/plugin/src/copied.ts', 'conciv(no-of-suffix)')).toEqual([])
      for (const folder of ['plugin', 'persistence']) {
        expect(
          await lintFixture(`of-suffix/apps/conciv/src/runtime/${folder}/copied.ts`, 'conciv(no-of-suffix)'),
        ).toEqual([])
      }
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

describe('test file budget', () => {
  type Finding = {message: string; filename: string}

  async function lintPackage(fixture: string): Promise<Finding[]> {
    const diagnostics = await lintDiagnostics(
      'test/oxlintrc-test-file-budget.json',
      `test/fixtures/test-file-budget/${fixture}`,
    )
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(test-file-budget)')
      .map((diagnostic) => ({message: String(diagnostic.message), filename: String(diagnostic.filename)}))
  }

  describe('conciv/test-file-budget', () => {
    test('leaves a package with one node file and one browser file alone', async () => {
      expect(await lintPackage('within')).toEqual([])
    })

    test('reports an over-budget package once, on its first test file', async () => {
      const findings = await lintPackage('over')
      expect(findings).toHaveLength(1)
      expect(findings[0]?.filename).toContain('over/src/stray.test.ts')
      expect(findings[0]?.message).toContain('test/fixtures/test-file-budget/over')
      expect(findings[0]?.message).toContain('3 test files')
      expect(findings[0]?.message).toContain('budget of 2')
      expect(findings[0]?.message).toContain('describe')
    })

    test('ignores test files under fixtures, host, and screenshot directories', async () => {
      expect(await lintPackage('ignored')).toEqual([])
    })

    test('honours a raised max from config', async () => {
      expect(await lintPackage('raised')).toEqual([])
    })
  })
})

describe('no comments', () => {
  async function lintFixture(fixture: string, config = 'test/oxlintrc-no-comments.json'): Promise<string[]> {
    const diagnostics = await lintDiagnostics(config, `test/fixtures/no-comments/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(no-comments)')
      .map((diagnostic) => String(diagnostic.message))
  }

  test('reports a plain comment', async () => {
    expect(await lintFixture('plain-comment.ts')).toHaveLength(1)
  })

  test('keeps a per-file @jsxImportSource pragma, which TypeScript and the bundler read', async () => {
    expect(await lintFixture('jsx-import-source.tsx')).toEqual([])
  })

  test('with keepDocComments keeps only a tagged doc comment directly above a declaration or member', async () => {
    expect(await lintFixture('doc-comments.ts', 'test/oxlintrc-no-comments-docs.json')).toHaveLength(6)
  })

  test('with keepDocComments the autofix keeps tagged blocks whole and deletes every other comment', async () => {
    const fixed = await lintFix('test/oxlintrc-no-comments-docs.json', 'test/fixtures/no-comments/doc-comments.ts')
    expect(fixed).toContain('Kept: prose inside a tagged block.')
    expect(fixed).toContain('@remarks Kept: a tagged block stays whole.')
    expect(fixed).toContain('/** @remarks Kept: a single-line tagged block above a member. */')
    expect(fixed).toContain('Kept: documents the function.')
    expect(fixed).toContain('@param shape Kept: the shape to measure.')
    expect(fixed).toContain('@returns Kept: the area.')
    expect(fixed).not.toContain('deleted')
    expect(fixed).not.toContain('Deleted')
  })

  test('without keepDocComments reports every doc comment too', async () => {
    expect(await lintFixture('doc-comments.ts')).toHaveLength(9)
  })
})

describe('no hand-made temp dir', () => {
  async function lintFixture(fixture: string): Promise<string[]> {
    const diagnostics = await lintDiagnostics('test/oxlintrc-temp-dir.json', `test/fixtures/${fixture}`)
    return diagnostics
      .filter((diagnostic) => diagnostic.code === 'conciv(no-hand-made-temp-dir)')
      .map((diagnostic) => String(diagnostic.message))
  }

  test('flags a temp folder a test makes under the OS temp dir by hand, and leaves the helpers alone', async () => {
    const findings = await lintFixture('temp-dir/hand-made.ts')
    expect(findings).toHaveLength(3)
    expect(findings[0]).toContain('tempDir(prefix)')
    expect(findings[0]).toContain('test-results/conciv-home')
    expect(await lintFixture('temp-dir/helpers.ts')).toEqual([])
    expect(await lintFixture('packages/vitest-config/src/temp-dir.ts')).toEqual([])
  })

  test('follows each import to its module, through aliases and namespaces, and ignores a shadowing parameter', async () => {
    const aliased = await lintFixture('temp-dir/aliased.ts')
    const shadowed = await lintFixture('temp-dir/shadowed.ts')
    expect({aliased: aliased.length, shadowed: shadowed.length}).toEqual({aliased: 3, shadowed: 0})
  })

  test('outside a test folder it flags a spec file and leaves a source file alone', async () => {
    const outside = async (file: string) =>
      (await lintDiagnostics('test/oxlintrc-temp-dir.json', `fixtures/temp-dir-outside/${file}`)).filter(
        (diagnostic) => diagnostic.code === 'conciv(no-hand-made-temp-dir)',
      )
    expect(await outside('hand-made.spec.ts')).toHaveLength(3)
    expect(await outside('hand-made.ts')).toEqual([])
  })

  test('flags a process exit hook in a test or a vitest config, and leaves other events and a shadowing parameter alone', async () => {
    const inTest = await lintFixture('temp-dir/exit-hook.ts')
    expect.soft(inTest).toHaveLength(2)
    expect.soft(inTest[0]).toContain('test-results/conciv-home')
    const inConfig = (
      await lintDiagnostics('test/oxlintrc-temp-dir.json', 'fixtures/temp-dir-outside/vitest.config.ts')
    ).filter((diagnostic) => diagnostic.code === 'conciv(no-hand-made-temp-dir)')
    expect.soft(inConfig).toHaveLength(1)
  })

  test('flags every fs call that creates a path on the OS temp dir, through one const, in tests, e2e and testkit sources', async () => {
    const created = await lintFixture('temp-dir/tmpdir-paths.ts')
    expect.soft(created).toHaveLength(10)
    expect.soft(created[0]).toContain('tempDir(prefix)')
    expect.soft(await lintFixture('temp-dir/tmpdir-reads.ts')).toEqual([])
    const outside = async (file: string) =>
      (await lintDiagnostics('test/oxlintrc-temp-dir.json', `fixtures/temp-dir-outside/${file}`))
        .filter((diagnostic) => diagnostic.code === 'conciv(no-hand-made-temp-dir)')
        .map((diagnostic) => String(diagnostic.message))
    const e2e = await outside('e2e/app/fixture-root.ts')
    expect.soft(e2e).toHaveLength(2)
    expect.soft(e2e[0]).toContain('e2e/.conciv-e2e/<app>')
    const testkit = await outside('packages/x-testkit/src/create-kit.ts')
    expect.soft(testkit).toHaveLength(2)
    expect.soft(testkit[0]).toContain('pass it in')
  })
})
