//
//  TablesView.swift
//  PiazzettaWaiter
//
//  Sala: lista tavoli, con notifica lampeggiante quando un ordine è pronto.
//

import SwiftUI

struct TablesView: View {
    @EnvironmentObject private var api: APIClient
    @State private var tables: [RestaurantTable] = []
    @State private var readyTableNames: Set<String> = []
    @State private var errorMessage: String?
    @State private var isLoading = false
    @State private var blink = false

    private let poll = Timer.publish(every: 8, on: .main, in: .common).autoconnect()
    private let blinkTimer = Timer.publish(every: 0.6, on: .main, in: .common).autoconnect()

    private let columns = [GridItem(.adaptive(minimum: 150), spacing: 14)]

    var body: some View {
        ScrollView {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote).padding(.horizontal)
            }
            LazyVGrid(columns: columns, spacing: 14) {
                ForEach(tables) { table in
                    TableCard(table: table, isReady: readyTableNames.contains(table.name), blink: blink)
                }
            }
            .padding()
        }
        .background(Brand.background)
        .navigationTitle("Sala")
        .overlay { if isLoading && tables.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .onReceive(poll) { _ in Task { await refreshBoard() } }
        .onReceive(blinkTimer) { _ in blink.toggle() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let tablesTask = api.fetchTables()
            async let boardTask = api.fetchBoard()
            tables = try await tablesTask
            readyTableNames = try await boardTask.readyTableNames
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func refreshBoard() async {
        do {
            readyTableNames = try await api.fetchBoard().readyTableNames
        } catch {
            // Silenzioso: il polling non deve interrompere la vista.
        }
    }
}

private struct TableCard: View {
    let table: RestaurantTable
    let isReady: Bool
    let blink: Bool

    private var isOccupied: Bool { table.state == "OCCUPIED" }

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: isOccupied ? "person.2.fill" : "checkmark.circle")
                .font(.title)
                .foregroundStyle(isOccupied ? Brand.accent : .secondary)
            Text(table.name).font(.headline)
            Text("\(table.seats) posti").font(.caption).foregroundStyle(.secondary)

            if isReady {
                Text("Ordine pronto!")
                    .font(.caption.bold())
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(.orange, in: Capsule())
                    .foregroundStyle(.white)
                    .opacity(blink ? 1 : 0.35)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: 130)
        .glassCard(cornerRadius: 20)
        .overlay {
            if isReady {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(.orange, lineWidth: blink ? 3 : 0)
            }
        }
    }
}

#Preview {
    NavigationStack { TablesView() }.environmentObject(APIClient.shared)
}
