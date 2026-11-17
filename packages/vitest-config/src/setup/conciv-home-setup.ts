import {existsSync, mkdirSync, readdirSync, rmdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'

function removeFolder(folder: string): void {
  rmSync(folder, {recursive: true, force: true, maxRetries: 10})
}

function removeFolderWhenEmpty(folder: string): void {
  try {
    rmdirSync(folder)
  } catch (error) {
    if (!existsSync(folder) || readdirSync(folder).length > 0) return
    throw error
  }
}

export default function setup(project: {config: {root: string}}): () => void {
  const testResults = join(project.config.root, 'test-results')
  const home = join(testResults, 'conciv-home')
  removeFolder(home)
  mkdirSync(home, {recursive: true})
  process.env.CONCIV_HOME = home
  return () => {
    removeFolder(home)
    removeFolderWhenEmpty(testResults)
  }
}
