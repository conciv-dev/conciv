import {execa} from 'execa'
import {readWorkspacePackages} from './workspace.ts'

async function tagExists(cwd: string, tag: string): Promise<boolean> {
  const {stdout} = await execa('git', ['tag', '-l', tag], {cwd})
  return stdout.trim().length > 0
}

export async function pushFirstPublishedTags(cwd: string, names: readonly string[]): Promise<void> {
  if (names.length === 0) return
  const packages = await readWorkspacePackages(cwd)
  const tags = names.map((name) => {
    const version = packages.find((pkg) => pkg.manifest.name === name)?.manifest.version
    if (version === undefined) {
      throw new Error(`${name}: no versioned manifest in the workspace to tag`)
    }
    return `${name}@${version}`
  })
  for (const tag of tags) {
    if (!(await tagExists(cwd, tag))) {
      await execa('git', ['tag', tag], {cwd})
    }
  }
  await execa('git', ['push', 'origin', '--tags'], {cwd, stdio: 'inherit'})
}
