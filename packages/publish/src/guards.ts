import {access, lstat, readFile, readdir} from 'node:fs/promises'
import {join, relative} from 'node:path'
import parseChangesetFile from '@changesets/parse'
import {execa} from 'execa'
import {qualifiesForCoverage} from './coverage-files.ts'
import {buildDependencyGraph, readWorkspacePackages, transitiveDependents, type WorkspacePackage} from './workspace.ts'

const CHANGESET_DIR = '.changeset'

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function pathExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch((error: unknown) => {
      if (isMissingPath(error)) return false
      throw error
    })
}

export async function assertWorkspaceRoot(cwd: string): Promise<void> {
  const hasWorkspaceManifest = await pathExists(join(cwd, 'pnpm-workspace.yaml'))
  const hasChangesetDir = await pathExists(join(cwd, CHANGESET_DIR))
  if (!hasWorkspaceManifest || !hasChangesetDir) {
    throw new Error(`conciv-publish must run at the workspace root (via the root pnpm scripts); cwd is ${cwd}`)
  }
}

export function assertValidTag(tag: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    throw new Error(`invalid dist-tag ${JSON.stringify(tag)}: must match /^[a-z][a-z0-9-]*$/`)
  }
}

export function assertValidPackageName(name: string): void {
  if (!/^@conciv\/[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`invalid package name ${JSON.stringify(name)}: must match /^@conciv\\/[a-z][a-z0-9-]*$/`)
  }
}

export const PUBLIC_PACKAGES = [
  '@conciv/it',
  '@conciv/plugin',
  '@conciv/cli',
  '@conciv/try',
  '@conciv/core',
  '@conciv/serve',
  '@conciv/harness',
  '@conciv/harness-init',
  '@conciv/protocol',
  '@conciv/contract',
  '@conciv/db',
  '@conciv/storage-history',
  '@conciv/client',
  '@conciv/grab',
  '@conciv/tools',
  '@conciv/extension',
  '@conciv/extension-compiler',
  '@conciv/solid-diffs',
  '@conciv/solid-stick-to-bottom',
  '@conciv/solid-streamdown',
  '@conciv/ui-kit-system',
  '@conciv/ui-kit-chat',
  '@conciv/ui-kit-chat-tools',
  '@conciv/ui-kit-tap',
  '@conciv/ui-kit-terminal',
  '@conciv/extension-test-runner',
  '@conciv/extension-whiteboard',
  '@conciv/extension-terminal',
  '@conciv/extension-recorder',
  '@conciv/extension-tanstack',
  '@conciv/extension-ios',
  '@conciv/extension-page',
  '@conciv/mascot',
  '@conciv/embed',
  '@conciv/react',
  '@conciv/preact',
  '@conciv/solid',
  '@conciv/skills',
]

export async function assertVersioned(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const stale = packages.filter((pkg) => !pkg.manifest.private && pkg.manifest.version === '0.0.0')
  if (stale.length > 0) {
    const names = stale.map((pkg) => pkg.manifest.name ?? '(unnamed)').join(', ')
    throw new Error(`still 0.0.0 - run "conciv-publish version" before publishing: ${names}`)
  }
}

export async function assertBootstrappable(cwd: string, name: string): Promise<void> {
  assertValidPackageName(name)
  if (!PUBLIC_PACKAGES.includes(name)) {
    throw new Error(`${name} is not in PUBLIC_PACKAGES - add it to packages/publish/src/guards.ts first`)
  }
  const packages = await readWorkspacePackages(cwd)
  const found = packages.find((pkg) => pkg.manifest.name === name)
  if (!found) {
    throw new Error(`${name} not found in the workspace`)
  }
  if (found.manifest.private) {
    throw new Error(`${name} is private - unset "private" in its package.json before bootstrapping`)
  }
  if (found.manifest.version === '0.0.0') {
    throw new Error(`${name} is still 0.0.0 - land a changeset and merge the version PR before bootstrapping`)
  }
}

function parseChangesetPackageNames(content: string, file: string): string[] {
  try {
    const releases = parseChangesetFile(content).releases
    if (releases.length === 0) {
      throw new Error('changeset has no releases')
    }
    return releases.map((release) => release.name)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${file}: ${message}`, {cause: error})
  }
}

async function listChangesetFiles(changesetDir: string): Promise<string[]> {
  const entries = await readdir(changesetDir).catch((error: unknown) => {
    if (isMissingPath(error)) {
      throw new Error(`${changesetDir} does not exist - is cwd the workspace root?`)
    }
    throw error
  })
  return entries.filter((file) => file.endsWith('.md') && file !== 'README.md').toSorted()
}

async function assertNotSymlink(filePath: string): Promise<void> {
  const stats = await lstat(filePath)
  if (stats.isSymbolicLink()) {
    throw new Error(`${filePath}: changeset files must not be symlinks`)
  }
}

export async function assertChangesetsResolve(cwd: string): Promise<void> {
  const changesetDir = join(cwd, CHANGESET_DIR)
  const files = await listChangesetFiles(changesetDir)
  if (files.length === 0) return
  const packages = await readWorkspacePackages(cwd)
  const workspaceNames = new Set(
    packages.map((pkg) => pkg.manifest.name).filter((name): name is string => typeof name === 'string'),
  )
  const errors: string[] = []
  for (const file of files) {
    const filePath = join(changesetDir, file)
    await assertNotSymlink(filePath)
    const content = await readFile(filePath, 'utf8')
    for (const name of parseChangesetPackageNames(content, file)) {
      if (!workspaceNames.has(name)) {
        errors.push(`${file}: package ${JSON.stringify(name)} is not in the workspace`)
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`invalid changeset package names:\n${errors.join('\n')}`)
  }
}

type DiffEntry = {status: string; path: string}

async function diffEntries(cwd: string, base: string): Promise<DiffEntry[]> {
  const {stdout} = await execa('git', ['diff', '--name-status', '--no-renames', `${base}...HEAD`], {cwd})
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status = '', ...pathParts] = line.split('\t')
      return {status, path: pathParts.join('\t')}
    })
}

function isAddedChangesetFile(entry: DiffEntry): boolean {
  return (
    entry.status === 'A' &&
    entry.path.startsWith(`${CHANGESET_DIR}/`) &&
    entry.path !== `${CHANGESET_DIR}/README.md` &&
    entry.path.endsWith('.md')
  )
}

async function addedChangesetPackageNames(cwd: string, entries: DiffEntry[]): Promise<string[]> {
  const files = entries.filter(isAddedChangesetFile).map((entry) => entry.path)
  const names = await Promise.all(
    files.map(async (path) => {
      const filePath = join(cwd, path)
      await assertNotSymlink(filePath)
      const content = await readFile(filePath, 'utf8')
      return parseChangesetPackageNames(content, path)
    }),
  )
  return [...new Set(names.flat())]
}

function findOwner(packages: WorkspacePackage[], path: string): WorkspacePackage | undefined {
  return packages
    .filter((pkg) => path === pkg.relativeDir || path.startsWith(`${pkg.relativeDir}/`))
    .toSorted((a, b) => b.relativeDir.length - a.relativeDir.length)
    .at(0)
}

export async function assertPublishedChangesCovered(cwd: string, base: string): Promise<void> {
  const [packages, entries] = await Promise.all([readWorkspacePackages(cwd), diffEntries(cwd, base)])
  const graph = buildDependencyGraph(packages)
  const publishedByName = new Map(
    packages
      .filter((pkg) => !pkg.manifest.private && typeof pkg.manifest.name === 'string')
      .map((pkg) => [pkg.manifest.name as string, pkg]),
  )

  const touchedPackageNames = new Set<string>()
  for (const entry of entries) {
    const owner = findOwner(packages, entry.path)
    if (!owner || typeof owner.manifest.name !== 'string') continue
    const packageRelativePath = relative(owner.relativeDir, entry.path)
    if (!qualifiesForCoverage(packageRelativePath, owner.manifest.files)) continue
    if (publishedByName.has(owner.manifest.name)) {
      touchedPackageNames.add(owner.manifest.name)
      continue
    }
    for (const dependent of transitiveDependents(graph, owner.manifest.name)) {
      if (publishedByName.has(dependent)) touchedPackageNames.add(dependent)
    }
  }
  if (touchedPackageNames.size === 0) return

  const changesetNames = await addedChangesetPackageNames(cwd, entries)
  const covered = changesetNames.some((name) => publishedByName.has(name))
  if (covered) return
  throw new Error(
    `no changeset covers changed published packages: ${[...touchedPackageNames].toSorted().join(', ')} - add a changeset naming any published @conciv package (fixed versioning releases the whole set together), or apply the "no-changeset" label if this PR intentionally ships no release`,
  )
}

export async function assertPublicSet(cwd: string): Promise<void> {
  const packages = await readWorkspacePackages(cwd)
  const found = packages
    .filter((pkg) => !pkg.manifest.private)
    .map((pkg) => pkg.manifest.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith('@conciv/'))
  const unexpected = found.filter((name) => !PUBLIC_PACKAGES.includes(name))
  const missing = PUBLIC_PACKAGES.filter((name) => !found.includes(name))
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `public package set drift - unexpected: [${unexpected.join(', ')}], missing: [${missing.join(', ')}]`,
    )
  }
}
