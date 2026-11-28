'use client'

import {ArrowUpRight, ChevronDown, Menu} from 'lucide-react'
import {usePathname} from 'fumadocs-core/framework'
import Link from 'fumadocs-core/link'
import {Popover, PopoverContent, PopoverTrigger} from 'fumadocs-ui/components/ui/popover'
import type {ComponentProps} from 'react'
import type {DocsLayoutProps} from 'fumadocs-ui/layouts/notebook'
import {Header} from 'fumadocs-ui/layouts/notebook/slots/header'
import {
  Sidebar,
  SidebarCollapseTrigger,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from 'fumadocs-ui/layouts/notebook/slots/sidebar'
import {cn} from '@/lib/utils'
import {
  isLinkItemActive,
  LinkItem,
  type LinkItemType,
  type MainItemType,
  type MenuItemType,
} from 'fumadocs-ui/layouts/shared'
import {repoUrl} from '@/lib/shared'
import {QuickstartDialog} from './quickstart-dialog'
import {useSearchContext} from 'fumadocs-ui/contexts/search'
import {ThemeToggle} from './landing/theme-toggle'
import {SoundToggle} from './landing/sound-toggle'
import MagnifierIcon from './ui/magnifier-icon'
import {useAnimatedIcon} from './ui/use-animated-icon'
import {GitHubStarLink} from './landing/github-star-link'

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
  {text: 'Comparison', url: '/docs/comparison', sections: ['comparison']},
  changelog,
  more,
]

const drawerMoreItemClass =
  'flex items-center justify-between gap-2 rounded-lg px-2 py-0.75 ps-3 text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-foreground [&_svg]:size-3.5 [&_svg]:shrink-0'

function DrawerMore() {
  return (
    <div className="flex flex-col gap-0.5 pt-2">
      <p className="px-2 py-0.75 text-fd-muted-foreground">{more.text}</p>
      <div className="relative ms-2 flex flex-col gap-0.5 before:absolute before:inset-y-1 before:start-0 before:w-px before:bg-fd-border">
        {more.items.map((item) =>
          item.type === 'custom' ? null : (
            <LinkItem key={item.url} item={item} className={drawerMoreItemClass}>
              {item.text}
              <ArrowUpRight />
            </LinkItem>
          ),
        )}
      </div>
      <div role="separator" className="px-2 pt-4">
        <span className="block h-px bg-fd-border" />
      </div>
    </div>
  )
}

export function docsDrawerLinks(): LinkItemType[] {
  return [
    {type: 'custom', on: 'menu', children: <QuickstartDialog className="mt-2 w-full" />},
    {...docs, on: 'menu'},
    {...changelog, on: 'menu'},
    {type: 'custom', on: 'menu', children: <DrawerMore />},
  ]
}

function DocsHeader(props: ComponentProps<'header'>) {
  const {open} = useSidebar()
  return <Header {...props} className={cn(props.className, open && 'max-md:z-50')} />
}

type SearchTriggerProps = {hideIfDisabled?: boolean; className?: string}

function FullSearchTrigger({hideIfDisabled, className}: SearchTriggerProps) {
  const {enabled, hotKey, setOpenSearch} = useSearchContext()
  const {iconRef, triggerProps} = useAnimatedIcon()
  if (hideIfDisabled === true && !enabled) return null
  return (
    <button
      type="button"
      data-search-full=""
      {...triggerProps}
      onClick={() => setOpenSearch(true)}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border bg-fd-secondary/50 p-1.5 ps-2 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground',
        className,
      )}
    >
      <MagnifierIcon ref={iconRef} className="size-4" />
      Search
      <div className="ms-auto inline-flex gap-0.5">
        {hotKey.map((key, index) => (
          <kbd key={index} className="rounded-md border bg-fd-background px-1.5">
            {key.display}
          </kbd>
        ))}
      </div>
    </button>
  )
}

function SmallSearchTrigger({hideIfDisabled, className}: SearchTriggerProps) {
  const {enabled, setOpenSearch} = useSearchContext()
  const {iconRef, triggerProps} = useAnimatedIcon()
  if (hideIfDisabled === true && !enabled) return null
  return (
    <button
      type="button"
      aria-label="Open Search"
      data-search=""
      {...triggerProps}
      onClick={() => setOpenSearch(true)}
      className={cn(
        'inline-flex items-center justify-center rounded-md text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground',
        className,
        'p-2',
      )}
    >
      <MagnifierIcon ref={iconRef} className="size-4" />
    </button>
  )
}

export const docsSlots: NonNullable<DocsLayoutProps['slots']> = {
  header: DocsHeader,
  searchTrigger: {full: FullSearchTrigger, sm: SmallSearchTrigger},
  sidebar: {
    provider: SidebarProvider,
    root: Sidebar,
    trigger: () => null,
    collapseTrigger: SidebarCollapseTrigger,
    useSidebar,
  },
}

export function SidebarBanner(props: ComponentProps<'div'>) {
  return <div {...props} className={cn('flex flex-col gap-3 p-4 pb-2 empty:hidden max-md:hidden', props.className)} />
}

export function SidebarFooter(props: ComponentProps<'div'>) {
  return <div {...props} className={cn(props.className, 'max-md:hidden')} />
}

export function DocsDrawerTrigger() {
  return (
    <SidebarTrigger className="order-first -ms-1.5 me-1.5 inline-flex items-center justify-center rounded-md p-1.5 text-fd-muted-foreground transition-colors hover:bg-fd-muted hover:text-fd-foreground focus-visible:ring-2 focus-visible:ring-fd-ring focus-visible:outline-none aria-expanded:text-fd-foreground md:hidden [&_svg]:size-4.5">
      <Menu />
    </SidebarTrigger>
  )
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

export function DocsHeaderActions() {
  return (
    <div className="flex items-center gap-2">
      <GitHubStarLink compact className="text-fd-muted-foreground hover:text-fd-foreground" />
      <SoundToggle className="text-fd-muted-foreground hover:text-fd-foreground" />
      <ThemeToggle className="text-fd-muted-foreground hover:text-fd-foreground" />
      <QuickstartDialog className="max-md:hidden" />
    </div>
  )
}
