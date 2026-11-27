import {Check, Copy} from 'lucide-react'
import {useRef, useState, type ReactNode} from 'react'
import {Tab} from 'fumadocs-ui/components/tabs'
import {Tabs} from './docs-tabs'
import {Button} from '@/components/ui/button'
import {writeAgentPrompt, type AgentPromptId} from '@/lib/agent-prompts'
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'

type FrameworkId = 'vite' | 'nextjs' | 'tanstack-start' | 'webpack' | 'rspack' | 'ios'

type Framework = {id: FrameworkId; label: string; icon: string; steps: string[]}

const INIT = 'In my app folder, the one with package.json, run `npx @conciv/cli@latest init --yes`.'
const RUNNER = 'If the project uses pnpm, yarn or bun, run it with pnpm dlx, yarn dlx or bunx instead of npx.'
const WHAT_INIT_DOES =
  'init installs @conciv/it as a dev dependency. It adds conciv to my build config and prints the diff. It writes a conciv section to AGENTS.md, and to CLAUDE.md for Claude Code. It connects the agent CLIs it finds on my machine.'
const MANUAL = 'If init prints a card with a snippet instead of doing a step, do that step yourself from the snippet.'
const DIRTY = 'If init stops on uncommitted changes, ask me before you commit or pass --force.'
const BLOCKED =
  'If the install fails, stop and show me the error. A release age policy can block a new version. Do not change that policy yourself.'
const LOG_IN =
  'Log me in. In the app folder, run `npx @conciv/cli@latest auth link <the app URL>` and give me the link it prints. Or tell me to click the conciv button and type the 6-digit code the dev server prints.'

function webSteps(wire: string[], start: string): string[] {
  return [INIT, RUNNER, WHAT_INIT_DOES, ...wire, MANUAL, DIRTY, BLOCKED, start, LOG_IN]
}

const VITE_START =
  'Start the dev server with my dev script. Open the app in the browser. A conciv button shows in the corner.'
const BUNDLER_START =
  'Start the dev server, or a build in watch mode. A one-off build starts no engine. Open the app in the browser. A conciv button shows in the corner.'

function bundlerWire(name: string): string[] {
  return [
    `Check that init added conciv to the plugins of my ${name} config.`,
    `Check that the config sets mode: 'development'. With no mode, ${name} builds for production and conciv stays off.`,
  ]
}

const FRAMEWORKS: Framework[] = [
  {
    id: 'vite',
    label: 'Vite',
    icon: '/icons/vite.svg',
    steps: webSteps(['Check that init added conciv() to the plugins of my Vite config.'], VITE_START),
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    icon: '/icons/nextjs.svg',
    steps: webSteps(
      [
        'Check that init wrapped my next config with withConciv.',
        'Check that it created instrumentation.ts and instrumentation-client.ts in the app folder.',
        'If my routes live in src/app or src/pages, move both files into src/.',
      ],
      'Start the dev server with my dev script (next dev). Open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    icon: '/icons/tanstack.svg',
    steps: webSteps(
      ['TanStack Start runs on Vite. Check that init added conciv() to the plugins of my Vite config.'],
      VITE_START,
    ),
  },
  {id: 'webpack', label: 'webpack', icon: '/icons/webpack.svg', steps: webSteps(bundlerWire('webpack'), BUNDLER_START)},
  {id: 'rspack', label: 'Rspack', icon: '/icons/rspack.svg', steps: webSteps(bundlerWire('Rspack'), BUNDLER_START)},
  {
    id: 'ios',
    label: 'iOS (alpha)',
    icon: '/icons/apple.svg',
    steps: [
      'conciv for iOS needs a web dev server that runs conciv. If my repo has none, ask me which web project to use.',
      `${INIT} Use the web project that will run the engine.`,
      RUNNER,
      BLOCKED,
      'Add the Swift package https://github.com/conciv-dev/conciv-swift.git to my app. Use the version that matches the @conciv/it version init installed.',
      'Add the ConcivWidget product to the target that shows my UI.',
      'Call ConcivWidget.attach() once at app start, in my SwiftUI App init or my scene delegate.',
      'Start the dev server. Then build and run a Debug build in the iOS simulator. A Release build shows no widget.',
      'Tell me to tap the conciv button and type the 6-digit code the dev server prints.',
    ],
  },
]

const FALLBACK: Framework = FRAMEWORKS[0] ?? {id: 'vite', label: 'Vite', icon: '', steps: []}

function numbered(steps: string[]): string {
  return [
    'Set up conciv in this project. conciv is a dev-only AI agent widget for my running app.',
    '',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ].join('\n')
}

function useCopied() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    })
  }
  return {copied, copy}
}

function CopyPromptButton({text}: {text: string}) {
  const {copied, copy} = useCopied()
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => copy(text)} aria-live="polite">
      {copied ? <Check className="text-primary" /> : <Copy />}
      {copied ? 'Copied' : 'Copy Prompt'}
    </Button>
  )
}

const BREAKABLE_TOKEN = /(\S*[-/]\S*)/

function PromptText({text}: {text: string}) {
  return (
    <pre className="m-0 overflow-x-auto whitespace-pre-wrap break-normal border-0 bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.7] text-fd-foreground">
      {text.split(BREAKABLE_TOKEN).map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </pre>
  )
}

export function SetupPrompt({framework: initial}: {framework?: FrameworkId}) {
  const [frameworkId, setFrameworkId] = useState<string>(initial ?? FALLBACK.id)
  const framework = FRAMEWORKS.find((entry) => entry.id === frameworkId) ?? FALLBACK
  const prompt = numbered(framework.steps)
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex flex-wrap items-center justify-start gap-2 border-b px-3 py-2 sm:justify-between">
        <Select value={framework.id} onValueChange={setFrameworkId}>
          <SelectTrigger aria-label="Framework" size="sm" className="gap-2">
            <SelectValue>
              <img src={framework.icon} alt="" className="size-4" />
              {framework.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {FRAMEWORKS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <img src={entry.icon} alt="" className="size-4" />
                  {entry.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <CopyPromptButton text={prompt} />
      </div>
      <PromptText text={prompt} />
    </div>
  )
}

export function CopyPrompt({text}: {text: string}) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex items-center justify-start border-b px-3 py-2 sm:justify-end">
        <CopyPromptButton text={text} />
      </div>
      <PromptText text={text} />
    </div>
  )
}

export function AgentsHumans({prompt, children}: {prompt: 'setup' | AgentPromptId; children: ReactNode}) {
  return (
    <Tabs groupId="reader" persist items={['Agents', 'Humans']} defaultIndex={1}>
      <Tab value="Agents">
        <p>
          {prompt === 'setup'
            ? 'Pick your framework, copy the prompt, and paste it into your coding agent. It runs every step on this page for you.'
            : 'Copy this into your coding agent. It builds this in your project, from this page.'}
        </p>
        {prompt === 'setup' ? <SetupPrompt /> : <CopyPrompt text={writeAgentPrompt(prompt)} />}
      </Tab>
      <Tab value="Humans">{children}</Tab>
    </Tabs>
  )
}
