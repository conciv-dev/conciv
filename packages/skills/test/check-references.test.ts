import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {expect, test} from 'vitest'
import {runCheck} from '../src/check-references.ts'

async function withTempRepo(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'skills-check-'))
  try {
    await scaffoldOtherGlobs(root)
    await run(root)
  } finally {
    await rm(root, {recursive: true, force: true})
  }
}

async function writeRepoFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolute = join(root, relativePath)
  await mkdir(dirname(absolute), {recursive: true})
  await writeFile(absolute, content)
}

async function scaffoldOtherGlobs(root: string): Promise<void> {
  await writeRepoFile(root, 'packages/client/skills/foo/bar/SKILL.md', '# Baseline client skill\n')
  await writeRepoFile(root, 'packages/harness/plugins/claude/skills/baz/SKILL.md', '# Baseline harness skill\n')
}

async function writeSkill(
  root: string,
  name: string,
  bodyLines: Array<string>,
  sourcesLines: Array<string> = [],
): Promise<string> {
  const relativePath = `packages/skills/skills/${name}/SKILL.md`
  const content = [`# ${name}`, '', ...bodyLines, '', '## Sources', ...sourcesLines].join('\n')
  await writeRepoFile(root, relativePath, content)
  return relativePath
}

async function writeSkillsPackageManifest(root: string, version: string): Promise<void> {
  await writeRepoFile(root, 'packages/skills/package.json', JSON.stringify({name: '@conciv/skills', version}))
}

async function writeSkillWithMetadata(
  root: string,
  name: string,
  libraryVersion: string | null,
  sourcesLines: Array<string>,
): Promise<string> {
  const relativePath = `packages/skills/skills/${name}/SKILL.md`
  const metadataLines =
    libraryVersion === null
      ? [`metadata:`, `  package: '@conciv/skills'`]
      : [`metadata:`, `  package: '@conciv/skills'`, `  library_version: '${libraryVersion}'`]
  const content = [
    '---',
    `name: ${name}`,
    'description: A test skill.',
    ...metadataLines,
    '---',
    '',
    `# ${name}`,
    '',
    `Body text for ${name}.`,
    '',
    '## Sources',
    ...sourcesLines,
  ].join('\n')
  await writeRepoFile(root, relativePath, content)
  return relativePath
}

function fillerLines(count: number): Array<string> {
  return Array.from({length: count}, (_, index) => `const filler${index + 1} = ${index + 1}`)
}

function expectSingleFinding(root: string, kind: string) {
  const outcome = runCheck(root)
  expect(outcome.findings).toHaveLength(1)
  const finding = outcome.findings[0]
  expect(finding?.kind).toBe(kind)
  return finding
}

test('dead source path in Sources section is flagged', async () => {
  await withTempRepo(async (root) => {
    await writeSkill(
      root,
      'dead-source',
      ['Some skill body text with no citations.'],
      ['- `packages/skills/skills/dead-source/missing-source.ts`'],
    )
    const finding = expectSingleFinding(root, 'dead-source')
    expect(finding?.detail).toBe('packages/skills/skills/dead-source/missing-source.ts')
  })
})

test('citation to a nonexistent file is flagged dead-citation', async () => {
  await withTempRepo(async (root) => {
    await writeSkill(root, 'dead-citation', ['See `packages/skills/skills/dead-citation/absent.ts:5` for details.'])
    expectSingleFinding(root, 'dead-citation')
  })
})

test('citation line beyond file length is flagged out-of-range-citation', async () => {
  await withTempRepo(async (root) => {
    await writeRepoFile(root, 'packages/skills/skills/out-of-range/target.ts', fillerLines(10).join('\n'))
    await writeSkill(root, 'out-of-range', ['`packages/skills/skills/out-of-range/target.ts:999`'])
    const finding = expectSingleFinding(root, 'out-of-range-citation')
    expect(finding?.detail).toContain('999')
  })
})

test('citation range end beyond file length is flagged out-of-range-citation', async () => {
  await withTempRepo(async (root) => {
    await writeRepoFile(root, 'packages/skills/skills/out-of-range-end/target.ts', fillerLines(10).join('\n'))
    await writeSkill(root, 'out-of-range-end', ['`packages/skills/skills/out-of-range-end/target.ts:5-999`'])
    const finding = expectSingleFinding(root, 'out-of-range-citation')
    expect(finding?.detail).toContain('5-999')
  })
})

test('comma multi-range citation flags only the out-of-range segment', async () => {
  await withTempRepo(async (root) => {
    await writeRepoFile(root, 'packages/skills/skills/multi-range/target.ts', fillerLines(10).join('\n'))
    await writeSkill(root, 'multi-range', ['`packages/skills/skills/multi-range/target.ts:2-3,900-901`'])
    const finding = expectSingleFinding(root, 'out-of-range-citation')
    expect(finding?.detail).toContain('900-901')
    expect(finding?.detail).not.toContain('2-3:')
  })
})

test('identifier moved outside the +/-30 line window fails the citation', async () => {
  await withTempRepo(async (root) => {
    const lines = fillerLines(90)
    lines[0] = 'function widgetMountHandler() {}'
    await writeRepoFile(root, 'packages/skills/skills/moved-identifier/target.ts', lines.join('\n'))
    await writeSkill(root, 'moved-identifier', [
      'See widgetMountHandler in `packages/skills/skills/moved-identifier/target.ts:50` for context.',
    ])
    const finding = expectSingleFinding(root, 'unmatchable-citation')
    expect(finding?.detail).toContain('widgetMountHandler')
  })
})

test('identifier inside the +/-30 line window passes', async () => {
  await withTempRepo(async (root) => {
    const lines = fillerLines(90)
    lines[39] = 'function widgetMountHandler() {}'
    await writeRepoFile(root, 'packages/skills/skills/window-hit/target.ts', lines.join('\n'))
    await writeSkill(root, 'window-hit', [
      'See widgetMountHandler in `packages/skills/skills/window-hit/target.ts:50` for context.',
    ])
    const outcome = runCheck(root)
    expect(outcome.findings).toEqual([])
  })
})

test('paragraph with no eligible identifiers only checks citation bounds', async () => {
  await withTempRepo(async (root) => {
    await writeRepoFile(root, 'packages/skills/skills/zero-identifier/target.ts', fillerLines(10).join('\n'))
    await writeSkill(root, 'zero-identifier', ['`packages/skills/skills/zero-identifier/target.ts:5`'])
    const outcome = runCheck(root)
    expect(outcome.findings).toEqual([])
  })
})

test('a skillGlobs entry matching zero files is flagged empty-glob', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skills-check-'))
  try {
    await scaffoldOtherGlobs(root)
    const finding = expectSingleFinding(root, 'empty-glob')
    expect(finding?.file).toBe('packages/skills/skills/*/SKILL.md')
  } finally {
    await rm(root, {recursive: true, force: true})
  }
})

test('missing Sources section in a packages/skills skill is flagged', async () => {
  await withTempRepo(async (root) => {
    const relativePath = 'packages/skills/skills/missing-sources/SKILL.md'
    await writeRepoFile(root, relativePath, ['# missing-sources', '', 'This skill never lists its sources.'].join('\n'))
    expectSingleFinding(root, 'missing-sources')
  })
})

test('citation path escaping the repository root is flagged', async () => {
  await withTempRepo(async (root) => {
    await writeSkill(root, 'escaping', ['`../../../outside/target.ts:1`'])
    expectSingleFinding(root, 'escaping-citation')
  })
})

test('a fully clean skill produces no findings', async () => {
  await withTempRepo(async (root) => {
    const lines = fillerLines(20)
    lines[9] = 'function cleanFixtureHelper() {}'
    await writeRepoFile(root, 'packages/skills/skills/clean/target.ts', lines.join('\n'))
    await writeSkill(
      root,
      'clean',
      ['Uses cleanFixtureHelper as shown in `packages/skills/skills/clean/target.ts:10` below.'],
      ['- `packages/skills/skills/clean/target.ts`'],
    )
    const outcome = runCheck(root)
    expect(outcome.findings).toEqual([])
    expect(outcome.checkedCitations).toBe(1)
    expect(outcome.skillCount).toBe(3)
  })
})

test('a library_version stamp older than packages/skills/package.json is flagged stale-library-version', async () => {
  await withTempRepo(async (root) => {
    await writeSkillsPackageManifest(root, '0.0.20')
    await writeSkillWithMetadata(root, 'stale-stamp', '0.0.19', [])
    const finding = expectSingleFinding(root, 'stale-library-version')
    expect(finding?.detail).toContain("'0.0.19'")
    expect(finding?.detail).toContain("'0.0.20'")
  })
})

test('a skill metadata block naming @conciv/skills with no library_version field is flagged missing-library-version', async () => {
  await withTempRepo(async (root) => {
    await writeSkillsPackageManifest(root, '0.0.20')
    await writeSkillWithMetadata(root, 'no-stamp', null, [])
    expectSingleFinding(root, 'missing-library-version')
  })
})

test('a library_version stamp matching packages/skills/package.json produces no findings', async () => {
  await withTempRepo(async (root) => {
    await writeSkillsPackageManifest(root, '0.0.20')
    await writeSkillWithMetadata(root, 'matching-stamp', '0.0.20', [])
    const outcome = runCheck(root)
    expect(outcome.findings).toEqual([])
  })
})
