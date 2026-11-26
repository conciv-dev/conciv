---
'@conciv/backend-plugin-api': patch
'@conciv/backend-app-api': patch
---

New: the Effect plugin entry `@conciv/backend-plugin-api/effect`. A plugin can export `Plugin.define({id, effect})`, whose `effect` returns an Effect that runs in the plugin's scope, as opencode's Effect plugins do. The engine host now imports these types from the SDK, and `fromPromise`, which turns a Promise plugin into the Effect plugin the host runs, lives in `@conciv/backend-plugin-api/promise/adapter`.

Changed for plugin authors: the Promise entry's `Agent`, `Location`, `Model`, `Skill`, `Tool` and `Rpc` are now Effect Schema values with branded ids, so an author builds them with the schema's makers. Before:

```ts
skills.add({
  id: 'deploy',
  name: 'Deploy',
  description: `${description}.`,
  path: 'skill://deploy/SKILL.md',
  content: 'You can deploy from code mode with `external_deploy_run`.',
})
```

After, with `AbsolutePath` from `@conciv/protocol/schema/schema`:

```ts
skills.add({
  id: Skill.Id.make('deploy'),
  name: Skill.Name.make('Deploy'),
  description: `${description}.`,
  path: AbsolutePath.make('skill://deploy/SKILL.md'),
  content: 'You can deploy from code mode with `external_deploy_run`.',
})
```

`@conciv/backend-plugin-api/rpc` accepts Effect Schema as well as Standard Schema and JSON Schema. `effect` is a dependency of `@conciv/backend-plugin-api`.
