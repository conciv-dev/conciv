import type {ReactNode} from 'react'
import {Pause, Play, RotateCcw, ScrollText} from 'lucide-react'
import type {PlaygroundProgress} from '@/playground/script'
import {PLAYGROUND_SPEEDS, type PlaygroundSpeed} from '@/playground/shell-api'
import {Button} from './ui/button'
import {Slider} from './ui/slider'
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from './ui/tooltip'

type PlaygroundControls = {
  readonly progress: PlaygroundProgress | undefined
  readonly paused: boolean
  readonly speed: PlaygroundSpeed
  readonly onSpeed: (speed: PlaygroundSpeed) => void
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onRestart: () => void
  readonly onTranscript: () => void
}

function BarButton(props: {label: string; disabled?: boolean; onClick: () => void; children: ReactNode}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {props.label}
      </TooltipContent>
    </Tooltip>
  )
}

function describeProgress(progress: PlaygroundProgress | undefined, paused: boolean): string {
  if (progress === undefined) return 'Starting'
  if (progress.ended) return 'Done'
  const step = `Turn ${progress.turn} of ${progress.turns}`
  return paused ? `${step}, paused` : step
}

function progressShare(progress: PlaygroundProgress | undefined): number {
  if (progress === undefined) return 0
  if (progress.ended) return 1
  return (progress.turn - 0.5) / progress.turns
}

function PlayToggle({controls}: {controls: PlaygroundControls}) {
  if (controls.progress?.ended === true)
    return (
      <BarButton label="Replay" onClick={controls.onRestart}>
        <RotateCcw aria-hidden="true" />
      </BarButton>
    )
  if (controls.paused)
    return (
      <BarButton label="Resume" onClick={controls.onResume}>
        <Play className="fill-current" aria-hidden="true" />
      </BarButton>
    )
  return (
    <BarButton label="Pause" disabled={controls.progress === undefined} onClick={controls.onPause}>
      <Pause className="fill-current" aria-hidden="true" />
    </BarButton>
  )
}

function SpeedSlider({speed, onSpeed}: {speed: PlaygroundSpeed; onSpeed: (speed: PlaygroundSpeed) => void}) {
  const label = `${speed}x`
  return (
    <div className="flex items-center gap-2 pe-1">
      <Slider
        className="w-14"
        thumb={{'aria-label': 'Playback speed', 'aria-valuetext': label}}
        min={0}
        max={PLAYGROUND_SPEEDS.length - 1}
        step={1}
        value={[PLAYGROUND_SPEEDS.indexOf(speed)]}
        onValueChange={([index]) => {
          const next = PLAYGROUND_SPEEDS[index ?? -1]
          if (next !== undefined) onSpeed(next)
        }}
      />
      <span className="w-7 text-xs text-fd-muted-foreground tabular-nums" aria-hidden="true">
        {label}
      </span>
    </div>
  )
}

export function PlaygroundBar({title, controls}: {title: string; controls: PlaygroundControls | undefined}) {
  return (
    <div className="relative flex h-10 items-center gap-3 border-b bg-fd-muted/40 px-3">
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-fd-foreground">{title}</p>
      {controls === undefined ? null : (
        <TooltipProvider delayDuration={300}>
          <div className="flex shrink-0 items-center gap-1">
            <p className="pe-2 text-xs text-fd-muted-foreground tabular-nums @max-sm:sr-only" aria-live="polite">
              {describeProgress(controls.progress, controls.paused)}
            </p>
            <SpeedSlider speed={controls.speed} onSpeed={controls.onSpeed} />
            <PlayToggle controls={controls} />
            {controls.progress?.ended === true ? null : (
              <BarButton label="Restart" onClick={controls.onRestart}>
                <RotateCcw aria-hidden="true" />
              </BarButton>
            )}
            <BarButton label="Show the transcript" onClick={controls.onTranscript}>
              <ScrollText aria-hidden="true" />
            </BarButton>
          </div>
          <div className="absolute inset-x-0 -bottom-px h-0.5" aria-hidden="true">
            <div
              className="h-full bg-fd-primary motion-safe:transition-[width] motion-safe:duration-500"
              style={{width: `${progressShare(controls.progress) * 100}%`}}
            />
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
