import type {HarnessInit, HarnessInitCard, HarnessInitCommand, HarnessInitPlan} from '@conciv/protocol/harness-types'
import {claudeConfigDir, claudeConnectServesProject} from './install-state.js'
import {claudeConnectDir, claudeConnectPluginFiles, CLAUDE_CONNECT_INSTALL_TARGET} from './plugin-files.js'

const INSTALL_ARGS = ['plugin', 'install', CLAUDE_CONNECT_INSTALL_TARGET, '--scope', 'local']

function shellQuoted(value: string): string {
  return `'${value.split("'").join(`'\\''`)}'`
}

function installCommands(root: string): HarnessInitCommand[] {
  return [
    {bin: 'claude', args: ['plugin', 'marketplace', 'add', root]},
    {bin: 'claude', args: INSTALL_ARGS},
  ]
}

function installPlan(stateDir: string): HarnessInitPlan {
  const root = claudeConnectDir(stateDir)
  return {root, files: claudeConnectPluginFiles({stateDir}), commands: installCommands(root)}
}

function installCard(root: string): HarnessInitCard {
  return {
    title: 'Install the conciv claude plugin',
    body: 'Register the generated conciv marketplace and install the connect plugin with the claude CLI. Full steps: https://conciv.dev/docs/quick-start/agents',
    snippet: [`claude plugin marketplace add ${shellQuoted(root)}`, `claude ${INSTALL_ARGS.join(' ')}`].join('\n'),
  }
}

export const claudeInit: HarnessInit<'claude'> = {
  harnessId: 'claude',
  detection: {bin: 'claude', configDir: ['.claude']},
  init: 'files',
  title: 'Install the conciv claude plugin',
  running: 'Installing the conciv claude plugin…',
  completed: 'Installed the conciv claude plugin',
  planSummary: `install ${CLAUDE_CONNECT_INSTALL_TARGET} through the claude plugin manager`,
  plan: (project) => installPlan(project.stateDir),
  installed: (project) =>
    claudeConnectServesProject({
      configDir: claudeConfigDir({home: project.home, override: process.env.CLAUDE_CONFIG_DIR}),
      stateDir: project.stateDir,
      root: project.cwd,
      files: claudeConnectPluginFiles({stateDir: project.stateDir}),
    }),
  manualCard: installCard,
}
