import {Sun} from 'lucide-react'
import {useTheme} from 'next-themes'
import {Button} from '@/components/ui/button'
import {cn} from '@/lib/utils'

const SIZES = {
  sm: 'h-8 px-3',
  default: 'h-9 px-4',
  lg: 'h-10 px-5',
}

export function ThemeSwitch({
  className,
  size = 'sm',
  showLabel = false,
}: {
  className?: string
  size?: keyof typeof SIZES
  showLabel?: boolean
}) {
  const {resolvedTheme, setTheme} = useTheme()

  return (
    <Button
      type="button"
      variant="outline"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn('rounded-lg transition-colors duration-[160ms] ease-[var(--od-ease-out)]', SIZES[size], className)}
    >
      <span className="flex items-center gap-2">
        <Sun aria-hidden className="size-4 text-primary dark:text-muted-foreground" />
        {showLabel && (
          <span className="od-caption font-medium">
            <span className="dark:hidden">Light</span>
            <span className="hidden dark:inline">Dark</span>
          </span>
        )}
      </span>
    </Button>
  )
}
