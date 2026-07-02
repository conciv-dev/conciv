import Magnet from '@/components/Magnet'
import {SparkMark} from './spark-mark'
import {ThemeToggle} from './theme-toggle'
import {useSmoothAnchor} from './smooth-scroll'

export function SiteNav() {
  const smoothAnchor = useSmoothAnchor()

  return (
    <nav className="mx-auto flex max-w-[1180px] items-center gap-7 px-8 py-[22px]">
      <div className="od-display mr-auto flex items-center gap-2 text-[19px] font-bold">
        <SparkMark className="text-primary" /> conciv
      </div>
      <a
        href="#how"
        onClick={smoothAnchor('#how')}
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        How it works
      </a>
      <a href="/docs" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
        Docs
      </a>
      <Magnet padding={40} magnetStrength={3}>
        <a
          href="https://github.com/conciv-dev/conciv"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      </Magnet>
      <ThemeToggle />
    </nav>
  )
}
