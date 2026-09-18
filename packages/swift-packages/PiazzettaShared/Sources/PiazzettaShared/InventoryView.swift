//
//  InventoryView.swift
//  PiazzettaOwner
//
//  Magazzino: giacenze e movimenti.
//

import SwiftUI

struct InventoryView: View {
    @EnvironmentObject private var api: APIClient
    @State private var stock: StockResponse?
    @State private var movements: [StockMovement] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var adjustingItem: StockItem?

    var body: some View {
        List {
            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }
            if let stock, stock.lowCount > 0 {
                Section {
                    Label("\(stock.lowCount) articoli sotto la soglia di riordino", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(Brand.dangerGradient)
                        .symbolEffect(.pulse, options: .repeating, isActive: true)
                }
            }
            Section("Giacenze") {
                if let stock, stock.items.isEmpty {
                    GlassEmptyState(icon: "shippingbox", title: "Nessun articolo in magazzino")
                }
                ForEach(stock?.items ?? []) { item in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.name).font(.body)
                            Text(item.category).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(formatted(item.quantity)) \(item.unit)")
                            .foregroundStyle(item.low ? .orange : .primary)
                        if item.low {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                                .symbolEffect(.bounce, value: item.low)
                        }
                        Button {
                            adjustingItem = item
                        } label: {
                            Image(systemName: "slider.horizontal.3")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                    }
                    .hoverHighlight()
                    .contentShape(Rectangle())
                    .onTapGesture(count: 2) { adjustingItem = item }
                }
            }
            Section("Movimenti recenti") {
                if movements.isEmpty && !isLoading {
                    Text("Nessun movimento registrato").foregroundStyle(.secondary)
                }
                ForEach(movements) { movement in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(movement.product.name).font(.body)
                            Text(movement.type).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(movement.qtyDelta > 0 ? "+" : "")\(formatted(movement.qtyDelta)) \(movement.product.unit)")
                            .foregroundStyle(movement.qtyDelta > 0 ? .green : .red)
                    }
                    .hoverHighlight()
                }
            }
        }
        .navigationTitle("Magazzino")
        .overlay { if isLoading && stock == nil { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $adjustingItem) { item in
            AdjustStockSheet(item: item) { await load() }
        }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.2f", value)
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let stockTask = api.fetchStock()
            async let movementsTask = api.fetchMovements()
            stock = try await stockTask
            movements = try await movementsTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct AdjustStockSheet: View {
    let item: StockItem
    let onChanged: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var type = "ADJUST"
    @State private var qtyText = ""
    @State private var reason = ""
    @State private var reorderText: String
    @State private var parText: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let types = [("IN", "Entrata"), ("OUT", "Uscita"), ("ADJUST", "Rettifica"), ("WASTE", "Scarto")]

    init(item: StockItem, onChanged: @escaping () async -> Void) {
        self.item = item
        self.onChanged = onChanged
        _reorderText = State(initialValue: String(format: "%.0f", item.reorderLevel))
        _parText = State(initialValue: String(format: "%.0f", item.parLevel))
    }

    var body: some View {
        Form {
            Section(item.name) {
                LabeledContent("Giacenza attuale", value: "\(formatted(item.quantity)) \(item.unit)")
            }
            Section("Movimento") {
                Picker("Tipo", selection: $type) {
                    ForEach(types, id: \.0) { value, label in
                        Text(label).tag(value)
                    }
                }
                TextField("Quantità (\(item.unit))", text: $qtyText)
                TextField("Motivo (opzionale)", text: $reason)
                Button("Registra movimento") { Task { await addMovement() } }
                    .adaptiveGlassProminentButton()
                    .disabled(isSaving || Double(qtyText.replacingOccurrences(of: ",", with: ".")) == nil)
            }
            Section("Soglie") {
                TextField("Soglia di riordino", text: $reorderText)
                TextField("Livello obiettivo (par level)", text: $parText)
                Button("Aggiorna soglie") { Task { await updateLevels() } }
                    .adaptiveGlassButton()
                    .disabled(isSaving)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 380, minHeight: 380)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Chiudi") { dismiss() }
            }
        }
    }

    private func formatted(_ value: Double) -> String {
        value.truncatingRemainder(dividingBy: 1) == 0 ? String(Int(value)) : String(format: "%.2f", value)
    }

    private func addMovement() async {
        guard let qty = Double(qtyText.replacingOccurrences(of: ",", with: ".")) else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await api.addMovement(productId: item.productId, type: type, qty: Int(qty), reason: reason.isEmpty ? nil : reason)
            await onChanged()
            qtyText = ""
            reason = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateLevels() async {
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await api.setStockLevels(
                productId: item.productId,
                reorderLevel: Int(reorderText),
                parLevel: Int(parText)
            )
            await onChanged()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { InventoryView() }.environmentObject(APIClient.shared)
}
