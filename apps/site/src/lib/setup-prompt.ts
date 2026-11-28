export type FrameworkId = 'vite' | 'nextjs' | 'tanstack-start' | 'webpack' | 'rspack' | 'ios'

export type HarnessId = 'claude' | 'codex' | 'gemini-cli' | 'opencode'

export type PluginId = 'test-runner' | 'recorder' | 'tanstack' | 'whiteboard' | 'ios'

export type SetupChoice = {framework: FrameworkId; harness: HarnessId; plugins: readonly PluginId[]}

type Framework = {
  id: FrameworkId
  label: string
  icon: string
  check: string
  start: string
  call: (options: string) => string
}

type Harness = {id: HarnessId; label: string; icon?: string; cli: string}

type Plugin = {id: PluginId; label: string; entry: string; note?: string}

const VITE_START = 'Start the dev server with my dev script and open the app. A conciv button shows in the corner.'
const BUNDLER_START =
  'Start the dev server, or a build in watch mode (a one-off build starts no engine), and open the app. A conciv button shows in the corner.'
const VITE_CHECK = 'Check that init added conciv() to the plugins of my Vite config.'

function bundlerCheck(name: string): string {
  return `Check that init added conciv to the plugins of my ${name} config, and that the config sets mode: 'development' (with no mode, ${name} builds for production and conciv stays off).`
}

function viteCall(options: string): string {
  return `conciv(${options}) in my Vite config`
}

function bundlerCall(name: string): (options: string) => string {
  return (options) => `conciv.default(${options}) in my ${name} config`
}

const VITE: Framework = {
  id: 'vite',
  label: 'Vite',
  icon: '/icons/vite.svg',
  check: VITE_CHECK,
  start: VITE_START,
  call: viteCall,
}

export const FRAMEWORKS: readonly Framework[] = [
  VITE,
  {
    id: 'nextjs',
    label: 'Next.js',
    icon: '/icons/nextjs.svg',
    check:
      'Check that init wrapped my next config with withConciv and created instrumentation.ts and instrumentation-client.ts. If my routes live in src/app or src/pages, move both files into src/.',
    start: VITE_START,
    call: (options) => `withConciv(nextConfig, ${options}) in my next config`,
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    icon: '/icons/tanstack.svg',
    check: VITE_CHECK,
    start: VITE_START,
    call: viteCall,
  },
  {
    id: 'webpack',
    label: 'webpack',
    icon: '/icons/webpack.svg',
    check: bundlerCheck('webpack'),
    start: BUNDLER_START,
    call: bundlerCall('webpack'),
  },
  {
    id: 'rspack',
    label: 'Rspack',
    icon: '/icons/rspack.svg',
    check: bundlerCheck('Rspack'),
    start: BUNDLER_START,
    call: bundlerCall('Rspack'),
  },
  {
    id: 'ios',
    label: 'iOS (alpha)',
    icon: '/icons/apple.svg',
    check:
      'Add the Swift package https://github.com/conciv-dev/conciv-swift.git (the version that matches the @conciv/it init installed) to my app, add the ConcivWidget product to the target that shows my UI, and call ConcivWidget.attach() once at app start.',
    start:
      'Start the dev server, then build and run a Debug build in the iOS simulator (a Release build shows no widget).',
    call: (options) => `the conciv plugin options in the web project's bundler config, as ${options}`,
  },
]

const CLAUDE: Harness = {id: 'claude', label: 'Claude Code', icon: '/icons/claude-ai.svg', cli: 'claude'}

export const HARNESSES: readonly Harness[] = [
  CLAUDE,
  {id: 'codex', label: 'Codex', cli: 'codex'},
  {id: 'gemini-cli', label: 'Gemini CLI', cli: 'gemini'},
  {id: 'opencode', label: 'opencode', cli: 'opencode'},
]

export const PLUGINS: readonly Plugin[] = [
  {
    id: 'test-runner',
    label: 'Test runner',
    entry: "'@conciv/plugin-test-runner'",
    note: "The test runner runs Vitest by default; for Playwright write ['@conciv/plugin-test-runner', {runner: 'playwright'}].",
  },
  {id: 'recorder', label: 'Recorder', entry: "'@conciv/plugin-recorder'"},
  {id: 'tanstack', label: 'TanStack', entry: "'@conciv/plugin-tanstack'"},
  {id: 'whiteboard', label: 'Whiteboard', entry: "'@conciv/plugin-whiteboard'"},
  {
    id: 'ios',
    label: 'iOS',
    entry: "['@conciv/plugin-ios', {projectRoot: '<my iOS project folder>', bundleId: '<my app bundle id>'}]",
    note: 'Ask me for the iOS projectRoot and bundleId.',
  },
]

const INIT =
  'In my app folder, the one with package.json, run `npx @conciv/cli@latest init --yes`, with pnpm dlx, yarn dlx or bunx instead of npx if the project uses that package manager. Do any step it prints as a snippet yourself. If it stops on uncommitted changes or the install fails, stop and ask me; do not pass --force or change a release age policy yourself.'

const LOG_IN =
  'Log me in: run `npx @conciv/cli@latest auth link <the app URL>` in the app folder and give me the link it prints, or tell me to click the conciv button and type the 6-digit code the dev server prints.'

const IOS_INIT =
  'conciv for iOS needs a web dev server that runs conciv; if my repo has none, ask me which web project to use.'

export function findFramework(id: FrameworkId): Framework {
  return FRAMEWORKS.find((entry) => entry.id === id) ?? VITE
}

export function findHarness(id: HarnessId): Harness {
  return HARNESSES.find((entry) => entry.id === id) ?? CLAUDE
}

function writeOptions(harness: HarnessId, plugins: readonly Plugin[]): string | undefined {
  const fields = [
    ...(harness === 'claude' ? [] : [`harness: '${harness}'`]),
    ...(plugins.length === 0 ? [] : [`plugins: [${plugins.map((plugin) => plugin.entry).join(', ')}]`]),
  ]
  return fields.length === 0 ? undefined : `{${fields.join(', ')}}`
}

function writeConfigStep(framework: Framework, harness: HarnessId, plugins: readonly Plugin[]): string[] {
  const options = writeOptions(harness, plugins)
  if (options === undefined) return []
  const notes =
    plugins.length === 0 ? [] : ['The engine installs plugin packages itself; do not add them to package.json.']
  const pluginNotes = plugins.flatMap((plugin) => (plugin.note === undefined ? [] : [plugin.note]))
  return [[`Set ${framework.call(options)}.`, ...notes, ...pluginNotes].join(' ')]
}

export function writeSetupPrompt(choice: SetupChoice): string {
  const framework = findFramework(choice.framework)
  const harness = findHarness(choice.harness)
  const plugins = PLUGINS.filter((plugin) => choice.plugins.includes(plugin.id))
  const steps = [
    framework.id === 'ios' ? `${IOS_INIT} ${INIT}` : INIT,
    framework.check,
    ...writeConfigStep(framework, harness.id, plugins),
    `Check that the ${harness.cli} CLI is installed, logged in and on the PATH of the shell that starts the dev server. conciv does not install it or log in; if it is missing, tell me.`,
    `${framework.start} ${LOG_IN}`,
  ]
  return [
    'Set up conciv in this project. conciv is a dev-only AI agent widget for my running app.',
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n')
}
