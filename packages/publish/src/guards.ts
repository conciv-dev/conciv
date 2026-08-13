import {access, lstat, readFile, readdir} from 'node:fs/promises'
import {join, relative} from 'node:path'
import parseChangesetFile from '@changesets/parse'
import {execa} from 'execa'

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

const PACKAGE_GROUPS = ['packages', 'packages/extensions']

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

type Manifest = {name?: string; version?: string; private?: boolean}
type ManifestEntry = {dir: string; manifest: Manifest}

async function readManifestEntries(cwd: string): Promise<ManifestEntry[]> {
  const groups = await Promise.all(
    PACKAGE_GROUPS.map(async (group) => {
      const groupDir = join(cwd, group)
      const dirs = await readdir(groupDir).catch((error: unknown) => {
        if (isMissingPath(error)) {
          throw new Error(`${groupDir} does not exist - is cwd the workspace root?`)
        }
        throw error
      })
      return Promise.all(
        dirs.map((dir) => {
          const packageDir = join(groupDir, dir)
          const manifestPath = join(packageDir, 'package.json')
          return readFile(manifestPath, 'utf8')
            .then((raw): ManifestEntry => ({dir: packageDir, manifest: JSON.parse(raw)}))
            .catch((error: unknown) => {
              if (isMissingPath(error)) return null
              throw new Error(`${manifestPath} could not be read as a package manifest`, {cause: error})
            })
        }),
      )
    }),
  )
  return groups.flat().filter((entry): entry is ManifestEntry => entry !== null)
}

async function readManifests(cwd: string): Promise<Manifest[]> {
  return (await readManifestEntries(cwd)).map((entry) => entry.manifest)
}

export async function assertVersioned(cwd: string): Promise<void> {
  const stale = (await readManifests(cwd)).filter((pkg) => !pkg.private && pkg.version === '0.0.0')
  if (stale.length > 0) {
    const names = stale.map((pkg) => pkg.name ?? '(unnamed)').join(', ')
    throw new Error(`still 0.0.0 - run "conciv-publish version" before publishing: ${names}`)
  }
}

export async function assertBootstrappable(cwd: string, name: string): Promise<void> {
  assertValidPackageName(name)
  if (!PUBLIC_PACKAGES.includes(name)) {
    throw new Error(`${name} is not in PUBLIC_PACKAGES - add it to packages/publish/src/guards.ts first`)
  }
  const manifest = (await readManifests(cwd)).find((pkg) => pkg.name === name)
  if (!manifest) {
    throw new Error(`${name} not found in the workspace`)
  }
  if (manifest.private) {
    throw new Error(`${name} is private - unset "private" in its package.json before bootstrapping`)
  }
  if (manifest.version === '0.0.0') {
    throw new Error(`${name} is still 0.0.0 - land a changeset and merge the version PR before bootstrapping`)
  }
}

function parseChangesetPackageNames(content: string, file: string): string[] {
  try {
    return parseChangesetFile(content).releases.map((release) => release.name)
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
  const workspaceNames = new Set(
    (await readManifests(cwd)).map((pkg) => pkg.name).filter((name): name is string => typeof name === 'string'),
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

const CODE_FILE_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'html', 'json'])

function isTestPath(relativePath: string): boolean {
  const segments = relativePath.split('/')
  const base = segments.at(-1) ?? ''
  return segments.includes('test') || segments.includes('tests') || /\.(test|spec)\./.test(base)
}

function isCodePath(relativePath: string): boolean {
  const extension = relativePath.split('.').at(-1) ?? ''
  return CODE_FILE_EXTENSIONS.has(extension.toLowerCase())
}

function qualifiesForCoverage(relativePath: string): boolean {
  return isCodePath(relativePath) && !isTestPath(relativePath)
}

async function changedFiles(cwd: string, base: string): Promise<string[]> {
  const {stdout} = await execa('git', ['diff', '--name-only', `${base}...HEAD`], {cwd})
  return stdout.split(/\r?\n/).filter((line) => line.length > 0)
}

async function changesetPackageNames(cwd: string): Promise<string[]> {
  const changesetDir = join(cwd, CHANGESET_DIR)
  const files = await listChangesetFiles(changesetDir)
  const names = await Promise.all(
    files.map(async (file) => {
      const filePath = join(changesetDir, file)
      await assertNotSymlink(filePath)
      const content = await readFile(filePath, 'utf8')
      return parseChangesetPackageNames(content, file)
    }),
  )
  return [...new Set(names.flat())]
}

export async function assertPublishedChangesCovered(cwd: string, base: string): Promise<void> {
  const [entries, files] = await Promise.all([readManifestEntries(cwd), changedFiles(cwd, base)])
  const publishedPackages = entries
    .filter((entry) => !entry.manifest.private)
    .map((entry) => ({name: entry.manifest.name, relativeDir: relative(cwd, entry.dir)}))
    .filter((pkg): pkg is {name: string; relativeDir: string} => typeof pkg.name === 'string')
  const touchedPackageNames = [
    ...new Set(
      files
        .filter(qualifiesForCoverage)
        .map(
          (file) =>
            publishedPackages.find((pkg) => file === pkg.relativeDir || file.startsWith(`${pkg.relativeDir}/`))?.name,
        )
        .filter((name): name is string => typeof name === 'string'),
    ),
  ]
  if (touchedPackageNames.length === 0) return
  const changesetNames = await changesetPackageNames(cwd)
  const covered = changesetNames.some((name) => name.startsWith('@conciv/'))
  if (covered) return
  throw new Error(
    `no changeset covers changed published packages: ${touchedPackageNames.toSorted().join(', ')} - add a changeset naming any @conciv package (fixed versioning releases the whole set together), or apply the "no-changeset" label if this PR intentionally ships no release`,
  )
}

export async function assertPublicSet(cwd: string): Promise<void> {
  const found = (await readManifests(cwd))
    .filter((pkg) => !pkg.private)
    .map((pkg) => pkg.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith('@conciv/'))
  const unexpected = found.filter((name) => !PUBLIC_PACKAGES.includes(name))
  const missing = PUBLIC_PACKAGES.filter((name) => !found.includes(name))
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `public package set drift - unexpected: [${unexpected.join(', ')}], missing: [${missing.join(', ')}]`,
    )
  }
}
