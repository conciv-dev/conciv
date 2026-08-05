---
'@conciv/extension': patch
---

Tools declared through a shared definition object (the pattern that lets a client and a server file agree on one contract) kept their name only as a widened `string`, so they were silently absent from the typed registry client and invisible to the tool-name collision diagnostics. A `toolDefinition()` helper on the UI-free `@conciv/extension/tool` subpath gives those objects an inference site that preserves the literal name, and every shared definition across the bundled extensions now goes through it. A tool's declared `errors` are carried through to the typed client too: `isDefinedError` narrows a call-site failure to the declared code with its `data` type instead of collapsing to `never`, and a client-bound tool additionally exposes the transport codes the forwarding layer can raise.
