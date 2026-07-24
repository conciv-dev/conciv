import XCTest
@testable import ConcivWidget

// Foundation-only. Runs on the macOS host via `swift test` (required CI job) and on
// the simulator. Covers the pure discovery/URL-building/staleness logic (06 M5) with
// injected fakes so no live network or filesystem is touched.

final class DiscoveryTests: XCTestCase {
  private func url(_ string: String) -> URL {
    guard let value = URL(string: string) else {
      fatalError("bad test url \(string)")
    }
    return value
  }

  func testParsePairingFileReadsBaseTokenAndPid() {
    let json = #"{"apiBase":"http://127.0.0.1:4599/t/secret","token":"secret","pid":4242}"#
    let endpoint = ConcivDiscovery.parsePairingFile(Data(json.utf8))
    XCTAssertEqual(endpoint?.apiBase, url("http://127.0.0.1:4599/t/secret"))
    XCTAssertEqual(endpoint?.token, "secret")
    XCTAssertEqual(endpoint?.pid, 4242)
  }

  func testParsePairingFileAcceptsNullTokenAndRejectsGarbage() {
    let loopback = #"{"apiBase":"http://127.0.0.1:4599","token":null,"pid":9}"#
    let parsed = ConcivDiscovery.parsePairingFile(Data(loopback.utf8))
    XCTAssertNil(parsed?.token)
    XCTAssertEqual(parsed?.pid, 9)

    XCTAssertNil(ConcivDiscovery.parsePairingFile(Data("not json".utf8)))
    XCTAssertNil(ConcivDiscovery.parsePairingFile(Data(#"{"apiBase":"","token":null,"pid":1}"#.utf8)))
    XCTAssertNil(ConcivDiscovery.parsePairingFile(Data(#"{"token":null,"pid":1}"#.utf8)))
  }

  func testPageAndHealthUrlsPreserveTheTokenPrefixWhileOriginStaysHostPort() {
    let apiBase = url("http://127.0.0.1:4599/t/secret")
    XCTAssertEqual(ConcivDiscovery.pageURL(for: apiBase), url("http://127.0.0.1:4599/t/secret/native"))
    XCTAssertEqual(ConcivDiscovery.healthURL(for: apiBase), url("http://127.0.0.1:4599/t/secret/health"))
    XCTAssertEqual(ConcivDiscovery.origin(of: apiBase), "http://127.0.0.1:4599")
    XCTAssertEqual(ConcivDiscovery.origin(of: url("https://example.test")), "https://example.test")
  }

  func testCandidateBasesLeadWithTheDefaultPort() {
    let bases = ConcivDiscovery.candidateBases()
    XCTAssertEqual(bases.first, url("http://127.0.0.1:4599"))
    XCTAssertEqual(ConcivDiscovery.defaultPort, 4599)
  }

  func testStaleTokenIsOnlyUnauthorizedOrNotFound() {
    XCTAssertTrue(ConcivDiscovery.isStaleToken(status: 401))
    XCTAssertTrue(ConcivDiscovery.isStaleToken(status: 404))
    XCTAssertFalse(ConcivDiscovery.isStaleToken(status: 200))
    XCTAssertFalse(ConcivDiscovery.isStaleToken(status: 500))
  }

  func testSameCoreDiscriminatorIsThePid() {
    let a = ConcivEndpoint(apiBase: url("http://127.0.0.1:4599"), token: nil, pid: 100)
    let moved = ConcivEndpoint(apiBase: url("http://127.0.0.1:5000"), token: nil, pid: 100)
    let other = ConcivEndpoint(apiBase: url("http://127.0.0.1:5000"), token: nil, pid: 200)
    XCTAssertTrue(ConcivDiscovery.isSameCore(previous: a, discovered: moved))
    XCTAssertFalse(ConcivDiscovery.isSameCore(previous: a, discovered: other))
    XCTAssertFalse(ConcivDiscovery.isSameCore(previous: nil, discovered: moved))
    let probed = ConcivEndpoint(apiBase: url("http://127.0.0.1:4599"), token: nil, pid: nil)
    XCTAssertFalse(ConcivDiscovery.isSameCore(previous: a, discovered: probed))
  }

  func testDefaultPairingFileUsesSimulatorHostHomeWhenPresent() {
    let simUrl = ConcivDiscovery.defaultPairingFileURL(environment: ["SIMULATOR_HOST_HOME": "/Users/dev"])
    XCTAssertEqual(simUrl, URL(fileURLWithPath: "/Users/dev/.conciv/dev-endpoint.json"))
    let fallback = ConcivDiscovery.defaultPairingFileURL(environment: [:])
    XCTAssertTrue(fallback.path.hasSuffix("/.conciv/dev-endpoint.json"))
  }

  func testDiscoverPrefersHealthyPairingFile() {
    let pairing = url("file:///tmp/dev-endpoint.json")
    let json = #"{"apiBase":"http://127.0.0.1:4599/t/secret","token":"secret","pid":77}"#
    let discoverer = ConcivDiscoverer(
      pairingFileURL: pairing,
      readFile: { $0 == pairing ? Data(json.utf8) : nil },
      probe: { $0 == ConcivDiscovery.healthURL(for: self.url("http://127.0.0.1:4599/t/secret")) }
    )
    let endpoint = discoverer.discover()
    XCTAssertEqual(endpoint?.apiBase, url("http://127.0.0.1:4599/t/secret"))
    XCTAssertEqual(endpoint?.token, "secret")
    XCTAssertEqual(endpoint?.pid, 77)
  }

  func testDiscoverFallsBackToPortProbeWhenPairingFileIsUnhealthy() {
    let pairing = url("file:///tmp/dev-endpoint.json")
    let json = #"{"apiBase":"http://127.0.0.1:9999","token":null,"pid":5}"#
    let healthy = ConcivDiscovery.healthURL(for: url("http://127.0.0.1:4599"))
    let discoverer = ConcivDiscoverer(
      pairingFileURL: pairing,
      readFile: { _ in Data(json.utf8) },
      probe: { $0 == healthy }
    )
    let endpoint = discoverer.discover()
    XCTAssertEqual(endpoint?.apiBase, url("http://127.0.0.1:4599"))
    XCTAssertNil(endpoint?.token)
    XCTAssertNil(endpoint?.pid)
  }

  func testDiscoverProbesWhenNoPairingFileExists() {
    let secondary = ConcivDiscovery.candidatePorts[1]
    let healthy = ConcivDiscovery.healthURL(for: url("http://127.0.0.1:\(secondary)"))
    let discoverer = ConcivDiscoverer(
      pairingFileURL: url("file:///tmp/none.json"),
      readFile: { _ in nil },
      probe: { $0 == healthy }
    )
    XCTAssertEqual(discoverer.discover()?.apiBase, url("http://127.0.0.1:\(secondary)"))
  }

  func testDiscoverReturnsNilWhenNothingResponds() {
    let discoverer = ConcivDiscoverer(
      pairingFileURL: url("file:///tmp/none.json"),
      readFile: { _ in nil },
      probe: { _ in false }
    )
    XCTAssertNil(discoverer.discover())
  }
}
