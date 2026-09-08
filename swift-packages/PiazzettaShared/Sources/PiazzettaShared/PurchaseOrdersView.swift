//
//  PurchaseOrdersView.swift
//  PiazzettaOwner
//
//  Ordini d'acquisto verso i fornitori.
//

import SwiftUI

struct PurchaseOrdersView: View {
    @EnvironmentObject private var api: APIClient
    @State private var orders: [PurchaseOrder] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            if orders.isEmpty && !isLoading {
                Text("Nessun ordine d'acquisto").foregroundStyle(.secondary)
            }
            ForEach(orders) { order in
                DisclosureGroup {
                    ForEach(order.items) { item in
                        HStack {
                            Text(item.product.name).font(.caption)
                            Spacer()
                            Text("\(item.packsOrdered) × \(formatted(item.packSize)) \(item.product.unit)")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    HStack {
                        if order.status == "DRAFT" {
                            Button("Invia") { Task { await send(order) } }.adaptiveGlassButton()
                            Button("Annulla", role: .destructive) { Task { await cancel(order) } }
                        }
                    }
                    .padding(.top, 4)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.supplier.name).font(.body.weight(.medium))
                            Text(order.createdAt.formatted(date: .abbreviated, time: .omitted))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text((Double(order.totalCents) / 100.0).formatted(.currency(code: "EUR")))
                            StatusBadge(status: order.status)
                        }
                    }
                }
            }
        }
        .navigationTitle("Acquisti")
        .overlay { if isLoading && orders.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.2f", value)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            orders = try await api.fetchPurchaseOrders()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func send(_ order: PurchaseOrder) async {
        do {
            let updated = try await api.sendPurchaseOrder(id: order.id)
            replace(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func cancel(_ order: PurchaseOrder) async {
        do {
            let updated = try await api.cancelPurchaseOrder(id: order.id)
            replace(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func replace(_ order: PurchaseOrder) {
        if let index = orders.firstIndex(where: { $0.id == order.id }) {
            orders[index] = order
        }
    }
}

private struct StatusBadge: View {
    let status: String

    var color: Color {
        switch status {
        case "RECEIVED": return .green
        case "SENT": return .blue
        case "CANCELLED": return .red
        default: return .secondary
        }
    }

    var body: some View {
        Text(status)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

#Preview {
    NavigationStack { PurchaseOrdersView() }.environmentObject(APIClient.shared)
}
