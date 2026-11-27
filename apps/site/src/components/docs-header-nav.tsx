import {ChevronDown} from 'lucide-react'
import {usePathname} from 'fumadocs-core/framework'
import Link from 'fumadocs-core/link'
import {Popover, PopoverContent, PopoverTrigger} from 'fumadocs-ui/components/ui/popover'
import {isLinkItemActive, LinkItem, type MainItemType, type MenuItemType} from 'fumadocs-ui/layouts/shared'
import type {DocsHeaderVariant} from '@/lib/search-schemas'
import {repoUrl} from '@/lib/shared'

type SectionLink = MainItemType & {sections?: readonly string[]}

type HeaderLink = SectionLink | MenuItemType

const docs: SectionLink = {text: 'Docs', url: '/docs', active: 'nested-url'}
const plugins: SectionLink = {text: 'Plugins', url: '/docs/plugins', active: 'nested-url'}
const changelog: SectionLink = {text: 'Changelog', url: `${repoUrl}/releases`, external: true}

const more: MenuItemType = {
  type: 'menu',
  text: 'More',
  items: [
    {text: 'Discussions', url: `${repoUrl}/discussions`, external: true},
    {text: 'llms.txt', url: '/llms.txt', external: true},
    {text: 'llms-full.txt', url: '/llms-full.txt', external: true},
  ],
}

const headerLinks: Record<DocsHeaderVariant, HeaderLink[]> = {
  a: [
    docs,
    plugins,
    {text: 'Comparison', url: '/docs/comparison', sections: ['comparison', 'comparison-b', 'comparison-c']},
    changelog,
    more,
  ],
  b: [docs, plugins, {text: 'Playground', url: '/docs/playground', active: 'nested-url'}, changelog],
  c: [
    {
      text: 'Getting started',
      url: '/docs/getting-started',
      sections: [
        '',
        'getting-started',
        'comparison',
        'comparison-b',
        'comparison-c',
        'requirements',
        'playground',
        'examples',
      ],
    },
    {
      text: 'Guides',
      url: '/docs/usage',
      sections: [
        'usage',
        'engine-and-widget',
        'sessions',
        'harnesses',
        'tools-and-code-mode',
        'agents-and-permissions',
        'skills',
        'bundlers',
        'agents',
        'recipes',
      ],
    },
    {...plugins, sections: ['plugins']},
    {text: 'Reference', url: '/docs/reference/configuration', sections: ['reference', 'api-reference', 'contributing']},
    more,
  ],
}

export function docsHeaderMenuLinks(variant: DocsHeaderVariant) {
  return headerLinks[variant].map((link) => ({...link, on: 'menu' as const}))
}

function isMenu(link: HeaderLink): link is MenuItemType {
  return link.type === 'menu'
}

function isSectionActive(link: SectionLink, pathname: string) {
  if (link.sections === undefined) return isLinkItemActive(link, pathname)
  const [, root, section = ''] = pathname.split('/')
  return root === 'docs' && link.sections.includes(section)
}

function selectActiveLink(links: HeaderLink[], pathname: string) {
  return links
    .filter((link): link is SectionLink => !isMenu(link) && isSectionActive(link, pathname))
    .toSorted((first, second) => second.url.length - first.url.length)
    .at(0)
}

const linkClass =
  'relative inline-flex h-14 items-center text-sm whitespace-nowrap text-fd-muted-foreground transition-colors hover:text-fd-foreground data-[active=true]:text-fd-primary data-[active=true]:after:absolute data-[active=true]:after:inset-x-0 data-[active=true]:after:bottom-0 data-[active=true]:after:h-0.5 data-[active=true]:after:bg-fd-primary'

function MoreMenu({link}: {link: MenuItemType}) {
  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-14 items-center gap-1 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground data-[state=open]:text-fd-foreground">
        {link.text}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="flex min-w-44 flex-col p-1">
        {link.items.map((item) =>
          item.type === 'custom' ? null : (
            <LinkItem
              key={item.url}
              item={item}
              className="rounded-md px-2.5 py-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
            >
              {item.text}
            </LinkItem>
          ),
        )}
      </PopoverContent>
    </Popover>
  )
}

export function DocsHeaderNav({variant}: {variant: DocsHeaderVariant}) {
  const pathname = usePathname()
  const links = headerLinks[variant]
  const active = selectActiveLink(links, pathname)

  return (
    <nav aria-label="Docs sections" className="flex items-center gap-6 ps-8 max-lg:hidden">
      {links.map((link) =>
        isMenu(link) ? (
          <MoreMenu key="more" link={link} />
        ) : (
          <Link
            key={link.url}
            href={link.url}
            external={link.external}
            data-active={link === active}
            className={linkClass}
          >
            {link.text}
          </Link>
        ),
      )}
    </nav>
  )
}
