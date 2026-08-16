import {Link} from '@tanstack/react-router'
import {SiteHeader} from '@/components/ui/site-header'
import {ThemeSwitch} from '@/components/ui/theme-switch'
import {BrandMark} from '@/components/brand-mark'
import {GitHubStarsButton} from '@/components/github-stars-button'

const NAV_LINK_CLASS =
  'od-hit od-ui inline-flex h-8 items-center rounded-lg px-3 transition-colors hover:text-foreground'
const NAV_INACTIVE_PROPS = {className: 'text-muted-foreground'}
const NAV_ACTIVE_PROPS = {className: 'text-foreground'}

export function SiteNav() {
  return (
    <div className="od-page">
      <div className="od-col">
        <SiteHeader
          className="px-3"
          brand={
            <Link to="/" aria-label="conciv home">
              <BrandMark />
            </Link>
          }
          links={[
            {
              label: 'How it works',
              node: (
                <a href="#how" className={`${NAV_LINK_CLASS} text-muted-foreground`}>
                  How it works
                </a>
              ),
            },
            {
              label: 'Docs',
              node: (
                <Link
                  to="/docs/$"
                  params={{_splat: ''}}
                  className={NAV_LINK_CLASS}
                  activeProps={NAV_ACTIVE_PROPS}
                  inactiveProps={NAV_INACTIVE_PROPS}
                >
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
