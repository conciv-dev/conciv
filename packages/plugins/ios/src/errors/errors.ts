import {defineErrorCatalog} from 'evlog'

export const iosErrors = defineErrorCatalog('ios', {
  INVALID_OPTIONS: {
    status: 400,
    message: ({detail}: {detail: string}) => `Invalid ios plugin options: ${detail}`,
    fix: 'Fix the ios options in the conciv config.',
  },
  SPAWN_FAILED: {
    message: ({command}: {command: string}) => `could not run ${command}`,
    why: 'The command is missing or could not be started.',
    fix: 'Install Xcode and its command line tools, then try again.',
  },
  OUTPUT_TOO_LARGE: {
    status: 413,
    message: ({command}: {command: string}) => `${command} printed more output than the 128MB limit`,
  },
  BUILD_FILE_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  SIMULATOR_NOT_FOUND: {
    status: 404,
    message: ({simulator}: {simulator: string}) => `no available simulator matching ${simulator}`,
    fix: 'Set the ios simulator option to a name or udid that xcrun simctl list devices shows.',
  },
  BOOT_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  ARTIFACT_MISSING: {
    status: 404,
    message: ({detail}: {detail: string}) => detail,
    fix: 'Run ios_build before ios_run.',
  },
  INSTALL_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  LAUNCH_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  LOGS_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  SCREENSHOT_FAILED: {
    message: ({detail}: {detail: string}) => detail,
  },
  PICK_TIMED_OUT: {
    message: 'The native app did not answer the element pick in time',
    fix: 'Check that the app is in front on the simulator, then pick again.',
  },
  PICK_FAILED: {
    message: 'The native app could not pick an element',
  },
  PICK_UNPARSEABLE: {
    message: 'The native app answered the element pick with a message conciv cannot read',
    why: 'The app and the widget run versions of the bridge that do not match.',
    fix: 'Update the conciv swift package in the app and rebuild it.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    ios: typeof iosErrors
  }
}
