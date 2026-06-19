import {readFile, readdir} from 'node:fs/promises'
import {join} from 'node:path'

// A dist-tag is passed verbatim into changeset/npm argv; reject anything flag-like
// so it cannot smuggle extra flags (e.g. --otp, --ignore) into the publish.
export function assertValidTag(tag: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) {
    throw new Error(`invalid dist-tag ${JSON.stringify(tag)}: must match /^[a-z][a-z0-9-]*$/`)
  }
}

// Refuse to publish placeholder 0.0.0 versions: workspace:^ would rewrite to ^0.0.0,
// an open upper bound a squatted 0.0.x could hijack. Run `version` first.
export async function assertVersioned(cwd: string): Promise<void> {
  const pkgsDir = join(cwd, 'packages')
  for (const dir of await readdir(pkgsDir)) {
    let pkg
    try {
      pkg = JSON.parse(await readFile(join(pkgsDir, dir, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (!pkg.private && pkg.version === '0.0.0') {
      throw new Error(`${pkg.name} is still 0.0.0 - run "mandarax-publish version" before publishing`)
    }
  }
}
