import {defineErrorCatalog} from 'evlog'

export const mascotErrors = defineErrorCatalog('mascot', {
  PART_ALREADY_PROVIDED: {
    message: ({part, component}: {part: string; component: string}) =>
      `mascot part '${part}' is already provided; render exactly one ${component}`,
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
