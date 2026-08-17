import {Link} from '@tanstack/react-router'
import {ConcivLockup} from '@conciv/brand/react'
import {ThemeToggle} from './theme-toggle'
import {useSmoothAnchor} from './smooth-scroll'
import {GitHubStarLink} from './github-star-link'

export function SiteNav() {
  const smoothAnchor = useSmoothAnchor()

  return (
    <nav className="mx-auto flex max-w-[1180px] items-center gap-7 px-8 py-[22px]">
      <Link
        to="/"
        aria-label="conciv home"
        className="mr-auto flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ConcivLockup interactive className="h-7 w-auto" />
      </Link>
      <Link
        to="/"
        hash="how"
        onClick={smoothAnchor('#how')}
        className="whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground max-sm:hidden"
      >
        How it works
      </Link>
      <Link
        to="/docs/$"
        params={{_splat: ''}}
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Docs
      </Link>
      <GitHubStarLink />
      <ThemeToggle />
    </nav>
  )
}
