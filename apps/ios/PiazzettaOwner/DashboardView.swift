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
                    GlassErrorState(message: errorMessage) { Task { await load() } }
                }

                if let kpis = dashboard?.kpis {
                    let revenueSpark = dashboard?.revenueByDay.map { Double($0.revenueCents) } ?? []
                    let ordersSpark = dashboard?.ordersByHour.map { Double($0.count) } ?? []

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                        KPICard(
                            title: "Ricavi", value: currency(kpis.totalRevenueCents),
                            icon: "eurosign.circle.fill", gradient: Brand.accentGradient,
                            deltaPercent: kpis.revenueDeltaPct, sparkline: revenueSpark
                        )
                        KPICard(
                            title: "Ordini", value: "\(kpis.totalOrders)",
                            icon: "receipt", gradient: Brand.successGradient,
                            deltaPercent: kpis.ordersDeltaPct, sparkline: ordersSpark
                        )
                        KPICard(
                            title: "Scontrino medio", value: currency(kpis.avgTicketCents),
                            icon: "chart.bar.fill", gradient: Brand.accentGradient,
                            deltaPercent: nil, sparkline: []
                        )
                        KPICard(
                            title: "Coperti", value: "\(kpis.totalGuests)",
                            icon: "person.2.fill", gradient: Brand.successGradient,
                            deltaPercent: kpis.guestsDeltaPct, sparkline: []
                        )
                    }
                    .entranceTransition()
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 200)
                } else if dashboard == nil && errorMessage == nil {
                    GlassEmptyState(icon: "gauge.with.dots.needle.67percent", title: "Nessun dato disponibile")
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
                            .hoverHighlight(cornerRadius: 14)
                        }
                    }
                    .entranceTransition()
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
                            .hoverHighlight(cornerRadius: 14)
                        }
                    }
                    .entranceTransition()
                }
            }
            .padding()
            .animation(.spring(duration: 0.4), value: dashboard?.kpis.totalOrders)
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
    var gradient: LinearGradient = Brand.accentGradient
    var deltaPercent: Double?
    var sparkline: [Double] = []

    @State private var hovering = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(gradient)
                    .font(.title2)
                    .symbolEffect(.bounce, value: value)
                Spacer()
                DeltaBadge(percent: deltaPercent)
            }
            Text(value).font(.title2.bold())
            Text(title).font(.caption).foregroundStyle(.secondary)
            if sparkline.count > 1 {
                Sparkline(values: sparkline, color: Brand.accent)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassCard(cornerRadius: 18)
        .scaleEffect(hovering ? 1.02 : 1)
        .shadow(color: .black.opacity(hovering ? 0.12 : 0), radius: 10, y: 4)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.15), value: hovering)
    }
}

#Preview {
    NavigationStack { DashboardView() }.environmentObject(APIClient.shared)
}
