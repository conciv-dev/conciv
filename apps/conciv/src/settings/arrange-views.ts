import {sortBy} from 'es-toolkit'
import type {Preferences} from './preferences-schema.js'

type Arrangement = Pick<Preferences, 'docksPinned' | 'docksCustomOrder'>

export function orderViews<View extends {id: string}>(views: readonly View[], arrangement: Arrangement): View[] {
  const ordered = sortBy(
    views.map((view, index) => ({
      view,
      pinned: arrangement.docksPinned.includes(view.id) ? 0 : 1,
      position: arrangement.docksCustomOrder[view.id] ?? index,
    })),
    [(entry) => entry.pinned, (entry) => entry.position],
  )
  return ordered.map((entry) => entry.view)
}

export function arrangeViews<View extends {id: string}>(
  views: readonly View[],
  arrangement: Arrangement & Pick<Preferences, 'docksHidden'>,
): View[] {
  return orderViews(views, arrangement).filter((view) => !arrangement.docksHidden.includes(view.id))
}
