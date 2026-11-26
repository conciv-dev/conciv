---
'@conciv/app': patch
---

The engine entry is the package root: `import {createEngine, TestLLM} from '@conciv/plugin-testkit'`, the same line in node, happy-dom and browser mode. `./node` is gone; `./browser` (`mount`, `createEngineRouterHistory`) and `./vitest` (`concivTest`) stay.
