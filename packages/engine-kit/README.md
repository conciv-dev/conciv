# @internal/engine-kit

The harness engine that engine tests share: the real engine, started through the `createBackend` the caller passes, on `@conciv/simulation`'s scripted model, in a temp project. `@conciv/backend-defaults` uses it in its own tests and `@conciv/backend-test-utils` bundles it. Private, source only.

## Invariants

- Depends on neither `@conciv/backend-defaults` nor `@conciv/backend-test-utils`.
- No module state: every engine is made by the call that starts it and stopped by its test.

Source: [src](./src/README.md).
