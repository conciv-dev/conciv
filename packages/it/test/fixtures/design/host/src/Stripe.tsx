import './stripe.css'

const NAV = ['Products', 'Solutions', 'Developers', 'Resources', 'Pricing']
const LOGOS = ['OpenAI', 'amazon', 'NVIDIA', 'Ford', 'coinbase', 'Google', 'shopify']
const BARS = Array.from({length: 40}, (_, index) => 20 + ((index * 37) % 80))
const ROWS = ['Vital Flow', 'Daybreak Yoga', 'Sacred Space', 'Jackson Hot Yoga', 'Harmony Flow', 'Balance at Brunch']
const CHIPS = ['Business website', 'What you sell', 'How you charge', 'Who you sell to']

type CardProps = {title: string; className?: string; children?: React.ReactNode}

function Card({title, className, children}: CardProps) {
  return (
    <section className={`card ${className ?? ''}`}>
      <header className="card-head">
        <h3>{title}</h3>
        <span className="card-icon" />
      </header>
      <div className="card-visual">{children}</div>
    </section>
  )
}

export function Stripe() {
  return (
    <div className="stripe">
      <nav className="nav">
        <strong className="logo">stripe</strong>
        <ul className="nav-links">
          {NAV.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <span className="nav-guide">Guide me</span>
        <div className="nav-actions">
          <button className="btn btn-light">Sign in</button>
          <button className="btn btn-primary">Contact sales</button>
        </div>
      </nav>

      <header className="hero">
        <p className="hero-gdp">Global GDP running on Stripe: 1.74284310%</p>
        <h1 className="hero-title">
          Financial infrastructure to grow your revenue.
          <span>
            {' '}
            Accept payments, handle business banking,¹ and implement custom revenue models—from your first transaction
            to your billionth.
          </span>
        </h1>
        <div className="hero-actions">
          <button className="btn btn-primary">Get started ›</button>
          <button className="btn btn-outline">Sign up with Google</button>
        </div>
        <div className="hero-ribbon" />
      </header>

      <ul className="logos">
        {LOGOS.map((logo) => (
          <li key={logo}>{logo}</li>
        ))}
      </ul>

      <aside className="chat">
        <div className="chat-pop">
          <span className="chat-avatars" />
          <div>
            <strong>6 sales reps available</strong>
            <p>We're here to discuss your business needs.</p>
          </div>
        </div>
        <button className="btn btn-dark">Chat now</button>
      </aside>

      <h2 className="lede">
        Flexible solutions for every business model.{' '}
        <span>Grow your business with a comprehensive set of payments and financial tools</span>
        —designed to work individually or together.
      </h2>

      <div className="grid">
        <Card title="Accept and optimize payments globally—online and in person" className="span-2 g-orange">
          <div className="terminal">
            <div className="terminal-screen">
              <b>$5.46</b>
              <small>Tap, insert, or swipe to pay</small>
              <span className="pill" />
            </div>
          </div>
          <div className="checkout">
            <h4>ROASTERY.</h4>
            <div className="checkout-buttons">
              <span className="btn-link">link</span>
              <span className="btn-pay">Pay</span>
            </div>
            <ul>
              <li>Card</li>
              <li>Affirm</li>
              <li>Cash App</li>
              <li>Crypto</li>
              <li>US bank account</li>
            </ul>
          </div>
        </Card>
        <Card title="Enable any billing model" className="g-purple">
          <div className="panel">
            <b>Pro Plan</b>
            <small>Billed monthly</small>
            <span className="meter" />
          </div>
          <div className="panel chart">
            <small>Tokens used in the last 30 days</small>
            <b>2,010,569,010</b>
            <div className="bars">
              {BARS.map((value, index) => (
                <i key={index} style={{flexBasis: `${value}%`}} />
              ))}
            </div>
          </div>
        </Card>
        <Card title="Monetize through agentic commerce" className="g-pink">
          <div className="bubble">
            I'm refreshing my wardrobe. Can you recommend some cozy, comfortable basics in size M?
          </div>
          <div className="products">
            <span className="product blue" />
            <span className="product navy" />
          </div>
          <span className="buy">Buy now</span>
        </Card>
        <Card title="Create a card issuing program" className="g-card">
          <div className="credit">
            <b>VISA</b>
          </div>
        </Card>
        <Card title="Access borderless money movement with stablecoins and crypto" className="g-dots" />
        <Card title="Embed payments in your platform" className="span-3 g-lilac">
          <div className="embed-left">
            <b>Daybreak Yoga</b>
            <small>Order Summary</small>
            <span className="embed-card">Card</span>
            <span className="embed-pay">Pay $999.0</span>
          </div>
          <div className="embed-table">
            <h4>Connected Accounts</h4>
            <ul>
              {ROWS.map((row) => (
                <li key={row}>
                  <span>{row}</span>
                  <span>Canada</span>
                  <span>$8,348.00</span>
                  <span>$71,562.98</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <section className="prompt">
        <h2>Get Stripe product recommendations</h2>
        <p>Enter your company's URL, or tell us what you sell and how you sell it.</p>
        <div className="prompt-box">
          <span className="prompt-text">Sell software subscriptions to our clients...</span>
          <div className="prompt-foot">
            <span>Input strength:</span>
            {CHIPS.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
            <span className="prompt-count">0/500</span>
          </div>
        </div>
        <small>By messaging, you understand how Stripe uses AI and acknowledge our Privacy Policy.</small>
      </section>

      <section className="banner">
        <h2>Building the economic infrastructure for AI</h2>
      </section>
    </div>
  )
}
