import {useTheme} from 'next-themes'
import {Button} from '@/components/ui/button'
import SunIcon from '@/components/ui/sun-icon'
import MoonIcon from '@/components/ui/moon-icon'
import {useAnimatedIcon} from '@/components/ui/use-animated-icon'
import {cn} from '@/lib/utils'
import {useSound} from '@/lib/sounds'

export function ThemeToggle({className}: {className?: string}) {
  const {resolvedTheme, setTheme} = useTheme()
  const toLight = useSound('guitar-toggle-on')
  const toDark = useSound('guitar-toggle-off')
  const {iconRef: sunRef, triggerProps: sunTrigger} = useAnimatedIcon()
  const {iconRef: moonRef, triggerProps: moonTrigger} = useAnimatedIcon()
  const both = (key: keyof typeof sunTrigger) => () => {
    sunTrigger[key]()
    moonTrigger[key]()
  }
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Toggle theme"
      onPointerDown={resolvedTheme === 'dark' ? toLight : toDark}
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      onPointerEnter={both('onPointerEnter')}
      onPointerLeave={both('onPointerLeave')}
      onFocus={both('onFocus')}
      onBlur={both('onBlur')}
      className={cn('h-auto p-2 text-muted-foreground hover:text-foreground', className)}
    >
      <SunIcon ref={sunRef} className="size-4 dark:hidden" />
      <MoonIcon ref={moonRef} className="hidden size-4 dark:block" />
    </Button>
  )
}
