import {lazy, Suspense} from 'react'
import {ClientOnly, getRouteApi} from '@tanstack/react-router'
import {useIsMobile} from '@/lib/use-is-mobile'

const LiveWidget = lazy(() => import('@/lib/live-widget'))
const rootRoute = getRouteApi('__root__')

export function LiveWidgetMount() {
  const isMobile = useIsMobile()
  const {widget} = rootRoute.useSearch()
  const {widgetHomeDefault} = rootRoute.useRouteContext()
  const widgetOpen = widget ?? widgetHomeDefault
  if (isMobile) return null
  return (
    <ClientOnly>
      <Suspense fallback={null}>
        <LiveWidget open={widgetOpen} />
      </Suspense>
    </ClientOnly>
  )
}
