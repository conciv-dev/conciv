declare module 'virtual:conciv-extension-under-test' {
  import type {AnyExtension} from '@conciv/extension'

  const extension: AnyExtension
  export default extension
}

declare module 'virtual:conciv-connect-probe' {
  import type {AnyExtension} from '@conciv/extension'

  const extension: AnyExtension
  export default extension
}
