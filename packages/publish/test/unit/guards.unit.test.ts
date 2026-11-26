import {describe, expect, test} from 'vitest'
import {findDependencyLoops} from '../../src/guards.ts'
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
