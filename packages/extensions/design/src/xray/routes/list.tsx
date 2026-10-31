import {createRoute} from '@tanstack/solid-router'
import {Match, Switch, type JSX} from 'solid-js'
import {stale} from '../data.js'
import {ComponentDetail} from '../detail.js'
import {ComponentRows} from '../rows.js'
import {AllMatch, NoRun, NothingShown} from '../states.js'
import {layoutRoute, useXrayPage} from './layout.js'

export const listRoute = createRoute({
  getParentRoute: () => layoutRoute,
  path: 'list',
  component: XrayList,
})

const Route = listRoute

function XrayList(): JSX.Element {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const clearQuery = () => navigate({search: (previous) => ({...previous, q: undefined}), replace: true})
  const page = useXrayPage()
  return (
    <Switch>
      <Match when={!page.ran()}>
        <NoRun
          route={page.loaded().target.route}
          width={page.loaded().target.width}
          running={page.activity.running}
          onRun={page.run}
        />
      </Match>
      <Match when={page.above() === 0 && page.fixed().size === 0}>
        <AllMatch
          width={page.loaded().target.width}
          total={page.rows().length}
          ranAt={page.loaded().ranAt}
          stale={stale(page.loaded())}
          running={page.activity.running}
          onRun={page.run}
        />
      </Match>
      <Match when={page.visible().length === 0}>
        <NothingShown query={search().q ?? ''} filter={search().filter} onClear={clearQuery} />
      </Match>
      <Match when={page.visible().length > 0}>
        <ComponentRows
          rows={page.visible()}
          selected={page.selected()?.key ?? null}
          fixed={page.fixed()}
          onSelect={page.toggle}
        >
          {(row) => (
            <ComponentDetail
              row={row}
              images={page.loaded().images}
              target={page.loaded().target}
              opening={page.activity.opening}
              onOpen={page.open}
              onCopied={page.copied}
            />
          )}
        </ComponentRows>
      </Match>
    </Switch>
  )
}
