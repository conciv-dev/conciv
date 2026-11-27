import {defineErrorCatalog} from 'evlog'

export const chatKitErrors = defineErrorCatalog('ui-kit-chat', {
  OUTSIDE_PROVIDER: {
    message: ({part, provider}: {part: string; provider: string}) => `${part} must be used within ${provider}`,
    fix: 'Render the part inside the component the message names.',
  },
  ICON_REGISTRY_MISSING: {
    message: 'Icon registry is unavailable: mount an IconRegistryProvider at the app root',
    fix: 'Wrap the app in an IconRegistryProvider.',
  },
  CODE_BLOCK_OUTSIDE: {
    message: 'A CodeBlock part renders inside a CodeBlock',
    fix: 'Render the part as a child of a CodeBlock.',
  },
  ICON_NOT_SVG: {
    message: ({name}: {name: string}) => `Icon "${name}" is not an SVG document`,
    fix: 'Register an SVG document whose root element is svg.',
  },
  ICON_NO_FRAME: {
    message: ({name}: {name: string}) => `Icon "${name}" needs a viewBox, or a width and a height`,
    fix: 'Add a viewBox, or a width and a height, to the root svg element.',
  },
  FILE_NOT_READ: {
    message: ({name}: {name: string}) => `Could not read ${name}`,
    why: 'The browser could not read the file from disk.',
    fix: 'Check that the file still exists and attach it again.',
  },
  FILE_REFUSED: {
    status: 413,
    message: 'The file cannot be attached',
  },
  NO_ADAPTER: {
    status: 415,
    message: ({name}: {name: string}) => `No attachment adapter accepts ${name}`,
    fix: 'Attach a file of a type this composer accepts.',
  },
  ATTACHMENTS_UNSUPPORTED: {
    message: 'Attachments are not supported',
    fix: 'Give the composer an attachment adapter.',
  },
  FILE_TYPE_NOT_ACCEPTED: {
    status: 415,
    message: ({type, accept}: {type: string; accept: string}) =>
      `File type ${type} is not accepted. Accepted types: ${accept}`,
    fix: 'Attach a file of one of the accepted types.',
  },
  ATTACHMENT_NOT_FOUND: {
    status: 404,
    message: 'Attachment not found',
  },
  SEND_FAILED: {
    message: 'The message could not be sent',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'ui-kit-chat': typeof chatKitErrors
  }
}
