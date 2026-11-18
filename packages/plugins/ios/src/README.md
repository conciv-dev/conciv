# src

The engine half of the iOS plugin: it builds, runs, screenshots and reads the logs of a native iOS app on the
simulator by running `xcrun`, `swiftc`, `plutil` and `codesign` as child processes.

- `index.ts` is the only entry; every other file is a flat module told apart by name.
- Every child process goes through the `Simctl` service, so an interrupted tool call stops its child.
- Options are untrusted input and are parsed with zod where they enter (`config.ts`); without options every tool
  answers `{ok: false, error: 'ios plugin not configured'}` and no rules reach the system prompt.
- The plugin holds no state between tool calls beyond the parsed options.
