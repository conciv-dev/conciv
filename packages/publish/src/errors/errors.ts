import {defineErrorCatalog} from 'evlog'

export const publishErrors = defineErrorCatalog('publish', {
  NOT_AT_WORKSPACE_ROOT: {
    message: ({cwd}: {cwd: string}) => `conciv-publish must run at the workspace root; cwd is ${cwd}`,
    fix: 'Run it through the root pnpm scripts, from the repository root.',
  },
  INVALID_DIST_TAG: {
    message: ({tag}: {tag: string}) => `invalid dist-tag ${JSON.stringify(tag)}: must match /^[a-z][a-z0-9-]*$/`,
    fix: 'Use a lower-case tag such as beta or next.',
  },
  INVALID_PACKAGE_NAME: {
    message: ({name}: {name: string}) =>
      `invalid package name ${JSON.stringify(name)}: must match /^@conciv\\/[a-z][a-z0-9-]*$/`,
  },
  STILL_UNVERSIONED: {
    message: ({names}: {names: string}) => `still 0.0.0: ${names}`,
    fix: 'Run "conciv-publish version" before publishing.',
  },
  NOT_PUBLIC: {
    message: ({name}: {name: string}) => `${name} is not in PUBLIC_PACKAGES`,
    fix: 'Add it to PUBLIC_PACKAGES in packages/publish/src/guards.ts first.',
  },
  PACKAGE_NOT_FOUND: {
    message: ({name}: {name: string}) => `${name} not found in the workspace`,
  },
  PACKAGE_PRIVATE: {
    message: ({name}: {name: string}) => `${name} is private`,
    fix: 'Unset "private" in its package.json before bootstrapping.',
  },
  PACKAGE_UNVERSIONED: {
    message: ({name}: {name: string}) => `${name} is still 0.0.0`,
    fix: 'Land a changeset and merge the version PR before bootstrapping.',
  },
  CHANGESET_EMPTY: {message: 'changeset has no releases'},
  CHANGESET_UNREADABLE: {
    message: ({file, reason}: {file: string; reason: string}) => `${file}: ${reason}`,
  },
  CHANGESET_FOLDER_MISSING: {
    message: ({directory}: {directory: string}) => `${directory} does not exist`,
    fix: 'Run it from the workspace root.',
  },
  CHANGESET_SYMLINK: {
    message: ({path}: {path: string}) => `${path}: changeset files must not be symlinks`,
  },
  CHANGESET_UNKNOWN_PACKAGES: {
    message: ({problems}: {problems: string[]}) => `invalid changeset package names:\n${problems.join('\n')}`,
  },
  CHANGESET_MISSING: {
    message: ({packages}: {packages: string}) => `no changeset covers changed published packages: ${packages}`,
    fix: 'Add a changeset naming any published @conciv package (fixed versioning releases the whole set together), or apply the "no-changeset" label if this PR intentionally ships no release.',
  },
  PRIVATE_SCOPE_PUBLISHED: {
    message: ({names, scope}: {names: string[]; scope: string}) =>
      names
        .map(
          (name) => `${name} must stay private: ${scope}* packages are inlined by conciv's own builds, never published`,
        )
        .join('\n'),
  },
  PUBLIC_SET_DRIFT: {
    message: ({unexpected, missing}: {unexpected: string[]; missing: string[]}) =>
      `public package set drift - unexpected: [${unexpected.join(', ')}], missing: [${missing.join(', ')}]`,
    fix: 'Make PUBLIC_PACKAGES in packages/publish/src/guards.ts list exactly the published @conciv packages.',
  },
  PUBLIC_DEPENDS_ON_PRIVATE: {
    message: ({violations}: {violations: string[]}) => violations.join('\n'),
  },
  PUBLIC_TYPES_NAME_PRIVATE: {
    message: ({violations}: {violations: string[]}) => violations.join('\n'),
  },
  DEPENDENCY_LOOPS: {
    message: ({loops}: {loops: string[]}) =>
      `workspace packages form ${loops.length} dependency loop(s); every edge counts (dependencies, devDependencies, peerDependencies, optionalDependencies):\n${loops.join('\n')}`,
  },
  DEPENDENCIES_NOT_CATALOGUED: {
    message: ({violations}: {violations: string[]}) =>
      `dependencies shared by two or more workspace manifests must use "catalog:" and take their version from the catalog in pnpm-workspace.yaml:\n${violations.join('\n')}`,
  },
  COVERAGE_NEEDS_BASE: {
    message: '--require-coverage requires --base <ref>',
    fix: 'Pass the git ref to compare against, e.g. --base origin/main.',
  },
  MIRROR_TOKEN_MISSING: {
    message: 'GH_MIRROR_TOKEN is required to publish the conciv-swift mirror',
    fix: 'Set GH_MIRROR_TOKEN to a token with push access to conciv-dev/conciv-swift.',
  },
  MIRROR_TAG_DIFFERS: {
    message: ({version}: {version: string}) =>
      `conciv-swift ${version} is already tagged but the assembled tree differs: the mirror source changed without a @conciv/plugin-ios version bump`,
    fix: 'Check the release flow: changesets should bump the version on every release.',
  },
  INVALID_SWIFT_VERSION: {
    message: ({version}: {version: string}) =>
      `invalid swift sdk version ${JSON.stringify(version)}: must be a bare semver major.minor.patch with no leading zeroes`,
  },
  RELEASE_COMMIT_NOT_FOUND: {
    message: ({path, version}: {path: string; version: string}) =>
      `could not find the commit that set ${path} version to ${version}: the mirror tree must be anchored to the release commit, so full history is required`,
    fix: 'Check out with fetch-depth: 0.',
  },
  REGISTRY_LOOKUP_FAILED: {
    message: ({name, httpStatus}: {name: string; httpStatus: number}) =>
      `registry lookup for ${name} failed with ${httpStatus}`,
  },
  NPM_TOO_OLD: {
    message: ({version}: {version: string}) => `sync needs npm >= 11.15 for npm trust, found ${version}`,
    fix: 'Run npm i -g npm@latest.',
  },
  SYNC_FAILED: {
    message: ({names}: {names: string}) => `sync failed for ${names}; tags not pushed.`,
    fix: 'Rerun sync, it is idempotent.',
  },
  NO_VERSION_TO_TAG: {
    message: ({name}: {name: string}) => `${name}: no versioned manifest in the workspace to tag`,
  },
  TURBO_TASK_EDGES: {
    message: ({violations}: {violations: string[]}) =>
      `every package task waits on its dependencies' builds through "^build", never through a "<package>#<task>" edge:\n${violations.join('\n')}`,
  },
  TYPECHECK_MISSES_BUILD: {
    message: ({violations}: {violations: string[]}) =>
      `a typecheck depends on the build of every workspace package whose dist its program reads, directly or through a package it reads from source:\n${violations.join('\n')}`,
  },
  PLUGIN_USES_UI_KIT: {
    message: ({builtIns, violations}: {builtIns: string[]; violations: string[]}) =>
      `a plugin under packages/plugins draws through ctx.ui (conciv's own plugins read conciv's members with OpaqueUi.toInternal), never with @conciv/ui-kit*; only the built-ins ${builtIns.join(' and ')} ("conciv": {"builtin": true} in package.json) draw with the kit directly:\n${violations.join('\n')}`,
  },
  INVALID_TURBO_CONFIG: {
    message: ({path, reason}: {path: string; reason: string}) => `${path}: invalid turbo.json\n${reason}`,
  },
  INVALID_COMMAND_OUTPUT: {
    message: ({command, reason}: {command: string; reason: string}) => `${command}: invalid output\n${reason}`,
  },
  INVALID_JSON: {
    message: ({path}: {path: string}) => `${path}: invalid JSON`,
  },
  TYPECHECK_COVERAGE_GAPS: {
    message: ({violations}: {violations: string[]}) =>
      `every package on the @internal/tsconfig preset takes its include from the preset, and its "typecheck" script checks every tracked TypeScript file:\n${violations.join('\n')}`,
  },
  INVALID_TSCONFIG: {
    message: ({path, reason}: {path: string; reason: string}) => `${path}: invalid tsconfig\n${reason}`,
  },
  TSCONFIG_NOT_JSON: {
    message: ({path}: {path: string}) => `${path}: a tsconfig on the @internal/tsconfig preset is plain JSON`,
    fix: 'Remove comments and trailing commas from it.',
  },
  LIST_FILES_FAILED: {
    message: ({config, output}: {config: string; output: string}) => `${config}: tsc --listFilesOnly failed\n${output}`,
  },
  TEST_FILE_UNPARSABLE: {
    message: ({filename, reason}: {filename: string; reason: string}) => `${filename}: cannot parse - ${reason}`,
  },
  INVALID_BUDGET: {
    message: ({path, reason}: {path: string; reason: string}) =>
      `${path}: expected {"<package name>": <test count>}\n${reason}`,
  },
  OVER_BUDGET: {
    message: ({lines}: {lines: string[]}) => lines.join('\n'),
  },
  INVALID_MANIFEST: {
    message: ({path, reason}: {path: string; reason: string}) => `${path}: invalid package manifest - ${reason}`,
  },
  WORKSPACE_NOT_MAPPING: {
    message: ({path}: {path: string}) => `${path}: expected a YAML mapping with a "packages" list`,
  },
  NODE_FLOOR_MISSING: {
    message: 'no published package declares engines.node',
    fix: 'Set engines.node to the oldest Node the published node packages support, e.g. ">=22.19.0".',
  },
  NODE_FLOOR_MIXED: {
    message: ({floors}: {floors: string}) => `published packages declare different engines.node: ${floors}`,
    fix: 'Give every published node package the same engines.node.',
  },
  NODE_FLOOR_UNREADABLE: {
    message: ({range}: {range: string}) => `engines.node ${JSON.stringify(range)} is not of the form >=X.Y.Z`,
  },
  NODE_BELOW_FLOOR: {
    message: ({version, floor}: {version: string; floor: string}) =>
      `the node given is ${version}, older than the floor ${floor}`,
    fix: 'Pass --node a Node binary at or above the floor, the floor itself in CI.',
  },
  NODE_FLOOR_UNPACKED: {
    message: ({names}: {names: string}) => `pnpm pack wrote no tarball for ${names}`,
  },
  NODE_FLOOR_FAILED: {
    message: ({version, failures}: {version: string; failures: string[]}) =>
      `the packed packages do not run on Node ${version}:\n${failures.join('\n')}`,
  },
  WORKSPACE_PACKAGES_NOT_GLOBS: {
    message: ({path}: {path: string}) => `${path}: "packages" must be a list of glob strings`,
  },
})

export function causeFrom(
  thrown: unknown,
  internal?: Record<string, unknown>,
): {cause: Error; internal?: Record<string, unknown>} | {internal: Record<string, unknown>} {
  return thrown instanceof Error ? {cause: thrown, internal} : {internal: {...internal, thrown}}
}

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    publish: typeof publishErrors
  }
}
