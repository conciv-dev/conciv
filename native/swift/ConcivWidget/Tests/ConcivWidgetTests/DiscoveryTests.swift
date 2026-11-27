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
    let json = #"{"apiBase":"http://127.0.0.1:4599","token":"secret","pid":4242}"#
    let endpoint = ConcivDiscovery.parsePairingFile(Data(json.utf8))
    XCTAssertEqual(endpoint?.apiBase, url("http://127.0.0.1:4599"))
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

  func testPageUrlCarriesTheTokenAsTheAuthQueryWhileHealthAndOriginStayBare() {
    let apiBase = url("http://127.0.0.1:4599")
    let endpoint = ConcivEndpoint(apiBase: apiBase, token: "secret", pid: 1)
    XCTAssertEqual(ConcivDiscovery.pageURL(for: endpoint), url("http://127.0.0.1:4599/widget?conciv_auth_token=secret"))
    XCTAssertEqual(ConcivDiscovery.healthURL(for: apiBase), url("http://127.0.0.1:4599/health"))
    XCTAssertEqual(ConcivDiscovery.origin(of: apiBase), "http://127.0.0.1:4599")
    XCTAssertEqual(ConcivDiscovery.origin(of: url("https://example.test")), "https://example.test")
  }

  func testCandidateBasesLeadWithTheDefaultPort() {
    let bases = ConcivDiscovery.candidateBases()
    XCTAssertEqual(bases.first, url("http://127.0.0.1:4599"))
    XCTAssertEqual(ConcivDiscovery.defaultPort, 4599)
  }

  func testHealthResponseRequiresTheCoreBodyShape() {
    XCTAssertTrue(ConcivDiscovery.isHealthyResponse(Data(#"{"ok":true,"harness":"claude"}"#.utf8)))
    XCTAssertTrue(ConcivDiscovery.isHealthyResponse(Data(#"{"ok":true,"harness":"codex","extra":1}"#.utf8)))
  }

  func testHealthResponseRejectsNonConcivTwoHundredBodies() {
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data(#"{"status":"running"}"#.utf8)))
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data("OK".utf8)))
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data("<!doctype html><title>vite</title>".utf8)))
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data(#"{"ok":false,"harness":"claude"}"#.utf8)))
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data(#"{"ok":true,"harness":""}"#.utf8)))
    XCTAssertFalse(ConcivDiscovery.isHealthyResponse(Data(#"{"ok":true}"#.utf8)))
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

  func testPageUrlAppendsWidgetOnceToATokenlessEndpoint() {
    let endpoint = ConcivEndpoint(apiBase: url("http://127.0.0.1:8891"), token: nil, pid: nil)
    XCTAssertEqual(ConcivDiscovery.pageURL(for: endpoint), url("http://127.0.0.1:8891/widget"))
    let emptyToken = ConcivEndpoint(apiBase: url("http://127.0.0.1:8891"), token: "", pid: nil)
    XCTAssertEqual(ConcivDiscovery.pageURL(for: emptyToken), url("http://127.0.0.1:8891/widget"))
  }

  func testEnvApiBaseParsesAValidBaseRejectsMalformedAndTreatsUnsetAsDiscovery() {
    let valid = ConcivDiscovery.envApiBase(environment: ["CONCIV_URL": "http://127.0.0.1:4599"])
    XCTAssertEqual(valid, url("http://127.0.0.1:4599"))

    XCTAssertNil(ConcivDiscovery.envApiBase(environment: [:]))
    XCTAssertNil(ConcivDiscovery.envApiBase(environment: ["CONCIV_URL": ""]))
    XCTAssertNil(ConcivDiscovery.envApiBase(environment: ["CONCIV_URL": "127.0.0.1:4599"]))
    XCTAssertNil(ConcivDiscovery.envApiBase(environment: ["CONCIV_URL": "not a url"]))
  }

  func testShouldAutoShowOnlyWhenEnvFlagIsExactlyOne() {
    XCTAssertTrue(ConcivDiscovery.shouldAutoShow(environment: ["CONCIV_AUTOSHOW": "1"]))
    XCTAssertFalse(ConcivDiscovery.shouldAutoShow(environment: ["CONCIV_AUTOSHOW": "0"]))
    XCTAssertFalse(ConcivDiscovery.shouldAutoShow(environment: ["CONCIV_AUTOSHOW": "true"]))
    XCTAssertFalse(ConcivDiscovery.shouldAutoShow(environment: [:]))
  }

  func testDefaultPairingFileUsesSimulatorHostHomeWhenPresent() {
    let simUrl = ConcivDiscovery.defaultPairingFileURL(environment: ["SIMULATOR_HOST_HOME": "/Users/dev"])
    XCTAssertEqual(simUrl, URL(fileURLWithPath: "/Users/dev/.conciv/dev-endpoint.json"))
    let fallback = ConcivDiscovery.defaultPairingFileURL(environment: [:])
    XCTAssertTrue(fallback.path.hasSuffix("/.conciv/dev-endpoint.json"))
  }

  func testEnvEndpointTakesThePairingTokenOnlyForTheSameOrigin() {
    let pairing = url("file:///tmp/dev-endpoint.json")
    let json = #"{"apiBase":"http://127.0.0.1:4599","token":"secret","pid":77}"#
    let paired = ConcivDiscoverer(
      pairingFileURL: pairing,
      readFile: { $0 == pairing ? Data(json.utf8) : nil },
      probe: { _ in false }
    )
    let same = paired.envEndpoint(apiBase: url("http://127.0.0.1:4599/"))
    XCTAssertEqual(same, ConcivEndpoint(apiBase: url("http://127.0.0.1:4599/"), token: "secret", pid: 77))
    XCTAssertEqual(
      ConcivDiscovery.pageURL(for: same),
      url("http://127.0.0.1:4599/widget?conciv_auth_token=secret")
    )

    let otherPort = paired.envEndpoint(apiBase: url("http://127.0.0.1:5000"))
    XCTAssertEqual(otherPort, ConcivEndpoint(apiBase: url("http://127.0.0.1:5000"), token: nil, pid: nil))
    let otherHost = paired.envEndpoint(apiBase: url("http://localhost:4599"))
    XCTAssertEqual(otherHost, ConcivEndpoint(apiBase: url("http://localhost:4599"), token: nil, pid: nil))

    let unpaired = ConcivDiscoverer(pairingFileURL: pairing, readFile: { _ in nil }, probe: { _ in false })
    XCTAssertEqual(
      unpaired.envEndpoint(apiBase: url("http://127.0.0.1:4599")),
      ConcivEndpoint(apiBase: url("http://127.0.0.1:4599"), token: nil, pid: nil)
    )
    let garbage = ConcivDiscoverer(pairingFileURL: pairing, readFile: { _ in Data("not json".utf8) }, probe: { _ in false })
    XCTAssertNil(garbage.envEndpoint(apiBase: url("http://127.0.0.1:4599")).token)
  }

  func testDiscoverPrefersHealthyPairingFile() {
    let pairing = url("file:///tmp/dev-endpoint.json")
    let json = #"{"apiBase":"http://127.0.0.1:4599","token":"secret","pid":77}"#
    let discoverer = ConcivDiscoverer(
      pairingFileURL: pairing,
      readFile: { $0 == pairing ? Data(json.utf8) : nil },
      probe: { $0 == ConcivDiscovery.healthURL(for: self.url("http://127.0.0.1:4599")) }
    )
    let endpoint = discoverer.discover()
    XCTAssertEqual(endpoint?.apiBase, url("http://127.0.0.1:4599"))
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

  // Version negotiation (02 D3). With bridgeMin == bridgeMax == 1 the negotiated version
  // is provably 1 for every current peer, so the wire is unchanged; the general min/max
  // rule is pinned for future ranges.
  func testNegotiatedVersionIsOneForCurrentPeers() {
    XCTAssertEqual(BridgeNegotiation.negotiatedVersion(helloMinV: 1, helloMaxV: 1), 1)
  }

  func testNegotiatedVersionPicksTheOverlapMinimum() {
    XCTAssertEqual(BridgeNegotiation.negotiatedVersion(helloMinV: 1, helloMaxV: 3, ourMinV: 1, ourMaxV: 2), 2)
    XCTAssertEqual(BridgeNegotiation.negotiatedVersion(helloMinV: 2, helloMaxV: 4, ourMinV: 1, ourMaxV: 3), 3)
    XCTAssertEqual(BridgeNegotiation.negotiatedVersion(helloMinV: 1, helloMaxV: 2, ourMinV: 2, ourMaxV: 5), 2)
  }

  func testNegotiatedVersionRejectsNonOverlappingRanges() {
    XCTAssertNil(BridgeNegotiation.negotiatedVersion(helloMinV: 2, helloMaxV: 3, ourMinV: 1, ourMaxV: 1))
    XCTAssertNil(BridgeNegotiation.negotiatedVersion(helloMinV: 1, helloMaxV: 1, ourMinV: 2, ourMaxV: 4))
  }
}
