import {describe, expect, test} from 'vitest'
import {findDependencyLoops, findPrivateTypeLeaks} from '../../src/guards.ts'
import type {Manifest} from '../../src/workspace.ts'

describe('the workspace dependency loop check', () => {
  const workspacePackage = (manifest: Manifest) => ({
    dir: `/repo/${manifest.name}`,
    relativeDir: `${manifest.name}`,
    manifest,
  })

  test('reports every loop with the field of each edge, through any field, and passes a tree', () => {
    const loops = findDependencyLoops([
      workspacePackage({name: 'app', devDependencies: {kit: 'workspace:^'}}),
      workspacePackage({name: 'kit', peerDependencies: {app: '*'}, dependencies: {types: 'workspace:^'}}),
      workspacePackage({name: 'plugin', optionalDependencies: {sdk: 'workspace:^'}}),
      workspacePackage({name: 'sdk', dependencies: {plugin: 'workspace:^', 'es-toolkit': '^1.0.0'}}),
      workspacePackage({name: 'types'}),
    ])

    expect(loops).toEqual([
      'app -(devDependencies)-> kit -(peerDependencies)-> app',
      'plugin -(optionalDependencies)-> sdk -(dependencies)-> plugin',
    ])
    expect(
      findDependencyLoops([
        workspacePackage({name: 'app', devDependencies: {kit: 'workspace:^'}}),
        workspacePackage({name: 'kit', dependencies: {types: 'workspace:^'}}),
        workspacePackage({name: 'types'}),
      ]),
    ).toEqual([])
  })
})

describe('the published types check', () => {
  test('fails a private package named by a declaration an export reaches, and passes one no export reaches', () => {
    const files = new Map([
      ['kit/dist/kit.d.ts', "import type {Props} from './props.js'\nexport declare const kit: Props"],
      ['kit/dist/props.d.ts', "export type Props = typeof import('./card.js').card"],
      ['kit/dist/card.d.ts', "import type {Ui} from '@internal/app-api'\nexport declare const card: Ui"],
      ['kit/dist/builtins.d.ts', "import type {Builtins} from '@internal/defaults'\nexport declare const b: Builtins"],
    ])
    const leaks = (exports: string[]) =>
      findPrivateTypeLeaks({entries: exports, files, privateNames: ['@internal/app-api', '@internal/defaults']})

    expect(leaks(['kit/dist/kit.js'])).toEqual([
      'kit/dist/kit.d.ts -> kit/dist/props.d.ts -> kit/dist/card.d.ts names private workspace package @internal/app-api',
    ])
    expect(leaks(['kit/dist/props.d.ts', 'kit/package.json'])).toHaveLength(1)
    expect(leaks(['kit/dist/*.js'])).toEqual([
      'kit/dist/card.d.ts names private workspace package @internal/app-api',
      'kit/dist/builtins.d.ts names private workspace package @internal/defaults',
    ])
    files.set('kit/dist/card.d.ts', 'export declare const card: string')
    expect(leaks(['kit/dist/kit.js'])).toEqual([])
  })
})
