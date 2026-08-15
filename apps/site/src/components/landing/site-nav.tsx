import {Link} from '@tanstack/react-router'
import {SparkMark} from './spark-mark'
import {ThemeToggle} from './theme-toggle'
import {GitHubStarLink} from './github-star-link'

const NAV_LINK_CLASS =
  'od-mono whitespace-nowrap text-[12.5px] text-muted-foreground transition-colors hover:text-foreground'

export function SiteNav() {
  return (
    <nav className="mx-auto flex h-14 max-w-[1180px] items-center gap-7 border-b px-8">
      <div className="od-display mr-auto flex items-center gap-2 text-[19px] font-bold">
        <SparkMark className="text-primary" /> conciv
      </div>
      <a href="#how" className={`${NAV_LINK_CLASS} max-sm:hidden`}>
        How it works
      </a>
      <Link to="/docs/$" params={{_splat: ''}} className={NAV_LINK_CLASS}>
        Docs
      </Link>
      <GitHubStarLink className={NAV_LINK_CLASS} hideCountOnMobile />
      <ThemeToggle />
    </nav>
  )
}
