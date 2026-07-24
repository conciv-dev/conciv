import Foundation

// Deterministic dev-core discovery (06 M5). Foundation-only so the pure logic runs
// under the macOS-host `swift test` job; the URLSession prober and the re-pair UI
// live in the UIKit-guarded files. The core writes ~/.conciv/dev-endpoint.json
// (packages/core/src/lib/dev-endpoint.ts); the simulator shares the host filesystem
// so a paired endpoint is read directly. `apiBase` in that file already carries the
// /t/<token> prefix when the core minted an access token, so the WebView loads
// apiBase/native token-scoped and RPC/SSE are path-scoped with zero extra work.

public struct ConcivEndpoint: Equatable {
  public let apiBase: URL
  public let token: String?
  public let pid: Int?

  public init(apiBase: URL, token: String?, pid: Int?) {
    self.apiBase = apiBase
    self.token = token
    self.pid = pid
  }
}

// Codable mirror of the pairing file written by the core. Extra keys are ignored so
// the file format can grow additively without bricking an older SDK.
struct DevEndpointFile: Codable {
  let apiBase: String
  let token: String?
  let pid: Int
}

public enum ConcivDiscovery {
  // The ios dev loop pins this port (documented default). Probed first so the common
  // pinned-port case resolves in one attempt; the rest cover a moved port.
  public static let defaultPort = 4599
  public static let candidatePorts = [4599, 8787, 3000]

  public static func parsePairingFile(_ data: Data) -> ConcivEndpoint? {
    guard let file = try? JSONDecoder().decode(DevEndpointFile.self, from: data),
          !file.apiBase.isEmpty,
          let url = URL(string: file.apiBase)
    else { return nil }
    return ConcivEndpoint(apiBase: url, token: file.token, pid: file.pid)
  }

  // The WebView loads the native page under the (possibly token-scoped) apiBase.
  public static func pageURL(for apiBase: URL) -> URL {
    apiBase.appendingPathComponent("native")
  }

  // Health check mirrors probeCore (packages/extensions/try-it/src/shared/probe.ts):
  // GET apiBase/health, token-scoped when apiBase carries /t/<token>.
  public static func healthURL(for apiBase: URL) -> URL {
    apiBase.appendingPathComponent("health")
  }

  // Origin pin stays scheme://host:port regardless of the /t/<token> path.
  public static func origin(of apiBase: URL) -> String {
    guard let scheme = apiBase.scheme, let host = apiBase.host else { return apiBase.absoluteString }
    if let port = apiBase.port { return "\(scheme)://\(host):\(port)" }
    return "\(scheme)://\(host)"
  }

  public static func candidateBases(ports: [Int] = candidatePorts) -> [URL] {
    ports.compactMap { URL(string: "http://127.0.0.1:\($0)") }
  }

  // A 401/404 on the token-scoped base means the token is stale: the whole app moved
  // to a new /t/<newtoken> mount (06 D13), so the old prefix no longer resolves.
  public static func isStaleToken(status: Int) -> Bool {
    status == 401 || status == 404
  }

  // Same-core discriminator is the pairing-file pid: the pid is always present (token
  // is null on pure loopback), and an unchanged pid means the same core process is
  // still alive, so a re-point (handshake rebind, D8) is correct. A changed pid is a
  // different process, which is a fresh mount, never a rebind.
  public static func isSameCore(previous: ConcivEndpoint?, discovered: ConcivEndpoint) -> Bool {
    guard let previousPid = previous?.pid, let discoveredPid = discovered.pid else { return false }
    return previousPid == discoveredPid
  }

  // The simulator exposes the host home via SIMULATOR_HOST_HOME; fall back to the
  // process home so the pure default is still meaningful off-simulator.
  public static func defaultPairingFileURL(
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> URL {
    let home = environment["SIMULATOR_HOST_HOME"] ?? NSHomeDirectory()
    return URL(fileURLWithPath: home)
      .appendingPathComponent(".conciv")
      .appendingPathComponent("dev-endpoint.json")
  }
}

// A pure discovery pass over injectable seams: a file reader (the pairing file) and a
// health probe. Prefers the pairing file when its base is healthy, else races a short
// candidate-port list, mirroring probeCore. The runtime injects a FileManager reader
// and a URLSession probe; the macOS-host tests inject fakes.
public struct ConcivDiscoverer {
  public typealias FileReader = (URL) -> Data?
  public typealias HealthProbe = (URL) -> Bool

  let pairingFileURL: URL
  let candidatePorts: [Int]
  let readFile: FileReader
  let probe: HealthProbe

  public init(
    pairingFileURL: URL,
    candidatePorts: [Int] = ConcivDiscovery.candidatePorts,
    readFile: @escaping FileReader,
    probe: @escaping HealthProbe
  ) {
    self.pairingFileURL = pairingFileURL
    self.candidatePorts = candidatePorts
    self.readFile = readFile
    self.probe = probe
  }

  public func discover() -> ConcivEndpoint? {
    if let data = readFile(pairingFileURL),
       let endpoint = ConcivDiscovery.parsePairingFile(data),
       probe(ConcivDiscovery.healthURL(for: endpoint.apiBase)) {
      return endpoint
    }
    for base in ConcivDiscovery.candidateBases(ports: candidatePorts) where probe(ConcivDiscovery.healthURL(for: base)) {
      return ConcivEndpoint(apiBase: base, token: nil, pid: nil)
    }
    return nil
  }
}
