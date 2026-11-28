import {createFileRoute, notFound} from '@tanstack/react-router'
import {DocsLayout} from 'fumadocs-ui/layouts/notebook'
import {createServerFn} from '@tanstack/react-start'
import {slugsToMarkdownPath, source} from '@/lib/source'
import browserCollections from 'collections/browser'
import {DocsBody, DocsDescription, DocsPage, DocsTitle} from 'fumadocs-ui/layouts/notebook/page'
import {baseOptions} from '@/lib/layout.shared'
import {gitConfig} from '@/lib/shared'
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
import {DocsPageActions, DocsPageActionsRow} from '@/components/docs-page-actions'
import {buildDocsHead} from '@/lib/docs-head'
import {useFumadocsLoader} from 'fumadocs-core/source/client'
import {Suspense} from 'react'
import {useMDXComponents} from '@/components/mdx'

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: async ({params}) => {
    const slugs = params._splat?.split('/') ?? []
    const data = await serverLoader({data: slugs})
    await clientLoader.preload(data.path)
    return data
  },
  head: ({loaderData, params}) => buildDocsHead({splat: params._splat, page: loaderData}),
})

const serverLoader = createServerFn({
  method: 'GET',
})
  .validator((slugs: string[]) => slugs)
  .handler(async ({data: slugs}) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()

    return {
      path: page.path,
      markdownUrl: slugsToMarkdownPath(page.slugs).url,
      pageTree: await source.serializePageTree(source.getPageTree()),
      title: page.data.title,
      description: page.data.description,
    }
  })

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    {toc, frontmatter, default: MDX},

    {
      markdownUrl,
      path,
    }: {
      markdownUrl: string
      path: string
    },
  ) {
    const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/site/content/docs/${path}`

    return (
      <DocsPage
        toc={toc}
        className="*:max-w-175 md:max-xl:pe-20"
        tableOfContent={{
          single: true,
          footer: <DocsPageActions markdownUrl={markdownUrl} githubUrl={githubUrl} />,
          container: {className: toc.length === 0 ? emptyTocClass : undefined},
          list: {className: tocListClass},
        }}
        tableOfContentPopover={{
          list: {className: tocListClass},
          content: {className: 'pb-[max(--spacing(2),env(safe-area-inset-bottom))]'},
        }}
      >
        <DocsTitle className="od-display text-5xl leading-tight font-extrabold max-sm:text-4xl">
          {frontmatter.title}
        </DocsTitle>
        <DocsDescription className="text-xl max-sm:mb-4 max-sm:text-lg">{frontmatter.description}</DocsDescription>
        <DocsPageActionsRow markdownUrl={markdownUrl} githubUrl={githubUrl} />
        <DocsBody className={path.startsWith('comparison') ? comparisonTableClass : undefined}>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    )
  },
})

const comparisonTableClass = [
  'xl:[&_div:has(>table)]:docs-breakout',
  '[&_table]:w-full',
  '[&_table]:min-w-2xl',
  '[&_table]:table-fixed',
  '[&_table]:bg-transparent',
  '[&_table]:text-sm',
  '[&_:is(th,td)]:border-s-0',
  '[&_:is(th,td)]:px-4',
  '[&_:is(th,td)]:py-3.5',
  '[&_:is(th,td)]:align-middle',
  '[&_th]:bg-transparent',
  '[&_th]:font-medium',
  '[&_th:not(:first-child)]:w-40',
  '[&_table:has(th:nth-child(5))_th:not(:first-child)]:w-32',
  '[&_td:first-child_a]:font-normal',
  '[&_td:first-child_a]:text-fd-foreground',
  '[&_td:first-child_a]:decoration-dotted',
  '[&_td:first-child_a]:decoration-fd-muted-foreground',
  '[&_td:first-child_a]:underline-offset-4',
].join(' ')

const tocListClass = '[&_a:hover]:text-fd-foreground [&_a[data-active=true]:hover]:text-fd-primary'

const emptyTocClass = '[&>#toc-title]:hidden [&>#toc-title+div]:hidden [&>div:last-child]:border-t-0'

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

function Page() {
  const {path, pageTree, markdownUrl} = useFumadocsLoader(Route.useLoaderData())
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
      tree={pageTree}
    >
      <Suspense>{clientLoader.useContent(path, {markdownUrl, path})}</Suspense>
    </DocsLayout>
  )
}
