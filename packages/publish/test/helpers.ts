import {writeFile, mkdir, rm} from 'node:fs/promises'
import {join} from 'node:path'
import {onTestFinished} from 'vitest'
import {tempDir} from '@conciv/vitest-config/temp-dir'

export async function scaffoldWorkspaceRoot(prefix: string, packageGlobs: string[] = ['packages/*']): Promise<string> {
  const root = tempDir(prefix)
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
