import {createFileRoute, notFound} from '@tanstack/react-router'
import {DocsLayout} from 'fumadocs-ui/layouts/notebook'
import {createServerFn} from '@tanstack/react-start'
import {slugsToMarkdownPath, source} from '@/lib/source'
import browserCollections from 'collections/browser'
import {DocsBody, DocsDescription, DocsPage, DocsTitle} from 'fumadocs-ui/layouts/notebook/page'
import {baseOptions} from '@/lib/layout.shared'
import {gitConfig, repoUrl} from '@/lib/shared'
import {DocsSidebarSeparator} from '@/components/docs-sidebar-separator'
import {DocsHeaderNav, docsHeaderMenuLinks} from '@/components/docs-header-nav'
import {DocsPageActions} from '@/components/docs-page-actions'
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
    const actions = (
      <DocsPageActions
        markdownUrl={markdownUrl}
        githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/site/content/docs/${path}`}
      />
    )

    return (
      <DocsPage
        toc={toc}
        className="*:max-w-175"
        tableOfContent={{
          single: true,
          footer: actions,
          container: {className: toc.length === 0 ? emptyTocClass : undefined},
        }}
        tableOfContentPopover={{footer: actions}}
      >
        <DocsTitle className="od-display text-5xl leading-tight font-extrabold">{frontmatter.title}</DocsTitle>
        <DocsDescription className="text-xl">{frontmatter.description}</DocsDescription>
        <DocsBody className={path.startsWith('comparison') ? comparisonTableClass : undefined}>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    )
  },
})

const comparisonTableClass = [
  'xl:[&_div:has(>table)]:w-[calc(min(100vw,var(--fd-layout-width,97rem))-var(--fd-sidebar-col)-var(--fd-toc-col)-4rem)]',
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
  '[&_td:first-child_a]:font-normal',
  '[&_td:first-child_a]:text-fd-foreground',
  '[&_td:first-child_a]:decoration-dotted',
  '[&_td:first-child_a]:decoration-fd-muted-foreground',
  '[&_td:first-child_a]:underline-offset-4',
].join(' ')

const emptyTocClass = '[&>#toc-title]:hidden [&>#toc-title+div]:hidden [&>div:last-child]:border-t-0'

const sidebarClass = [
  'border-e',
  '[&_:is(a[data-active],button[aria-expanded])]:py-1.5',
  '[&_:is(a[data-active],button[aria-expanded])]:bg-transparent',
  '[&_:is(a[data-active=false],button[aria-expanded]):hover]:text-fd-foreground',
  '[&_a[data-active=true]]:font-medium',
  '[&_a[data-active=true]]:text-fd-primary',
  '[&_a[data-active]:has([data-docs-icon])]:gap-2.5',
  '[&_a[data-active]:has([data-docs-icon])]:py-1',
].join(' ')

function Page() {
  const {path, pageTree, markdownUrl} = useFumadocsLoader(Route.useLoaderData())
  const base = baseOptions()

  return (
    <DocsLayout
      {...base}
      nav={{...base.nav, mode: 'top', children: <DocsHeaderNav />}}
      links={docsHeaderMenuLinks()}
      githubUrl={repoUrl}
      sidebar={{collapsible: false, className: sidebarClass, components: {Separator: DocsSidebarSeparator}}}
      tree={pageTree}
    >
      <Suspense>{clientLoader.useContent(path, {markdownUrl, path})}</Suspense>
    </DocsLayout>
  )
}
