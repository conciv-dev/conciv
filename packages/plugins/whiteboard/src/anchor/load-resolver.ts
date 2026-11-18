import {Effect} from 'effect'
import {unreadable} from './confine.js'

export const loadResolver = (root: string) =>
  Effect.tryPromise({try: () => import('./resolver.js'), catch: unreadable(root)}).pipe(
    Effect.map((module) => module.createReactAnchorResolver({root})),
  )
