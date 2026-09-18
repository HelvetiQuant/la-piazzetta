//
//  PrepTimeStatsView.swift
//  PiazzettaOwner
//
//  Tempi di attesa, preparazione e consegna, per postazione/categoria/prodotto.
//

import SwiftUI

struct PrepTimeStatsView: View {
    @EnvironmentObject private var api: APIClient
    @State private var stats: PrepTimeStats?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var groupBy = "station"

    private let groupings = [("station", "Postazione"), ("category", "Categoria"), ("product", "Prodotto")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Picker("Raggruppa per", selection: $groupBy) {
                    ForEach(groupings, id: \.0) { value, label in
                        Text(label).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: groupBy) { _, _ in Task { await load() } }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }

                if let delivery = stats?.delivery {
                    HStack(spacing: 16) {
                        StatCard(title: "Consegna media", value: fmtSec(delivery.avgSec))
                        StatCard(title: "Mediana", value: fmtSec(delivery.medianSec))
                        StatCard(title: "P90", value: fmtSec(delivery.p90Sec))
                        StatCard(title: "Ordini", value: "\(delivery.count)")
                    }
                }

                if let groups = stats?.groups, !groups.isEmpty {
                    Text("Dettaglio").font(.title3.bold())
                    VStack(spacing: 10) {
                        ForEach(groups) { group in
                            HStack {
                                Text(group.label).font(.body.weight(.medium))
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text("Coda \(fmtSec(group.queue.avgSec))").font(.caption).foregroundStyle(.secondary)
                                    Text("Prep \(fmtSec(group.prep.avgSec))").font(.caption).foregroundStyle(.secondary)
                                }
                                Text(fmtSec(group.stationTotal.avgSec))
                                    .font(.body.bold())
                                    .foregroundStyle(Brand.accent)
                            }
                            .padding(14)
                            .glassCard(cornerRadius: 14)
                        }
                    }
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                }
            }
            .padding()
        }
        .background(Brand.background)
        .navigationTitle("Tempi")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            stats = try await api.fetchPrepStats(groupBy: groupBy)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func fmtSec(_ sec: Double?) -> String {
        guard let sec else { return "—" }
        let m = Int(sec) / 60
        let s = Int(sec) % 60
        return String(format: "%d:%02d", m, s)
    }
}

private struct StatCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(value).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassCard(cornerRadius: 18)
    }
}

#Preview {
    NavigationStack { PrepTimeStatsView() }.environmentObject(APIClient.shared)
}
