import {ChevronDown} from 'lucide-react'
import {usePathname} from 'fumadocs-core/framework'
import Link from 'fumadocs-core/link'
import {Popover, PopoverContent, PopoverTrigger} from 'fumadocs-ui/components/ui/popover'
import {isLinkItemActive, LinkItem, type MainItemType, type MenuItemType} from 'fumadocs-ui/layouts/shared'
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

const headerLinks: HeaderLink[] = [
  docs,
  plugins,
  {text: 'Comparison', url: '/docs/comparison', sections: ['comparison', 'comparison-b', 'comparison-c']},
  changelog,
  more,
]

export function docsHeaderMenuLinks() {
  return headerLinks.map((link) => ({...link, on: 'menu' as const}))
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

const chevronClass =
  'size-3.5 transition-[opacity,rotate] duration-120 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[state=open]:rotate-180 motion-reduce:transition-none'

const menuContentClass = [
  'flex min-w-44 flex-col p-1',
  '[--animate-fd-popover-in:fd-fade-in_120ms_cubic-bezier(0.22,1,0.36,1)]',
  '[--animate-fd-popover-out:fd-fade-out_120ms_cubic-bezier(0.22,1,0.36,1)_both]',
  'motion-reduce:[--animate-fd-popover-in:none]',
  'motion-reduce:[--animate-fd-popover-out:none]',
].join(' ')

function MoreMenu({link}: {link: MenuItemType}) {
  return (
    <Popover>
      <PopoverTrigger className="group inline-flex h-14 items-center gap-1 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground data-[state=open]:text-fd-foreground">
        {link.text}
        <ChevronDown className={chevronClass} />
      </PopoverTrigger>
      <PopoverContent align="start" className={menuContentClass}>
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

export function DocsHeaderNav() {
  const pathname = usePathname()
  const active = selectActiveLink(headerLinks, pathname)

  return (
    <nav aria-label="Docs sections" className="flex items-center gap-6 ps-8 max-lg:hidden">
      {headerLinks.map((link) =>
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
