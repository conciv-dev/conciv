import {
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
} from '@/components/ui/video-player'

export function OutsideAgentVideo() {
  return (
    <VideoPlayer className="my-6">
      <VideoPlayerMedia
        aria-label="An outside agent in a terminal drives the open browser tab"
        autoPlay
        muted
        playsInline
        loop
        preload="auto"
      >
        <source src="/videos/outside-agent.webm" type="video/webm" />
        <source src="/videos/outside-agent.mp4" type="video/mp4" />
      </VideoPlayerMedia>
      <VideoPlayerPoster src="/videos/outside-agent.jpg" />
      <VideoPlayerBigPlay />
      <VideoPlayerControls>
        <VideoPlayerTimeSlider />
        <VideoPlayerControlGroup>
          <VideoPlayerPlayButton />
          <VideoPlayerTime className="mr-auto" />
          <VideoPlayerMuteButton />
          <VideoPlayerFullscreenButton />
        </VideoPlayerControlGroup>
      </VideoPlayerControls>
    </VideoPlayer>
  )
}
