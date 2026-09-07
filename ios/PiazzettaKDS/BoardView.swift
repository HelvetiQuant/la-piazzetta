//
//  BoardView.swift
//  PiazzettaKDS
//
//  Board KDS a colonne: Nuovo → In preparazione → Pronto → Servito.
//

import SwiftUI

private struct Row: Identifiable {
    let id: String
    let table: String
    let placedAt: Date
    var item: BoardItem
}

struct BoardView: View {
    let station: Station
    let onChangeStation: () -> Void

    @EnvironmentObject private var api: APIClient
    @State private var rows: [Row] = []
    @State private var errorMessage: String?
    @State private var isLoading = false

    private let poll = Timer.publish(every: 6, on: .main, in: .common).autoconnect()
    private let columns: [OrderItemStatus] = [.sent, .inPreparation, .ready, .served]

    var body: some View {
        VStack(spacing: 0) {
            header

            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote).padding()
            }

            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    ForEach(columns, id: \.self) { column in
                        columnView(column)
                    }
                }
                .padding(16)
            }
        }
        .background(Color.black.ignoresSafeArea())
        .task { await load() }
        .refreshable { await load() }
        .onReceive(poll) { _ in Task { await load() } }
    }

    private var header: some View {
        HStack {
            Text("\(station.emoji) \(station.label)")
                .font(.title2.bold())
                .foregroundStyle(.white)
            Spacer()
            if isLoading { ProgressView().tint(.white) }
            Button("Cambia postazione", action: onChangeStation)
                .adaptiveGlassButton()
                .foregroundStyle(.white)
        }
        .padding()
        .background(.black)
    }

    private func columnView(_ status: OrderItemStatus) -> some View {
        let items = rows.filter { $0.item.status == status.rawValue }
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(status.column)
                    .font(.headline)
                    .foregroundStyle(.white)
                Text("\(items.count)")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 2)
                    .background(Brand.accent, in: Capsule())
                    .foregroundStyle(.white)
            }
            ForEach(items) { row in
                OrderCardView(table: row.table, item: row.item, placedAt: row.placedAt) {
                    Task { await advance(row) }
                }
            }
        }
        .frame(width: 280, alignment: .top)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await api.fetchBoard(station: station)
            rows = response.orders.flatMap { order in
                order.items.map { Row(id: $0.id, table: order.table, placedAt: order.placedAt, item: $0) }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func advance(_ row: Row) async {
        guard let current = OrderItemStatus(rawValue: row.item.status), let next = current.next else { return }
        if let index = rows.firstIndex(where: { $0.id == row.id }) {
            rows[index].item.status = next.rawValue
        }
        do {
            _ = try await api.advanceItem(id: row.id, to: next)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    BoardView(station: .bar, onChangeStation: {}).environmentObject(APIClient.shared)
}
