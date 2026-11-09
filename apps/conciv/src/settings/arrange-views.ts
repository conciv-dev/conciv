import {sortBy} from 'es-toolkit'
import type {Preferences} from './preferences-schema.js'

type Arrangement = Pick<Preferences, 'docksHidden' | 'docksCustomOrder'>

export function arrangeViews<View extends {id: string}>(views: readonly View[], arrangement: Arrangement): View[] {
  const ordered = sortBy(
    views.map((view, index) => ({view, position: arrangement.docksCustomOrder[view.id] ?? index})),
    [(entry) => entry.position],
  )
  return ordered.map((entry) => entry.view).filter((view) => !arrangement.docksHidden.includes(view.id))
}
