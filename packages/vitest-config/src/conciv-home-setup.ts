import {mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'

function removeFolder(folder: string): void {
  rmSync(folder, {recursive: true, force: true, maxRetries: 10})
}

export default function setup(project: {config: {root: string}}): () => void {
  const home = join(project.config.root, 'test-results', 'conciv-home')
  removeFolder(home)
  mkdirSync(home, {recursive: true})
  process.env.CONCIV_HOME = home
  return () => removeFolder(home)
}
