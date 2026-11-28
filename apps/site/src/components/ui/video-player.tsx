'use client'

import * as React from 'react'
import {
  Container,
  Controls,
  createPlayer,
  FullscreenButton,
  Gesture,
  Hotkey,
  MuteButton,
  PlayButton,
  Poster,
  StatusAnnouncer,
  Time,
  TimeSlider,
  useContainerAttach,
} from '@videojs/react'
import {Video, videoFeatures} from '@videojs/react/video'
import {MaximizeIcon, MinimizeIcon, PauseIcon, PlayIcon} from 'lucide-react'
import {Button} from '@/components/ui/button'
import Volume2Icon from '@/components/ui/volume-2-icon'
import VolumeXIcon from '@/components/ui/volume-x-icon'
import {cn} from '@/lib/utils'

const {Player} = createPlayer({features: videoFeatures})

type PartProps<T extends React.ElementType> = Omit<React.ComponentProps<T>, 'className'> & {className?: string}

function VideoPlayerFrame({className, children, ...props}: React.ComponentProps<typeof Container>) {
  const setContainer = useContainerAttach()
  return (
    <Container
      data-slot="video-player"
      className={cn(
        'group/video-player not-prose relative isolate aspect-video w-full overflow-hidden rounded-xl border bg-muted text-foreground',
        className,
      )}
      {...props}
      ref={setContainer}
    >
      {children}
      <Gesture type="tap" action="togglePaused" pointer="mouse" />
      <Gesture type="doubletap" action="toggleFullscreen" />
      <Hotkey keys="Space" action="togglePaused" />
      <Hotkey keys="k" action="togglePaused" />
      <Hotkey keys="m" action="toggleMuted" />
      <Hotkey keys="f" action="toggleFullscreen" />
      <Hotkey keys="ArrowLeft" action="seekStep" value={-5} />
      <Hotkey keys="ArrowRight" action="seekStep" value={5} />
      <StatusAnnouncer />
    </Container>
  )
}

function VideoPlayer(props: React.ComponentProps<typeof Container>) {
  return (
    <Player>
      <VideoPlayerFrame {...props} />
    </Player>
  )
}

function VideoPlayerMedia({className, ...props}: React.ComponentProps<typeof Video>) {
  return (
    <Video
      data-slot="video-player-media"
      preload="none"
      playsInline
      className={cn('block size-full object-cover', className)}
      {...props}
    />
  )
}

function VideoPlayerPoster({className, alt = '', ...props}: PartProps<typeof Poster.Image>) {
  return (
    <Poster.Root
      data-slot="video-player-poster"
      className="pointer-events-none absolute inset-0 not-data-visible:hidden"
    >
      <Poster.Image alt={alt} className={cn('size-full object-cover', className)} {...props} />
    </Poster.Root>
  )
}

function VideoPlayerBigPlay({className, ...props}: PartProps<typeof PlayButton>) {
  return (
    <PlayButton
      data-slot="video-player-big-play"
      className={cn(
        'absolute inset-0 z-10 m-auto size-14 rounded-full bg-background/85 shadow-sm backdrop-blur-sm not-data-paused:hidden',
        className,
      )}
      render={(renderProps) => (
        <Button {...renderProps} variant="outline">
          <PlayIcon className="size-6 translate-x-px" />
        </Button>
      )}
      {...props}
    />
  )
}

function VideoPlayerControls({className, children, ...props}: PartProps<typeof Controls.Content>) {
  return (
    <Controls.Root>
      <Controls.Content
        data-slot="video-player-controls"
        className={cn(
          'absolute inset-x-2 bottom-2 z-20 flex flex-col gap-1 rounded-lg border bg-background/85 px-2 pt-1 pb-1.5 shadow-sm backdrop-blur-sm transition-opacity duration-200 not-data-started:invisible not-data-visible:not-has-focus-visible:opacity-0 motion-reduce:transition-none',
          className,
        )}
        {...props}
      >
        {children}
      </Controls.Content>
    </Controls.Root>
  )
}

function VideoPlayerControlGroup({
  className,
  'aria-label': ariaLabel = 'Playback controls',
  ...props
}: PartProps<typeof Controls.Group>) {
  return (
    <Controls.Group
      data-slot="video-player-control-group"
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  )
}

function VideoPlayerPlayButton({className, ...props}: PartProps<typeof PlayButton>) {
  return (
    <PlayButton
      data-slot="video-player-play-button"
      className={className}
      render={(renderProps, state) => (
        <Button {...renderProps} variant="ghost" size="icon-sm">
          {state.paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      )}
      {...props}
    />
  )
}

function VideoPlayerMuteButton({className, ...props}: PartProps<typeof MuteButton>) {
  return (
    <MuteButton
      data-slot="video-player-mute-button"
      className={cn('data-hidden:hidden', className)}
      render={(renderProps, state) => (
        <Button {...renderProps} variant="ghost" size="icon-sm">
          {state.muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
        </Button>
      )}
      {...props}
    />
  )
}

function VideoPlayerFullscreenButton({className, ...props}: PartProps<typeof FullscreenButton>) {
  return (
    <FullscreenButton
      data-slot="video-player-fullscreen-button"
      className={cn('data-hidden:hidden', className)}
      render={(renderProps, state) => (
        <Button {...renderProps} variant="ghost" size="icon-sm">
          {state.fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
      )}
      {...props}
    />
  )
}

function VideoPlayerTimeSlider({className, ...props}: PartProps<typeof TimeSlider.Root>) {
  return (
    <TimeSlider.Root
      data-slot="video-player-time-slider"
      className={cn('relative flex h-4 w-full cursor-pointer touch-none items-center select-none', className)}
      {...props}
    >
      <TimeSlider.Track
        data-slot="video-player-time-slider-track"
        className="relative h-1 w-full grow overflow-hidden rounded-full bg-input"
      >
        <TimeSlider.Buffer className="absolute inset-y-0 left-0 w-(--media-slider-buffer) bg-muted-foreground/25" />
        <TimeSlider.Fill
          data-slot="video-player-time-slider-range"
          className="absolute inset-y-0 left-0 w-(--media-slider-fill) bg-primary"
        />
      </TimeSlider.Track>
      <TimeSlider.Thumb
        data-slot="video-player-time-slider-thumb"
        className="absolute left-(--media-slider-fill) block size-3 shrink-0 -translate-x-1/2 rounded-full border border-ring bg-background ring-ring/50 transition-[color,box-shadow] select-none after:absolute after:-inset-2 hover:ring-3 focus-visible:ring-3 focus-visible:outline-hidden active:ring-3 motion-reduce:transition-none"
      />
    </TimeSlider.Root>
  )
}

function VideoPlayerTime({className, ...props}: PartProps<typeof Time.Group>) {
  return (
    <Time.Group
      data-slot="video-player-time"
      className={cn('flex items-center gap-1 px-1 text-xs text-muted-foreground tabular-nums', className)}
      {...props}
    >
      <Time.Value type="current" />
      <Time.Separator />
      <Time.Value type="duration" />
    </Time.Group>
  )
}

export {
  VideoPlayer,
  VideoPlayerBigPlay,
  VideoPlayerControlGroup,
  VideoPlayerControls,
  VideoPlayerFullscreenButton,
  VideoPlayerMedia,
  VideoPlayerMuteButton,
  VideoPlayerPlayButton,
  VideoPlayerPoster,
  VideoPlayerTime,
  VideoPlayerTimeSlider,
}
