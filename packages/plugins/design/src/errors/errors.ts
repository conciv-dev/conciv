import {defineErrorCatalog} from 'evlog'

export const designErrors = defineErrorCatalog('design', {
  INVALID_OPTIONS: {
    status: 400,
    message: ({detail}: {detail: string}) => `Invalid design plugin options: ${detail}`,
    fix: 'Fix the design options in the conciv config.',
  },
  UNPARSED: {
    message: ({file, detail}: {file: string; detail: string}) => `${file} could not be parsed: ${detail}`,
  },
  FIGMA_LINK: {
    status: 400,
    message: 'the Figma link must point at a frame: https://www.figma.com/design/<fileKey>/<name>?node-id=<id>',
  },
  FIGMA_SOURCE: {
    status: 400,
    message: 'no way to read the Figma frame',
    fix: 'Set the figma.token option of the design plugin to a Figma personal access token, or fetch the frame with your Figma MCP and pass its REST nodes document as document.',
  },
  FIGMA_REQUEST: {
    status: 502,
    message: ({detail}: {detail: string}) => detail,
  },
  FIGMA_TOKEN: {
    status: 401,
    message: ({detail}: {detail: string}) => `Figma refused the token: ${detail}`,
    fix: 'Set the figma.token option of the design plugin to a fresh Figma personal access token, then restart the engine.',
  },
  FIGMA_DOCUMENT: {
    status: 400,
    message: ({detail}: {detail: string}) => `the Figma document has an unexpected shape: ${detail}`,
  },
  NO_TARGET: {
    status: 400,
    message: 'no design is registered',
    fix: 'Call design_get with the Figma link.',
  },
  UNREADABLE: {
    message: ({file, detail}: {file: string; detail: string}) => `${file} could not be read: ${detail}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    design: typeof designErrors
  }
}
