export type BridgeFixtureDirection = 'p2n' | 'n2p'

export type BridgeFixture = {
  direction: BridgeFixtureDirection
  type: string
  file: string
  valid: unknown
  invalid: unknown
  unknownKey: unknown
}

const neutralGrab = {
  text: 'Payroll Deposit · Acme Corp · Today · +$3,120.00',
  preview: {kind: 'image', dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', width: 361, height: 72},
  rect: {x: 16, y: 232, width: 361, height: 72},
  source: {componentName: 'PaymentCardCell', filePath: '', lineNumber: null},
  subtree: {
    class: 'PaymentCardCell',
    a11yId: 'PaymentsScreen/payrollRow',
    text: 'Payroll Deposit',
    rect: {x: 16, y: 232, width: 361, height: 72},
    children: [
      {
        class: 'UILabel',
        a11yId: null,
        text: 'Payroll Deposit',
        rect: {x: 28, y: 240, width: 180, height: 20},
        children: [],
      },
    ],
  },
}

export const bridgeFixtures: BridgeFixture[] = [
  {
    direction: 'p2n',
    type: 'bridge.ready',
    file: 'p2n.bridge-ready',
    valid: {v: 1, type: 'bridge.ready'},
    invalid: {type: 'bridge.ready'},
    unknownKey: {v: 1, type: 'bridge.ready', frame: 'main'},
  },
  {
    direction: 'p2n',
    type: 'handshake.hello',
    file: 'p2n.handshake-hello',
    valid: {v: 1, type: 'handshake.hello', minV: 1, maxV: 1, clientId: 'client-abc', bundleReady: true},
    invalid: {v: 1, type: 'handshake.hello', minV: 1, maxV: 1, bundleReady: true},
    unknownKey: {
      v: 1,
      type: 'handshake.hello',
      minV: 1,
      maxV: 1,
      clientId: 'client-abc',
      bundleReady: true,
      platform: 'ios',
    },
  },
  {
    direction: 'p2n',
    type: 'grab.pick',
    file: 'p2n.grab-pick',
    valid: {v: 1, type: 'grab.pick', requestId: 'req-1', mode: 'activate'},
    invalid: {v: 1, type: 'grab.pick', requestId: 'req-1', mode: 'bogus'},
    unknownKey: {v: 1, type: 'grab.pick', requestId: 'req-1', mode: 'comment', origin: 'fab'},
  },
  {
    direction: 'p2n',
    type: 'grab.cancel',
    file: 'p2n.grab-cancel',
    valid: {v: 1, type: 'grab.cancel', requestId: 'req-1'},
    invalid: {v: 1, type: 'grab.cancel'},
    unknownKey: {v: 1, type: 'grab.cancel', requestId: 'req-1', reason: 'escape'},
  },
  {
    direction: 'p2n',
    type: 'bridge.ack',
    file: 'p2n.bridge-ack',
    valid: {v: 1, type: 'bridge.ack', seq: 7},
    invalid: {v: 1, type: 'bridge.ack', seq: '7'},
    unknownKey: {v: 1, type: 'bridge.ack', seq: 7, received: true},
  },
  {
    direction: 'p2n',
    type: 'host.panelToggled',
    file: 'p2n.host-panel-toggled',
    valid: {
      v: 1,
      type: 'host.panelToggled',
      open: true,
      connected: true,
      mascotRect: {x: 300, y: 640, width: 64, height: 64},
    },
    invalid: {v: 1, type: 'host.panelToggled', open: 'yes', connected: true},
    unknownKey: {v: 1, type: 'host.panelToggled', open: false, connected: true, launcher: 'mascot'},
  },
  {
    direction: 'p2n',
    type: 'host.log',
    file: 'p2n.host-log',
    valid: {v: 1, type: 'host.log', level: 'info', message: 'widget mounted'},
    invalid: {v: 1, type: 'host.log', level: 'debug', message: 'widget mounted'},
    unknownKey: {v: 1, type: 'host.log', level: 'error', message: 'boom', stack: 'at boot'},
  },
  {
    direction: 'n2p',
    type: 'handshake',
    file: 'n2p.handshake',
    valid: {v: 1, seq: 1, type: 'handshake', apiBase: 'http://127.0.0.1:5311', token: null},
    invalid: {v: 1, seq: 1, type: 'handshake', token: null},
    unknownKey: {
      v: 1,
      seq: 1,
      type: 'handshake',
      apiBase: 'http://127.0.0.1:5311',
      token: 'pair-xyz',
      expiresAt: 1893456000,
    },
  },
  {
    direction: 'n2p',
    type: 'bridge.incompatible',
    file: 'n2p.bridge-incompatible',
    valid: {v: 1, seq: 2, type: 'bridge.incompatible', nativeMinV: 2, nativeMaxV: 3},
    invalid: {v: 1, seq: 2, type: 'bridge.incompatible', nativeMinV: '2', nativeMaxV: 3},
    unknownKey: {v: 1, seq: 2, type: 'bridge.incompatible', nativeMinV: 2, nativeMaxV: 3, hint: 'update the SDK'},
  },
  {
    direction: 'n2p',
    type: 'open',
    file: 'n2p.open',
    valid: {v: 1, seq: 3, type: 'open'},
    invalid: {v: 1, type: 'open'},
    unknownKey: {v: 1, seq: 3, type: 'open', origin: 'fab'},
  },
  {
    direction: 'n2p',
    type: 'close',
    file: 'n2p.close',
    valid: {v: 1, seq: 4, type: 'close'},
    invalid: {v: 1, seq: null, type: 'close'},
    unknownKey: {v: 1, seq: 4, type: 'close', origin: 'user'},
  },
  {
    direction: 'n2p',
    type: 'grabResult',
    file: 'n2p.grab-result',
    valid: {v: 1, seq: 5, type: 'grabResult', requestId: 'req-1', grab: neutralGrab},
    invalid: {
      v: 1,
      seq: 5,
      type: 'grabResult',
      requestId: 'req-1',
      grab: {...neutralGrab, preview: {kind: 'dom', dataUrl: '', width: 361, height: 72}},
    },
    unknownKey: {v: 1, seq: 5, type: 'grabResult', requestId: 'req-1', grab: neutralGrab, durationMs: 12},
  },
  {
    direction: 'n2p',
    type: 'grabCapability',
    file: 'n2p.grab-capability',
    valid: {v: 1, seq: 6, type: 'grabCapability', grabbable: true},
    invalid: {v: 1, seq: 6, type: 'grabCapability', grabbable: 'true'},
    unknownKey: {v: 1, seq: 6, type: 'grabCapability', grabbable: false, screen: 'PaymentsScreen'},
  },
]
