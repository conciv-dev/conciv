import {mountWidget} from '../../src/mount.js'

// Test-only self-mounting entry: the node E2E suites inject a self-contained <script> and expect the
// widget to mount itself (the old global bundle's behaviour, before the plugin took over mounting).
// Built into dist/mandarax-widget.global.js by vite.global.config.ts — never a package export.
mountWidget([])
