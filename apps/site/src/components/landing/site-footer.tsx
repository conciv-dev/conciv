import {Link} from '@tanstack/react-router'
import {BrandMark} from '@/components/brand-mark'
import {repoUrl} from '@/lib/shared'

type FooterLink = {label: string; href?: string; splat?: string; exact?: boolean}

const LINKS: FooterLink[] = [
  {label: 'Docs', splat: '', exact: true},
  {label: 'Quick start', splat: 'quick-start'},
  {label: 'Configuration', splat: 'configuration'},
  {label: 'GitHub', href: repoUrl},
  {label: 'Issues', href: `${repoUrl}/issues`},
  {label: 'Releases', href: `${repoUrl}/releases`},
  {label: 'npm', href: 'https://www.npmjs.com/package/@conciv/it'},
]

const LINK_CLASS = 'od-hit od-ui whitespace-nowrap transition-colors duration-[160ms] hover:text-foreground'
const INACTIVE_PROPS = {className: 'text-muted-foreground'}
const ACTIVE_PROPS = {className: 'text-foreground'}

function FooterAnchor({link}: {link: FooterLink}) {
  if (link.splat !== undefined) {
    return (
      <Link
        to="/docs/$"
        params={{_splat: link.splat}}
        className={LINK_CLASS}
        activeProps={ACTIVE_PROPS}
        inactiveProps={INACTIVE_PROPS}
        activeOptions={link.exact === true ? {exact: true} : undefined}
      >
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} className={`${LINK_CLASS} text-muted-foreground`}>
      {link.label}
    </a>
  )
}

export function SiteFooter() {
  return (
    <footer className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <div className="od-inset flex flex-wrap items-center gap-x-8 gap-y-4 py-8">
            <Link to="/" aria-label="conciv home">
              <BrandMark />
            </Link>
            <p className="od-caption text-muted-foreground">MIT-licensed. Runs with your local dev server.</p>
            <nav aria-label="Footer" className="ml-auto">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {LINKS.map((link) => (
                  <li key={link.label}>
                    <FooterAnchor link={link} />
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="od-inset od-mono od-caption flex justify-between border-t py-4 text-muted-foreground">
            <span>MIT © conciv</span>
            <span className="text-primary">beta</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
