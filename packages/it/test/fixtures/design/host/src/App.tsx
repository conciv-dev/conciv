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
  if (requested === 'dashboard') return <main className="dashboard" />
  if (requested === 'stripe') return <Stripe />
  if (requested === 'sections') return <TwoSections />
  if (requested === 'contact') {
    return (
      <main className="contact">
        <h2>Get In Touch</h2>
        <form className="contact-form">
          <input className="contact-field" type="email" placeholder="Your Email" />
          <textarea className="contact-field contact-message" placeholder="Message" />
          <button type="submit">Send</button>
        </form>
      </main>
    )
  }
  if (requested === 'type') {
    return (
      <main className="type">
        {TYPE_SIZES.flatMap((size) =>
          TYPE_STRINGS.map((text) => (
            <p key={`${size}-${text}`} style={{fontSize: size}}>
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
        shifted={requested === 'shifted'}
      />
      <input
        id="field"
        className="field"
        placeholder="Search invoices"
        style={requested === 'field-border' ? FIELD_BORDER : undefined}
      />
      {requested === 'painted' ? <PaintedCards /> : <Cards variant={variant} column={requested === 'column'} />}
      {variant === 'missing' ? null : <Table variant={variant} look={requested} />}
      {requested === 'container' ? <style>{CONTAINER_CSS}</style> : null}
    </>
  )
}

function PaintedCards() {
  return (
    <section style={{height: 86}}>
      <article className={cardStyles.card} style={{position: 'absolute', left: 24, top: 148, width: 612, height: 86}}>
        <h2>Revenue</h2>
        <p>7000</p>
      </article>
      <article className={cardStyles.card} style={{position: 'absolute', left: 24, top: 380, width: 612, height: 86}}>
        <h2>Invoices</h2>
        <p>8000</p>
      </article>
      <article className={cardStyles.card} style={{position: 'absolute', left: 644, top: 148, width: 612, height: 86}}>
        <h2>Customers</h2>
        <p>9000</p>
      </article>
    </section>
  )
}

function TwoSections() {
  return (
    <main className="sections">
      <article className="section-first">
        <h2>Quarterly revenue</h2>
        <p>Revenue rose in every region</p>
      </article>
      <article className="section-second">
        <h2>Open invoices</h2>
        <p className="section-line">Twelve invoices are due this week</p>
      </article>
    </main>
  )
}
