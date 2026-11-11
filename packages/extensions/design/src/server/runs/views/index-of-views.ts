import {brokenRoundsView} from './broken-rounds.js'
import {fomNodesView} from './fom-nodes.js'
import {hintVsDrawnView} from './hint-vs-drawn.js'
import {kitPerRoundView} from './kit-per-round.js'
import {lostComponentsView} from './lost-components.js'
import {lowestRenderedView} from './lowest-rendered.js'
import {mispairsView} from './mispairs.js'
import {pageHeightRowsView} from './page-height-rows.js'
import {roundRowsView} from './round-rows.js'
import {runSummaryView} from './run-summary.js'

export const runsViews = {
  run_summary: runSummaryView,
  round_rows: roundRowsView,
  hint_vs_drawn: hintVsDrawnView,
  kit_per_round: kitPerRoundView,
  mispairs: mispairsView,
  lost_components: lostComponentsView,
  page_height_rows: pageHeightRowsView,
  broken_rounds: brokenRoundsView,
  lowest_rendered: lowestRenderedView,
  fom_nodes: fomNodesView,
}
