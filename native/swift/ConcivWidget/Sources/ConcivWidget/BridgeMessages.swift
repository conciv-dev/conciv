import Foundation

// Codable mirror of packages/extensions/ios/src/shared/bridge.ts.
//
// Every per-message struct uses the compiler-synthesized Codable, which ignores
// unknown keys on decode. That is the wire contract (additive evolution within a
// bridge version must not brick a peer). The only hand-written Codable is the
// `BridgeMessage` discriminated union, which switches on the `type` discriminator
// through a keyed container - decoding an unknown `type` throws, but unknown keys
// inside a known message are still ignored.

public let bridgeMinVersion = 1
public let bridgeMaxVersion = 1

public struct Rect: Codable, Equatable {
  public var x: Double
  public var y: Double
  public var width: Double
  public var height: Double

  public init(x: Double, y: Double, width: Double, height: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
  }
}

public struct Source: Codable, Equatable {
  public var componentName: String?
  public var filePath: String
  public var lineNumber: Int?

  public init(componentName: String?, filePath: String, lineNumber: Int?) {
    self.componentName = componentName
    self.filePath = filePath
    self.lineNumber = lineNumber
  }
}

public enum PreviewKind: String, Codable {
  case image
}

public struct ImagePreview: Codable, Equatable {
  public var kind: PreviewKind
  public var dataUrl: String
  public var width: Double
  public var height: Double

  public init(kind: PreviewKind = .image, dataUrl: String, width: Double, height: Double) {
    self.kind = kind
    self.dataUrl = dataUrl
    self.width = width
    self.height = height
  }
}

public struct ViewNode: Codable, Equatable {
  public var className: String
  public var a11yId: String?
  public var text: String?
  public var rect: Rect
  public var children: [ViewNode]

  enum CodingKeys: String, CodingKey {
    case className = "class"
    case a11yId
    case text
    case rect
    case children
  }

  public init(className: String, a11yId: String?, text: String?, rect: Rect, children: [ViewNode]) {
    self.className = className
    self.a11yId = a11yId
    self.text = text
    self.rect = rect
    self.children = children
  }
}

public struct NeutralGrab: Codable, Equatable {
  public var text: String
  public var preview: ImagePreview
  public var rect: Rect?
  public var source: Source?
  public var subtree: ViewNode?

  public init(text: String, preview: ImagePreview, rect: Rect?, source: Source?, subtree: ViewNode?) {
    self.text = text
    self.preview = preview
    self.rect = rect
    self.source = source
    self.subtree = subtree
  }
}

public enum GrabMode: String, Codable {
  case activate
  case comment
}

public enum LogLevel: String, Codable {
  case info
  case warn
  case error
}

// Page -> Native

public struct BridgeReady: Codable, Equatable {
  public var v: Int
  public var type: String

  public init(v: Int, type: String = "bridge.ready") {
    self.v = v
    self.type = type
  }
}

public struct HandshakeHello: Codable, Equatable {
  public var v: Int
  public var type: String
  public var minV: Int
  public var maxV: Int
  public var clientId: String
  public var bundleReady: Bool

  public init(v: Int, minV: Int, maxV: Int, clientId: String, bundleReady: Bool, type: String = "handshake.hello") {
    self.v = v
    self.type = type
    self.minV = minV
    self.maxV = maxV
    self.clientId = clientId
    self.bundleReady = bundleReady
  }
}

public struct GrabPick: Codable, Equatable {
  public var v: Int
  public var type: String
  public var requestId: String
  public var mode: GrabMode

  public init(v: Int, requestId: String, mode: GrabMode, type: String = "grab.pick") {
    self.v = v
    self.type = type
    self.requestId = requestId
    self.mode = mode
  }
}

public struct GrabCancel: Codable, Equatable {
  public var v: Int
  public var type: String
  public var requestId: String

  public init(v: Int, requestId: String, type: String = "grab.cancel") {
    self.v = v
    self.type = type
    self.requestId = requestId
  }
}

public struct BridgeAck: Codable, Equatable {
  public var v: Int
  public var type: String
  public var seq: Int

  public init(v: Int, seq: Int, type: String = "bridge.ack") {
    self.v = v
    self.type = type
    self.seq = seq
  }
}

public struct HostPanelToggled: Codable, Equatable {
  public var v: Int
  public var type: String
  public var open: Bool
  public var connected: Bool
  public var mascotRect: Rect?

  public init(v: Int, open: Bool, connected: Bool, mascotRect: Rect?, type: String = "host.panelToggled") {
    self.v = v
    self.type = type
    self.open = open
    self.connected = connected
    self.mascotRect = mascotRect
  }
}

public struct HostLog: Codable, Equatable {
  public var v: Int
  public var type: String
  public var level: LogLevel
  public var message: String

  public init(v: Int, level: LogLevel, message: String, type: String = "host.log") {
    self.v = v
    self.type = type
    self.level = level
    self.message = message
  }
}

// Native -> Page

public struct Handshake: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String
  public var apiBase: String
  public var token: String?

  public init(v: Int, seq: Int, apiBase: String, token: String?, type: String = "handshake") {
    self.v = v
    self.seq = seq
    self.type = type
    self.apiBase = apiBase
    self.token = token
  }
}

public struct BridgeIncompatible: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String
  public var nativeMinV: Int
  public var nativeMaxV: Int

  public init(v: Int, seq: Int, nativeMinV: Int, nativeMaxV: Int, type: String = "bridge.incompatible") {
    self.v = v
    self.seq = seq
    self.type = type
    self.nativeMinV = nativeMinV
    self.nativeMaxV = nativeMaxV
  }
}

public struct Open: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String

  public init(v: Int, seq: Int, type: String = "open") {
    self.v = v
    self.seq = seq
    self.type = type
  }
}

public struct Close: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String

  public init(v: Int, seq: Int, type: String = "close") {
    self.v = v
    self.seq = seq
    self.type = type
  }
}

public struct GrabResult: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String
  public var requestId: String
  public var grab: NeutralGrab?

  public init(v: Int, seq: Int, requestId: String, grab: NeutralGrab?, type: String = "grabResult") {
    self.v = v
    self.seq = seq
    self.type = type
    self.requestId = requestId
    self.grab = grab
  }
}

public struct GrabCapability: Codable, Equatable {
  public var v: Int
  public var seq: Int
  public var type: String
  public var grabbable: Bool

  public init(v: Int, seq: Int, grabbable: Bool, type: String = "grabCapability") {
    self.v = v
    self.seq = seq
    self.type = type
    self.grabbable = grabbable
  }
}

// Discriminated union across both directions, keyed on `type`.

public enum BridgeMessage: Equatable {
  case bridgeReady(BridgeReady)
  case handshakeHello(HandshakeHello)
  case grabPick(GrabPick)
  case grabCancel(GrabCancel)
  case bridgeAck(BridgeAck)
  case hostPanelToggled(HostPanelToggled)
  case hostLog(HostLog)
  case handshake(Handshake)
  case bridgeIncompatible(BridgeIncompatible)
  case open(Open)
  case close(Close)
  case grabResult(GrabResult)
  case grabCapability(GrabCapability)
}

extension BridgeMessage: Codable {
  private enum TypeKey: String, CodingKey {
    case type
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: TypeKey.self)
    let type = try container.decode(String.self, forKey: .type)
    switch type {
    case "bridge.ready": self = .bridgeReady(try BridgeReady(from: decoder))
    case "handshake.hello": self = .handshakeHello(try HandshakeHello(from: decoder))
    case "grab.pick": self = .grabPick(try GrabPick(from: decoder))
    case "grab.cancel": self = .grabCancel(try GrabCancel(from: decoder))
    case "bridge.ack": self = .bridgeAck(try BridgeAck(from: decoder))
    case "host.panelToggled": self = .hostPanelToggled(try HostPanelToggled(from: decoder))
    case "host.log": self = .hostLog(try HostLog(from: decoder))
    case "handshake": self = .handshake(try Handshake(from: decoder))
    case "bridge.incompatible": self = .bridgeIncompatible(try BridgeIncompatible(from: decoder))
    case "open": self = .open(try Open(from: decoder))
    case "close": self = .close(try Close(from: decoder))
    case "grabResult": self = .grabResult(try GrabResult(from: decoder))
    case "grabCapability": self = .grabCapability(try GrabCapability(from: decoder))
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .type,
        in: container,
        debugDescription: "unknown bridge message type \(type)"
      )
    }
  }

  public func encode(to encoder: Encoder) throws {
    switch self {
    case .bridgeReady(let message): try message.encode(to: encoder)
    case .handshakeHello(let message): try message.encode(to: encoder)
    case .grabPick(let message): try message.encode(to: encoder)
    case .grabCancel(let message): try message.encode(to: encoder)
    case .bridgeAck(let message): try message.encode(to: encoder)
    case .hostPanelToggled(let message): try message.encode(to: encoder)
    case .hostLog(let message): try message.encode(to: encoder)
    case .handshake(let message): try message.encode(to: encoder)
    case .bridgeIncompatible(let message): try message.encode(to: encoder)
    case .open(let message): try message.encode(to: encoder)
    case .close(let message): try message.encode(to: encoder)
    case .grabResult(let message): try message.encode(to: encoder)
    case .grabCapability(let message): try message.encode(to: encoder)
    }
  }
}
