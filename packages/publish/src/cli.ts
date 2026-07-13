#!/usr/bin/env node
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {defineCommand, runMain} from 'citty'
import {execa} from 'execa'
import {findRoot} from './workspace-root.ts'
import {assertPublicSet, assertValidTag, assertVersioned} from './guards.ts'

async function atRoot() {
  const cwd = await findRoot(process.cwd())
  const run = (file: string, args: string[]) => execa(file, args, {cwd, stdio: 'inherit'})
  const turbo = (...tasks: string[]) => run('pnpm', ['exec', 'turbo', 'run', ...tasks])
  const changeset = (...args: string[]) => run('pnpm', ['exec', 'changeset', ...args])
  return {cwd, run, turbo, changeset}
}

const version = defineCommand({
  meta: {name: 'version', description: 'Consume changesets, bump versions, resync the lockfile'},
  async run() {
    const {run, changeset} = await atRoot()
    await changeset('version')
    await run('pnpm', ['install', '--lockfile-only'])
  },
})

const check = defineCommand({
  meta: {name: 'check', description: 'Validate every package: build + publint + attw'},
  async run() {
    const {turbo} = await atRoot()
    await turbo('build', 'publint', 'attw')
  },
})

const release = defineCommand({
  meta: {name: 'release', description: 'Build, validate, then publish to npm via changesets'},
  async run() {
    const {cwd, turbo, changeset} = await atRoot()
    await assertPublicSet(cwd)
    await assertVersioned(cwd)
    await turbo('build', 'publint', 'attw')
    await changeset('publish')
  },
})

const snapshot = defineCommand({
  meta: {name: 'snapshot', description: 'Publish a throwaway prerelease under a dist-tag (never touches latest)'},
  args: {tag: {type: 'positional', default: 'beta', description: 'npm dist-tag, e.g. beta'}},
  async run({args}) {
    assertValidTag(args.tag)
    const {cwd, turbo, changeset} = await atRoot()
    await assertPublicSet(cwd)
    await changeset('version', '--snapshot', args.tag)
    await turbo('build', 'publint', 'attw')
    await changeset('publish', '--tag', args.tag, '--no-git-checks')
  },
})

const attw = defineCommand({
  meta: {name: 'attw', description: 'Run attw against a pnpm-packed tarball (applies publishConfig overrides)'},
  async run({rawArgs}) {
    const dir = await mkdtemp(join(tmpdir(), 'conciv-attw-'))
    const tarball = join(dir, 'package.tgz')
    try {
      await execa('pnpm', ['pack', '--out', tarball], {cwd: process.cwd(), stdio: 'inherit'})
      await execa('pnpm', ['exec', 'attw', tarball, ...rawArgs], {cwd: process.cwd(), stdio: 'inherit'})
    } finally {
      await rm(dir, {recursive: true, force: true})
    }
  },
})

const main = defineCommand({
  meta: {name: 'conciv-publish', description: 'Release tooling for the aidx monorepo'},
  subCommands: {version, check, release, snapshot, attw},
})

runMain(main)
