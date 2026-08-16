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
      className={cn(
        'group relative rounded-lg border-border bg-gradient-to-b from-card to-muted transition-[background-color,border-color,box-shadow] duration-200 ease-out',
        'hover:border-[color-mix(in_oklch,var(--od-line),var(--od-ink)_18%)]',
        'shadow-[0_1px_2px_-1px_rgb(0_0_0/0.1),0_1px_3px_-2px_rgb(0_0_0/0.1)] hover:shadow-[0_2px_4px_-2px_rgb(0_0_0/0.15),0_2px_6px_-3px_rgb(0_0_0/0.15)] active:shadow-[0_0px_1px_0_rgb(0_0_0/0.1)]',
        'after:absolute after:inset-0 after:rounded-lg after:bg-gradient-to-t after:from-foreground/5 after:to-transparent after:opacity-0 after:transition-opacity hover:after:opacity-100',
        SIZES[size],
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <Sun
          aria-hidden
          className={cn(
            'size-4 rotate-0 text-primary transition-transform duration-500 ease-out dark:rotate-180 dark:text-muted-foreground',
            'transform-gpu group-hover:scale-110 group-hover:rotate-[360deg] group-active:scale-95',
          )}
        />
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
