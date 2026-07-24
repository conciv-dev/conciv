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
}
