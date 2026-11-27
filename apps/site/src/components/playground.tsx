import {useCallback, useId, useState} from 'react'
import {Play, Square} from 'lucide-react'
import {useMediaQuery} from '@/lib/use-media-query'
import {cn} from '@/lib/utils'
import {
  isPlaygroundPage,
  isPlaygroundScriptId,
  playgroundScripts,
  type PlaygroundPage,
  type PlaygroundScriptId,
} from '@/playground/playground-scripts'
import type {PageEdit, Reply, UiStep} from '@/playground/script'

const CHANNEL = 'conciv-playground'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border bg-fd-secondary px-3 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent'

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

function describeReply(reply: Reply): string {
  if (reply.kind !== 'tool') return plain(reply.text)
  const how = reply.mode === 'code' ? ' from a code mode program' : ''
  const ask = reply.ask === undefined ? '' : ` A permission card asks first, and the reader clicks ${reply.ask.answer}.`
  const page = reply.page === undefined ? '' : ` On the page, ${describeEdit(reply.page)}.`
  return `The agent calls ${reply.name}${how}.${ask}${page}`
}

function describeStep(step: UiStep): string {
  if (step.kind === 'point') return `The reader points at the “${step.label}” ${step.role} on the page.`
  return `The reader clicks “${step.label}”.`
}

function Transcript({script}: {script: PlaygroundScriptId}) {
  return (
    <ol className="flex flex-col gap-3 p-0 list-none">
      {playgroundScripts[script].turns.map((turn) => (
        <li key={turn.prompt} className="flex flex-col gap-1.5">
          {(turn.before ?? []).map((step) => (
            <p key={step.label} className="text-fd-muted-foreground">
              {describeStep(step)}
            </p>
          ))}
          <p className="font-medium text-fd-foreground">
            <span className="text-fd-muted-foreground">{turn.queued === true ? 'You, while it runs: ' : 'You: '}</span>
            {turn.prompt}
          </p>
          {turn.replies.map((reply, index) => (
            <p
              key={`${reply.kind}-${index}`}
              className={reply.kind === 'text' ? 'text-fd-foreground' : 'text-fd-muted-foreground'}
            >
              {describeReply(reply)}
            </p>
          ))}
          {(turn.after ?? []).map((step) => (
            <p key={step.label} className="text-fd-muted-foreground">
              {describeStep(step)}
            </p>
          ))}
        </li>
      ))}
    </ol>
  )
}

function readPlayground(page: string, script: string): {page: PlaygroundPage; script: PlaygroundScriptId} {
  if (!isPlaygroundPage(page)) throw new Error(`no playground page ${page}`)
  if (!isPlaygroundScriptId(script)) throw new Error(`no playground script ${script}`)
  return {page, script}
}

export function Playground(props: {
  page: string
  script: string
  height?: number
  caption?: string
  autoplay?: boolean
}) {
  const {page, script} = readPlayground(props.page, props.script)
  const instance = useId()
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
  const wide = useMediaQuery('(min-width: 48rem)')
  const [chosen, setChosen] = useState<'play' | 'stop' | undefined>(undefined)
  const live = chosen === 'play' || (chosen === undefined && props.autoplay === true && wide && !reducedMotion)
  const claim = useCallback(
    (frame: HTMLIFrameElement | null) => {
      if (frame === null) return
      const channel = new BroadcastChannel(CHANNEL)
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string' && event.data !== instance) setChosen('stop')
      })
      channel.postMessage(instance)
      return () => channel.close()
    },
    [instance],
  )
  const title = playgroundScripts[script].title
  return (
    <figure className="@container not-prose my-6 flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border bg-fd-card">
        {live ? (
          <iframe
            ref={claim}
            title={title}
            src={`/playground/${page}/${script}`}
            loading="lazy"
            className="block w-full border-0"
            style={{height: props.height ?? 560}}
          />
        ) : (
          <div className="flex flex-col gap-4 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-fd-foreground">{title}</p>
              <button type="button" className={cn(BUTTON, 'hidden @md:inline-flex')} onClick={() => setChosen('play')}>
                <Play className="size-4" aria-hidden="true" />
                Play
              </button>
            </div>
            <Transcript script={script} />
            <p className="text-fd-muted-foreground @md:hidden">Open on a wider screen to play it.</p>
          </div>
        )}
      </div>
      <figcaption className="flex items-center justify-between gap-3 text-sm text-fd-muted-foreground">
        <span>{props.caption}</span>
        {live ? (
          <button type="button" className={BUTTON} onClick={() => setChosen('stop')}>
            <Square className="size-4" aria-hidden="true" />
            Show the transcript
          </button>
        ) : null}
      </figcaption>
    </figure>
  )
}
