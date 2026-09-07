//
//  DashboardView.swift
//  PiazzettaOwner
//

import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var api: APIClient
    @State private var dashboard: DashboardResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var range = "today"

    private let ranges = [("today", "Oggi"), ("week", "Settimana"), ("month", "Mese")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Picker("Periodo", selection: $range) {
                    ForEach(ranges, id: \.0) { value, label in
                        Text(label).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: range) { _, _ in Task { await load() } }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }

                if let kpis = dashboard?.kpis {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                        KPICard(title: "Ricavi", value: currency(kpis.totalRevenueCents), icon: "eurosign.circle.fill")
                        KPICard(title: "Ordini", value: "\(kpis.totalOrders)", icon: "receipt")
                        KPICard(title: "Scontrino medio", value: currency(kpis.avgTicketCents), icon: "chart.bar.fill")
                        KPICard(title: "Coperti", value: "\(kpis.totalGuests)", icon: "person.2.fill")
                    }
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                }

                if let top = dashboard?.topProducts.byQuantity, !top.isEmpty {
                    Text("Top prodotti per quantità").font(.title3.bold())
                    VStack(spacing: 10) {
                        ForEach(top) { product in
                            HStack {
                                Text(product.name)
                                Spacer()
                                Text("\(product.quantity)×").foregroundStyle(.secondary)
                                Text(currency(product.revenueCents)).foregroundStyle(.secondary)
                            }
                            .padding(14)
                            .glassCard(cornerRadius: 14)
                        }
                    }
                }

                if let stations = dashboard?.stationBreakdown, !stations.isEmpty {
                    Text("Per postazione").font(.title3.bold())
                    VStack(spacing: 10) {
                        ForEach(stations) { s in
                            HStack {
                                Text(s.station)
                                Spacer()
                                if let c = s.count { Text("\(c) ordini").foregroundStyle(.secondary) }
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
        .navigationTitle("Dashboard")
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            dashboard = try await api.fetchDashboard(range: range)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func currency(_ cents: Int) -> String {
        let value = Double(cents) / 100.0
        return value.formatted(.currency(code: "EUR"))
    }
}

private struct KPICard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .foregroundStyle(Brand.accent)
                .font(.title2)
            Text(value).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassCard(cornerRadius: 18)
    }
}

#Preview {
    NavigationStack { DashboardView() }.environmentObject(APIClient.shared)
}
