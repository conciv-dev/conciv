import type {PlaygroundScript} from './script'
import approvalsAllowOnce from './scripts/approvals/allow-once'
import chatSendAndQueue from './scripts/chat/send-and-queue'
import devServerBuildErrors from './scripts/dev-server/build-errors'
import docsAsk from './scripts/docs/ask'
import gettingStartedAskAboutPage from './scripts/getting-started/ask-about-page'
import introFirstSession from './scripts/intro/first-session'
import liveTestsRun from './scripts/live-tests/run'
import pageControlPointAndChange from './scripts/page-control/point-and-change'
import pluginsFirstPluginCard from './scripts/plugins/first-plugin-card'
import pluginsPanelTab from './scripts/plugins/panel-tab'
import pluginsPermissionCard from './scripts/plugins/permission-card'
import pluginsToolDirectVsCodemode from './scripts/plugins/tool-direct-vs-codemode'
import quickTerminalCommand from './scripts/quick-terminal/command'

const scripts = {
  'intro/first-session': introFirstSession,
  'getting-started/ask-about-page': gettingStartedAskAboutPage,
  'chat/send-and-queue': chatSendAndQueue,
  'page-control/point-and-change': pageControlPointAndChange,
  'approvals/allow-once': approvalsAllowOnce,
  'live-tests/run': liveTestsRun,
  'quick-terminal/command': quickTerminalCommand,
  'dev-server/build-errors': devServerBuildErrors,
  'plugins/first-plugin-card': pluginsFirstPluginCard,
  'plugins/tool-direct-vs-codemode': pluginsToolDirectVsCodemode,
  'plugins/permission-card': pluginsPermissionCard,
  'plugins/panel-tab': pluginsPanelTab,
  'docs/ask': docsAsk,
} satisfies Record<string, PlaygroundScript>

export type PlaygroundScriptId = keyof typeof scripts

export const playgroundScripts: Readonly<Record<PlaygroundScriptId, PlaygroundScript>> = scripts

const playgroundPages = ['vite-react'] as const

export type PlaygroundPage = (typeof playgroundPages)[number]

export function isPlaygroundScriptId(id: string): id is PlaygroundScriptId {
  return Object.hasOwn(scripts, id)
}

export function isPlaygroundPage(page: string): page is PlaygroundPage {
  return playgroundPages.some((known) => known === page)
}
