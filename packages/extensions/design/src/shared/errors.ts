import type {ToolErrors} from '@conciv/extension'

export const DESIGN_ERRORS = {
  'image-unreadable': {message: 'image is neither a PNG file nor PNG base64'},
  'no-target': {message: 'no design is registered; call design_get with the Figma link'},
  'figma-link': {
    message: 'the Figma link must point at a frame: https://www.figma.com/design/<fileKey>/<name>?node-id=<id>',
  },
  'figma-source': {
    message:
      'no way to read the Figma frame: set FIGMA_API_KEY for the engine, or fetch the frame with your Figma MCP and pass it as document together with its image',
  },
  'figma-request': {message: 'Figma did not answer the request'},
} satisfies ToolErrors
