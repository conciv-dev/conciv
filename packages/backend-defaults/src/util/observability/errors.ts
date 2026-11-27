import {defineErrorCatalog} from 'evlog'

export const observabilityErrors = defineErrorCatalog('backend.observability', {
  LOG_RETENTION_INVALID: {
    message: ({reason}: {reason: string}) => `conciv: logRetention: ${reason}`,
    fix: 'Set logRetention to a duration such as 7d or 12h.',
  },
  RESOURCE_ATTRIBUTE_INVALID: {
    message: 'Invalid OTEL_RESOURCE_ATTRIBUTES entry',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'backend.observability': typeof observabilityErrors
  }
}
