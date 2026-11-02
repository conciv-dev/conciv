# Trial: the reference dashboard built from an empty page (CUJ 2)

## Setup

| Field        | Value                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route        | `/?variant=dashboard` of the design fixture host (`packages/it/test/fixtures/design/host`)                                                                                      |
| Variant      | `dashboard`: one branch in `App.tsx` returning `<main className="dashboard" />`, nothing else                                                                                   |
| Tab width    | 1280 (viewport 1280 × 720, headless Chromium)                                                                                                                                   |
| Design image | `reference-1280.png` next to this record, 1280 × 1136 at 1x: the full-page render of the invoice dashboard from the `design-loop-spike` branch                                  |
| Target       | id `570b482cf2a2`, 1280 × 1136, 102 text runs                                                                                                                                   |
| Budget       | `roundBudget` 8, `stallRounds` 2, unchanged                                                                                                                                     |
| Command line | `pnpm trial --route '/?variant=dashboard' --width 1280 --image ../../docs/designs/trials/reference-1280.png --state <dir>` from `packages/it`, then the commands below on stdin |

Commands typed, in order: `diff`, `screenshot r1.png`, `diff`, `pin 2ef616fe /2/1/1/2/4`, `pin 12b9a018 /2/1/1/1/1`, `diff`, `pin d8ef2b83 /2/1/1/2/4/3/2`, `diff`, `mark excluded 12b9a018`, `mark excluded d8ef2b83`, `mark excluded 680f9e8b`, `mark accept-delta b51114de text`, `mark accept-delta 70781c1b text`, `mark accept-delta 5cc8aa34 text`, `mark accept-delta 7a805dcf text`, `diff`, `diff`, `diff`, `diff`, `status`, `screenshot final.png`, `quit`. Every save between two `diff` calls was picked up by Vite's HMR.

The reference sources in `aidx-loop` were not opened. The first draft was written from the design image itself (the PNG above) and run 0's brief, which named only the five largest boxes; the brief alone does not carry enough to write a page from, so the image was read the way a coding agent reads the image it is handed.

## Rounds

| Round | Stage     | Score `[unpaired, structure, content, geometry, paint, residual]` | Stop     | Sources | Capture path | Run time (ms)  |
| ----- | --------- | ----------------------------------------------------------------- | -------- | ------- | ------------ | -------------- |
| 0     | structure | `[0.8373, 84.651, 0, 0, 0, 0]`                                    | null     | dom     | snapdom-live | (registration) |
| 1     | structure | `[0.3899, 44.5208, 256.2, 92.5, 252.3033, 0.1823]`                | null     | dom     | snapdom-live | 13546          |
| 2     | structure | `[0.3788, 16.5, 260.2, 77.5, 256.0865, 0.1934]`                   | null     | dom     | snapdom-live | 8136           |
| 3     | structure | `[0.0027, 6.6962, 290.2, 85, 256.0865, 0.3008]`                   | null     | dom     | snapdom-live | 6885           |
| 4     | content   | `[0, 0, 300.2, 91, 256.0865, 0.3006]`                             | null     | dom     | snapdom-live | 7086           |
| 5     | geometry  | `[0, 0, 197.2, 75, 236.0865, 0.3026]`                             | null     | dom     | snapdom-live | 6407           |
| 6     | geometry  | `[0, 0, 197.2, 56.5, 236.0865, 0.3038]`                           | null     | dom     | snapdom-live | 8217           |
| 7     | geometry  | `[0, 0, 197.2, 48, 236.0865, 0.3038]`                             | null     | dom     | snapdom-live | 8608           |
| 8     | geometry  | `[0, 0, 197.2, 52.5, 236.0865, 0.4658]`                           | `budget` | dom     | snapdom-live | 8362           |

### Run 0 (registration)

Brief:

1. build the box the design shows at 0,0 (232×1136)
2. build the box the design shows at 914,24 (280×38)
3. build the box the design shows at 264,86 (234×124)
4. build the box the design shows at 514,86 (234×124)
5. build the box the design shows at 764,86 (234×124)

Response: the whole page in one pass, `src/Dashboard.tsx` (156 lines) and `src/dashboard.css`, and the `dashboard` branch in `App.tsx` switched to render it:

```diff
+import {Dashboard} from './Dashboard'
 import {Cards} from './Cards'
@@
-  if (requested === 'dashboard') return <main className="dashboard" />
+  if (requested === 'dashboard') return <Dashboard />
```

The full first draft is the final diff below minus the hunks of rounds 1, 5, 6 and 7.

### Round 1

Brief:

1. build the box the design shows at 264,540 (984×556)
2. build the text "$126,890.40" the design shows at 536,137 (160×25)
3. build the text "0 Ledgerly" the design shows at 24,24 (117×32)
4. build the text "$48,250.00" the design shows at 286,137 (146×25)
5. build the text "$9,412.75" the design shows at 786,137 (123×25)
6. replace the hard-coded sample "$0" at src/Dashboard.tsx:87 with the expression that renders it

Warnings: `sample-data $0`. 40 deltas, 38 counted unmatched, 46 unmatched in all.

Items 2, 4 and 5 named texts that were on the page with the same strings. A screenshot showed the stat values about 10 px above the design: the reset `.dashboard p { margin: 0 }` outranked `.stat-value { margin-top: 10px }`. Item 1 named the table card, which was on the page at 264,540. Item 3 is the logo glyph and the brand name read by OCR as one line, "0 Ledgerly"; no element renders that string. Changed the reset to zero specificity and rendered the axis ticks from numbers (item 6):

```diff
-.dashboard p,
-.dashboard h1,
-.dashboard h2 {
+:where(.dashboard) p,
+:where(.dashboard) h1,
+:where(.dashboard) h2 {
   margin: 0;
 }
```

```diff
-              <span>$75k</span>
-              <span>$50k</span>
-              <span>$25k</span>
-              <span>$0</span>
+              {TICKS.map((tick) => (
+                <span key={tick}>{tick === 0 ? '$0' : `$${tick}k`}</span>
+              ))}
@@
+const TICKS = [75, 50, 25, 0]
```

### Round 2

Brief:

1. build the box the design shows at 264,540 (984×556)
2. build the text "0 Ledgerly" the design shows at 24,24 (117×32)

42 deltas, 31 counted unmatched, 36 unmatched in all; no warning.

Both items name things the page already renders. The report's top twelve rows were all deltas, so the node ids of the two unbuilt entries were read from the stored run (`result-*.json`); the stored pairs showed the card article (`/2/1/1/2/4`) paired with nothing. No file edit. Pinned the card node to the article and the "0 Ledgerly" node to the brand row (see Decisions).

### Round 3

Brief:

1. build the text "Previous 1 2" the design shows at 903,1048 (133×29)

43 deltas, 35 counted unmatched, 39 unmatched in all.

The two pins cleared their items, structure fell from 16.5 to 6.6962, and content rose from 260.2 to 290.2. A new item appeared: OCR read the Previous, 1 and 2 buttons as one line, which was not in the brief of rounds 1 and 2. No element renders "Previous 1 2"; the pager row holds all three buttons. No file edit; pinned the node to the pager row.

### Round 4

Brief:

1. div (src/Dashboard.tsx:49): fontSize is 16 where the design has 32
2. div (src/Dashboard.tsx:49): lineHeight is 19.2 where the design has 38.4
3. div (src/Dashboard.tsx:49): change the text from to 0 Ledgerly at src/Dashboard.tsx:49
4. div (src/Dashboard.tsx:138): change the text from to Previous 1 2 at src/Dashboard.tsx:138
5. input (src/Dashboard.tsx:66): change the text from Search invoices, customers… to Search invoices, customers.. at src/Dashboard.tsx:66

Structure reached zero. Every item in the brief comes from an OCR reading: items 1 to 4 from the two pinned merged lines (a container whose text is in its children reads as the empty string), item 5 from the ellipsis read as two dots. Other rows of the report: the avatar "MK" with fontSize 12 → 45.5, fontWeight 700 → 400, background #0f766e → #f5f7fa; the three "Pending" pills with fontSize 12 → 25 and radius 10 → 0; the filters with text "Status: All" → "Status: All ," (the caret read as a comma); the date range with "–" → "−". No file edit; three nodes excluded and four text rows accepted (see Decisions).

### Round 5

Brief:

1. move the element (src/Dashboard.tsx:143) by 9,-2 px to where the design places it
2. move the element (src/Dashboard.tsx:130) by -8,-8 px to where the design places it
3. move the element (src/Dashboard.tsx:130) by -8,-8 px to where the design places it
4. move the element (src/Dashboard.tsx:130) by -8,-8 px to where the design places it
5. move the element (src/Dashboard.tsx:143) by 8,-2 px to where the design places it

Content fell from 300.2 to 197.2 and paint from 256.0865 to 236.0865, and the stage moved to geometry while content was still 197.2: the remaining content rows (the pill and avatar font estimates, the nav icon at fontSize 11 → 18) had not changed for two rounds and were demoted out of the stage choice. The report also said `pin lost ed5b501c` and `pin lost c9442749`, the two pins whose nodes were now excluded. Items 1 and 5 are the pager buttons; items 2 to 4 are the "Pending" pills, which a screenshot showed in the design's place; the -8,-8 is measured from the pill's padded box, not its text. Narrowed the pager buttons and took 1 px off the filter row:

```diff
 .table-tools {
   display: flex;
   align-items: center;
   gap: 12px;
-  height: 67px;
+  height: 66px;
@@
+.dashboard .page {
+  min-width: 34px;
+  padding: 0 10px;
+}
+
 .dashboard .page.current {
-  min-width: 34px;
   background: #4f46e5;
```

### Round 6

Brief:

1. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
2. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
3. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
4. move the element (src/Dashboard.tsx:87) by -2,7 px to where the design places it
5. move the element (src/Dashboard.tsx:128) by -5,-1 px to where the design places it

Geometry fell from 75 to 56.5. Item 4 is the axis tick labels, packed tighter than the design (in a screenshot, centres about 51 px apart against 53). Items 1 to 3 again the pill padding; item 5 an amount cell. Spread the tick column and moved it 2 px left:

```diff
 .axis-labels {
@@
-  width: 30px;
-  height: 172px;
+  width: 28px;
+  height: 179px;
@@
 .bars {
   display: flex;
   flex: 1;
-  margin-left: 15px;
+  margin-left: 17px;
```

### Round 7

Brief:

1. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
2. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
3. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
4. move the element (src/Dashboard.tsx:128) by -5,-1 px to where the design places it
5. move the element (src/Dashboard.tsx:94) by 1,4 px to where the design places it

Geometry fell from 56.5 to 48. Item 5 is the month labels under the bars. Moved them 4 px down without moving the bars:

```diff
 .bar-label {
-  margin: 10px 0 4px;
+  margin: 14px 0 0;
```

### Round 8

Brief:

1. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
2. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
3. move the element (src/Dashboard.tsx:130) by -8,-7 px to where the design places it
4. move the element (src/Dashboard.tsx:128) by -5,-1 px to where the design places it
5. div (src/Dashboard.tsx:93): gap-after is 14 where the design has 10

`stop: budget`. Geometry rose from 48 to 52.5 and the residual share from 0.3038 to 0.4658. `design_status` returned `done: false`, `round: 8`, `stop: budget`, `mismatch` 0.0165, 12 components above tolerance, and still carried the `next` line telling the agent to call `design_diff` again.

## Decisions

| Decision            | Node       | Value            | Why                                                                                                          |
| ------------------- | ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| pin                 | `2ef616fe` | `/2/1/1/2/4`     | the table card box at 264,540 (984×556) stayed "build the box" for two rounds while the card was on the page |
| pin                 | `12b9a018` | `/2/1/1/1/1`     | OCR read the logo and the brand name as one line, "0 Ledgerly"; the brand row holds both                     |
| pin                 | `d8ef2b83` | `/2/1/1/2/4/3/2` | OCR read three pager buttons as one line, "Previous 1 2"; the pager row holds them                           |
| mark `excluded`     | `12b9a018` | none             | the pin produced a text delta from the empty string and a 32 px font size on the brand row                   |
| mark `excluded`     | `d8ef2b83` | none             | the pin produced a text delta from the empty string on the pager row                                         |
| mark `excluded`     | `680f9e8b` | none             | the avatar's "MK" was estimated at 45.5 px weight 400 with the circle's teal as its ink                      |
| mark `accept-delta` | `b51114de` | `text`           | "…" in the placeholder read as ".."                                                                          |
| mark `accept-delta` | `70781c1b` | `text`           | the filter caret read as ","                                                                                 |
| mark `accept-delta` | `5cc8aa34` | `text`           | the filter caret read as ","                                                                                 |
| mark `accept-delta` | `7a805dcf` | `text`           | the en dash in the date range read as a minus sign                                                           |

These are user decisions in the design (made in the overlay); here the agent made them through the trial script. Nothing was accepted as a run.

## Where the agent went wrong

- **The first draft's margin reset.** `.dashboard p { margin: 0 }` overrode every margin on the stat cards, which put the three stat values in the round 1 brief as texts to build. The report said "build", not "move", so the cause was found from a screenshot, not from the report.
- **Pinning before excluding.** Pinning the two OCR-merged lines moved structure down but raised content from 260.2 to 290.2 and then 300.2, and put four rows in the round 4 brief that no edit can satisfy (a text change from the empty string, a 32 px font on a row). Excluding them at once would have saved two decision runs and kept round 4's brief for real items.
- **The axis ticks as an expression.** Round 1's warning asked for the "$0" tick to come from an expression. The ticks are static labels of the chart, and the warning counts nothing; the edit was made because the brief listed it.
- **Round 7's label move.** The brief asked to move the month labels by 1,4. Moving them with a larger top margin added a gap the design does not have: round 8 reported `gap-after is 14 where the design has 10`, geometry rose from 48 to 52.5 and the residual share from 0.3038 to 0.4658. Moving the labels and keeping the 10 px gap needed the bars' baseline moved too, which the brief did not say.
- **Reading the store.** Node ids of the unbuilt entries were read from the stored run, and the stored pairs were read to see why the card did not pair, because the report's top rows listed deltas before unmatched entries. The trial script now lists counted unmatched entries first.
- **The pill moves were not made.** Rounds 5 to 8 each spent three of five brief lines on moving the "Pending" pills by -8,-8 or -8,-7. The pills sit where the design has them; the offset is their padding. The agent left them, which the loop counts as an unfixed item.

## Defects

1. **OCR lines spanning several elements become structure items no edit can clear.** "0 Ledgerly" (the logo glyph "L" read as "0", joined to the brand name), "Previous 1 2" (three buttons) and "Status: All ," (the caret) are single text nodes. The brief says "build the text …". Reproduction: register `reference-1280.png`; `model.json` holds node `12b9a018` with lines "0" at 24,24 (32×32) and "Ledgerly" at 52,25 (89×29).
2. **A text node pinned to a container compares against the container's own text, which is empty.** Reproduction: on the round 3 page, `pin 12b9a018 /2/1/1/1/1`; the next report has `text '' → '0 Ledgerly'`, `fontSize 16 → 32` and `lineHeight 19.2 → 38.4` on `src/Dashboard.tsx:49`.
3. **The type estimate reads a filled shape behind light text as ink.** The avatar "MK" (white 12 px bold on a teal circle) is stored with typography size 45.5, weight 400, and its row reads `background #0f766e → #f5f7fa`, `foreground #ffffff → #0f766e`. The "Pending" pills (amber text on a light pill) read `fontSize 12 → 25`, `fontWeight 600 → 400`, `radius 10 → 0`. Reproduction: register `reference-1280.png`, read node `680f9e8b` in `model.json`.
4. **A text with the same string a few pixels off is reported as unbuilt, not moved.** Round 1: "$126,890.40", "$48,250.00" and "$9,412.75" were rendered with those strings about 10 px above the design (read from a screenshot) and the brief said "build the text". Reproduction: the round 1 page, the stat values with `margin-top: 0`.
5. **A card whose child has nearly the same box stays unpaired.** The table card (264,540, 984×556) was on the page in rounds 1 and 2 and stayed "build the box", with the article element paired to nothing. Reproduction: the round 1 page, node `2ef616fe` against `/2/1/1/2/4`; a pin clears it.
6. **The offset of a padded inline element is its padding.** A pill whose text sits at the design's place reports "move the element by -8,-8" every round. Reproduction: the final page, `src/Dashboard.tsx:130`.
7. **Excluding a pinned node reports the pin as lost every round.** Reproduction: `pin 12b9a018 …`, then `mark excluded 12b9a018`; every later report carries `pin lost ed5b501c`.
8. **`design_status` keeps the `next` line after the loop has stopped on `budget`.** The line tells the agent to call `design_diff` again and to stop when `stop` is set, while `stop` is set.

## Result

`stop: budget` at round 8, score `[0, 0, 197.2, 52.5, 236.0865, 0.4658]`. **Fail**: the trial did not end `done` or `residual-only` within the budget. Structure was cleared by round 4; content stayed at 197.2 from round 5 on, made of rows that come from OCR and type-estimate readings (defects 1 and 3), and the stage moved on to geometry because those rows stalled.

What the loop told the agent, and what it should have told it:

- It said "build the text "0 Ledgerly"" and "build the text "Previous 1 2"". It should have said that one design line spans several rendered elements and offered to exclude or split it.
- It said "build the text "$126,890.40"" for a text on the page with that string. It should have said "move it by 0,10".
- It said "fontSize is 12 where the design has 45.5" for the avatar. It should have withheld a type estimate whose ink is a filled shape.

Three things that would have made the loop faster:

1. Split OCR lines at the gaps between rendered elements, or report a line that spans several elements as its own kind, outside the structure count.
2. Reject type estimates whose ink is a filled shape (the avatar, the pills), so the content stage holds only real rows.
3. Measure the offset of a text inside a padded element from its glyph boxes, and group identical rows in the brief: the three pill moves took three of five lines in four rounds.

## Final diff

The built page is not committed; this is its final state against the setup (`App.tsx` relative to the empty `dashboard` branch).

```diff
--- a/packages/it/test/fixtures/design/host/src/App.tsx
+++ b/packages/it/test/fixtures/design/host/src/App.tsx
@@ -1,3 +1,4 @@
+import {Dashboard} from './Dashboard'
 import {Cards} from './Cards'
 import {Table} from './Table'
 import {Toolbar} from './Toolbar'
@@ -28,7 +29,7 @@ export function App() {
   const requested = new URLSearchParams(location.search).get('variant')
   document.documentElement.className = (requested === null ? undefined : LOOK_CLASSES[requested]) ?? ''
   if (requested === 'empty') return null
-  if (requested === 'dashboard') return <main className="dashboard" />
+  if (requested === 'dashboard') return <Dashboard />
   if (requested === 'type') {
     return (
       <main className="type">
diff --git a/packages/it/test/fixtures/design/host/src/Dashboard.tsx b/packages/it/test/fixtures/design/host/src/Dashboard.tsx
new file mode 100644
index 000000000..ecb0f8fc8
--- /dev/null
+++ b/packages/it/test/fixtures/design/host/src/Dashboard.tsx
@@ -0,0 +1,156 @@
+import './dashboard.css'
+
+const NAV = [
+  {icon: '◧', label: 'Overview'},
+  {icon: '▤', label: 'Invoices', active: true},
+  {icon: '◎', label: 'Customers'},
+  {icon: '◈', label: 'Payments'},
+  {icon: '▥', label: 'Reports'},
+  {icon: '⚙', label: 'Settings'},
+]
+
+const STATS = [
+  {label: 'Outstanding', value: '$48,250.00', change: '+12.4% vs last month', tone: 'up'},
+  {label: 'Paid this month', value: '$126,890.40', change: '+8.1% vs last month', tone: 'up'},
+  {label: 'Overdue', value: '$9,412.75', change: '+3.2% vs last month', tone: 'down'},
+  {label: 'Average days to pay', value: '18.6', change: '-1.4 days vs last month', tone: 'up'},
+]
+
+const MONTHS = [
+  {month: 'Jan', height: 62},
+  {month: 'Feb', height: 88},
+  {month: 'Mar', height: 74},
+  {month: 'Apr', height: 120},
+  {month: 'May', height: 104},
+  {month: 'Jun', height: 146},
+  {month: 'Jul', height: 132},
+  {month: 'Aug', height: 168},
+]
+
+const INVOICES = [
+  ['INV-2041', 'Northwind Traders', 'Aug 02, 2026', 'Sep 01, 2026', '$4,820.00', 'Paid'],
+  ['INV-2042', 'Blue Harbor Dental', 'Aug 03, 2026', 'Sep 02, 2026', '$1,275.50', 'Pending'],
+  ['INV-2043', 'Kestrel Logistics', 'Aug 05, 2026', 'Aug 20, 2026', '$12,940.00', 'Overdue'],
+  ['INV-2044', 'Maple & Finch Bakery', 'Aug 07, 2026', 'Sep 06, 2026', '$386.20', 'Paid'],
+  ['INV-2045', 'Orbital Design Co.', 'Aug 09, 2026', 'Sep 08, 2026', '$7,600.00', 'Pending'],
+  ['INV-2046', 'Riverside Pediatrics', 'Aug 11, 2026', 'Aug 26, 2026', '$2,145.80', 'Overdue'],
+  ['INV-2047', 'Summit Outdoor Supply', 'Aug 12, 2026', 'Sep 11, 2026', '$9,030.00', 'Paid'],
+  ['INV-2048', 'Lumen Analytics', 'Aug 14, 2026', 'Sep 13, 2026', '$5,512.40', 'Pending'],
+]
+
+const TICKS = [75, 50, 25, 0]
+
+const PAGES = ['1', '2', '3', '…', '8']
+
+export function Dashboard() {
+  return (
+    <main className="dashboard">
+      <aside className="sidebar">
+        <div className="brand">
+          <span className="logo">L</span>
+          <span className="brand-name">Ledgerly</span>
+        </div>
+        <nav className="nav">
+          {NAV.map((item) => (
+            <a key={item.label} className={item.active ? 'nav-item active' : 'nav-item'} href="#">
+              <span className="nav-icon">{item.icon}</span>
+              {item.label}
+            </a>
+          ))}
+        </nav>
+      </aside>
+      <section className="content">
+        <header className="page-header">
+          <h1>Invoices</h1>
+          <div className="header-tools">
+            <input className="search" placeholder="Search invoices, customers…" />
+            <span className="avatar">MK</span>
+          </div>
+        </header>
+        <div className="stats">
+          {STATS.map((stat) => (
+            <article key={stat.label} className="card stat">
+              <p className="stat-label">{stat.label}</p>
+              <p className="stat-value">{stat.value}</p>
+              <p className={`stat-change ${stat.tone}`}>{stat.change}</p>
+            </article>
+          ))}
+        </div>
+        <article className="card chart">
+          <div className="card-title-row">
+            <h2>Revenue by month</h2>
+            <span className="muted small">2026, collected</span>
+          </div>
+          <div className="plot">
+            <div className="axis-labels">
+              {TICKS.map((tick) => (
+                <span key={tick}>{tick === 0 ? '$0' : `$${tick}k`}</span>
+              ))}
+            </div>
+            <div className="bars">
+              {MONTHS.map((entry) => (
+                <div key={entry.month} className="bar-column">
+                  <div className="bar" style={{height: entry.height}} />
+                  <span className="bar-label">{entry.month}</span>
+                </div>
+              ))}
+            </div>
+          </div>
+        </article>
+        <article className="card invoices">
+          <div className="table-tools">
+            <button type="button" className="select">
+              Status: All <span className="caret">▾</span>
+            </button>
+            <button type="button" className="select">
+              Customer: Any <span className="caret">▾</span>
+            </button>
+            <span className="range">Mar 1, 2026 – Aug 31, 2026</span>
+          </div>
+          <table className="invoice-table">
+            <thead>
+              <tr>
+                <th>Invoice</th>
+                <th>Customer</th>
+                <th>Issued</th>
+                <th>Due</th>
+                <th className="amount">Amount</th>
+                <th>Status</th>
+              </tr>
+            </thead>
+            <tbody>
+              {INVOICES.map(([invoice, customer, issued, due, amount, status]) => (
+                <tr key={invoice}>
+                  <td>{invoice}</td>
+                  <td>{customer}</td>
+                  <td>{issued}</td>
+                  <td>{due}</td>
+                  <td className="amount">{amount}</td>
+                  <td>
+                    <span className={`pill ${status?.toLowerCase()}`}>{status}</span>
+                  </td>
+                </tr>
+              ))}
+            </tbody>
+          </table>
+          <footer className="table-footer">
+            <span className="muted">Showing 1–8 of 64 invoices</span>
+            <div className="pager">
+              <button type="button" className="page">
+                Previous
+              </button>
+              {PAGES.map((page) => (
+                <button key={page} type="button" className={page === '1' ? 'page current' : 'page'}>
+                  {page}
+                </button>
+              ))}
+              <button type="button" className="page">
+                Next
+              </button>
+            </div>
+          </footer>
+        </article>
+      </section>
+    </main>
+  )
+}
diff --git a/packages/it/test/fixtures/design/host/src/dashboard.css b/packages/it/test/fixtures/design/host/src/dashboard.css
new file mode 100644
index 000000000..909e27cff
--- /dev/null
+++ b/packages/it/test/fixtures/design/host/src/dashboard.css
@@ -0,0 +1,389 @@
+body:has(.dashboard) {
+  background: #f6f7f9;
+  font-family: system-ui, sans-serif;
+  line-height: normal;
+  color: #111827;
+}
+
+#root:has(> .dashboard) {
+  display: block;
+  padding: 0;
+}
+
+.dashboard {
+  display: flex;
+  min-height: 1136px;
+}
+
+:where(.dashboard) p,
+:where(.dashboard) h1,
+:where(.dashboard) h2 {
+  margin: 0;
+}
+
+.sidebar {
+  width: 232px;
+  flex: none;
+  background: #ffffff;
+  border-right: 1px solid #e5e7eb;
+  padding: 24px 16px;
+}
+
+.brand {
+  display: flex;
+  align-items: center;
+  gap: 10px;
+  padding-left: 8px;
+  height: 32px;
+}
+
+.logo {
+  display: grid;
+  place-items: center;
+  width: 32px;
+  height: 32px;
+  border-radius: 8px;
+  background: #4f46e5;
+  color: #ffffff;
+  font-weight: 700;
+  font-size: 14px;
+}
+
+.brand-name {
+  font-size: 18px;
+  font-weight: 700;
+}
+
+.nav {
+  display: flex;
+  flex-direction: column;
+  gap: 4px;
+  margin-top: 24px;
+}
+
+.nav-item {
+  display: flex;
+  align-items: center;
+  gap: 12px;
+  height: 40px;
+  padding: 0 14px;
+  border-radius: 8px;
+  color: #1f2937;
+  font-size: 14px;
+  text-decoration: none;
+}
+
+.nav-item.active {
+  background: #eef0ff;
+  color: #4f46e5;
+  font-weight: 600;
+}
+
+.nav-icon {
+  width: 12px;
+  font-size: 11px;
+  color: #6b7280;
+}
+
+.nav-item.active .nav-icon {
+  color: #4f46e5;
+}
+
+.content {
+  flex: 1;
+  padding: 24px 32px 40px;
+}
+
+.page-header {
+  display: flex;
+  justify-content: space-between;
+  align-items: center;
+  height: 38px;
+}
+
+.page-header h1 {
+  font-size: 24px;
+  font-weight: 700;
+}
+
+.header-tools {
+  display: flex;
+  align-items: center;
+  gap: 16px;
+}
+
+.search {
+  width: 280px;
+  height: 38px;
+  padding: 0 14px;
+  border: 1px solid #d1d5db;
+  border-radius: 8px;
+  font: inherit;
+  font-size: 14px;
+  background: #ffffff;
+}
+
+.avatar {
+  display: grid;
+  place-items: center;
+  width: 38px;
+  height: 38px;
+  border-radius: 50%;
+  background: #0f766e;
+  color: #ffffff;
+  font-size: 12px;
+  font-weight: 700;
+}
+
+.card {
+  background: #ffffff;
+  border: 1px solid #e5e7eb;
+  border-radius: 12px;
+}
+
+.stats {
+  display: grid;
+  grid-template-columns: repeat(4, 1fr);
+  gap: 16px;
+  margin-top: 24px;
+}
+
+.stat {
+  height: 124px;
+  padding: 20px;
+}
+
+.stat-label {
+  font-size: 13px;
+  color: #4b5563;
+}
+
+.stat-value {
+  margin-top: 10px;
+  font-size: 26px;
+  font-weight: 700;
+}
+
+.stat-change {
+  margin-top: 8px;
+  font-size: 12.5px;
+  font-weight: 600;
+}
+
+.stat-change.up {
+  color: #15803d;
+}
+
+.stat-change.down {
+  color: #b91c1c;
+}
+
+.chart {
+  margin-top: 24px;
+  height: 282px;
+  padding: 20px;
+}
+
+.card-title-row {
+  display: flex;
+  justify-content: space-between;
+  align-items: center;
+}
+
+.card-title-row h2 {
+  font-size: 15px;
+  font-weight: 600;
+}
+
+.muted {
+  color: #6b7280;
+}
+
+.small {
+  font-size: 12px;
+}
+
+.plot {
+  display: flex;
+  margin-top: 18px;
+  height: 202px;
+}
+
+.axis-labels {
+  display: flex;
+  flex-direction: column;
+  justify-content: space-between;
+  align-items: flex-end;
+  width: 28px;
+  height: 179px;
+  padding-top: 6px;
+  font-size: 11px;
+  color: #6b7280;
+}
+
+.bars {
+  display: flex;
+  flex: 1;
+  margin-left: 17px;
+  border-bottom: 1px solid #e5e7eb;
+}
+
+.bar-column {
+  flex: 1;
+  display: flex;
+  flex-direction: column;
+  justify-content: flex-end;
+  align-items: center;
+}
+
+.bar {
+  width: 40px;
+  background: #6366f1;
+  border-radius: 4px 4px 0 0;
+}
+
+.bar-label {
+  margin: 14px 0 0;
+  font-size: 12px;
+  color: #4b5563;
+}
+
+.invoices {
+  margin-top: 24px;
+  overflow: hidden;
+}
+
+.table-tools {
+  display: flex;
+  align-items: center;
+  gap: 12px;
+  height: 66px;
+  padding: 0 20px;
+  border-bottom: 1px solid #e5e7eb;
+}
+
+.dashboard .select,
+.dashboard .page {
+  height: 34px;
+  padding: 0 12px;
+  border: 1px solid #d1d5db;
+  border-radius: 6px;
+  background: #ffffff;
+  color: #111827;
+  font: inherit;
+  font-size: 14px;
+  line-height: normal;
+}
+
+.caret {
+  margin-left: 6px;
+  font-size: 9px;
+  color: #6b7280;
+}
+
+.range {
+  margin-left: auto;
+  font-size: 14px;
+  color: #374151;
+}
+
+.invoice-table {
+  width: 100%;
+  border-collapse: collapse;
+  table-layout: fixed;
+  font-size: 14px;
+}
+
+.invoice-table th {
+  height: 41px;
+  padding: 0;
+  background: #f9fafb;
+  color: #6b7280;
+  font-size: 12px;
+  font-weight: 600;
+  letter-spacing: 0.06em;
+  text-transform: uppercase;
+  text-align: left;
+}
+
+.invoice-table td {
+  height: 48px;
+  padding: 0;
+  border-top: 1px solid #eef0f3;
+}
+
+.invoice-table th:nth-child(1),
+.invoice-table td:nth-child(1) {
+  width: 150px;
+  padding-left: 20px;
+}
+
+.invoice-table th:nth-child(2) {
+  width: 245px;
+}
+
+.invoice-table th:nth-child(3) {
+  width: 160px;
+}
+
+.invoice-table th:nth-child(4) {
+  width: 120px;
+}
+
+.invoice-table th:nth-child(5) {
+  width: 188px;
+}
+
+.invoice-table .amount {
+  text-align: right;
+  padding-right: 40px;
+}
+
+.pill {
+  display: inline-block;
+  padding: 3px 8px;
+  border-radius: 999px;
+  font-size: 12px;
+  font-weight: 600;
+}
+
+.pill.paid {
+  background: #dcfce7;
+  color: #15803d;
+}
+
+.pill.pending {
+  background: #fef3c7;
+  color: #b45309;
+}
+
+.pill.overdue {
+  background: #fee2e2;
+  color: #b91c1c;
+}
+
+.table-footer {
+  display: flex;
+  justify-content: space-between;
+  align-items: center;
+  height: 64px;
+  padding: 0 20px;
+  border-top: 1px solid #e5e7eb;
+  font-size: 14px;
+}
+
+.pager {
+  display: flex;
+  gap: 6px;
+}
+
+.dashboard .page {
+  min-width: 34px;
+  padding: 0 10px;
+}
+
+.dashboard .page.current {
+  background: #4f46e5;
+  border-color: #4f46e5;
+  color: #ffffff;
+}
```
