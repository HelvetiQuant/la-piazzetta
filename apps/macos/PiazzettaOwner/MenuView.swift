//
//  MenuView.swift
//  PiazzettaOwner
//

import SwiftUI

struct MenuView: View {
    @EnvironmentObject private var api: APIClient
    @State private var products: [MenuProduct] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var search = ""
    @State private var editingProduct: MenuProduct?

    private var grouped: [(String, [MenuProduct])] {
        let filtered = search.isEmpty ? products : products.filter { $0.name.localizedCaseInsensitiveContains(search) }
        let groups = Dictionary(grouping: filtered, by: \.category)
        return groups.sorted { $0.key < $1.key }
    }

    var body: some View {
        List {
            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }
            ForEach(grouped, id: \.0) { category, items in
                Section(categoryLabel(category)) {
                    ForEach(items) { product in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(product.name).font(.body)
                                Text("\(product.code) · \(product.unit)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text((Double(product.priceCents) / 100.0).formatted(.currency(code: "EUR")))
                                .foregroundStyle(Brand.accent)
                            Button {
                                editingProduct = product
                            } label: {
                                Image(systemName: "pencil.circle")
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                        .hoverHighlight()
                        .contentShape(Rectangle())
                        .onTapGesture(count: 2) { editingProduct = product }
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Cerca piatto")
        .navigationTitle("Menu")
        .overlay {
            if isLoading && products.isEmpty { ProgressView() }
            else if products.isEmpty && !isLoading {
                GlassEmptyState(icon: "fork.knife.circle", title: "Nessun piatto in menu")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editingProduct) { product in
            EditPriceSheet(product: product) { updated in
                if let index = products.firstIndex(where: { $0.id == updated.id }) {
                    products[index] = updated
                }
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            products = try await api.fetchMenu()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Etichette italiane per le categorie prodotto, allineate a web-owner (CATEGORY_LABELS).
    private func categoryLabel(_ category: String) -> String {
        let labels: [String: String] = [
            "colazione": "Colazione", "tavola_calda": "Tavola Calda", "bibite": "Bibite",
            "birra": "Birre", "bollicine": "Bollicine", "cocktail": "Cocktail",
            "cocktail_analcolico": "Analcolici", "gin": "Gin", "whisky": "Whisky", "rum": "Rum",
            "primi_piatti": "Primi Piatti", "secondi_piatti": "Secondi Piatti",
            "contorni": "Contorni", "dolci": "Dolci", "varie": "Varie", "generic": "Generale",
        ]
        return labels[category.lowercased()] ?? category.capitalized
    }
}

private struct EditPriceSheet: View {
    let product: MenuProduct
    let onSaved: (MenuProduct) -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var priceText: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(product: MenuProduct, onSaved: @escaping (MenuProduct) -> Void) {
        self.product = product
        self.onSaved = onSaved
        _priceText = State(initialValue: String(format: "%.2f", Double(product.priceCents) / 100.0))
    }

    var body: some View {
        Form {
            Section(product.name) {
                LabeledContent("Codice", value: product.code)
                LabeledContent("Categoria", value: product.category)
                TextField("Prezzo (€)", text: $priceText)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 360, minHeight: 220)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Salva") { Task { await save() } }
                    .disabled(isSaving || Double(priceText.replacingOccurrences(of: ",", with: ".")) == nil)
            }
        }
    }

    private func save() async {
        guard let value = Double(priceText.replacingOccurrences(of: ",", with: ".")) else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            let updated = try await api.updateProductPrice(id: product.id, priceCents: Int((value * 100).rounded()))
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { MenuView() }.environmentObject(APIClient.shared)
}
