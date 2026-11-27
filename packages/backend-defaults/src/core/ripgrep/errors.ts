import {defineErrorCatalog} from 'evlog'

export const ripgrepErrors = defineErrorCatalog('backend.ripgrep', {
  FAILED: {
    message: 'ripgrep failed',
  },
  INVALID_PATTERN: {
    status: 400,
    message: ({details}: {details: string}) => details,
    why: 'ripgrep could not parse the search pattern as a regular expression.',
    fix: 'Fix the regular expression, or search for the text literally.',
  },
  CHECKSUM_MISMATCH: {
    message: ({filename, expected, actual}: {filename: string; expected: string; actual: string}) =>
      `ripgrep download ${filename} failed SHA-256 verification: expected ${expected}, got ${actual}`,
  },
  EXTRACTION_FAILED: {
    message: ({exitCode}: {exitCode: number}) => `ripgrep extraction failed with code ${exitCode}`,
  },
  EXECUTABLE_MISSING: {
    message: ({extracted}: {extracted: string}) => `ripgrep archive did not contain executable: ${extracted}`,
  },
  PLATFORM_UNSUPPORTED: {
    message: ({platformKey}: {platformKey: string}) => `unsupported platform for ripgrep: ${platformKey}`,
    fix: 'Install ripgrep (rg) on the PATH.',
  },
  DOWNLOAD_EMPTY: {
    message: ({url}: {url: string}) => `failed to download ripgrep from ${url}`,
    fix: 'Check the network, or install ripgrep (rg) on the PATH.',
  },
})

declare module 'evlog' {
  interface RegisteredErrorCatalogs {
    'backend.ripgrep': typeof ripgrepErrors
  }
}
