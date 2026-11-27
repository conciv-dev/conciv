import {defineErrorCatalog} from 'evlog'

export const homeErrors = defineErrorCatalog('home', {
  FOLDER_REFUSED: {
    status: 403,
    message: ({home, reason}: {home: string; reason: string}) => `conciv refuses the home folder ${home}: ${reason}`,
    why: 'The home folder holds secrets, so conciv only uses a real folder owned by you.',
    fix: 'Point CONCIV_HOME at a folder you own, or remove the link and let conciv make the folder.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    home: typeof homeErrors
  }
}
