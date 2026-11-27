import {join} from 'node:path'
import {addDependencyCommand, dlxCommand} from 'nypm'
import {detectPackageManagerName} from '../detect.js'
import {captureFile, readOptionalText} from '../interrupt.js'
import type {ManualCard} from '../ledger.js'
import type {InitContext, InitStep, SpawnBin} from '../pipeline.js'
import type {AddDep} from './install-it.js'
import {hasDependency, readManifest} from './manifest.js'
import {cliErrors} from '@conciv/errors'

const skillsName = '@conciv/skills'
const intentPackage = '@tanstack/intent@latest'
const intentBlockStartMarker = '<!-- intent-skills:start -->'
const intentBlockEndMarker = '<!-- intent-skills:end -->'

type IntentCommands = {
  spawn: [string, ...string[]]
  intentLine: string
  addCommand: string
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function intentBlockPresent(cwd: string): Promise<boolean> {
  const content = await readOptionalText(join(cwd, 'AGENTS.md'))
  if (content === null) return false
  return content.includes(intentBlockStartMarker) && content.includes(intentBlockEndMarker)
}

async function resolveIntentCommands(cwd: string): Promise<IntentCommands> {
  const pmName = await detectPackageManagerName(cwd)
  const intentLine = dlxCommand(pmName, intentPackage, {args: ['install']})
  const [bin, ...args] = intentLine.split(' ')
  if (bin === undefined) throw cliErrors.EMPTY_DLX_COMMAND({line: intentLine})
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

async function present(ctx: InitContext): Promise<boolean> {
  return hasDependency(await readManifest(ctx.cwd), skillsName) && (await intentBlockPresent(ctx.cwd))
}

export function docsPackStep(add: AddDep, spawn: SpawnBin): InitStep {
  return {
    id: 'docs-pack',
    title: `Add the ${skillsName} docs pack`,
    running: `Adding the ${skillsName} docs pack…`,
    completed: `Added the ${skillsName} docs pack`,
    detect: async (ctx) => ((await present(ctx)) ? 'present' : 'missing'),
    plan: async () => ({
      summary: `add ${skillsName} as a dev dependency and run \`intent install\` for skill-loading guidance`,
      wouldEdit: ['package.json', 'AGENTS.md'],
    }),
    apply: async (ctx) => {
      const depPresent = hasDependency(await readManifest(ctx.cwd), skillsName)
      if (!depPresent) {
        ctx.backup(await captureFile(join(ctx.cwd, 'package.json')))
        const addFailure = await add(skillsName, {cwd: ctx.cwd, signal: ctx.signal}).then(
          () => null,
          (error: unknown) => message(error),
        )
        if (addFailure !== null)
          return {status: 'manual', cards: [await failureCard(ctx.cwd, depPresent)], detail: addFailure}
      }
      if (await intentBlockPresent(ctx.cwd)) return {status: 'done'}
      ctx.backup(await captureFile(join(ctx.cwd, 'AGENTS.md')))
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
    verify: (ctx) => present(ctx),
    manualCard: () => ({
      title: `Add the ${skillsName} docs pack`,
      body: `Add ${skillsName} as a dev dependency, then run \`${intentPackage} install\` with your package manager's dlx equivalent, or re-run conciv init.`,
    }),
  }
}
