import {useCallback, useId, useState, type CSSProperties} from 'react'
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
import {Button} from './ui/button'
import {PanelStill} from './playground-still'

const CHANNEL = 'conciv-playground'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border bg-fd-secondary px-3 py-1.5 text-sm font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent'

function readPlayground(page: string, script: string): {page: PlaygroundPage; script: PlaygroundScriptId} {
  if (!isPlaygroundPage(page)) throw new Error(`no playground page ${page}`)
  if (!isPlaygroundScriptId(script)) throw new Error(`no playground script ${script}`)
  return {page, script}
}

function PlayButton({onPlay, className}: {onPlay: () => void; className?: string}) {
  return (
    <Button type="button" size="lg" className={cn('h-11 gap-2 px-5 text-base', className)} onClick={onPlay}>
      <Play className="size-4.5 fill-current" aria-hidden="true" />
      Play
    </Button>
  )
}

function Still(props: {
  script: PlaygroundScriptId
  title: string
  height: number
  poster: boolean
  onPlay: () => void
}) {
  return (
    <div
      className="relative flex flex-col gap-4 bg-fd-background p-4 @md:h-(--frame-height) @md:flex-row @md:items-stretch @md:gap-6 @md:pt-9 @md:pr-5 @md:pb-21 @md:pl-8"
      style={{'--frame-height': `${props.height}px`} as CSSProperties}
    >
      <div
        className={cn('flex flex-col gap-2 @md:flex-1 @md:justify-center @md:gap-4', props.poster && '@md:invisible')}
      >
        <p className="text-lg font-semibold text-fd-foreground @md:text-2xl">{props.title}</p>
        <p className="text-sm text-fd-muted-foreground">
          A scripted session in the real panel. It plays in your browser, with no server.
        </p>
        <PlayButton onPlay={props.onPlay} className="hidden self-start @md:inline-flex" />
        <p className="text-sm text-fd-muted-foreground @md:hidden">Open on a wider screen to play it.</p>
      </div>
      <PanelStill
        script={props.script}
        className={cn('@md:w-125 @md:max-w-[65%] @md:shrink-0', props.poster && '@md:opacity-60 @md:blur-[2px]')}
      />
      {props.poster ? (
        <div className="absolute inset-0 hidden flex-col items-center justify-center gap-4 @md:flex">
          <p className="rounded-lg bg-fd-background/80 px-3 py-1 text-2xl font-semibold text-fd-foreground">
            {props.title}
          </p>
          <PlayButton onPlay={props.onPlay} className="shadow-lg" />
        </div>
      ) : null}
    </div>
  )
}

export function Playground(props: {
  page: string
  script: string
  height?: number
  caption?: string
  autoplay?: boolean
  look?: 'frame' | 'poster'
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
    <figure className="@container not-prose my-6 flex flex-col gap-2 xl:w-[calc(min(100vw,var(--fd-layout-width,97rem))-var(--fd-sidebar-col)-var(--fd-toc-col)-4rem)]">
      <div className="overflow-hidden rounded-xl border bg-fd-card">
        {live ? (
          <iframe
            ref={claim}
            title={title}
            src={`/playground/${page}/${script}`}
            loading="lazy"
            className="block w-full border-0"
            style={{height: props.height ?? 750}}
          />
        ) : (
          <Still
            script={script}
            title={title}
            height={props.height ?? 750}
            poster={props.look === 'poster'}
            onPlay={() => setChosen('play')}
          />
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
