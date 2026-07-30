import UIKit

// A single payment row: a colored merchant chip, the merchant name and a subtitle,
// and the amount on the trailing edge. This is the UIKit view the native grab picks
// up by hit-testing; grep for "class PaymentCardCell" to find and edit it.
final class PaymentCardCell: UIView {
  init(merchant: String, detail: String, amount: String, tint: UIColor) {
    super.init(frame: .zero)

    backgroundColor = .secondarySystemBackground
    layer.cornerRadius = 16
    accessibilityIdentifier = "payment-row-\(merchant.lowercased())"

    let chip = UILabel()
    chip.text = String(merchant.prefix(1))
    chip.font = .systemFont(ofSize: 18, weight: .bold)
    chip.textColor = .systemBlue
    chip.textAlignment = .center
    chip.backgroundColor = tint
    chip.layer.cornerRadius = 22
    chip.clipsToBounds = true
    chip.translatesAutoresizingMaskIntoConstraints = false

    let merchantLabel = UILabel()
    merchantLabel.text = merchant
    merchantLabel.font = .systemFont(ofSize: 17, weight: .semibold)
    merchantLabel.textColor = .label

    let detailLabel = UILabel()
    detailLabel.text = detail
    detailLabel.font = .systemFont(ofSize: 14)
    detailLabel.textColor = .secondaryLabel

    let amountLabel = UILabel()
    amountLabel.text = amount
    amountLabel.font = .systemFont(ofSize: 17, weight: .bold)
    amountLabel.textColor = amount.hasPrefix("+") ? .systemGreen : .label
    amountLabel.textAlignment = .right
    amountLabel.setContentHuggingPriority(.required, for: .horizontal)
    amountLabel.setContentCompressionResistancePriority(.required, for: .horizontal)

    let textStack = UIStackView(arrangedSubviews: [merchantLabel, detailLabel])
    textStack.axis = .vertical
    textStack.spacing = 2

    let row = UIStackView(arrangedSubviews: [chip, textStack, amountLabel])
    row.axis = .horizontal
    row.alignment = .center
    row.spacing = 14
    row.translatesAutoresizingMaskIntoConstraints = false
    addSubview(row)

    NSLayoutConstraint.activate([
      chip.widthAnchor.constraint(equalToConstant: 44),
      chip.heightAnchor.constraint(equalToConstant: 44),
      row.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
      row.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -16),
      row.topAnchor.constraint(equalTo: topAnchor, constant: 14),
      row.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -14),
    ])
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}
