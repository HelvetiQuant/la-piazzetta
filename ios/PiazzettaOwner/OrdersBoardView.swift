//
//  OrdersBoardView.swift
//  PiazzettaOwner
//
//  Comande in corso, per postazione (Bar / Tavola calda).
//

import SwiftUI

struct OrdersBoardView: View {
    @EnvironmentObject private var api: APIClient
    @State private var board: Board?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }
                HStack(alignment: .top, spacing: 20) {
                    BoardColumn(title: "Bar", icon: "cup.and.saucer.fill", orders: board?.BAR ?? [])
                    BoardColumn(title: "Tavola calda", icon: "flame.fill", orders: board?.TAVOLA_CALDA ?? [])
                }
                if isLoading && board == nil {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                }
            }
            .padding()
        }
        .background(Brand.background)
        .navigationTitle("Comande")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            board = try await api.fetchBoard()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct BoardColumn: View {
    let title: String
    let icon: String
    let orders: [BoardOrder]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.title3.bold())
                .foregroundStyle(Brand.accent)
            if orders.isEmpty {
                Text("Nessuna comanda in corso").foregroundStyle(.secondary)
            } else {
                ForEach(orders) { order in
                    OrderCard(order: order)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct OrderCard: View {
    let order: BoardOrder

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Tavolo \(order.table)").font(.headline)
                Spacer()
                Text(waitingLabel)
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(waitingColor.opacity(0.15), in: Capsule())
                    .foregroundStyle(waitingColor)
            }
            ForEach(order.items) { item in
                HStack {
                    Text("\(item.quantity)×").foregroundStyle(.secondary)
                    Text(item.name)
                    Spacer()
                    Text(item.status).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .glassCard(cornerRadius: 14)
    }

    private var waitingLabel: String {
        let m = order.waitingSec / 60
        let s = order.waitingSec % 60
        return String(format: "%d:%02d", m, s)
    }

    private var waitingColor: Color {
        order.waitingSec > 900 ? .red : (order.waitingSec > 480 ? .orange : .green)
    }
}

#Preview {
    NavigationStack { OrdersBoardView() }.environmentObject(APIClient.shared)
}
