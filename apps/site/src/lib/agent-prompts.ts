const DOCS = 'https://conciv.dev/docs'

const SKILL =
  'If the project has the conciv-develop skill (conciv init installs it with the @conciv/skills docs pack), load it too.'
const INSTALL = 'Install only the packages the page lists, with the package manager this project uses.'
const FRAMEWORK =
  'Write the browser part in the UI framework my app uses. For React or Preact, put it in my app with @conciv/react or @conciv/preact and give it to <ConcivWidget>, as the page shows. For anything else, use Solid in the plugin folder and build it as the page shows.'
const ASK = 'If I did not say what it should do, ask me before you write code.'
const REPORT = 'When you are done, tell me what you changed and how to see it.'
const TOOLS_CHECK = 'Check that the engine sees it: run `npx @conciv/cli tools --help` while the dev server runs.'

type PluginPrompt = {readonly slug: string; readonly goal: readonly string[]; readonly check: readonly string[]}

const PROMPTS = {
  'first-plugin': {
    slug: 'plugins/first-plugin',
    goal: [
      'Add a plugin folder, conciv/plugins/project-version. Its server.ts adds a project_version tool that reads my package.json and returns its name and version.',
      'Add a browser card that shows the name and version for each project_version call.',
      FRAMEWORK,
    ],
    check: [
      `${TOOLS_CHECK} project_version must be listed.`,
      'Tell me to ask the conciv chat "What version is this project?" and to look for the card.',
    ],
  },
  tool: {
    slug: 'plugins/guides/tool',
    goal: [
      'Add a tool to my plugin in conciv/plugins.',
      ASK,
      'Give it a zod input, and fail with a clear message when it cannot do its job, as the page shows.',
    ],
    check: [`${TOOLS_CHECK} The new tool must be listed.`],
  },
  panel: {
    slug: 'plugins/guides/panel',
    goal: ['Add a tab to the conciv panel from my plugin.', ASK, FRAMEWORK],
    check: ['Tell me to open the conciv panel and look for the tab.'],
  },
  'slot-pill': {
    slug: 'plugins/guides/slot-pill',
    goal: ['Add a slot in the conciv panel, or a pill above the composer, from my plugin.', ASK, FRAMEWORK],
    check: ['Tell me where to look for it in the conciv panel.'],
  },
  settings: {
    slug: 'plugins/guides/settings',
    goal: [
      'Give my plugin options from the conciv config, or a setting in the widget settings, as the page shows.',
      ASK,
      FRAMEWORK,
    ],
    check: ['Tell me where the option goes in my config, or where the setting shows in the widget settings.'],
  },
  rpc: {
    slug: 'plugins/guides/rpc',
    goal: [
      "Share an RPC method between my plugin's engine part and its browser part: the contract in rpc.ts, the method in server.ts, and the call in the browser part.",
      ASK,
      FRAMEWORK,
    ],
    check: [
      'While the dev server runs, call the method with `npx @conciv/cli plugin call <plugin> <method> --data <json>` and show me the output.',
    ],
  },
  testing: {
    slug: 'plugins/guides/testing',
    goal: [
      'Write a test for my plugin with @conciv/backend-test-utils: start a real engine with the plugin, and call its tool.',
    ],
    check: ['Run the test with `npx vitest run <the test file>` and show me the result.'],
  },
  'share-a-plugin': {
    slug: 'recipes/share-a-plugin-across-projects',
    goal: [
      'Move my plugin out of conciv/plugins so several projects can use it: a shared folder listed in the plugins option of conciv(), or a package, as the page shows.',
      'Ask me which one, and which projects use it, before you move anything.',
    ],
    check: [`${TOOLS_CHECK} The plugin's tools must still be listed in each project.`],
  },
} satisfies Record<string, PluginPrompt>

export type AgentPromptId = keyof typeof PROMPTS

export function writeAgentPrompt(id: AgentPromptId): string {
  const prompt: PluginPrompt = PROMPTS[id]
  const steps = [
    `Read ${DOCS}/${prompt.slug}.md and follow it. It is the source of truth for the API.`,
    SKILL,
    ...prompt.goal,
    INSTALL,
    ...prompt.check,
    REPORT,
  ]
  return [
    'Build this in my project with conciv. conciv is a dev-only AI agent widget, and it already runs in my app.',
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n')
}
