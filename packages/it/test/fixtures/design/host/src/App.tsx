import cardStyles from './card.module.css'
import {Cards} from './Cards'
import {Stripe} from './Stripe'
import {Table} from './Table'
import {Toolbar} from './Toolbar'

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
])
const LOOK_CLASSES: Record<string, string> = {webfont: 'webfont', container: 'webfont'}
const CONTAINER_CSS =
  '#root { container-type: inline-size; } @container (min-width: 600px) { .toolbar { padding-bottom: 12px; } }'
const FIELD_BORDER = {borderColor: '#d64545', borderRadius: 0}
const TYPE_SIZES = [12, 16, 24, 32]
const TYPE_STRINGS = ['Export the quarterly report', 'EXPORT', '1,240.00']

export function App() {
  const requested = new URLSearchParams(location.search).get('variant')
  document.documentElement.className = (requested === null ? undefined : LOOK_CLASSES[requested]) ?? ''
  if (requested === 'empty') return null
  if (requested === 'dashboard') return <main className="dashboard" data-conciv-key="dBlROA" />
  if (requested === 'stripe') return <Stripe data-conciv-key="lRWD-g" />
  if (requested === 'sections') return <TwoSections data-conciv-key="GAoSTQ" />
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
      {requested === 'container' ? <style data-conciv-key="2WxtqQ">{CONTAINER_CSS}</style> : null}
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
