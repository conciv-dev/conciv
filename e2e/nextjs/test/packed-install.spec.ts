import {mkdirSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {expect, test} from '@playwright/test'
import {assertTrustedResolutions, buildAndPack, firewalledPnpm, releaseAgeYaml, run} from '@conciv/vitest-config/pack'
import {collectFailures, expectWidgetBoots, loginWidget} from '@conciv/e2e-utils/widget'
import {PACKED_ROOT} from '../packed/packed-app-dir.ts'

test.describe('installing conciv in a next app from its packed tarballs', () => {
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
    test.setTimeout(6 * 60_000)
    const trustPolicyExcludes = ['semver', 'langium', '@pierre/theme', 'solid-js']
    const root = join(PACKED_ROOT, `trust-policy-${test.info().project.name}`)
    const tarballs = join(root, 'tarballs')
    rmSync(root, {recursive: true, force: true})
    mkdirSync(tarballs, {recursive: true})
    const {overrides} = await buildAndPack(tarballs, ['@conciv/it'])
    const concivIt = overrides['@conciv/it']
    if (concivIt === undefined) throw new Error('buildAndPack did not produce a tarball for @conciv/it')
    writeFileSync(
      join(root, 'package.json'),
      `${JSON.stringify({name: 'trust-policy-fixture', version: '0.0.0', private: true}, null, 2)}\n`,
    )
    writeFileSync(
      join(root, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - '.'",
        ...releaseAgeYaml(),
        'trustPolicy: no-downgrade',
        'trustPolicyExclude:',
        ...trustPolicyExcludes.map((name) => `  - ${JSON.stringify(name)}`),
        'allowBuilds:',
        '  protobufjs: false',
        'overrides:',
        ...Object.entries(overrides).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)}`),
        '',
      ].join('\n'),
    )

    const [command, args] = firewalledPnpm(['add', '-D', concivIt])
    await run(command, args, root)

    expect(() => assertTrustedResolutions(root)).not.toThrow()
  })
})
