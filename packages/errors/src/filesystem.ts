import {defineErrorCatalog} from 'evlog'

export const filesystemErrors = defineErrorCatalog('filesystem', {
  FILESYSTEM_FAILED: {
    message: ({method}: {method: string}) => `Filesystem operation failed: ${method}`,
  },
  LOCK_GLOBAL_MISSING: {
    message: 'The lock folder is not set',
    why: 'Flock.setGlobal was not called before a lock was taken.',
    fix: 'Call Flock.setGlobal with the state folder at engine start.',
  },
  LOCK_ABORTED: {message: 'Waiting for the lock was aborted'},
  LOCK_NOT_ACQUIRED: {message: 'Another process holds the lock'},
  LOCK_TIMEOUT: {
    message: ({key}: {key: string}) => `Timed out waiting for lock: ${key}`,
    why: 'Another process held the lock for longer than the wait allows.',
    fix: 'Stop the other conciv process that works on the same folder, then try again.',
  },
  LOCK_COMPROMISED: {
    message: ({detail}: {detail: string}) => `Lock acquired but ${detail} (possible compromise)`,
    why: 'Another process wrote into the lock folder while this one took it.',
  },
  LOCK_RELEASE_REFUSED: {
    message: ({detail}: {detail: string}) => `Refusing to release: ${detail}`,
    why: 'The lock folder no longer belongs to this process.',
  },
  INSTALL_FAILED: {
    message: ({target, detail}: {target: string; detail: string}) =>
      detail ? `Failed to install ${target}: ${detail}` : `Failed to install ${target}`,
    fix: 'Check the package name and your network, then try again.',
  },
  INSTALL_UNSUPPORTED_SPEC: {
    message: ({action}: {action: string}) => `Package ${action} only support registry and Git package specs`,
    fix: 'Name the package by its registry name or a Git url.',
  },
  PACKAGE_NOT_INSTALLED: {
    status: 404,
    message: ({pkg}: {pkg: string}) => `Package is not installed: ${pkg}`,
  },
  PACKAGE_REVISION_NOT_FOUND: {
    status: 404,
    message: ({pkg}: {pkg: string}) => `Package revision not found: ${pkg}`,
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    filesystem: typeof filesystemErrors
  }
}
