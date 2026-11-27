import {useId, type ReactNode} from 'react'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {FRAMEWORKS, HARNESSES, PLUGINS} from '@/lib/setup-prompt'
import {CopyPromptButton, FrameworkIcon, HarnessIcon, PromptText, useSetupChoice} from './setup-prompt'

const cardClass =
  'flex cursor-pointer items-center gap-2 rounded-lg border bg-fd-card px-3 py-2.5 text-sm transition-colors select-none hover:bg-fd-accent/50 has-focus-visible:ring-2 has-focus-visible:ring-fd-ring has-data-[state=checked]:border-fd-primary'

const gridClass = 'grid grid-cols-2 gap-2 sm:grid-cols-3'

function ChoiceCard({icon, label, control}: {icon?: ReactNode; label: string; control: ReactNode}) {
  return (
    <label className={cardClass}>
      {icon}
      <span className="min-w-0 leading-tight sm:truncate">{label}</span>
      <span className="ms-auto flex shrink-0">{control}</span>
    </label>
  )
}

function SectionLabel({id, children}: {id: string; children: ReactNode}) {
  return (
    <p id={id} className="font-mono text-[11px] tracking-[0.06em] text-fd-muted-foreground uppercase">
      {children}
    </p>
  )
}

function CopyPromptForm() {
  const {choice, prompt, setFramework, setHarness, setPlugin} = useSetupChoice()
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-2">
        <SectionLabel id={`${id}-framework`}>Framework</SectionLabel>
        <RadioGroup
          value={choice.framework}
          onValueChange={setFramework}
          aria-labelledby={`${id}-framework`}
          className={gridClass}
        >
          {FRAMEWORKS.map((entry) => (
            <ChoiceCard
              key={entry.id}
              icon={<FrameworkIcon id={entry.id} className="shrink-0" />}
              label={entry.label}
              control={<RadioGroupItem value={entry.id} aria-label={entry.label} />}
            />
          ))}
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-2">
        <SectionLabel id={`${id}-agent`}>Agent</SectionLabel>
        <RadioGroup
          value={choice.harness}
          onValueChange={setHarness}
          aria-labelledby={`${id}-agent`}
          className={gridClass}
        >
          {HARNESSES.map((entry) => (
            <ChoiceCard
              key={entry.id}
              icon={<HarnessIcon id={entry.id} className="shrink-0" />}
              label={entry.label}
              control={<RadioGroupItem value={entry.id} aria-label={entry.label} />}
            />
          ))}
        </RadioGroup>
      </div>
      <div className="flex flex-col gap-2">
        <SectionLabel id={`${id}-plugins`}>Plugins</SectionLabel>
        <div role="group" aria-labelledby={`${id}-plugins`} className={gridClass}>
          {PLUGINS.map((plugin) => (
            <ChoiceCard
              key={plugin.id}
              label={plugin.label}
              control={
                <Checkbox
                  aria-label={plugin.label}
                  checked={choice.plugins.includes(plugin.id)}
                  onCheckedChange={(checked) => setPlugin(plugin.id, checked === true)}
                />
              }
            />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border bg-fd-card">
        <PromptText text={prompt} className="h-40 sm:h-56" />
      </div>
      <DialogFooter className="mx-0 mb-0 border-t-0 bg-transparent p-0">
        <DialogClose asChild>
          <Button variant="outline" size="sm">
            Close
          </Button>
        </DialogClose>
        <CopyPromptButton text={prompt} variant="default" />
      </DialogFooter>
    </div>
  )
}

export function QuickstartDialog({className}: {className?: string}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className={className}>
          Quickstart
        </Button>
      </DialogTrigger>
      <DialogContent className="top-[12vh] max-h-[80vh] translate-y-0 gap-5 overflow-y-auto p-6 sm:max-w-[40rem]">
        <DialogHeader>
          <DialogTitle className="text-lg">Copy Prompt</DialogTitle>
          <DialogDescription>Pick your framework, then copy this prompt into your agent.</DialogDescription>
        </DialogHeader>
        <CopyPromptForm />
      </DialogContent>
    </Dialog>
  )
}
