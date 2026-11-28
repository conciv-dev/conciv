import {defineErrorCatalog} from 'evlog'
import {FIGMA_KEY_MISSING, FIGMA_KEY_REFUSED} from '../key/figma-key-text.js'

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
  FIGMA_KEY_MISSING: {
    status: 401,
    message: FIGMA_KEY_MISSING,
    fix: 'Ask the user to save a Figma personal access token in the design settings, or to set FIGMA_API_KEY in the engine environment, then call design_get again; or fetch the frame with your Figma MCP and pass it as document together with its image.',
  },
  FIGMA_NO_DOCUMENT: {
    status: 400,
    message: ({file}: {file: string}) => `no Figma document at ${file}`,
  },
  IMAGE_UNREADABLE: {
    status: 400,
    message: ({ref}: {ref: string}) => `${ref} is neither a PNG file nor PNG base64`,
  },
  FIGMA_REQUEST: {
    status: 502,
    message: ({detail}: {detail: string}) => detail,
  },
  FIGMA_TOKEN: {
    status: 401,
    message: ({detail}: {detail: string}) => `${FIGMA_KEY_REFUSED}: ${detail}`,
    fix: 'Ask the user to save a fresh Figma personal access token in the design settings, then call design_get again.',
  },
  FIGMA_DOCUMENT: {
    status: 400,
    message: ({detail}: {detail: string}) => `the Figma document has an unexpected shape: ${detail}`,
  },
  FILL_FORMAT: {
    message: ({node, format}: {node: string; format: string}) =>
      `the image fill of ${node} is ${format}, which the design plugin cannot decode`,
  },
  NO_TARGET: {
    status: 400,
    message: 'no design is registered',
    fix: 'Call design_get with the Figma link.',
  },
  UNWRITABLE: {
    message: ({file, detail}: {file: string; detail: string}) => `${file} could not be written: ${detail}`,
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
