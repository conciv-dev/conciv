import {join} from 'node:path'
import {addDependencyCommand, detectPackageManager} from 'nypm'
import {captureFile} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitContext, InitStep, SpawnBin} from '../pipeline.js'
import type {AddDep} from './install-it.js'
import {hasDependency, readManifest} from './manifest.js'

const skillsName = '@conciv/skills'
const intentInstallCommand = 'pnpm dlx @tanstack/intent@latest install'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function failureCard(cwd: string): Promise<ManualCard> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  const addCommand = addDependencyCommand(found?.name ?? 'npm', skillsName, {dev: true})
  return {
    title: `Add the ${skillsName} docs pack`,
    body: 'The automatic setup failed. Run these in your project:',
    snippet: `${addCommand}\n${intentInstallCommand}`,
  }
}

function present(ctx: InitContext): boolean {
  return hasDependency(readManifest(ctx.cwd), skillsName)
}

export function docsPackStep(add: AddDep, spawn: SpawnBin): InitStep {
  return {
    id: 'docs-pack',
    title: `Add the ${skillsName} docs pack`,
    running: `Adding the ${skillsName} docs pack…`,
    completed: `Added the ${skillsName} docs pack`,
    detect: async (ctx) => (present(ctx) ? 'present' : 'missing'),
    plan: async () => ({
      summary: `add ${skillsName} as a dev dependency and run \`intent install\` for skill-loading guidance`,
      wouldEdit: ['package.json', 'AGENTS.md'],
    }),
    apply: async (ctx) => {
      ctx.backup(captureFile(join(ctx.cwd, 'package.json')))
      const addFailure = await add(skillsName, {cwd: ctx.cwd}).then(
        () => null,
        (error: unknown) => message(error),
      )
      if (addFailure !== null) return {status: 'manual', cards: [await failureCard(ctx.cwd)], detail: addFailure}
      const outcome = await spawn('pnpm', ['dlx', '@tanstack/intent@latest', 'install'], ctx.cwd).catch(
        (error: unknown) => ({code: -1, output: message(error)}),
      )
      if (outcome.code === 0) return {status: 'done'}
      const reason = outcome.output.trim()
      return {
        status: 'manual',
        cards: [await failureCard(ctx.cwd)],
        detail: reason.length === 0 ? 'intent install failed' : reason,
      }
    },
    verify: async (ctx) => present(ctx),
    manualCard: () => ({
      title: `Add the ${skillsName} docs pack`,
      body: `Add ${skillsName} as a dev dependency, then run ${intentInstallCommand} — or re-run conciv init.`,
    }),
  }
}
