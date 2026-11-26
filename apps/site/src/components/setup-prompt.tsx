import {Check, Copy} from 'lucide-react'
import {useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'

type Framework = {id: string; label: string; icon: string; steps: string[]}

const INIT = 'Run `npx @conciv/cli@latest init --yes` in my app folder, the one with package.json.'
const RUNNER = 'If the project uses pnpm, yarn or bun, run the same command with pnpm dlx, yarn dlx or bunx instead.'
const WHAT_INIT_DOES =
  'init installs @conciv/it as a dev dependency. It wires conciv into my build config and prints the diff. It writes a conciv section to AGENTS.md, and to CLAUDE.md when I use Claude Code. It connects the agent CLIs it finds on my machine.'
const DIRTY = 'If init stops on uncommitted changes, ask me before you commit or pass --force.'
const BLOCKED =
  'If the install fails, stop and show me the error. A release age policy can block a new version. Do not change that policy yourself.'
const LOG_IN =
  'Log me in. Run `npx @conciv/cli@latest auth link <the app URL>` in the app folder and give me the link from its output. Or tell me to type the 6-digit code the dev server printed.'

function webSteps(wire: string, start: string): string[] {
  return [INIT, RUNNER, WHAT_INIT_DOES, wire, DIRTY, BLOCKED, start, LOG_IN]
}

const FRAMEWORKS: Framework[] = [
  {
    id: 'vite',
    label: 'Vite',
    icon: '/icons/vite.svg',
    steps: webSteps(
      'init adds conciv() to the plugins of my Vite config. Check that the diff did that.',
      'Start the dev server with my dev script, then open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'nextjs',
    label: 'Next.js',
    icon: '/icons/nextjs.svg',
    steps: webSteps(
      'init wraps my next config with withConciv. It creates instrumentation.ts and instrumentation-client.ts. Check that the diff did that.',
      'Start the dev server with my dev script (next dev), then open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'tanstack-start',
    label: 'TanStack Start',
    icon: '/icons/tanstack.svg',
    steps: webSteps(
      'TanStack Start runs on Vite. init adds conciv() to the plugins of my Vite config. Check that the diff did that.',
      'Start the dev server with my dev script, then open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'webpack',
    label: 'webpack',
    icon: '/icons/webpack.svg',
    steps: webSteps(
      "init adds conciv to the plugins of my webpack config. Check that the config sets mode: 'development'. With no mode, webpack builds for production and conciv stays off.",
      'Start the webpack dev server, or a build in watch mode. A one-off build does not start conciv. Then open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'rspack',
    label: 'Rspack',
    icon: '/icons/rspack.svg',
    steps: webSteps(
      "init adds conciv to the plugins of my Rspack config. Check that the config sets mode: 'development'. With no mode, Rspack builds for production and conciv stays off.",
      'Start the Rspack dev server, or a build in watch mode. A one-off build does not start conciv. Then open the app in the browser. A conciv button shows in the corner.',
    ),
  },
  {
    id: 'ios',
    label: 'iOS (alpha)',
    icon: '/icons/apple.svg',
    steps: [
      'conciv for iOS needs a dev server that runs conciv. If my repo has none, ask me which web project to use.',
      INIT + ' Use the web project that will run the engine.',
      RUNNER,
      BLOCKED,
      'Add the Swift package https://github.com/conciv-dev/conciv-swift.git to my app. Use the version that matches the @conciv/it version init installed.',
      'Add the ConcivWidget product to the target that shows my UI.',
      'Call ConcivWidget.attach() once at app start, in my SwiftUI App init or my scene delegate.',
      'Start the dev server. Then build and run a Debug build in the iOS simulator. A Release build shows no widget.',
      'Tell me to tap the conciv button and type the 6-digit code the dev server printed.',
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

function PromptText({text}: {text: string}) {
  return (
    <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap border-0 bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.7] text-fd-foreground">
      {text}
    </pre>
  )
}

export function SetupPrompt() {
  const [frameworkId, setFrameworkId] = useState(FALLBACK.id)
  const framework = FRAMEWORKS.find((entry) => entry.id === frameworkId) ?? FALLBACK
  const prompt = numbered(framework.steps)
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <Select value={framework.id} onValueChange={setFrameworkId}>
          <SelectTrigger aria-label="Framework" size="sm" className="gap-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {FRAMEWORKS.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                <img src={entry.icon} alt="" className="size-4" />
                {entry.label}
              </SelectItem>
            ))}
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
      <div className="flex items-center justify-end border-b px-3 py-2">
        <CopyPromptButton text={text} />
      </div>
      <PromptText text={text} />
    </div>
  )
}
