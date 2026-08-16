import {Link} from '@tanstack/react-router'
import {SiteHeader} from '@/components/ui/site-header'
import {ThemeSwitch} from '@/components/ui/theme-switch'
import {SparkMark} from './spark-mark'
import {GitHubStarsButton} from './github-stars-button'

const NAV_LINK_CLASS =
  'od-ui inline-flex h-8 items-center rounded-lg px-2.5 text-muted-foreground transition-colors hover:text-foreground'

export function SiteNav() {
  return (
    <div className="od-page">
      <div className="od-col">
        <SiteHeader
          className="px-4"
          brand={
            <Link to="/" className="od-display inline-flex items-center gap-2 text-[17px] font-semibold">
              <SparkMark className="text-primary" /> conciv
            </Link>
          }
          links={[
            {
              label: 'How it works',
              node: (
                <a href="#how" className={NAV_LINK_CLASS}>
                  How it works
                </a>
              ),
            },
            {
              label: 'Docs',
              node: (
                <Link to="/docs/$" params={{_splat: ''}} className={NAV_LINK_CLASS}>
                  Docs
                </Link>
              ),
            },
          ]}
          actions={<GitHubStarsButton />}
          mobileActions={<ThemeSwitch />}
        />
      </div>
    </div>
  )
}
