import {defineErrorCatalog} from 'evlog'

export const imageErrors = defineErrorCatalog('backend.image', {
  WASM_UNAVAILABLE: {message: 'photon wasm is unavailable'},
  WORKER_UNAVAILABLE: {message: 'photon worker is unavailable'},
  WORKER_EXITED: {message: ({code}: {code: number}) => `photon worker exited with code ${code}`},
  WORKER_FAILED: {message: ({reason}: {reason: string}) => `photon worker failed: ${reason}`},
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'backend.image': typeof imageErrors
  }
}
