import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {onTestFinished} from 'vitest'

export async function scaffoldWorkspaceRoot(prefix: string, packageGlobs: string[] = ['packages/*']): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  onTestFinished(() => rm(root, {recursive: true, force: true}))
  await writeFile(
    join(root, 'pnpm-workspace.yaml'),
    `packages:\n${packageGlobs.map((glob) => `  - ${glob}`).join('\n')}\n`,
  )
  await writeFile(join(root, 'package.json'), `${JSON.stringify({name: 'workspace-root', private: true}, null, 2)}\n`)
  return root
}

export async function writeManifest(dir: string, manifest: Record<string, unknown>): Promise<void> {
  await mkdir(dir, {recursive: true})
  await writeFile(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}
