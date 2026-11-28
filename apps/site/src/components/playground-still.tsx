import {ChevronRight, MousePointer2, Wrench} from 'lucide-react'
import {cn} from '@/lib/utils'
import {playgroundScripts, type PlaygroundScriptId} from '@/playground/playground-scripts'
import type {PageEdit, ToolReply, UiStep} from '@/playground/script'

function plain(text: string): string {
  return text.replaceAll('**', '').replaceAll('`', '')
}

function describeEdit(edit: PageEdit): string {
  return [
    edit.heading === undefined ? [] : [`the heading reads “${edit.heading}”`],
    edit.button === undefined ? [] : [`the button says “${edit.button}”`],
    edit.count === undefined ? [] : [`the count is ${edit.count}`],
  ]
    .flat()
    .join(', ')
}

function describeTool(reply: ToolReply): string {
  return [
    reply.mode === 'code' ? ['From a code mode program.'] : [],
    reply.ask === undefined ? [] : [`A permission card asks first: ${reply.ask.answer}.`],
    reply.page === undefined ? [] : [`On the page, ${describeEdit(reply.page)}.`],
  ]
    .flat()
    .join(' ')
}

function describeStep(step: UiStep): string {
  if (step.kind === 'point') return `The reader points at the “${step.label}” ${step.role} on the page.`
  return `The reader clicks “${step.label}”.`
}

function StepRow({step}: {step: UiStep}) {
  return (
    <p className="flex items-center gap-2 text-xs text-fd-muted-foreground">
      <MousePointer2 className="size-3.5 shrink-0" aria-hidden="true" />
      {describeStep(step)}
    </p>
  )
}

function ToolRow({reply}: {reply: ToolReply}) {
  const detail = describeTool(reply)
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-fd-muted/60 px-3 py-2">
      <p className="flex items-center gap-2 text-xs">
        <Wrench className="size-3.5 shrink-0 text-fd-muted-foreground" aria-hidden="true" />
        <span className="sr-only">The agent calls </span>
        <code className="font-mono text-fd-foreground">{reply.name}</code>
      </p>
      {detail === '' ? null : <p className="text-xs text-fd-muted-foreground">{detail}</p>}
    </div>
  )
}

function Messages({script}: {script: PlaygroundScriptId}) {
  return (
    <ol className="flex list-none flex-col gap-5 p-0">
      {playgroundScripts[script].turns.map((turn) => (
        <li key={turn.prompt} className="flex flex-col gap-2.5">
          {(turn.before ?? []).map((step) => (
            <StepRow key={step.label} step={step} />
          ))}
          <p className="flex gap-2 font-mono text-sm text-fd-foreground">
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-fd-primary" aria-hidden="true" />
            <span>
              <span className="sr-only">You: </span>
              {turn.prompt}
              {turn.queued === true ? (
                <span className="ms-2 rounded border px-1.5 py-0.5 text-xs text-fd-muted-foreground">queued</span>
              ) : null}
            </span>
          </p>
          <div className="flex flex-col gap-2.5 ps-6">
            {turn.replies.map((reply, index) =>
              reply.kind === 'tool' ? (
                <ToolRow key={`tool-${index}`} reply={reply} />
              ) : (
                <p
                  key={`${reply.kind}-${index}`}
                  className={cn(
                    'text-sm',
                    reply.kind === 'thinking' ? 'text-fd-muted-foreground italic' : 'text-fd-foreground',
                  )}
                >
                  {plain(reply.text)}
                </p>
              ),
            )}
            {(turn.after ?? []).map((step) => (
              <StepRow key={step.label} step={step} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function PanelStill({script, className}: {script: PlaygroundScriptId; className?: string}) {
  const {title} = playgroundScripts[script]
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border bg-fd-card shadow-lg', className)}>
      <div className="flex flex-col gap-0.5 border-b px-4 py-3">
        <p className="font-mono text-xs tracking-widest text-fd-muted-foreground uppercase" aria-hidden="true">
          conciv / transcript
        </p>
        <p className="text-sm font-semibold text-fd-foreground">{title}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 @md:mask-b-from-85%">
        <Messages script={script} />
      </div>
      <p
        className="flex items-center gap-2 border-t px-4 py-3 font-mono text-sm text-fd-muted-foreground"
        aria-hidden="true"
      >
        <ChevronRight className="size-4 text-fd-primary" />
        Add an instruction…
      </p>
    </div>
  )
}
