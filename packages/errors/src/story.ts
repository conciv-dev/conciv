import {defineErrorCatalog} from 'evlog'

export const storyErrors = defineErrorCatalog('story', {
  ELEMENT_MISSING: {
    message: ({element}: {element: string}) => `The story renders no ${element}`,
    fix: 'Check that the story still renders the element its play function looks for.',
  },
  SAMPLE_FAILURE: {
    message: ({detail}: {detail: string}) => detail,
    why: 'The story feeds this failure in on purpose, to show the error state.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    story: typeof storyErrors
  }
}
