import {defineErrorCatalog} from 'evlog'

export const sourceErrors = defineErrorCatalog('whiteboard.source', {
  NOT_A_FILE: {
    status: 400,
    message: ({file}: {file: string}) => `refusing non-filesystem path: ${file}`,
    fix: 'Anchor the comment to a file path inside the project.',
  },
  OUTSIDE_PROJECT: {
    status: 403,
    message: ({file}: {file: string}) => `path escapes project root: ${file}`,
    fix: 'Anchor the comment to a file path inside the project.',
  },
  UNREADABLE: {message: ({file}: {file: string}) => `the source file ${file} could not be read`},
  GIT_FAILED: {
    message: ({command}: {command: string}) => `git ${command} failed`,
    why: 'The project is not a git repository, or git is not installed.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'whiteboard.source': typeof sourceErrors
  }
}
