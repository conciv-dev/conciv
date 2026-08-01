import XCTest
@testable import ConcivWidget

// Foundation-only. Runs on the macOS host via `swift test` (required CI job) and on
// the simulator. Decode-equivalence + roundtrip over the committed fixture copy
// (07 section 4/5, D3): every valid/unknown-key fixture decodes and survives a
// decode -> encode -> decode cycle equal; every invalid fixture fails to decode.

final class BridgeConformanceTests: XCTestCase {
  private struct TypeProbe: Decodable {
    let type: String
  }

  private static let expectedTypes: Set<String> = [
    "bridge.ready",
    "handshake.hello",
    "grab.pick",
    "grab.cancel",
    "bridge.ack",
    "host.panelToggled",
    "host.log",
    "handshake",
    "bridge.incompatible",
    "open",
    "close",
    "grabResult",
    "grabCapability",
  ]

  private func bridgeDir() throws -> URL {
    if let url = Bundle.module.url(forResource: "bridge", withExtension: nil) {
      return url
    }
    if let resourceURL = Bundle.module.resourceURL {
      let candidate = resourceURL.appendingPathComponent("bridge")
      if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
    }
    throw XCTSkip("bridge fixtures not found in test bundle")
  }

  private func jsonFiles(in dir: URL) throws -> [URL] {
    let entries = try FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)
    return entries.filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
  }

  func testValidFixturesDecodeAndRoundtrip() throws {
    let files = try jsonFiles(in: bridgeDir())
    XCTAssertFalse(files.isEmpty, "expected valid fixtures at the bridge dir root")
    var seenTypes: Set<String> = []
    let encoder = JSONEncoder()
    let decoder = JSONDecoder()
    for file in files {
      let data = try Data(contentsOf: file)
      let probe = try decoder.decode(TypeProbe.self, from: data)
      seenTypes.insert(probe.type)
      let decoded = try decoder.decode(BridgeMessage.self, from: data)
      let reEncoded = try encoder.encode(decoded)
      let reDecoded = try decoder.decode(BridgeMessage.self, from: reEncoded)
      XCTAssertEqual(decoded, reDecoded, "roundtrip mismatch for \(file.lastPathComponent)")
    }
    XCTAssertEqual(seenTypes, Self.expectedTypes, "valid fixtures must cover every BridgeMessage variant")
  }

  func testUnknownKeyFixturesDecodeAndRoundtrip() throws {
    let files = try jsonFiles(in: bridgeDir().appendingPathComponent("unknown-key"))
    XCTAssertFalse(files.isEmpty, "expected unknown-key fixtures")
    let encoder = JSONEncoder()
    let decoder = JSONDecoder()
    for file in files {
      let data = try Data(contentsOf: file)
      let decoded = try decoder.decode(BridgeMessage.self, from: data)
      let reDecoded = try decoder.decode(BridgeMessage.self, from: try encoder.encode(decoded))
      XCTAssertEqual(decoded, reDecoded, "unknown-key roundtrip mismatch for \(file.lastPathComponent)")
    }
  }

  func testInvalidFixturesAreRejected() throws {
    let files = try jsonFiles(in: bridgeDir().appendingPathComponent("invalid"))
    XCTAssertFalse(files.isEmpty, "expected invalid fixtures")
    let decoder = JSONDecoder()
    for file in files {
      let data = try Data(contentsOf: file)
      XCTAssertThrowsError(try decoder.decode(BridgeMessage.self, from: data), "expected \(file.lastPathComponent) to fail decoding")
    }
  }

  func testGrabResultDecodesNeutralGrabWithSubtree() throws {
    let url = try bridgeDir().appendingPathComponent("n2p.grab-result.json")
    let data = try Data(contentsOf: url)
    let message = try JSONDecoder().decode(BridgeMessage.self, from: data)
    guard case .grabResult(let result) = message, let grab = result.grab else {
      return XCTFail("expected a grabResult carrying a NeutralGrab")
    }
    XCTAssertEqual(grab.preview.kind, .image)
    XCTAssertEqual(grab.subtree?.className, "PaymentCardCell")
    XCTAssertEqual(grab.subtree?.a11yId, "PaymentsScreen/payrollRow")
    XCTAssertEqual(grab.subtree?.children.first?.className, "UILabel")
    XCTAssertNil(grab.subtree?.children.first?.a11yId)
  }

  func testGrabResultReasonDecodesAndRoundtrips() throws {
    let decoder = JSONDecoder()
    let encoder = JSONEncoder()
    let cases: [(String, GrabResultReason)] = [
      ("n2p.grab-result-cancelled.json", .cancelled),
      ("n2p.grab-result-failed.json", .failed),
    ]
    for (file, expected) in cases {
      let data = try Data(contentsOf: try bridgeDir().appendingPathComponent(file))
      let message = try decoder.decode(BridgeMessage.self, from: data)
      guard case .grabResult(let result) = message else {
        return XCTFail("expected a grabResult for \(file)")
      }
      XCTAssertNil(result.grab, "\(file) should carry no grab")
      XCTAssertEqual(result.reason, expected)
      let reDecoded = try decoder.decode(BridgeMessage.self, from: try encoder.encode(message))
      XCTAssertEqual(message, reDecoded, "reason roundtrip mismatch for \(file)")
    }
  }

  // The encode-direction conformance suite (the nil-key drift class). Each variant is
  // built as a real struct, encoded with JSONEncoder, and its produced JSON object
  // asserted equal (key-set + values, order-independent) to the committed fixture the TS
  // NativeToPageSchema also validates. A nil Swift optional omits its key, so the
  // tokenless handshake fixture pins that the omission is exactly what the page accepts.
  private static func encodeVariants() -> [(file: String, message: BridgeMessage)] {
    let apiBase = "http://127.0.0.1:5311"
    let preview = ImagePreview(dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", width: 361, height: 72)
    let rect = Rect(x: 16, y: 232, width: 361, height: 72)
    let labelRect = Rect(x: 28, y: 240, width: 180, height: 20)
    let fullSubtree = ViewNode(
      className: "PaymentCardCell",
      a11yId: "PaymentsScreen/payrollRow",
      text: "Payroll Deposit",
      rect: rect,
      children: [
        ViewNode(className: "UILabel", a11yId: "PaymentsScreen/amount", text: "+$3,120.00", rect: labelRect, children: []),
      ]
    )
    let fullGrab = NeutralGrab(
      text: "Payroll Deposit",
      preview: preview,
      rect: rect,
      source: Source(componentName: "PaymentCardCell", filePath: "", lineNumber: 42),
      subtree: fullSubtree
    )
    let minimalGrab = NeutralGrab(text: "Payroll Deposit", preview: preview, rect: nil, source: nil, subtree: nil)
    let sourceNilsGrab = NeutralGrab(
      text: "Payroll Deposit",
      preview: preview,
      rect: nil,
      source: Source(componentName: nil, filePath: "", lineNumber: nil),
      subtree: nil
    )
    let viewNodeNilsGrab = NeutralGrab(
      text: "Payroll Deposit",
      preview: preview,
      rect: nil,
      source: nil,
      subtree: ViewNode(className: "UILabel", a11yId: nil, text: nil, rect: rect, children: [])
    )
    return [
      ("n2p.encode.handshake-token", .handshake(Handshake(v: 1, seq: 1, apiBase: apiBase, token: "pair-xyz"))),
      ("n2p.encode.handshake-tokenless", .handshake(Handshake(v: 1, seq: 1, apiBase: apiBase, token: nil))),
      ("n2p.encode.bridge-incompatible", .bridgeIncompatible(BridgeIncompatible(v: 1, seq: 2, nativeMinV: 2, nativeMaxV: 3))),
      ("n2p.encode.open", .open(Open(v: 1, seq: 3))),
      ("n2p.encode.close", .close(Close(v: 1, seq: 4))),
      ("n2p.encode.grab-capability", .grabCapability(GrabCapability(v: 1, seq: 6, grabbable: true))),
      ("n2p.encode.grab-result-full", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: fullGrab))),
      ("n2p.encode.grab-result-minimal-grab", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: minimalGrab))),
      ("n2p.encode.grab-result-source-nils", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: sourceNilsGrab))),
      ("n2p.encode.grab-result-viewnode-nils", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: viewNodeNilsGrab))),
      ("n2p.encode.grab-result-cancelled", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: nil, reason: .cancelled))),
      ("n2p.encode.grab-result-failed", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: nil, reason: .failed))),
      ("n2p.encode.grab-result-bare", .grabResult(GrabResult(v: 1, seq: 5, requestId: "req-1", grab: nil))),
    ]
  }

  func testNativeEncodeVariantsMatchCommittedFixtures() throws {
    let dir = try bridgeDir().appendingPathComponent("encode")
    let encoder = JSONEncoder()
    let variants = Self.encodeVariants()
    for (file, message) in variants {
      let url = dir.appendingPathComponent("\(file).json")
      let expected = try JSONSerialization.jsonObject(with: try Data(contentsOf: url)) as? NSDictionary
      let produced = try JSONSerialization.jsonObject(with: try encoder.encode(message)) as? NSDictionary
      XCTAssertNotNil(expected, "committed fixture \(file) is not a JSON object")
      XCTAssertEqual(produced, expected, "encode mismatch for \(file)")
    }
    let committed = Set(try jsonFiles(in: dir).map { $0.deletingPathExtension().lastPathComponent })
    XCTAssertEqual(committed, Set(variants.map { $0.file }), "encode variants must match committed fixtures 1:1")
  }
}
