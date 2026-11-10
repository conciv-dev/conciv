import cardStyles from './card.module.css'
import {Broken} from './Broken'
import {Cards} from './Cards'
import {Chip} from './Chip'
import {Stripe} from './Stripe'
import {Table} from './Table'
import {Toolbar} from './Toolbar'
import {Pill} from './ui-kit/Pill'
import {XrayProofPage} from './XrayProofPage'

const TARGET_ALIASES = new Set([
  'badge',
  'text-recolor',
  'textnoise',
  'badge-textnoise',
  'text-changed',
  'field-border',
  'span-recolor',
  'bordered',
  'column',
  'grid',
  'shifted',
  'webfont',
  'container',
  'process',
])
const LOOK_CLASSES: Record<string, string> = {webfont: 'webfont', container: 'webfont'}
const CONTAINER_CSS =
  '#root { container-type: inline-size; } @container (min-width: 600px) { .toolbar { padding-bottom: 12px; } }'
const FIELD_BORDER = {borderColor: '#d64545', borderRadius: 0}
const SLOW_FONT_CSS = "@import url('/slow-font.css');"
const SLOW_FONT_TEXT = 'The quarterly report lists every invoice that was paid late, with the customer and the days overdue.'
const WRAP_TEXT = 'The quarterly report lists every invoice that was paid late, with the customer and the days overdue.'
const TALL_LINE = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='1' height='360'/>"
const TYPE_SIZES = [12, 16, 24, 32]
const TYPE_STRINGS = ['Export the quarterly report', 'EXPORT', '1,240.00']

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  document.documentElement.className = (requested === null ? undefined : LOOK_CLASSES[requested]) ?? ''
  if (requested === 'empty') return null
  if (requested === 'broken') return <Broken data-conciv-key="f-BlcQ" />
  if (requested === 'drift') return <DriftPage data-conciv-key="k8rCfA" />
  if (requested === 'drift-hand') return <DriftHandPage data-conciv-key="hNdPgA" />
  if (requested === 'drift-kit') return <DriftKitPage data-conciv-key="kItPgA" />
  if (requested === 'dashboard') return <main className="dashboard" data-conciv-key="dBlROA" />
  if (requested === 'xray') return <XrayProofPage data-conciv-key="8prgZg" />
  if (requested === 'bentolio') return <main className="bentolio" data-conciv-key="bNtLiO" />
  if (requested === 'tech') return <main className="tech" data-conciv-key="tEcHlP" />
  if (requested === 'agency') return <main className="agency" data-conciv-key="aGnCyP" />
  if (requested === 'picture') {
    return (
      <main className="picture" data-conciv-key="pIcTmn">
        <img className="picture-image" src={new URLSearchParams(location.search).get('src') ?? ''} alt="" data-conciv-key="pIcTim" />
      </main>
    )
  }
  if (requested === 'stripe') return <Stripe data-conciv-key="lRWD-g" />
  if (requested === 'sections') return <TwoSections data-conciv-key="GAoSTQ" />
  if (requested === 'contents') return <ContentsGrid data-conciv-key="x9JTfp" />
  if (requested === 'pixels') {
    return (
      <main className="pixels" data-conciv-key="pXmAin">
        <div className="pixels-panel" data-conciv-key="pXpAnl" />
      </main>
    )
  }
  if (requested === 'contact') {
    return (
      <main className="contact" data-conciv-key="JUIGlw">
        <h2 data-conciv-key="5ptTdw">Get In Touch</h2>
        <form className="contact-form" data-conciv-key="benlZw">
          <input className="contact-field" type="email" placeholder="Your Email" data-conciv-key="OQ2U7A" />
          <textarea className="contact-field contact-message" placeholder="Message" data-conciv-key="rLmLTw" />
          <button type="submit" data-conciv-key="Yqw8VA">Send</button>
        </form>
      </main>
    )
  }
  if (requested === 'barebutton') {
    return (
      <main className="barebutton" data-conciv-key="bArEmn">
        <button type="button" className="barebutton-button" data-conciv-key="bArEbt">
          Contact Us
        </button>
      </main>
    )
  }
  if (requested === 'sidemargin') {
    return (
      <main className="sidemargin" data-conciv-key="sDmGmn">
        <div className="sidemargin-panel" data-conciv-key="sDmGpn" />
      </main>
    )
  }
  if (requested === 'wrap') {
    return (
      <main className="wrap" data-conciv-key="wRaPmn">
        <p className="wrap-text" style={{width: Number(new URLSearchParams(location.search).get('width'))}} data-conciv-key="wRaPtx">
          {WRAP_TEXT}
        </p>
      </main>
    )
  }
  if (requested === 'tall') {
    return (
      <main className="tall" data-conciv-key="tAlLmn">
        <p className="tall-title" data-conciv-key="tAlLtx">Tall page</p>
        <div className="tall-wrap" data-conciv-key="tAlLwr">
          <img className="tall-line" src={TALL_LINE} alt="" style={{width: new URLSearchParams(location.search).get('width') ?? '100%'}} data-conciv-key="tAlLim" />
        </div>
        <style data-conciv-key="WuNMlQ">{`body { min-height: ${new URLSearchParams(location.search).get('bodyMin') ?? 'auto'}; }`}</style>
      </main>
    )
  }
  if (requested === 'stackrow') {
    return (
      <main className="stackrow" data-conciv-key="sTkRmn">
        <div className="stackrow-row" style={{width: Number(new URLSearchParams(location.search).get('width'))}} data-conciv-key="sTkRrw">
          <div className="stackrow-card" data-conciv-key="sTkRc1" />
          <div className="stackrow-card" data-conciv-key="sTkRc2" />
        </div>
      </main>
    )
  }
  if (requested === 'slowfont') {
    return (
      <main className="slowfont" data-conciv-key="sLwFmn">
        <style data-conciv-key="sLwFst">{SLOW_FONT_CSS}</style>
        <p className="slowfont-text" data-conciv-key="sLwFtx">{SLOW_FONT_TEXT}</p>
      </main>
    )
  }
  if (requested === 'type') {
    return (
      <main className="type" data-conciv-key="dpOrFw">
        {TYPE_SIZES.flatMap((size) =>
          TYPE_STRINGS.map((text) => (
            <p key={`${size}-${text}`} style={{fontSize: size}} data-conciv-key="lAX5EA">
              {text}
            </p>
          )),
        )}
      </main>
    )
  }
  const variant = requested !== null && TARGET_ALIASES.has(requested) ? 'target' : requested
  const labelColor = requested === 'text-recolor' ? '#ffd166' : undefined
  const label = requested === 'text-changed' ? 'Download' : 'Export'
  const badge = requested === 'badge' || requested === 'badge-textnoise'
  const textNoise = requested === 'textnoise' || requested === 'badge-textnoise'
  const spanColor = requested === 'span-recolor' ? '#ffd166' : undefined
  return (
    <>
      <Toolbar
        variant={variant}
        badge={badge}
        labelColor={labelColor}
        textNoise={textNoise}
        label={label}
        spanColor={spanColor}
        shifted={requested === 'shifted'} data-conciv-key="t_IsLQ"
      />
      <input
        id="field"
        className="field"
        placeholder="Search invoices"
        style={requested === 'field-border' ? FIELD_BORDER : undefined} data-conciv-key="z0_ekQ"
      />
      {requested === 'painted' ? <PaintedCards data-conciv-key="WViT6A" /> : <Cards variant={variant} column={requested === 'column'} data-conciv-key="EztCBw" />}
      {variant === 'missing' ? null : <Table variant={variant} look={requested} data-conciv-key="rFh37A" />}
      {requested === 'process' ? <section id="process" data-conciv-key="SE7-sA" /> : null}
      {requested === 'container' ? <style data-conciv-key="2WxtqQ">{CONTAINER_CSS}</style> : null}
      {requested === 'effects-cover' ? (
        <div
          data-conciv-effects=""
          style={{position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgb(255,0,0)'}} data-conciv-key="9wrSag"
        />
      ) : null}
    </>
  )
}

function PaintedCards() {
  return (
    <section style={{height: 86}} data-conciv-key="uVoyaQ">
      <article className={cardStyles.card} style={{position: 'absolute', left: 24, top: 148, width: 612, height: 86}} data-conciv-key="JcyPHg">
        <h2 data-conciv-key="Pdi2Og">Revenue</h2>
        <p data-conciv-key="cepiQw">7000</p>
      </article>
      <article className={cardStyles.card} style={{position: 'absolute', left: 24, top: 380, width: 612, height: 86}} data-conciv-key="isyglg">
        <h2 data-conciv-key="cHldqA">Invoices</h2>
        <p data-conciv-key="H1xaoA">8000</p>
      </article>
      <article className={cardStyles.card} style={{position: 'absolute', left: 644, top: 148, width: 612, height: 86}} data-conciv-key="7UAi0w">
        <h2 data-conciv-key="XqH4cQ">Customers</h2>
        <p data-conciv-key="u0iLAw">9000</p>
      </article>
    </section>
  )
}

function DriftPage() {
  return (
    <main className="drift" data-conciv-key="JphxEg">
      <Chip data-conciv-key="yPfAfw" />
      <span className="loose" data-conciv-key="Sh110A" />
    </main>
  )
}

function DriftHandPage() {
  return (
    <main className="drift" data-conciv-key="hNdMnA">
      <span className="chip" data-conciv-key="hNdChp" />
      <span className="loose" data-conciv-key="hNdLse" />
    </main>
  )
}

function DriftKitPage() {
  return (
    <main className="drift" data-conciv-key="kItMnA">
      <Pill data-conciv-key="kItPlA" />
      <span className="loose" data-conciv-key="kItLsA" />
    </main>
  )
}

function TwoSections() {
  return (
    <main className="sections" data-conciv-key="XT3HoQ">
      <article className="section-first" data-conciv-key="9oCDgg">
        <h2 data-conciv-key="k7tpRQ">Quarterly revenue</h2>
        <p data-conciv-key="6fLghA">Revenue rose in every region</p>
      </article>
      <article className="section-second" data-conciv-key="PC0JuA">
        <h2 data-conciv-key="FRUyvQ">Open invoices</h2>
        <p className="section-line" data-conciv-key="OYt3aQ">Twelve invoices are due this week</p>
      </article>
    </main>
  )
}

function ContentsGrid() {
  return (
    <div className="contents-grid" data-conciv-key="uk5mgr">
      <header className="contents-wrapper" data-conciv-key="F1YZ-4">
        <nav className="contents-placed" data-conciv-key="GIed4_" />
      </header>
      <div className="contents-left" data-conciv-key="gy1ciu" />
      <div className="contents-right" data-conciv-key="Qm7rTe" />
    </div>
  )
}
