import {runChild} from './run-child.js'

// The spawned vitest-runner entry. The driver launches THIS file by path (never imports it);
// all logic lives in the importable, side-effect-free ./run-child.js. Keeping the entry to a
// single call is what makes the old import-vs-spawn footgun structurally impossible — there is
// nothing here worth importing, so no module can boot a runner by importing it.
void runChild()
