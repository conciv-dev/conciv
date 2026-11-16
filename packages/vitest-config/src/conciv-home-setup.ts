import {mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'

export default function setup(project: {config: {root: string}}): void {
  const home = join(project.config.root, 'test-results', 'conciv-home')
  rmSync(home, {recursive: true, force: true, maxRetries: 10})
  mkdirSync(home, {recursive: true})
  process.env.CONCIV_HOME = home
}
