import SwiftUI
import UIKit

// A believable consumer payments screen: a balance header, a list of recent payment
// rows (UIKit PaymentCardCell, pickable out of the box), and a subscriptions section
// rendered in SwiftUI with .concivGrab(id:) anchors so the anchored-pick path is
// demonstrable too.
final class PaymentsViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()

    view.backgroundColor = .systemBackground
    title = "Payments"
    navigationController?.navigationBar.prefersLargeTitles = true

    let scroll = UIScrollView()
    scroll.translatesAutoresizingMaskIntoConstraints = false
    scroll.alwaysBounceVertical = true
    view.addSubview(scroll)

    let content = UIStackView()
    content.axis = .vertical
    content.spacing = 12
    content.isLayoutMarginsRelativeArrangement = true
    content.layoutMargins = UIEdgeInsets(top: 16, left: 16, bottom: 40, right: 16)
    content.translatesAutoresizingMaskIntoConstraints = false
    scroll.addSubview(content)

    content.addArrangedSubview(makeBalanceHeader())
    content.setCustomSpacing(24, after: content.arrangedSubviews[0])

    content.addArrangedSubview(makeSectionTitle("Recent"))
    for card in Self.sampleCards() {
      content.addArrangedSubview(PaymentCardCell(merchant: card.merchant, detail: card.detail, amount: card.amount, tint: card.tint))
    }

    content.addArrangedSubview(makeSectionTitle("Subscriptions"))
    content.addArrangedSubview(makeSubscriptionsSection())

    NSLayoutConstraint.activate([
      scroll.topAnchor.constraint(equalTo: view.topAnchor),
      scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor),
      content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor),
      content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor),
      content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor),
      content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor),
    ])
  }

  private func makeBalanceHeader() -> UIView {
    let card = UIView()
    card.backgroundColor = UIColor(red: 0.16, green: 0.20, blue: 0.42, alpha: 1)
    card.layer.cornerRadius = 20

    let caption = UILabel()
    caption.text = "Available balance"
    caption.font = .systemFont(ofSize: 14, weight: .medium)
    caption.textColor = UIColor.white.withAlphaComponent(0.75)

    let amount = UILabel()
    amount.text = "$4,820.55"
    amount.font = .systemFont(ofSize: 36, weight: .bold)
    amount.textColor = .white

    let stack = UIStackView(arrangedSubviews: [caption, amount])
    stack.axis = .vertical
    stack.spacing = 6
    stack.translatesAutoresizingMaskIntoConstraints = false
    card.addSubview(stack)

    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
      stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),
      stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 22),
      stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -22),
    ])
    return card
  }

  private func makeSectionTitle(_ text: String) -> UILabel {
    let label = UILabel()
    label.text = text
    label.font = .systemFont(ofSize: 20, weight: .bold)
    label.textColor = .label
    return label
  }

  private func makeSubscriptionsSection() -> UIView {
    let host = UIHostingController(rootView: SubscriptionsView())
    host.view.backgroundColor = .clear
    host.view.translatesAutoresizingMaskIntoConstraints = false
    addChild(host)
    host.didMove(toParent: self)
    return host.view
  }

  private struct PaymentSample {
    let merchant: String
    let detail: String
    let amount: String
    let tint: UIColor
  }

  private static func sampleCards() -> [PaymentSample] {
    [
      PaymentSample(merchant: "Whole Foods", detail: "Today, 9:41 AM", amount: "-$64.20", tint: .systemGreen),
      PaymentSample(merchant: "Shell", detail: "Yesterday", amount: "-$48.10", tint: .systemYellow),
      PaymentSample(merchant: "Payroll", detail: "Mon, direct deposit", amount: "+$2,400.00", tint: .systemBlue),
      PaymentSample(merchant: "Delta", detail: "Sat, flight SFO-JFK", amount: "-$312.99", tint: .systemRed),
      PaymentSample(merchant: "Amazon", detail: "Fri, order #7741", amount: "-$29.99", tint: .systemOrange),
    ]
  }
}

// SwiftUI subscriptions section. Each row opts into the native grab with
// .concivGrab(id:label:); unanchored SwiftUI content is not pickable by design.
struct SubscriptionsView: View {
  var body: some View {
    VStack(spacing: 12) {
      subscriptionRow(name: "iCloud+", plan: "200 GB storage", amount: "$2.99")
        .concivGrab(id: "sub-icloud", label: "iCloud+ subscription")
      subscriptionRow(name: "Spotify", plan: "Premium, monthly", amount: "$10.99")
        .concivGrab(id: "sub-spotify", label: "Spotify subscription")
    }
  }

  private func subscriptionRow(name: String, plan: String, amount: String) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(name).font(.system(size: 17, weight: .semibold))
        Text(plan).font(.system(size: 14)).foregroundStyle(.secondary)
      }
      Spacer()
      Text(amount).font(.system(size: 17, weight: .bold))
    }
    .padding(16)
    .background(Color(.secondarySystemBackground))
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }
}
