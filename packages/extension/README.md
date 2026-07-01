# @conciv/extension

The conciv extension-authoring contract: `defineExtension`/`defineTool` plus the SolidJS
runtime context and typed `useSlot`/`useContext` hooks.

Part of [conciv](https://github.com/conciv-dev/conciv). Author an extension under
`conciv/extensions/*.tsx` in your app:

```ts
import {defineExtension} from '@conciv/extension'

export default defineExtension({
  name: 'my-extension',
  // tools, slots, context…
})
```
