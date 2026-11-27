import {defineErrorCatalog} from 'evlog'

export const chatToolsErrors = defineErrorCatalog('ui-kit-chat-tools', {
  OUTSIDE_ROOT: {
    message: ({tool}: {tool: string}) => `${tool} sub-components must be used within ${tool}.Root`,
    fix: 'Render the sub-component inside the matching Root.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'ui-kit-chat-tools': typeof chatToolsErrors
  }
}
