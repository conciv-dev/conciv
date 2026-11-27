import {defineErrorCatalog} from 'evlog'

export const driveErrors = defineErrorCatalog('drive', {
  CLICK_OUTSIDE_TARGET: {
    status: 400,
    message: 'the click position must be within the target element',
    fix: 'Pick a position inside the element the snapshot reports.',
  },
  TARGET_STALE: {
    status: 404,
    message: ({target}: {target: number}) => `the target element is stale or unavailable: ${target}`,
    why: 'The element left the widget since the last snapshot.',
    fix: 'Take a new snapshot and use a target from it.',
  },
  NOTHING_FOCUSED: {
    status: 409,
    message: 'nothing in the widget has focus',
    fix: 'Focus or click an element in the widget first.',
  },
  TARGET_NOT_FOCUSABLE: {
    status: 400,
    message: ({target}: {target: number}) => `the target element cannot take focus: ${target}`,
    fix: 'Focus an element that is a control or a field.',
  },
  SEMANTIC_TARGET_STALE: {
    status: 404,
    message: ({id}: {id: string}) => `the semantic click target is stale or unavailable: ${id}`,
    why: 'The element left the widget since the last snapshot.',
    fix: 'Take a new snapshot and use a target from it.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    drive: typeof driveErrors
  }
}
