# @conciv/ui-kit-chat

A clean-room SolidJS implementation of the assistant-ui chat API: headless compound
primitives (Thread/Message/Composer/ActionBar/…) plus a neutral, themeable styled set, bound
to the canonical `@tanstack/ai-client` data model. Every component is viewable in Storybook
against the real `useChat` behind a fake connection.

Part of [conciv](https://github.com/conciv-dev/conciv). It ships as a dependency of the
umbrella package; install that:

```sh
npm install -D @conciv/it
```
