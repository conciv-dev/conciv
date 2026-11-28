import {Link} from '@tanstack/react-router'
import {ConcivLockup} from '@internal/brand-react'
import {ThemeToggle} from './theme-toggle'
import {useSmoothAnchor} from './smooth-scroll'
import {GitHubStarLink} from './github-star-link'
import {QuickstartDialog} from '../quickstart-dialog'

export function SiteNav() {
  const smoothAnchor = useSmoothAnchor()

  return (
    <nav className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-[22px] sm:gap-7 sm:px-8">
      <Link
        to="/"
        aria-label="conciv home"
        className="flex items-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ConcivLockup interactive className="h-7 w-auto" />
      </Link>
      <Link
        to="/"
        hash="how"
        onClick={smoothAnchor('#how')}
        className="whitespace-nowrap text-sm font-medium leading-5 text-muted-foreground transition-colors hover:text-foreground max-sm:hidden"
      >
        How it works
      </Link>
      <Link
        to="/docs/$"
        params={{_splat: ''}}
        className="text-sm font-medium leading-5 text-muted-foreground transition-colors hover:text-foreground"
      >
        Docs
      </Link>
      <div className="ms-auto flex items-center gap-2 sm:gap-3">
        <GitHubStarLink compact className="max-sm:hidden" />
        <ThemeToggle />
        <QuickstartDialog />
      </div>
    </nav>
  )
}
