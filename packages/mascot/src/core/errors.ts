import {defineErrorCatalog} from 'evlog'
import {PART_COMPONENTS, type MascotPartName} from './slot-contract.js'

export const mascotErrors = defineErrorCatalog('mascot', {
  PART_ALREADY_PROVIDED: {
    message: ({part}: {part: MascotPartName}) =>
      `mascot part '${part}' is already provided; render exactly one ${PART_COMPONENTS[part]}`,
    fix: 'Render each mascot part once inside <Mascot />.',
  },
  OUTSIDE_MASCOT: {
    message: 'a mascot part can only render inside <Mascot />',
    fix: 'Render the part as a child of <Mascot />.',
  },
  TIP_NOT_PLACED: {
    message: 'a tip emitter needs inline left and top in pixels before it can be anchored',
    fix: 'Set inline left and top in pixels on the tip before anchoring it.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    mascot: typeof mascotErrors
  }
}
