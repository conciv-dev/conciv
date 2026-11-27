import {defineErrorCatalog} from 'evlog'

export const storeErrors = defineErrorCatalog('whiteboard.store', {
  UNREADABLE: {
    message: ({key, reason}: {key: string; reason: string}) => `whiteboard state ${key} is unreadable: ${reason}`,
    why: 'A stored whiteboard row does not match the shape this version of the plugin reads.',
  },
  ROW_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `no row ${id} in this room`,
    why: 'The row was removed, or it belongs to another room.',
    fix: 'List the rows again and use an id from that list.',
  },
  VERSION_CONFLICT: {
    status: 409,
    message: ({elementId}: {elementId: string}) => `element ${elementId} has a newer version stored`,
    why: 'Another writer saved this element first.',
    fix: 'Read the stored element and write again on top of its version.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'whiteboard.store': typeof storeErrors
  }
}
