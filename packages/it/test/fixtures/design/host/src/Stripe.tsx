import './stripe.css'

const NAV = ['Products', 'Solutions', 'Developers', 'Resources', 'Pricing']
const LOGOS = ['OpenAI', 'amazon', 'NVIDIA', 'Ford', 'coinbase', 'Google', 'shopify']
const BARS = Array.from({length: 40}, (_, index) => 20 + ((index * 37) % 80))
const ROWS = ['Vital Flow', 'Daybreak Yoga', 'Sacred Space', 'Jackson Hot Yoga', 'Harmony Flow', 'Balance at Brunch']
const CHIPS = ['Business website', 'What you sell', 'How you charge', 'Who you sell to']

type CardProps = {title: string; className?: string; children?: React.ReactNode}

function Card({title, className, children}: CardProps) {
  return (
    <section className={`card ${className ?? ''}`} data-conciv-key="S64vXQ">
      <header className="card-head" data-conciv-key="2kot3A">
        <h3 data-conciv-key="eaYeGA">{title}</h3>
        <span className="card-icon" data-conciv-key="NRsHtQ" />
      </header>
      <div className="card-visual" data-conciv-key="Ku2yQg">{children}</div>
    </section>
  )
}

export function Stripe() {
  return (
    <div className="stripe" data-conciv-key="W3YqVA">
      <nav className="nav" data-conciv-key="65XZxA">
        <strong className="logo" data-conciv-key="ofM-LQ">stripe</strong>
        <ul className="nav-links" data-conciv-key="8azzpA">
          {NAV.map((item) => (
            <li key={item} data-conciv-key="Tx2baw">{item}</li>
          ))}
        </ul>
        <span className="nav-guide" data-conciv-key="ElSEcw">Guide me</span>
        <div className="nav-actions" data-conciv-key="o1M7HQ">
          <button className="btn btn-light" data-conciv-key="eDbY0g">Sign in</button>
          <button className="btn btn-primary" data-conciv-key="r8k3Ow">Contact sales</button>
        </div>
      </nav>

      <header className="hero" data-conciv-key="mOBPPg">
        <p className="hero-gdp" data-conciv-key="xw-hJQ">Global GDP running on Stripe: 1.74284310%</p>
        <h1 className="hero-title" data-conciv-key="NIftsg">
          Financial infrastructure to grow your revenue.
          <span data-conciv-key="iM9V2g">
            {' '}
            Accept payments, handle business banking,¹ and implement custom revenue models—from your first transaction
            to your billionth.
          </span>
        </h1>
        <div className="hero-actions" data-conciv-key="D_CSuw">
          <button className="btn btn-primary" data-conciv-key="nfHvOQ">Get started ›</button>
          <button className="btn btn-outline" data-conciv-key="kbKSYA">Sign up with Google</button>
        </div>
        <div className="hero-ribbon" data-conciv-key="HsgbTQ" />
      </header>

      <ul className="logos" data-conciv-key="OxsdpQ">
        {LOGOS.map((logo) => (
          <li key={logo} data-conciv-key="6zQWWw">{logo}</li>
        ))}
      </ul>

      <aside className="chat" data-conciv-key="FreBRQ">
        <div className="chat-pop" data-conciv-key="NFgOnQ">
          <span className="chat-avatars" data-conciv-key="0UW3VQ" />
          <div data-conciv-key="2kI07g">
            <strong data-conciv-key="g8U8Ig">6 sales reps available</strong>
            <p data-conciv-key="38ltlQ">We're here to discuss your business needs.</p>
          </div>
        </div>
        <button className="btn btn-dark" data-conciv-key="JWTXjg">Chat now</button>
      </aside>

      <h2 className="lede" data-conciv-key="KEoRcg">
        Flexible solutions for every business model.{' '}
        <span data-conciv-key="02Okng">Grow your business with a comprehensive set of payments and financial tools</span>
        —designed to work individually or together.
      </h2>

      <div className="grid" data-conciv-key="e9ZYVg">
        <Card title="Accept and optimize payments globally—online and in person" className="span-2 g-orange" data-conciv-key="pmdcTw">
          <div className="terminal" data-conciv-key="P88TiQ">
            <div className="terminal-screen" data-conciv-key="Vp3bug">
              <b data-conciv-key="ly4SVg">$5.46</b>
              <small data-conciv-key="u47SDA">Tap, insert, or swipe to pay</small>
              <span className="pill" data-conciv-key="iy1Nog" />
            </div>
          </div>
          <div className="checkout" data-conciv-key="g0FSoA">
            <h4 data-conciv-key="TphF6g">ROASTERY.</h4>
            <div className="checkout-buttons" data-conciv-key="P3A1CA">
              <span className="btn-link" data-conciv-key="1Apmwg">link</span>
              <span className="btn-pay" data-conciv-key="kyC2cA">Pay</span>
            </div>
            <ul data-conciv-key="XnjxXQ">
              <li data-conciv-key="efsQbA">Card</li>
              <li data-conciv-key="KnVKeQ">Affirm</li>
              <li data-conciv-key="x0fSxA">Cash App</li>
              <li data-conciv-key="evo7aQ">Crypto</li>
              <li data-conciv-key="9fJV9w">US bank account</li>
            </ul>
          </div>
        </Card>
        <Card title="Enable any billing model" className="g-purple" data-conciv-key="TZQHWA">
          <div className="panel" data-conciv-key="-cQwqQ">
            <b data-conciv-key="jSCsQA">Pro Plan</b>
            <small data-conciv-key="dvAuoQ">Billed monthly</small>
            <span className="meter" data-conciv-key="L-JbXw" />
          </div>
          <div className="panel chart" data-conciv-key="krp_ow">
            <small data-conciv-key="gqpsrw">Tokens used in the last 30 days</small>
            <b data-conciv-key="KcHBIQ">2,010,569,010</b>
            <div className="bars" data-conciv-key="fc6HTg">
              {BARS.map((value, index) => (
                <i key={index} style={{flexBasis: `${value}%`}} data-conciv-key="fYswxQ" />
              ))}
            </div>
          </div>
        </Card>
        <Card title="Monetize through agentic commerce" className="g-pink" data-conciv-key="i-0CqQ">
          <div className="bubble" data-conciv-key="JfInBA">
            I'm refreshing my wardrobe. Can you recommend some cozy, comfortable basics in size M?
          </div>
          <div className="products" data-conciv-key="lWSrnA">
            <span className="product blue" data-conciv-key="tk7BTQ" />
            <span className="product navy" data-conciv-key="NG1Hiw" />
          </div>
          <span className="buy" data-conciv-key="uIDtew">Buy now</span>
        </Card>
        <Card title="Create a card issuing program" className="g-card" data-conciv-key="fgMNFw">
          <div className="credit" data-conciv-key="F6gmOA">
            <b data-conciv-key="YyxbJg">VISA</b>
          </div>
        </Card>
        <Card title="Access borderless money movement with stablecoins and crypto" className="g-dots" data-conciv-key="RQsYgQ" />
        <Card title="Embed payments in your platform" className="span-3 g-lilac" data-conciv-key="gPN7cw">
          <div className="embed-left" data-conciv-key="iky-aw">
            <b data-conciv-key="xwJwFg">Daybreak Yoga</b>
            <small data-conciv-key="Y45lRg">Order Summary</small>
            <span className="embed-card" data-conciv-key="235l6g">Card</span>
            <span className="embed-pay" data-conciv-key="7tT7uA">Pay $999.0</span>
          </div>
          <div className="embed-table" data-conciv-key="xzZ8tA">
            <h4 data-conciv-key="tCGaCA">Connected Accounts</h4>
            <ul data-conciv-key="nyhjJQ">
              {ROWS.map((row) => (
                <li key={row} data-conciv-key="JfaBXA">
                  <span data-conciv-key="hIuiiQ">{row}</span>
                  <span data-conciv-key="pmyl7g">Canada</span>
                  <span data-conciv-key="1a8luw">$8,348.00</span>
                  <span data-conciv-key="iG3YNg">$71,562.98</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <section className="prompt" data-conciv-key="GTcl3w">
        <h2 data-conciv-key="sXdsBg">Get Stripe product recommendations</h2>
        <p data-conciv-key="wYJpSw">Enter your company's URL, or tell us what you sell and how you sell it.</p>
        <div className="prompt-box" data-conciv-key="5crZpA">
          <span className="prompt-text" data-conciv-key="LQGerQ">Sell software subscriptions to our clients...</span>
          <div className="prompt-foot" data-conciv-key="2OUlnA">
            <span data-conciv-key="FVQ_-g">Input strength:</span>
            {CHIPS.map((chip) => (
              <span key={chip} data-conciv-key="nXs4KA">{chip}</span>
            ))}
            <span className="prompt-count" data-conciv-key="MLf2IQ">0/500</span>
          </div>
        </div>
        <small data-conciv-key="ABwAOg">By messaging, you understand how Stripe uses AI and acknowledge our Privacy Policy.</small>
      </section>

      <section className="banner" data-conciv-key="NFXjvQ">
        <h2 data-conciv-key="YlAaTg">Building the economic infrastructure for AI</h2>
      </section>
    </div>
  )
}
