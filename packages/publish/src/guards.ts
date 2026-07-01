import {readFile, readdir} from 'node:fs/promises'
import {join} from 'node:path'

// A dist-tag is passed verbatim into changeset/npm argv; reject anything flag-like
// so it cannot smuggle extra flags (e.g. --otp, --ignore) into the publish.
export function assertValidTag(tag: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    throw new Error(`invalid dist-tag ${JSON.stringify(tag)}: must match /^[a-z][a-z0-9-]*$/`)
  }
}

const PACKAGE_GROUPS = ['packages', 'packages/extensions']

// The reviewed set of publishable @conciv/* packages. Anything non-private outside this
// list must NOT reach npm; assertPublicSet is the tripwire.
const PUBLIC_PACKAGES = [
  '@conciv/it',
  '@conciv/plugin',
  '@conciv/cli',
  '@conciv/core',
  '@conciv/harness',
  '@conciv/protocol',
  '@conciv/api-client',
  '@conciv/grab',
  '@conciv/tools',
  '@conciv/extension',
  '@conciv/widget',
  '@conciv/solid-diffs',
  '@conciv/solid-streamdown',
  '@conciv/ui-kit-system',
  '@conciv/ui-kit-chat',
  '@conciv/ui-kit-chat-tools',
  '@conciv/ui-kit-tap',
  '@conciv/extension-test-runner',
  '@conciv/extension-whiteboard',
]

type Manifest = {name?: string; version?: string; private?: boolean}

// Every workspace package.json across packages/* AND packages/extensions/* (entries
// without a manifest, e.g. the packages/extensions dir itself, resolve to null).
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

// Refuse to publish placeholder 0.0.0 versions: workspace:^ would rewrite to ^0.0.0,
// an open upper bound a squatted 0.0.x could hijack. Run `version` first.
export async function assertVersioned(cwd: string): Promise<void> {
  const stale = (await readManifests(cwd)).filter((pkg) => !pkg.private && pkg.version === '0.0.0')
  if (stale.length > 0) {
    const names = stale.map((pkg) => pkg.name ?? '(unnamed)').join(', ')
    throw new Error(`still 0.0.0 - run "conciv-publish version" before publishing: ${names}`)
  }
}

// Fail if the set of non-private @conciv/* packages drifts from the reviewed allowlist,
// so a newly added packages/* cannot publish by default and a mis-flagged private stays out.
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
