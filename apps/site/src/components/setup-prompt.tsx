import {Check, ChevronDown, Copy, SquareTerminal} from 'lucide-react'
import {useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {cn} from '@/lib/utils'
import {writeAgentPrompt, type AgentPromptId} from '@/lib/agent-prompts'
import {Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  FRAMEWORKS,
  HARNESSES,
  PLUGINS,
  findFramework,
  findHarness,
  writeSetupPrompt,
  type FrameworkId,
  type HarnessId,
  type PluginId,
  type SetupChoice,
} from '@/lib/setup-prompt'

export function useSetupChoice() {
  const [choice, setChoice] = useState<SetupChoice>({framework: 'vite', harness: 'claude', plugins: []})
  const setFramework = (value: string) => {
    const framework = FRAMEWORKS.find((entry) => entry.id === value)?.id
    if (framework !== undefined) setChoice((current) => ({...current, framework}))
  }
  const setHarness = (value: string) => {
    const harness = HARNESSES.find((entry) => entry.id === value)?.id
    if (harness !== undefined) setChoice((current) => ({...current, harness}))
  }
  const setPlugin = (plugin: PluginId, checked: boolean) =>
    setChoice((current) => ({
      ...current,
      plugins: checked ? [...current.plugins, plugin] : current.plugins.filter((entry) => entry !== plugin),
    }))
  return {choice, prompt: writeSetupPrompt(choice), setFramework, setHarness, setPlugin}
}

export function HarnessIcon({id, className}: {id: HarnessId; className?: string}) {
  const icon = findHarness(id).icon
  return icon === undefined ? (
    <SquareTerminal aria-hidden="true" className={cn('size-4 text-fd-muted-foreground', className)} />
  ) : (
    <img src={icon} alt="" className={cn('size-4', className)} />
  )
}

export function FrameworkIcon({id, className}: {id: FrameworkId; className?: string}) {
  return <img src={findFramework(id).icon} alt="" className={cn('size-4', className)} />
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

export function CopyPromptButton({text, variant = 'outline'}: {text: string; variant?: 'outline' | 'default'}) {
  const {copied, copy} = useCopied()
  return (
    <Button type="button" variant={variant} size="sm" onClick={() => copy(text)} aria-live="polite">
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy Prompt'}
    </Button>
  )
}

const BREAKABLE_TOKEN = /(\S*[-/]\S*)/

export function PromptText({text, className}: {text: string; className?: string}) {
  return (
    <pre
      tabIndex={0}
      aria-label="Prompt"
      className={cn(
        'm-0 overflow-auto overscroll-contain whitespace-pre-wrap break-normal wrap-anywhere border-0 bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.7] text-fd-foreground outline-none focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:ring-inset',
        className,
      )}
    >
      {text.split(BREAKABLE_TOKEN).map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="inline-block max-w-full">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </pre>
  )
}

function PluginsMenu({
  plugins,
  onChange,
}: {
  plugins: readonly PluginId[]
  onChange: (id: PluginId, on: boolean) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="w-32 justify-between">
          {plugins.length === 0 ? 'Plugins' : `Plugins (${plugins.length})`}
          <ChevronDown className="text-fd-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PLUGINS.map((plugin) => (
          <DropdownMenuCheckboxItem
            key={plugin.id}
            checked={plugins.includes(plugin.id)}
            onCheckedChange={(checked) => onChange(plugin.id, checked)}
            onSelect={(event) => event.preventDefault()}
          >
            {plugin.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SetupPrompt() {
  const {choice, prompt, setFramework, setHarness, setPlugin} = useSetupChoice()
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Select value={choice.framework} onValueChange={setFramework}>
          <SelectTrigger aria-label="Framework" size="sm" className="w-40 gap-2">
            <SelectValue>
              <FrameworkIcon id={choice.framework} />
              {findFramework(choice.framework).label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {FRAMEWORKS.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <FrameworkIcon id={entry.id} />
                  {entry.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select value={choice.harness} onValueChange={setHarness}>
          <SelectTrigger aria-label="Agent" size="sm" className="w-40 gap-2">
            <SelectValue>
              <HarnessIcon id={choice.harness} />
              {findHarness(choice.harness).label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectGroup>
              {HARNESSES.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  <HarnessIcon id={entry.id} />
                  {entry.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <PluginsMenu plugins={choice.plugins} onChange={setPlugin} />
        <div className="ms-auto">
          <CopyPromptButton text={prompt} />
        </div>
      </div>
      <PromptText text={prompt} className="h-72" />
    </div>
  )
}

export function CopyPrompt({text}: {text: string}) {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border bg-fd-card">
      <div className="flex items-center justify-between gap-2 border-b py-2 ps-4 pe-3">
        <span className="text-sm text-fd-muted-foreground">Prompt</span>
        <CopyPromptButton text={text} />
      </div>
      <PromptText text={text} />
    </div>
  )
}

export function AgentPrompt({prompt}: {prompt: 'setup' | AgentPromptId}) {
  if (prompt === 'setup') {
    return (
      <>
        <p>Pick your framework, then copy this prompt into your agent.</p>
        <SetupPrompt />
      </>
    )
  }
  return (
    <>
      <p>Copy this prompt into your agent. It builds this in your project from this page.</p>
      <CopyPrompt text={writeAgentPrompt(prompt)} />
    </>
  )
}
