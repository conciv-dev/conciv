import {execFile, execFileSync} from 'node:child_process'
import {mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {promisify} from 'node:util'
import {expect, test} from '@internal/e2e-utils/fixtures'
import {collectFailures, expectWidgetBoots, loginWidget} from '@internal/e2e-utils/widget'
import {PACKED_ROOT} from '../packed/packed-app-dir.ts'

test.describe('installing conciv in a next app from its packed tarballs', () => {
  test.use({signedIn: false})

  test('the user signs in and the widget from instrumentation-client opens on the engine register() booted', async ({
    page,
  }) => {
    const failures = collectFailures(page)

    await loginWidget(page)

    await expectWidgetBoots(page, failures)
  })
})

test.describe('installing the packed @conciv/it into a fresh project under pnpm trustPolicy: no-downgrade', () => {
  test('the install succeeds and every package it resolves comes from the npm registry', async () => {
    // oxlint-disable-next-line conciv/max-test-timeout -- this packed-only test proves a fresh registry resolution under trustPolicy no-downgrade, and a cold registry fetch can outrun the cap
    test.setTimeout(60_000)
    const trustPolicyExcludes = ['semver', 'langium', '@pierre/theme', 'solid-js']
    const tarballs = join(PACKED_ROOT, 'tarballs')
    const overrides = readdirSync(tarballs).flatMap((file) => {
      const packed = /^conciv-(.+)-\d+\.\d+\.\d+[^/]*\.tgz$/.exec(file)
      return packed?.[1] === undefined ? [] : [{name: `@conciv/${packed[1]}`, value: `file:${join(tarballs, file)}`}]
    })
    const concivIt = overrides.find(({name}) => name === '@conciv/it')?.value
    if (concivIt === undefined) throw new Error(`test-packed.ts left no @conciv/it tarball in ${tarballs}`)
    const workspaceConfig = (key: string): unknown =>
      JSON.parse(execFileSync('pnpm', ['config', 'get', key, '--json'], {cwd: import.meta.dirname, encoding: 'utf8'}))
    const minimumReleaseAge = workspaceConfig('minimumReleaseAge')
    const releaseAgeExclude = workspaceConfig('minimumReleaseAgeExclude')
    const root = join(PACKED_ROOT, `trust-policy-${test.info().project.name}`)
    rmSync(root, {recursive: true, force: true})
    mkdirSync(root, {recursive: true})
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({name: 'trust-policy-fixture', version: '0.0.0', private: true}, null, 2)}\n`,
    )
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - '.'",
        `minimumReleaseAge: ${JSON.stringify(minimumReleaseAge)}`,
        'minimumReleaseAgeExclude:',
        ...(Array.isArray(releaseAgeExclude) ? releaseAgeExclude : []).map((name) => `  - ${JSON.stringify(name)}`),
        'trustPolicy: no-downgrade',
        'trustPolicyExclude:',
        ...trustPolicyExcludes.map((name) => `  - ${JSON.stringify(name)}`),
        'allowBuilds:',
        '  protobufjs: false',
        'overrides:',
        ...overrides.map(({name, value}) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`),
        '',
      ].join('\n'),
    )

    await promisify(execFile)('sfw', ['pnpm', 'add', '-D', concivIt], {
      cwd: root,
      env: {...process.env, CI: 'true'},
      maxBuffer: 64 * 1024 * 1024,
    })

    const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
    expect(lock).not.toMatch(/resolution: \{[^}]*(tarball: (?!file:)|type: git|commit: )/)
  })
})
