import {readFile, readdir} from 'node:fs/promises'
import {join} from 'node:path'

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
  '@conciv/extension-ios',
  '@conciv/mascot',
  '@conciv/embed',
  '@conciv/react',
  '@conciv/preact',
  '@conciv/solid',
]

type Manifest = {name?: string; version?: string; private?: boolean}

async function readManifests(cwd: string): Promise<Manifest[]> {
  const groups = await Promise.all(
    PACKAGE_GROUPS.map(async (group) => {
      const dirs = await readdir(join(cwd, group)).catch(() => [])
      return Promise.all(
        dirs.map((dir) =>
          readFile(join(cwd, group, dir, 'package.json'), 'utf8')
            .then((raw): Manifest => JSON.parse(raw))
            .catch(() => null),
        ),
      )
    }),
  )
  return groups.flat().filter((manifest): manifest is Manifest => manifest !== null)
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
