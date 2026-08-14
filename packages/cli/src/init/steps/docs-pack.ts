import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {addDependencyCommand, detectPackageManager, dlxCommand} from 'nypm'
import {captureFile} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitContext, InitStep, SpawnBin} from '../pipeline.js'
import type {AddDep} from './install-it.js'
import {hasDependency, readManifest} from './manifest.js'

const skillsName = '@conciv/skills'
const intentPackage = '@tanstack/intent@latest'
const intentBlockMarker = '<!-- intent-skills:start -->'

type IntentCommands = {
  spawn: [string, ...string[]]
  intentLine: string
  addCommand: string
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function intentBlockPresent(cwd: string): boolean {
  const agentsMdPath = join(cwd, 'AGENTS.md')
  if (!existsSync(agentsMdPath)) return false
  return readFileSync(agentsMdPath, 'utf8').includes(intentBlockMarker)
}

async function resolveIntentCommands(cwd: string): Promise<IntentCommands> {
  const found = await detectPackageManager(cwd, {ignoreArgv: true})
  const pmName = found?.name ?? 'npm'
  const intentLine = dlxCommand(pmName, intentPackage, {args: ['install']})
  const [bin, ...args] = intentLine.split(' ')
  if (bin === undefined) throw new Error(`nypm dlxCommand returned an empty command: ${intentLine}`)
  return {spawn: [bin, ...args], intentLine, addCommand: addDependencyCommand(pmName, skillsName, {dev: true})}
}

async function failureCard(cwd: string, depPresent: boolean): Promise<ManualCard> {
  const commands = await resolveIntentCommands(cwd)
  const lines = depPresent ? [commands.intentLine] : [commands.addCommand, commands.intentLine]
  return {
    title: `Add the ${skillsName} docs pack`,
    body: 'The automatic setup failed. Run these in your project:',
    snippet: lines.join('\n'),
  }
}

function present(ctx: InitContext): boolean {
  return hasDependency(readManifest(ctx.cwd), skillsName) && intentBlockPresent(ctx.cwd)
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
      const depPresent = hasDependency(readManifest(ctx.cwd), skillsName)
      if (!depPresent) {
        ctx.backup(captureFile(join(ctx.cwd, 'package.json')))
        const addFailure = await add(skillsName, {cwd: ctx.cwd}).then(
          () => null,
          (error: unknown) => message(error),
        )
        if (addFailure !== null)
          return {status: 'manual', cards: [await failureCard(ctx.cwd, depPresent)], detail: addFailure}
      }
      if (intentBlockPresent(ctx.cwd)) return {status: 'done'}
      const commands = await resolveIntentCommands(ctx.cwd)
      const [bin, ...args] = commands.spawn
      const outcome = await spawn(bin, args, ctx.cwd, ctx.feed).catch((error: unknown) => ({
        code: -1,
        output: message(error),
      }))
      if (outcome.code === 0) return {status: 'done'}
      const reason = outcome.output.trim()
      return {
        status: 'manual',
        cards: [await failureCard(ctx.cwd, true)],
        detail: reason.length === 0 ? 'intent install failed' : reason,
      }
    },
    verify: async (ctx) => present(ctx),
    manualCard: () => ({
      title: `Add the ${skillsName} docs pack`,
      body: `Add ${skillsName} as a dev dependency, then run \`${intentPackage} install\` with your package manager's dlx equivalent — or re-run conciv init.`,
    }),
  }
}
