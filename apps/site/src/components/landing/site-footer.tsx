import {Link} from '@tanstack/react-router'
import {BrandMark} from '@/components/brand-mark'
import {repoUrl} from '@/lib/shared'

type FooterLink = {label: string; href?: string; splat?: string}

const COLUMNS: {title: string; links: FooterLink[]}[] = [
  {
    title: 'Product',
    links: [
      {label: 'Docs', splat: ''},
      {label: 'Quick start', splat: 'quick-start'},
      {label: 'Configuration', splat: 'configuration'},
      {label: 'Troubleshooting', splat: 'troubleshooting'},
    ],
  },
  {
    title: 'Community',
    links: [
      {label: 'GitHub', href: repoUrl},
      {label: 'Issues', href: `${repoUrl}/issues`},
      {label: 'Releases', href: `${repoUrl}/releases`},
    ],
  },
  {
    title: 'Install',
    links: [
      {label: 'npm: @conciv/it', href: 'https://www.npmjs.com/package/@conciv/it'},
      {label: 'Example app', href: `${repoUrl}/tree/main/apps/examples/tanstack-start`},
    ],
  },
]

const LINK_CLASS = 'od-ui text-muted-foreground transition-colors hover:text-primary'

function FooterAnchor({link}: {link: FooterLink}) {
  if (link.splat !== undefined) {
    return (
      <Link to="/docs/$" params={{_splat: link.splat}} className={LINK_CLASS}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} className={LINK_CLASS}>
      {link.label}
    </a>
  )
}

export function SiteFooter() {
  return (
    <footer className="od-ruled">
      <div className="od-page">
        <div className="od-col">
          <div className="od-inset grid grid-cols-1 gap-12 py-16 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Link to="/" aria-label="conciv home">
                <BrandMark />
              </Link>
              <p className="od-caption mt-4 max-w-[36ch] text-muted-foreground">
                MIT-licensed. Runs with your local dev server.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7">
              {COLUMNS.map((column) => (
                <div key={column.title}>
                  <h4 className="od-caption mb-4 font-semibold uppercase tracking-wide">{column.title}</h4>
                  <ul className="space-y-3">
                    {column.links.map((link) => (
                      <li key={link.label}>
                        <FooterAnchor link={link} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
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
