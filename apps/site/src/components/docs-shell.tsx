'use client'

import type {ReactNode} from 'react'
import {DocsLayout, type DocsLayoutProps} from 'fumadocs-ui/layouts/notebook'
import {baseOptions} from '@/lib/layout.shared'
import {DocsSidebarSeparator} from '@/components/docs-sidebar-separator'
import {
  DocsDrawerTrigger,
  DocsHeaderNav,
  docsDrawerLinks,
  DocsHeaderActions,
  docsSlots,
  SidebarBanner,
  SidebarFooter,
} from '@/components/docs-header-nav'

const sidebarClass = [
  'border-e',
  'max-md:inset-s-0',
  'max-md:inset-e-auto',
  'max-md:top-(--fd-docs-row-2)',
  'max-md:w-3/5',
  'max-md:min-w-64',
  'max-md:max-w-80',
  'max-md:border-s-0',
  'max-md:shadow-none',
  'max-md:pb-[max(--spacing(4),env(safe-area-inset-bottom))]',
  'max-md:[--fd-sidebar-drawer-offset:-100%]',
  '[&_:is(a[data-active],button[aria-expanded]:not([data-variant]))]:py-1.5',
  '[&_:is(a[data-active],button[aria-expanded]:not([data-variant]))]:bg-transparent',
  '[&_:is(a[data-active=false],button[aria-expanded]:not([data-variant])):hover]:text-fd-foreground',
  '[&_a[data-active=true]]:font-medium',
  '[&_a[data-active=true]]:text-fd-primary',
  '[&_a[data-active]:has([data-docs-icon])]:gap-2.5',
  '[&_a[data-active]:has([data-docs-icon])]:py-1',
  'max-md:[&_:is(a[data-active],button[aria-expanded]:not([data-variant]))]:py-0.75',
  'max-md:[&_a[data-active]:has([data-docs-icon])]:py-0.75',
].join(' ')

const mobileHeaderClass = [
  'max-md:[&_[data-header-body]>div:last-child>a]:inline-flex',
  'max-md:[&_[data-header-body]>div:last-child>a]:order-1',
  'max-md:[&_[data-header-body]>div:last-child>div:last-child]:flex',
  'max-md:[&_[data-header-body]>div:last-child>div:last-child]:order-2',
  'max-md:[&>div:has(+#nd-sidebar-mobile)]:bg-fd-background/60',
  'max-md:[&>div:has(+#nd-sidebar-mobile)]:backdrop-blur-none',
].join(' ')

export function DocsShell({tree, children}: {tree: DocsLayoutProps['tree']; children: ReactNode}) {
  const base = baseOptions()
  return (
    <DocsLayout
      {...base}
      nav={{
        ...base.nav,
        mode: 'top',
        children: (
          <>
            <DocsDrawerTrigger />
            <DocsHeaderNav />
          </>
        ),
      }}
      links={docsDrawerLinks()}
      containerProps={{className: mobileHeaderClass}}
      themeSwitch={{component: <DocsHeaderActions />}}
      slots={docsSlots}
      sidebar={{
        collapsible: false,
        className: sidebarClass,
        banner: SidebarBanner,
        footer: SidebarFooter,
        components: {Separator: DocsSidebarSeparator},
      }}
      tree={tree}
    >
      {children}
    </DocsLayout>
  )
}
