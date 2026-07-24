#if canImport(UIKit)
import Foundation

// Runtime seams for ConcivDiscoverer: a FileManager-backed reader for the pairing
// file and a synchronous URLSession /health probe. Kept out of Discovery.swift so the
// pure logic stays Foundation-host-testable with no live network. All DEBUG-only via
// the callers; the blocking discover() runs off the main thread.

enum ConcivDiscoveryRuntime {
  static let probeTimeout: TimeInterval = 1.5

  static func readPairingFile(_ url: URL) -> Data? {
    try? Data(contentsOf: url)
  }

  static func probeHealth(_ url: URL) -> Bool {
    var request = URLRequest(url: url)
    request.timeoutInterval = probeTimeout
    request.cachePolicy = .reloadIgnoringLocalCacheData
    let semaphore = DispatchSemaphore(value: 0)
    var healthy = false
    let task = URLSession.shared.dataTask(with: request) { _, response, _ in
      if let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) {
        healthy = true
      }
      semaphore.signal()
    }
    task.resume()
    _ = semaphore.wait(timeout: .now() + probeTimeout + 0.5)
    return healthy
  }

  static func makeDiscoverer() -> ConcivDiscoverer {
    ConcivDiscoverer(
      pairingFileURL: ConcivDiscovery.defaultPairingFileURL(),
      readFile: readPairingFile,
      probe: probeHealth
    )
  }

  static func discover(using discoverer: ConcivDiscoverer, completion: @escaping (ConcivEndpoint?) -> Void) {
    DispatchQueue.global(qos: .userInitiated).async {
      let endpoint = discoverer.discover()
      DispatchQueue.main.async { completion(endpoint) }
    }
  }
}
#endif
