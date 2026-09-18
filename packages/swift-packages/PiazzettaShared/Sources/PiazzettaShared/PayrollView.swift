//
//  PayrollView.swift
//  PiazzettaOwner
//
//  Stipendi: riepilogo periodo e cedolini staff.
//

import SwiftUI

struct PayrollView: View {
    @EnvironmentObject private var api: APIClient
    @State private var entries: [PayrollEntry] = []
    @State private var summary: PayrollSummary?
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }
                if let summary {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                        StatCard(title: "Netto totale", value: currency(summary.totalNetCents))
                        StatCard(title: "Lordo totale", value: currency(summary.totalGrossCents))
                        StatCard(title: "Ore totali", value: String(format: "%.1f h", summary.totalHours))
                        StatCard(title: "Cedolini", value: "\(summary.count)")
                    }
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                }

                if !entries.isEmpty {
                    Text("Cedolini").font(.title3.bold())
                    VStack(spacing: 10) {
                        ForEach(entries) { entry in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.user.name).font(.body.weight(.medium))
                                    Text("\(entry.periodStart.formatted(date: .abbreviated, time: .omitted)) – \(entry.periodEnd.formatted(date: .abbreviated, time: .omitted))")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text(currency(entry.netPayCents)).font(.body.bold()).foregroundStyle(Brand.accent)
                                    Text(entry.status).font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            .padding(14)
                            .glassCard(cornerRadius: 14)
                        }
                    }
                }
            }
            .padding()
        }
        .background(Brand.background)
        .navigationTitle("Stipendi")
        .task { await load() }
        .refreshable { await load() }
    }

    private func currency(_ cents: Int) -> String {
        (Double(cents) / 100.0).formatted(.currency(code: "EUR"))
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let entriesTask = api.fetchPayroll()
            async let summaryTask = api.fetchPayrollSummary()
            entries = try await entriesTask
            summary = try await summaryTask
        } catch {
            errorMessage = error.localizedDescription
        }
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
    NavigationStack { PayrollView() }.environmentObject(APIClient.shared)
}
