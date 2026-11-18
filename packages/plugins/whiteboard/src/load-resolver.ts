import {Effect} from 'effect'
import {unreadable} from './anchor-confine.js'

export const loadResolver = (root: string) =>
  Effect.tryPromise({try: () => import('./anchor-resolver.js'), catch: unreadable(root)}).pipe(
    Effect.map((module) => module.createReactAnchorResolver({root})),
  )
