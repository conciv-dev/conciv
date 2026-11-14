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
  'filters',
  'media-height',
  'late-font',
])
const LOOK_CLASSES: Record<string, string> = {webfont: 'webfont', container: 'webfont'}
const CONTAINER_CSS =
  '#root { container-type: inline-size; } @container (min-width: 600px) { .toolbar { padding-bottom: 12px; } }'
const INPUT_FIELD = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  width: 348,
  boxSizing: 'border-box',
  padding: '20px 30px',
  borderRadius: 6,
  border: '1px solid #262626',
  background: '#242424',
} as const
const INPUT_LINE = {display: 'flex', flexDirection: 'column', gap: 6, height: 30, boxSizing: 'border-box'} as const
const INPUT_LINES = {
  'input-field': INPUT_LINE,
  'input-field-line': {...INPUT_LINE, borderBottom: '1px solid #333333'},
  'input-field-box': {...INPUT_LINE, border: '1px solid #333333'},
  'input-field-outline': {...INPUT_LINE, borderBottom: '1px solid #333333'},
  'input-field-bare': {...INPUT_LINE, borderBottom: '1px solid #333333'},
  'input-field-shadow': {...INPUT_LINE, borderBottom: '1px solid #333333'},
  'input-field-rule': {...INPUT_LINE, height: 'auto'},
  'input-field-input': {...INPUT_LINE, borderBottom: '1px solid #333333'},
}
const INPUT_FIELDS = {
  'input-field': INPUT_FIELD,
  'input-field-line': INPUT_FIELD,
  'input-field-box': INPUT_FIELD,
  'input-field-outline': {...INPUT_FIELD, border: 'none', outline: '1px solid #262626', outlineOffset: -1},
  'input-field-bare': {...INPUT_FIELD, border: 'none'},
  'input-field-shadow': {...INPUT_FIELD, border: 'none', boxShadow: 'inset 0 0 0 1px #262626'},
  'input-field-rule': INPUT_FIELD,
  'input-field-input': INPUT_FIELD,
}
const PLACEHOLDER_INPUT = {
  height: 24,
  padding: 0,
  border: 'none',
  background: 'transparent',
  fontSize: 16,
  lineHeight: '24px',
  color: '#ffffff',
} as const
const PLACEHOLDER_CSS = '.typed-field::placeholder { color: #656567; }'
const DISCOVERY_TEXT =
  'We begin by thoroughly understanding your business goals, target audience, and project requirements. We conduct in-depth research to gather insights and define project objectives, allowing us to develop a tailored strategy.'
const PLANNING_TEXT =
  'Based on the gathered information, we create a comprehensive project plan and strategy. This includes defining project milestones, timelines, deliverables, and resource allocation. We collaborate closely with you to align our strategy with your vision.'
const SLIDER_LAYER = {gridColumn: 1, gridRow: 1} as const
const FORM_STROKE = '0 -1px 0 0 #262626, 1px 0 0 0 #262626, -1px 0 0 0 #262626'
const COLUMN_CARDS = [292, 292, 334, 334, 340, 340, 334, 340]
const COLUMN_LINES = ['100-1615', '100-1622', '100-1635', '100-1642', '100-1655', '100-1668', '100-2303']
const MEDIA_HEIGHT_CSS = '#root section { @media (width >= 40rem) { height: 120px; } }'
const FIELD_BORDER = {borderColor: '#d64545', borderRadius: 0}
const SLOW_FONT_CSS = "@import url('/slow-font.css');"
const HERO_GAP_CSS = [
  '.hero-gap { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 50px 16px; text-align: center; color: #ffffff; }',
  '.hero-gap-heading { margin: 0; width: 100%; font-size: 28px; font-weight: 600; }',
  '.hero-gap-text { margin: 0; width: 100%; font-size: 14px; line-height: 24px; color: #e6e6e6; }',
  '@media (width >= 600px) { .hero-gap { gap: 10px; padding: 100px 250px; } .hero-gap-heading, .hero-gap-text { width: 780px; } }',
].join(' ')
const HERO_FIT_CSS = HERO_GAP_CSS.replace('width: 780px', 'width: 100%; max-width: 780px')
const CONTACT_ITEMS = ['hello@squareup.com', '+91 91813 23 2309', 'Somewhere in the World']
const CONTACT_ICONS = ['/design/100-1516.png', '/design/100-1520.png', '/design/100-1524.png']
function contactBarCss(input: {breakpoint: number; footer: string}): string {
  const {breakpoint, footer} = input
  return [
    '.contact-bar { display: flex; flex-direction: column; gap: 20px; color: #e6e6e6; font-size: 18px; }',
    '.contact-bar-items { display: flex; flex-direction: column; }',
    '.contact-bar-item { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 20px 0; box-shadow: inset 0 0 0 1px #262626; }',
    '.contact-bar-icon { width: 24px; height: 24px; background: #9eff00; }',
    '.contact-bar-copy { color: #98989a; font-size: 16px; text-align: center; }',
    `@media (width >= ${breakpoint}px) { .contact-bar { flex-direction: ${footer}; justify-content: space-between; align-items: center; } .contact-bar-items { flex-direction: row; gap: 22px; } .contact-bar-item { padding: 6px 0; gap: 6px; font-size: 16px; } .contact-bar-copy { font-size: 14px; } }`,
  ].join(' ')
}
const FORM_FIELD = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  borderRadius: 8,
  background: 'rgba(36, 36, 36, 0.5)',
  padding: '20px 30px',
  outline: '1px solid #262626',
  outlineOffset: -1,
} as const
const FORM_PANEL = {
  display: 'flex',
  flexDirection: 'column',
  gap: 30,
  margin: 0,
  border: 0,
  minWidth: 0,
  padding: 30,
  borderRadius: 8,
  background: 'rgba(36, 36, 36, 0.5)',
  outline: '1px solid #262626',
  outlineOffset: -1,
} as const
const FORM_LABEL = {margin: 0, padding: 0, fontSize: 18, lineHeight: 1.5, fontWeight: 500, color: '#ffffff'} as const
const FORM_INPUT = {
  width: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  fontSize: 16,
  lineHeight: 1.5,
  color: '#ffffff',
  outline: 'none',
} as const
const FORM_REASONS = [
  ['Web Design', 'Collaboration'],
  ['Mobile App Design', 'Others'],
]
const LATE_FONT_CSS = `${SLOW_FONT_CSS} @media (width < 900px) { #root { font-family: 'Slow Sans', monospace; } }`
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
  if (
    requested === 'input-field' ||
    requested === 'input-field-line' ||
    requested === 'input-field-box' ||
    requested === 'input-field-outline' ||
    requested === 'input-field-bare' ||
    requested === 'input-field-shadow' ||
    requested === 'input-field-rule' ||
    requested === 'input-field-input'
  ) {
    return (
      <main data-conciv-key="iNfMnA">
        <label style={INPUT_FIELDS[requested]} data-conciv-key="iNfLbA">
          <span style={{fontSize: 18, lineHeight: '27px', color: '#ffffff'}} data-conciv-key="iNfTtA">
            Full Name
          </span>
          <span
            style={INPUT_LINES[requested]}
            data-conciv-key="iNfSbA"
          >
            {requested === 'input-field-input' ? (
              <>
                <style data-conciv-key="iNfPsA">{PLACEHOLDER_CSS}</style>
                <input className="typed-field" placeholder="Type here" style={PLACEHOLDER_INPUT} data-conciv-key="iNfInA" />
              </>
            ) : (
              <span style={{fontSize: 16, lineHeight: '24px', color: '#656567'}} data-conciv-key="iNfPhA">
                Type here
              </span>
            )}
            {requested === 'input-field-rule' ? (
              <span style={{height: 1, background: '#333333'}} data-conciv-key="iNfRlA" />
            ) : null}
          </span>
        </label>
      </main>
    )
  }
  if (requested === 'contact-form' || requested === 'contact-form-flat' || requested === 'contact-section')
    return <ContactForm flat={requested !== 'contact-form'} section={requested === 'contact-section'} data-conciv-key="cFpGeA" />
  if (requested === 'form-stroke')
    return <main style={{margin: -24, width: 358, height: 1070, background: '#1a1a1a', boxShadow: FORM_STROKE}} data-conciv-key="fSmNaA" />
  if (requested === 'form-stroke-wrapped')
    return (
      <main style={{margin: -24, width: 358, boxShadow: 'inset 0 1px 0 0 #262626'}} data-conciv-key="fSwRaA">
        <form style={{height: 1070, background: '#1a1a1a', boxShadow: FORM_STROKE}} data-conciv-key="fSwFmA" />
      </main>
    )
  if (requested === 'process-row' || requested === 'process-row-boxed') {
    const boxed = requested === 'process-row-boxed'
    return (
      <main style={{margin: -24, display: 'flex', alignItems: 'flex-start', background: '#1a1a1a'}} data-conciv-key="pRmNaA">
        <ProcessCard number="01" heading="Discovery" text={DISCOVERY_TEXT} boxed={boxed} divided={false} />
        {boxed ? <span style={{width: 1, alignSelf: 'stretch', background: '#262626'}} data-conciv-key="pRlNeA" /> : null}
        <ProcessCard number="02" heading="Planning and Strategy" text={PLANNING_TEXT} boxed={boxed} divided={!boxed} />
      </main>
    )
  }
  if (
    requested === 'process-column' ||
    requested === 'process-column-flat' ||
    requested === 'process-column-screen' ||
    requested === 'process-column-thin'
  ) {
    const flat = requested !== 'process-column'
    return (
      <main style={{margin: -24, width: 358, display: 'flex', flexDirection: 'column', background: '#1a1a1a'}} data-conciv-key="pCmNaA">
        {COLUMN_CARDS.map((height, index) => (
          <>
            {index === 0 ? null : requested === 'process-column-thin' ? (
              <img
                src={`/design/${COLUMN_LINES[index - 1]}.png`}
                alt=""
                style={{display: 'block', width: '100%', aspectRatio: index % 2 === 0 ? '1596 / 1' : '358 / 1'}}
                data-conciv-key="pCtHnA"
              />
            ) : (
              <span
                style={flat ? {height: 0, outline: '0.5px solid #262626'} : {height: 1, background: '#262626'}}
                data-conciv-key="pClNeA"
              />
            )}
            <div
              style={{height, minHeight: requested === 'process-column-screen' && index === 0 ? '12vh' : 0, boxSizing: 'border-box', padding: '40px 24px'}}
              data-conciv-key="pCcRdA"
            >
              <span style={{fontSize: 56, lineHeight: '56px', fontWeight: 600, color: '#d8ff99'}} data-conciv-key="pCnMbA">
                {`0${index + 1}`}
              </span>
            </div>
          </>
        ))}
      </main>
    )
  }
  if (requested === 'check-row' || requested === 'check-row-wrong') {
    return (
      <main style={{margin: -24, background: '#1a1a1a'}} data-conciv-key="cKmNaA">
        <label style={{display: 'flex', alignItems: 'center', gap: 10, width: 400}} data-conciv-key="cKlBlA">
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              boxSizing: 'border-box',
              borderRadius: 4,
              background: '#262626',
              boxShadow: 'inset 0 0 0 1px #333333',
            }}
            data-conciv-key="cKbXxA"
          >
            <img
              src={requested === 'check-row' ? '/design/check-icon.svg' : '/design/4-30.svg'}
              alt=""
              style={{width: 20, height: 20}}
              data-conciv-key="cKiCnA"
            />
          </span>
          <span style={{flex: 1, fontSize: 18, lineHeight: '27px', color: '#fdfffa'}} data-conciv-key="cKtXtA">
            Web Design
          </span>
        </label>
      </main>
    )
  }
  if (requested === 'hero-gap' || requested === 'hero-gap-fit') {
    return (
      <main style={{margin: -24, background: '#1a1a1a'}} data-conciv-key="hGmNaA">
        <style data-conciv-key="hGsTyA">{requested === 'hero-gap' ? HERO_GAP_CSS : HERO_FIT_CSS}</style>
        <section className="hero-gap" data-conciv-key="hGsCnA">
          <h1 className="hero-gap-heading" data-conciv-key="hGhDgA">
            Process of Starting the Project
          </h1>
          <p className="hero-gap-text" data-conciv-key="hGpRgA">
            At SquareUp, we value transparency, collaboration, and delivering exceptional results.
          </p>
        </section>
      </main>
    )
  }
  if (requested === 'logo-tile' || requested === 'logo-tile-flat') {
    return (
      <main style={{margin: -24, padding: 0, background: '#1a1a1a'}} data-conciv-key="lTmNaA">
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 50.23,
            height: 50,
            borderRadius: 7,
            background: '#9eff00',
            boxShadow: requested === 'logo-tile' ? 'inset 0 0 14px 6px rgba(255, 255, 255, 0.5)' : 'none',
          }}
          data-conciv-key="lTtLeA"
        >
          <img src="/design/100-1684.png" alt="" style={{width: 26.67, height: 30}} data-conciv-key="lTiMgA" />
        </div>
      </main>
    )
  }
  if (
    requested === 'contact-bar' ||
    requested === 'contact-bar-fit' ||
    requested === 'contact-bar-stacked' ||
    requested === 'contact-bar-picture'
  ) {
    return (
      <main style={{margin: -24, background: '#1a1a1a'}} data-conciv-key="cBmNaA">
        <style data-conciv-key="cBsTyA">{contactBarCss({breakpoint: requested === 'contact-bar-fit' ? 700 : 1200, footer: requested === 'contact-bar-stacked' ? 'column' : 'row'})}</style>
        <footer className="contact-bar" data-conciv-key="cBfTrA">
          <div className="contact-bar-items" data-conciv-key="cBiTmA">
            {CONTACT_ITEMS.map((item, index) => (
              <span className="contact-bar-item" key={item} data-conciv-key="cBbTnA">
                {requested === 'contact-bar-picture' ? (
                  <picture data-conciv-key="cBpIcA">
                    <source srcSet="/late/design/4-30.svg" />
                    <img src={CONTACT_ICONS[index]} alt="" width={24} height={24} data-conciv-key="cBiMgA" />
                  </picture>
                ) : (
                  <span className="contact-bar-icon" data-conciv-key="cBiCnA" />
                )}
                {item}
              </span>
            ))}
          </div>
          <span className="contact-bar-copy" data-conciv-key="cBcPyA">
            © 2023 SquareUp. All rights reserved.
          </span>
        </footer>
      </main>
    )
  }
  if (requested === 'range-slider') {
    return (
      <main style={{margin: -24, paddingTop: 5.67, background: '#141414'}} data-conciv-key="rSmNaA">
        <div style={{display: 'grid', padding: '26px 3px'}} data-conciv-key="rSfRmA">
          <span style={{...SLIDER_LAYER, height: 2, alignSelf: 'center', background: '#333333'}} data-conciv-key="rStRkA" />
          <span
            style={{...SLIDER_LAYER, display: 'flex', alignItems: 'center', alignSelf: 'center', width: 326, margin: '-9px 0 -9px 57px'}}
            data-conciv-key="rSrWaA"
          >
            <SliderKnob label="$1000" />
            <span style={{height: 3, flex: 1, background: '#9eff00'}} data-conciv-key="rSbArA" />
            <SliderKnob label="$5000" />
          </span>
        </div>
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
      {requested === 'filters' ? (
        <details data-conciv-key="fLtRdT">
          <summary data-conciv-key="fLtRsM">Filters</summary>
          <div style={{height: 240}} data-conciv-key="fLtRbD" />
        </details>
      ) : null}
      {requested === 'painted' ? <PaintedCards data-conciv-key="WViT6A" /> : <Cards variant={variant} column={requested === 'column'} data-conciv-key="EztCBw" />}
      {variant === 'missing' ? null : <Table variant={variant} look={requested} data-conciv-key="rFh37A" />}
      {requested === 'process' ? <section id="process" data-conciv-key="SE7-sA" /> : null}
      {requested === 'container' ? <style data-conciv-key="2WxtqQ">{CONTAINER_CSS}</style> : null}
      {requested === 'media-height' ? <style data-conciv-key="mDhTst">{MEDIA_HEIGHT_CSS}</style> : null}
      {requested === 'late-font' ? <style data-conciv-key="lAtFst">{LATE_FONT_CSS}</style> : null}
      {requested === 'effects-cover' ? (
        <div
          data-conciv-effects=""
          style={{position: 'fixed', inset: 0, zIndex: 2147483647, background: 'rgb(255,0,0)'}} data-conciv-key="9wrSag"
        />
      ) : null}
    </>
  )
}

function ProcessCard(props: {number: string; heading: string; text: string; boxed: boolean; divided: boolean}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 50,
        padding: '100px 50px',
        boxSizing: 'border-box',
        borderLeft: props.divided ? '1px solid #262626' : 'none',
      }}
      data-conciv-key="pRcRdA"
    >
      <div style={{display: 'flex', alignItems: 'flex-end', gap: 14}} data-conciv-key="pRcNtA">
        <span style={{fontSize: 150, lineHeight: '105px', fontWeight: 600, color: '#d8ff99'}} data-conciv-key="pRnMbA">
          {props.number}
        </span>
        <span
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            padding: '0 0 26px 10px',
            ...(props.boxed ? {border: '1px solid #262626'} : {borderBottom: '1px solid #262626'}),
          }}
          data-conciv-key="pRtXcA"
        >
          <span style={{fontSize: 30, lineHeight: '36px', fontWeight: 500, color: '#98989a'}} data-conciv-key="pRhDgA">
            {props.heading}
          </span>
        </span>
      </div>
      <p style={{margin: 0, fontSize: 18, lineHeight: '27px', color: '#98989a'}} data-conciv-key="pRpGhA">
        {props.text}
      </p>
    </div>
  )
}

function FormLine(props: {flat: boolean}) {
  return (
    <span
      style={{display: 'block', width: '100%', height: 1, marginBottom: props.flat ? -1 : 0, background: '#262626'}}
      data-conciv-key="cFlNeA"
    />
  )
}

function FormField(props: {label: string; flat: boolean}) {
  return (
    <label style={{...FORM_FIELD, gap: 16, flex: '1 1 0'}} data-conciv-key="cFfLdA">
      <span style={FORM_LABEL} data-conciv-key="cFlBlA">
        {props.label}
      </span>
      <span style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6}} data-conciv-key="cFsBcA">
        <input placeholder="Type here" style={FORM_INPUT} data-conciv-key="cFiNpA" />
        <FormLine flat={props.flat} />
      </span>
    </label>
  )
}

function FormThumb(props: {value: string}) {
  return (
    <span style={{position: 'relative', display: 'flex', borderRadius: 30, background: '#4c4c4d', padding: 4}} data-conciv-key="cFtHbA">
      <span style={{width: 12, height: 12, borderRadius: 6, background: '#9eff00'}} data-conciv-key="cFtDtA" />
      <span
        style={{position: 'absolute', top: 27, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: 14, fontWeight: 500, color: '#ffffff'}}
        data-conciv-key="cFtLbA"
      >
        {props.value}
      </span>
    </span>
  )
}

function ContactForm(props: {flat: boolean; section: boolean}) {
  const form = (
      <form
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 30,
          padding: 60,
          outline: '1px solid #262626',
          outlineOffset: -1,
          ...(props.section ? {boxSizing: 'border-box', width: '100%', maxWidth: 846} : {}),
        }}
        data-conciv-key="cFfRmA"
      >
        <div style={{display: 'flex', gap: 30}} data-conciv-key="cFrWaA">
          <FormField label="Full Name" flat={props.flat} />
          <FormField label="Email" flat={props.flat} />
        </div>
        <fieldset style={FORM_PANEL} data-conciv-key="cFfStA">
          <legend style={{...FORM_LABEL, float: 'left', width: '100%'}} data-conciv-key="cFlGdA">
            Why are you contacting us?
          </legend>
          <div style={{display: 'flex', flexDirection: 'column', gap: 24}} data-conciv-key="cFcKsA">
            {FORM_REASONS.map((row) => (
              <div key={row[0]} style={{display: 'flex', gap: 20}} data-conciv-key="cFcRwA">
                {row.map((reason) => (
                  <label key={reason} style={{display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 0'}} data-conciv-key="cFcBxA">
                    <span
                      style={{width: 28, height: 28, boxSizing: 'border-box', borderRadius: 4, background: '#262626', outline: '1px solid #333333', outlineOffset: -1}}
                      data-conciv-key="cFcSqA"
                    />
                    <span style={{flex: 1, fontSize: 16, lineHeight: 1.5, color: '#fdfffa'}} data-conciv-key="cFcTxA">
                      {reason}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <div style={{...FORM_PANEL}} data-conciv-key="cFbDgA">
          <div style={{display: 'flex', flexDirection: 'column', gap: 14}} data-conciv-key="cFbTxA">
            <p style={FORM_LABEL} data-conciv-key="cFbHdA">
              Your Budget
            </p>
            <p style={{margin: 0, fontSize: 16, lineHeight: 1.5, color: '#e6e6e6'}} data-conciv-key="cFbPrA">
              Slide to indicate your budget range
            </p>
          </div>
          <div style={{display: 'grid', padding: '26px 3px'}} data-conciv-key="cFsLdA">
            <div style={{...SLIDER_LAYER, height: 2, alignSelf: 'center', background: '#333333'}} data-conciv-key="cFsTkA" />
            <div
              style={{...SLIDER_LAYER, display: 'flex', alignItems: 'center', margin: '-9px 0 -9px 8.6%', width: '49%'}}
              data-conciv-key="cFsRgA"
            >
              <FormThumb value="$1000" />
              <div style={{height: 3, flex: 1, background: '#9eff00'}} data-conciv-key="cFsBrA" />
              <FormThumb value="$5000" />
            </div>
          </div>
        </div>
        <label style={{...FORM_FIELD, gap: 20}} data-conciv-key="cFmSgA">
          <span style={FORM_LABEL} data-conciv-key="cFmLbA">
            Your Message
          </span>
          <span style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 34}} data-conciv-key="cFmBdA">
            <span style={{display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6}} data-conciv-key="cFmInA">
              <input placeholder="Type here" style={FORM_INPUT} data-conciv-key="cFmIpA" />
              <FormLine flat={props.flat} />
            </span>
            <FormLine flat={props.flat} />
          </span>
        </label>
        <button
          type="submit"
          style={{alignSelf: 'center', border: 0, borderRadius: 8, background: '#9eff00', padding: '14px 36px', fontSize: 14, lineHeight: 1.5, fontWeight: 500, color: '#1a1a1a'}}
          data-conciv-key="cFsBtA"
        >
          Submit
        </button>
      </form>
  )
  return (
    <main style={{margin: -24, background: '#1a1a1a'}} data-conciv-key="cFmNaA">
      {props.section ? (
        <section style={{display: 'flex', flexDirection: 'column'}} data-conciv-key="cSsCnA">
          <div
            style={{height: 483, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, color: '#ffffff'}}
            data-conciv-key="cShDrA"
          >
            <h2 style={{margin: 0, fontSize: 28, fontWeight: 600}} data-conciv-key="cShTxA">
              Thank you for your Interest in SquareUp.
            </h2>
            <span style={{padding: '14px 24px', borderRadius: 8, background: '#9eff00', color: '#000000'}} data-conciv-key="cSbTnA">
              Start Project
            </span>
          </div>
          <div style={{display: 'flex', justifyContent: 'center', boxShadow: 'inset 0 1px 0 #262626'}} data-conciv-key="cSwRpA">
            {form}
          </div>
        </section>
      ) : (
        form
      )}
</main>
  )
}

function SliderKnob(props: {label: string}) {
  return (
    <span
      style={{display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 4, borderRadius: 30, background: '#4c4c4d'}}
      data-conciv-key="rSkNbA"
    >
      <span style={{width: 12, height: 12, borderRadius: 6, background: '#9eff00'}} data-conciv-key="rSdOtA" />
      <span
        style={{margin: '12px -16px -33px', fontSize: 14, lineHeight: '17px', color: '#ffffff', whiteSpace: 'nowrap'}}
        data-conciv-key="rSlBlA"
      >
        {props.label}
      </span>
    </span>
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
