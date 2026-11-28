import {createFileRoute, notFound} from '@tanstack/react-router'
import {createServerFn} from '@tanstack/react-start'
import {renderServerComponent} from '@tanstack/react-start/rsc'
import {DocsBody, DocsDescription, DocsPage, DocsTitle} from 'fumadocs-ui/layouts/notebook/page'
import {source} from '@/lib/source'
import {slugsToMarkdownPath} from '@/lib/docs-paths'
import {gitConfig} from '@/lib/shared'
import {DocsShell} from '@/components/docs-shell'
import {DocsPageActions, DocsPageActionsRow} from '@/components/docs-page-actions'
import {buildDocsHead} from '@/lib/docs-head'
import {useMDXComponents} from '@/components/mdx'

type DocsSourcePage = NonNullable<ReturnType<typeof source.getPage>>

export const Route = createFileRoute('/docs/$')({
  component: Page,
  loader: ({params}) => getDocsPage({data: params._splat?.split('/') ?? []}),
  head: ({loaderData, params}) => buildDocsHead({splat: params._splat, page: loaderData}),
})

const getDocsPage = createServerFn({method: 'GET'})
  .validator((slugs: string[]) => slugs)
  .handler(async ({data: slugs}) => {
    const page = source.getPage(slugs)
    if (!page) throw notFound()
    const Renderable = await renderServerComponent(<DocsServerPage page={page} />)
    return {Renderable, title: page.data.title, description: page.data.description}
  })

function DocsServerPage({page}: {page: DocsSourcePage}) {
  const markdownUrl = slugsToMarkdownPath(page.slugs).url
  const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/site/content/docs/${page.path}`
  const {toc, body: MDX} = page.data

  return (
    <DocsShell tree={source.getPageTree()}>
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
          {page.data.title}
        </DocsTitle>
        <DocsDescription className="text-xl max-sm:mb-4 max-sm:text-lg">{page.data.description}</DocsDescription>
        <DocsPageActionsRow markdownUrl={markdownUrl} githubUrl={githubUrl} />
        <DocsBody className={page.path.startsWith('comparison') ? comparisonTableClass : undefined}>
          <MDX components={useMDXComponents()} />
        </DocsBody>
      </DocsPage>
    </DocsShell>
  )
}

function Page() {
  const {Renderable} = Route.useLoaderData()
  return <>{Renderable}</>
}

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
