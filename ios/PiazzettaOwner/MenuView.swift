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

    private var grouped: [(String, [MenuProduct])] {
        let filtered = search.isEmpty ? products : products.filter { $0.name.localizedCaseInsensitiveContains(search) }
        let groups = Dictionary(grouping: filtered, by: \.category)
        return groups.sorted { $0.key < $1.key }
    }

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            ForEach(grouped, id: \.0) { category, items in
                Section(category) {
                    ForEach(items) { product in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(product.name).font(.body)
                                Text("\(product.code) · \(product.unit)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text((Double(product.priceCents) / 100.0).formatted(.currency(code: "EUR")))
                                .foregroundStyle(Brand.accent)
                        }
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "Cerca piatto")
        .navigationTitle("Menu")
        .overlay {
            if isLoading && products.isEmpty { ProgressView() }
            else if products.isEmpty && !isLoading { ContentUnavailableFallback() }
        }
        .task { await load() }
        .refreshable { await load() }
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
}

/// `ContentUnavailableView` esiste da iOS 17: qui un piccolo fallback testuale.
private struct ContentUnavailableFallback: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "fork.knife.circle").font(.largeTitle).foregroundStyle(.secondary)
            Text("Nessun piatto in menu").foregroundStyle(.secondary)
        }
    }
}

#Preview {
    NavigationStack { MenuView() }.environmentObject(APIClient.shared)
}
