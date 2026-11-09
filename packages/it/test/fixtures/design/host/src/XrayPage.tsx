import './xray-page.css'

const SIDEBAR_BARS = ['xp-bar-a', 'xp-bar-b', 'xp-bar-c', 'xp-bar-d', 'xp-bar-e', 'xp-bar-f']
const TABLE_BARS = ['xp-row-short', 'xp-row-full', 'xp-row-short', 'xp-row-full', 'xp-row-short', 'xp-row-full']
const STATS = [
  {value: '1,284 t', label: 'Picked this week'},
  {value: '$212k', label: 'Open invoices'},
  {value: '7', label: 'Trucks on the road'},
]

export function XrayPage() {
  return (
    <div className="xp-page" data-conciv-key="AHjjUw">
      <header className="xp-topbar" data-conciv-key="LuzDnw">
        <div className="xp-logo" data-conciv-key="EuWoCw" />
        <span className="xp-nav" data-conciv-key="SXLmvw">Overview</span>
        <span className="xp-nav" data-conciv-key="t1xYNg">Orders</span>
        <span className="xp-nav" data-conciv-key="Ylup4Q">Fields</span>
        <span className="xp-nav" data-conciv-key="ltDXlg">Settings</span>
      </header>
      <div className="xp-layout" data-conciv-key="8LPOwQ">
        <aside className="xp-sidebar" data-conciv-key="cvzrSA">
          {SIDEBAR_BARS.map((bar) => (
            <div key={bar} className={`xp-bar ${bar}`} data-conciv-key="CZ8qzA" />
          ))}
        </aside>
        <main className="xp-main" data-conciv-key="n7jFZw">
          <h1 className="xp-greeting" data-conciv-key="dfU4xA">Good morning, Dana</h1>
          <p className="xp-lede" data-conciv-key="5yxPig">
            Harvest week 46. Three fields are ready, two trucks are scheduled, and the Valencia lot still needs a buyer.
          </p>
          <section className="xp-figures" data-conciv-key="A4VsVg">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="xp-card"
                data-conciv-key="yW45EQ"
                data-conciv-instance={`A4VsVg/yW45EQ/${stat.label}`}
              >
                <span className="xp-card-value" data-conciv-key="OszFng">{stat.value}</span>
                <span className="xp-card-label" data-conciv-key="TOcseA">{stat.label}</span>
              </div>
            ))}
          </section>
          <img className="xp-portrait" src="/design/5-78.svg" alt="" data-conciv-key="arzcgA" />
          <section className="xp-table" data-conciv-key="6sFMzA">
            {TABLE_BARS.map((bar, index) => (
              <div key={index} className={`xp-row ${bar}`} data-conciv-key="lJbIow" />
            ))}
          </section>
        </main>
      </div>
    </div>
  )
}
