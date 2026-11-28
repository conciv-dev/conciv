import {Button} from '@/components/ui/button'
import Volume2Icon from '@/components/ui/volume-2-icon'
import VolumeXIcon from '@/components/ui/volume-x-icon'
import {useAnimatedIcon} from '@/components/ui/use-animated-icon'
import {setSoundsMuted, useSoundsMuted, useUnmuteSound} from '@/lib/sounds'
import {cn} from '@/lib/utils'

export function SoundToggle({className}: {className?: string}) {
  const muted = useSoundsMuted()
  const unmuteSound = useUnmuteSound()
  const {iconRef, triggerProps} = useAnimatedIcon()
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      aria-pressed={muted}
      {...triggerProps}
      onPointerDown={muted ? unmuteSound : undefined}
      onClick={() => setSoundsMuted(!muted)}
      className={cn('h-auto p-2 text-muted-foreground hover:text-foreground', className)}
    >
      {muted ? <VolumeXIcon ref={iconRef} className="size-4" /> : <Volume2Icon ref={iconRef} className="size-4" />}
    </Button>
  )
}
