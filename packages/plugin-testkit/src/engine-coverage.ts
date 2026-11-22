import {randomUUID} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import {Session} from 'node:inspector/promises'
import {join} from 'node:path'
import type {BrowserCommandContext} from 'vitest/node'

export type EngineCoverage = {
  start: (context: BrowserCommandContext) => Promise<void>
  hand: (context: BrowserCommandContext) => Promise<void>
}

function isWorkspaceScript(url: string): boolean {
  return url.startsWith('file://') && !url.includes('/node_modules/')
}

export function engineCoverage(): EngineCoverage {
  const state: {session: Session | null} = {session: null}
  return {
    start: async ({project}) => {
      if (state.session || !project.vitest.config.coverage.enabled) return
      const session = new Session()
      session.connect()
      await session.post('Profiler.enable')
      await session.post('Profiler.startPreciseCoverage', {callCount: true, detailed: true})
      state.session = session
    },
    hand: async ({project, testPath}) => {
      if (!state.session || testPath === undefined) return
      const provider = await project.vitest.createCoverageProvider()
      if (!provider) return
      const {result} = await state.session.post('Profiler.takePreciseCoverage')
      const scripts = result
        .filter((script) => isWorkspaceScript(script.url))
        .map((script) => ({...script, isExtendedContext: true}))
      const directory = join(project.vitest.config.coverage.reportsDirectory, '.conciv-engine')
      await mkdir(directory, {recursive: true})
      const file = join(directory, `${randomUUID()}.json`)
      await writeFile(file, JSON.stringify({result: scripts}))
      const nodeSide =
        project.vitest.projects.find((each) => !each.isBrowserEnabled()) ?? project.vitest.getRootProject()
      provider.onAfterSuiteRun({
        coverage: file,
        environment: 'conciv-engine',
        projectName: nodeSide.name,
        testFiles: [testPath],
      })
    },
  }
}
