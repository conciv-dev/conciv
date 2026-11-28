import {Moon, Sun} from 'lucide-react'
import {useTheme} from 'next-themes'
import {Button} from '@/components/ui/button'

export function ThemeToggle() {
  const {resolvedTheme, setTheme} = useTheme()
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="h-auto p-2 text-muted-foreground"
    >
      <Sun className="size-4 dark:hidden" />
      <Moon className="hidden size-4 dark:block" />
    </Button>
  )
}
