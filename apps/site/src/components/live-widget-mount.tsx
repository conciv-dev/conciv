import {lazy, Suspense} from 'react'
import {ClientOnly, getRouteApi} from '@tanstack/react-router'
import {useIsMobile} from '@/lib/use-is-mobile'
import {useMediaQuery} from '@/lib/use-media-query'

const LiveWidget = lazy(() => import('@/lib/live-widget'))
const rootRoute = getRouteApi('__root__')

export function LiveWidgetMount() {
  const isMobile = useIsMobile()
  const narrow = useMediaQuery('(width < 48rem)')
  const {widget} = rootRoute.useSearch()
  const {widgetHomeDefault, playgroundFrame, docsPage} = rootRoute.useRouteContext()
  const widgetOpen = widget ?? widgetHomeDefault
  if (isMobile || playgroundFrame || (docsPage && narrow)) return null
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <LiveWidget key={docsPage ? 'docs' : 'site'} open={widgetOpen} docs={docsPage} />
      </Suspense>
    </ClientOnly>
  )
}
