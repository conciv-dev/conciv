import {defineErrorCatalog} from 'evlog'

export const svgErrors = defineErrorCatalog('whiteboard.svg', {
  TOO_LARGE: {status: 413, message: 'svg exceeds 64kb', fix: 'Draw fewer or simpler shapes.'},
  NO_ROOT: {status: 400, message: 'markup must have an <svg> root', fix: 'Wrap the shapes in an <svg> element.'},
  SCRIPT: {status: 400, message: 'script elements are not allowed', fix: 'Remove every <script> element.'},
  FOREIGN_OBJECT: {
    status: 400,
    message: 'foreignObject elements are not allowed',
    fix: 'Remove every <foreignObject> element.',
  },
  TOO_MANY_NODES: {
    status: 413,
    message: ({nodes, limit}: {nodes: number; limit: number}) => `svg has ${nodes} drawable nodes, limit is ${limit}`,
    fix: 'Draw fewer shapes, or split the drawing into several calls.',
  },
  MALFORMED: {status: 400, message: 'the svg is not well-formed', fix: 'Close every tag and quote every attribute.'},
  ROOT_NOT_FOUND: {status: 400, message: 'no <svg> root found', fix: 'Wrap the shapes in an <svg> element.'},
  NOTHING_DRAWABLE: {
    status: 400,
    message: 'the svg had nothing drawable',
    fix: 'Use paths, shapes or text with their own fill and stroke.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'whiteboard.svg': typeof svgErrors
  }
}
