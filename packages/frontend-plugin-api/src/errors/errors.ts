import {defineErrorCatalog} from 'evlog'

export const pluginApiErrors = defineErrorCatalog('frontend-plugin-api', {
  OUTSIDE_CONTRIBUTION: {
    message: 'usePlugin must run inside a plugin contribution',
    fix: 'Call usePlugin from a component your plugin contributes, or from its setup.',
  },
  OUTSIDE_PANEL: {
    message: 'usePanel must run inside a panel render',
    fix: 'Call usePanel from the component a panel contribution renders.',
  },
  PORTAL_NOT_PLACED: {
    message: ({event}: {event: string}) => `a contribution sent ${event} and no <ConcivWidget/> above it placed it`,
    fix: 'Render the element inside a <ConcivWidget/>.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'frontend-plugin-api': typeof pluginApiErrors
  }
}
