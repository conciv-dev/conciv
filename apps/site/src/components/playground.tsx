import {useCallback, useId, useRef, useState, type CSSProperties} from 'react'
import {Play} from 'lucide-react'
import {useMediaQuery} from '@/lib/use-media-query'
import {cn} from '@/lib/utils'
import {
  isPlaygroundPage,
  isPlaygroundScriptId,
  playgroundScripts,
  type PlaygroundPage,
  type PlaygroundScriptId,
} from '@/playground/playground-scripts'
import type {PlaygroundProgress} from '@/playground/script'
import {PlaygroundReport, playgroundCommand} from '@/playground/shell-api'
import {Button} from './ui/button'
import {PlaygroundBar} from './playground-bar'
import {PanelStill} from './playground-still'

const CHANNEL = 'conciv-playground'

const BAR_HEIGHT = 40

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
  const frameHeight: CSSProperties & Record<'--frame-height', string> = {'--frame-height': `${props.height}px`}
  return (
    <div
      className="relative flex flex-col gap-4 bg-fd-background p-4 @md:h-(--frame-height) @md:flex-row @md:items-stretch @md:gap-6 @md:pt-9 @md:pr-5 @md:pb-21 @md:pl-8"
      style={frameHeight}
    >
      <div
        className={cn('flex flex-col gap-2 @md:flex-1 @md:justify-center @md:gap-4', props.poster && '@md:invisible')}
      >
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
  const [run, setRun] = useState(0)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState<PlaygroundProgress | undefined>(undefined)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const live = chosen === 'play' || (chosen === undefined && props.autoplay === true && wide && !reducedMotion)
  const claim = useCallback(
    (element: HTMLIFrameElement | null) => {
      if (element === null) return
      frame.current = element
      const listening = new AbortController()
      const channel = new BroadcastChannel(CHANNEL)
      channel.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string' && event.data !== instance) setChosen('stop')
      })
      channel.postMessage(instance)
      window.addEventListener(
        'message',
        (event: MessageEvent<unknown>) => {
          if (event.source !== element.contentWindow || event.origin !== location.origin) return
          const report = PlaygroundReport.safeParse(event.data)
          if (report.success) setProgress(report.data.progress)
        },
        {signal: listening.signal},
      )
      return () => {
        channel.close()
        listening.abort()
        frame.current = null
      }
    },
    [instance],
  )
  const command = (name: 'hold' | 'resume'): void => {
    frame.current?.contentWindow?.postMessage(playgroundCommand(name), location.origin)
    setPaused(name === 'hold')
  }
  const reset = (): void => {
    setPaused(false)
    setProgress(undefined)
  }
  const restart = (): void => {
    reset()
    setRun((current) => current + 1)
  }
  const height = props.height ?? 750
  const title = playgroundScripts[script].title
  return (
    <figure className="@container not-prose my-6 flex flex-col gap-2 xl:w-[calc(min(100vw,var(--fd-layout-width,97rem))-var(--fd-sidebar-col)-var(--fd-toc-col)-4rem)]">
      <div className="overflow-hidden rounded-xl border bg-fd-card">
        <PlaygroundBar
          title={title}
          controls={
            live
              ? {
                  progress,
                  paused,
                  onPause: () => command('hold'),
                  onResume: () => command('resume'),
                  onRestart: restart,
                  onTranscript: () => {
                    reset()
                    setChosen('stop')
                  },
                }
              : undefined
          }
        />
        {live ? (
          <iframe
            key={run}
            ref={claim}
            title={title}
            src={`/playground/${page}/${script}`}
            loading="lazy"
            className="block w-full border-0"
            style={{height: height - BAR_HEIGHT}}
          />
        ) : (
          <Still
            script={script}
            title={title}
            height={height - BAR_HEIGHT}
            poster={props.look === 'poster'}
            onPlay={() => {
              reset()
              setChosen('play')
            }}
          />
        )}
      </div>
      {props.caption === undefined ? null : (
        <figcaption className="text-sm text-fd-muted-foreground">{props.caption}</figcaption>
      )}
    </figure>
  )
}
