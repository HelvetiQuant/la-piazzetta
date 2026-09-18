//
//  OrderCardView.swift
//  PiazzettaKDS
//
//  Card di una riga ordine: timer, note, emoji categoria, azione di bump.
//

import SwiftUI

struct OrderCardView: View {
    let table: String
    let item: BoardItem
    let placedAt: Date
    let onAdvance: () -> Void

    @State private var now = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var elapsedMinutes: Int { max(0, Int(now.timeIntervalSince(placedAt)) / 60) }
    private var isLate: Bool { elapsedMinutes >= 10 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(item.categoryEmoji).font(.title2)
                VStack(alignment: .leading) {
                    Text(table).font(.caption.bold()).foregroundStyle(Brand.accent)
                    Text(item.name).font(.headline).foregroundStyle(.white)
                }
                Spacer()
                Text("x\(item.quantity)")
                    .font(.headline)
                    .foregroundStyle(.white)
            }

            if let notes = item.notes, !notes.isEmpty {
                Text(notes)
                    .font(.caption)
                    .foregroundStyle(.yellow)
                    .lineLimit(2)
            }

            HStack {
                Label("\(elapsedMinutes) min", systemImage: "clock")
                    .font(.caption.bold())
                    .foregroundStyle(isLate ? .red : .white.opacity(0.7))
                Spacer()
                if let status = OrderItemStatus(rawValue: item.status), status.next != nil {
                    Button(action: onAdvance) {
                        Text(actionLabel(for: status))
                            .font(.caption.bold())
                    }
                    .adaptiveGlassProminentButton()
                    .tint(Brand.accent)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard(cornerRadius: 18)
        .overlay {
            if isLate {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(.red, lineWidth: 2)
            }
        }
        .onReceive(timer) { now = $0 }
    }

    private func actionLabel(for status: OrderItemStatus) -> String {
        switch status {
        case .sent: return "Inizia"
        case .inPreparation: return "Pronto"
        case .ready: return "Servito"
        case .served: return ""
        }
    }
}

#Preview {
    OrderCardView(
        table: "Tavolo 4",
        item: BoardItem(id: "1", name: "Spritz", quantity: 2, notes: "Senza ghiaccio", preparation: nil, station: "BAR", status: "SENT"),
        placedAt: Date().addingTimeInterval(-660),
        onAdvance: {}
    )
    .padding()
    .background(Color.black)
}
