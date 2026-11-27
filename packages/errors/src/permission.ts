import {defineErrorCatalog} from 'evlog'

export const permissionErrors = defineErrorCatalog('permission', {
  DECLINED: {
    status: 403,
    message: 'The permission request was declined',
    why: 'The user rejected the request, or the run ended before anyone answered it.',
  },
  CORRECTED: {
    status: 403,
    message: ({feedback}: {feedback: string}) => feedback,
    why: 'The user rejected the request and said what to do instead.',
  },
  BLOCKED: {
    status: 403,
    message: ({permission}: {permission: string}) => `Permission denied: ${permission}`,
    why: 'A permission rule denies this action.',
    fix: 'Change the permission rules if the action should be allowed.',
  },
  REQUEST_NOT_FOUND: {
    status: 404,
    message: ({requestId}: {requestId: string}) => `Permission request not found: ${requestId}`,
    why: 'The request was already answered, or its run ended.',
  },
  DUPLICATE_PENDING_ID: {
    status: 409,
    message: ({requestId}: {requestId: string}) => `Duplicate pending permission ID: ${requestId}`,
  },
  SAVED_NOT_FOUND: {
    status: 404,
    message: ({id}: {id: string}) => `Saved permission not found: ${id}`,
    fix: 'List the saved permissions again and use an id from that list.',
  },
  SAVED_CONFLICT: {
    status: 409,
    message: ({action, resource}: {action: string; resource: string}) =>
      `A saved permission for ${action} on ${resource} already exists`,
    fix: 'Edit the saved permission that already exists instead.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    permission: typeof permissionErrors
  }
}
