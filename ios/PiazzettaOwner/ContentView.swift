//
//  ContentView.swift
//  PiazzettaOwner
//
//  Root view: mostra il login oppure la NavigationSplitView principale
//  con tutte le 18 sezioni del owner (parità con macOS).
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var api: APIClient

    var body: some View {
        Group {
            if api.isAuthenticated {
                MainSplitView()
            } else if !api.isReady {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Connessione a La Piazzetta…")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Brand.background)
            } else {
                LoginView()
            }
        }
        .animation(.default, value: api.isAuthenticated)
    }
}

// MARK: - Main Split View (18 sezioni)

struct MainSplitView: View {
    @State private var selectedSection: OwnerSection? = .dashboard

    var body: some View {
        NavigationSplitView {
            List(OwnerSection.allCases, selection: $selectedSection) { section in
                NavigationLink(value: section) {
                    Label(section.title, systemImage: section.icon)
                        .foregroundStyle(section == .aiAssistant ? Brand.accent : .primary)
                }
            }
            .listStyle(.sidebar)
            .navigationTitle("La Piazzetta")
            .navigationBarTitleDisplayMode(.inline)
        } detail: {
            if let section = selectedSection {
                NavigationStack {
                    sectionView(for: section)
                        .navigationTitle(section.title)
                        .navigationBarTitleDisplayMode(.inline)
                }
            } else {
                Text("Seleziona una sezione")
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func sectionView(for section: OwnerSection) -> some View {
        switch section {
        case .server:        ServerStatusView()
        case .dashboard:     DashboardView()
        case .orders:        OrdersBoardView()
        case .prepTimes:     PrepTimeStatsView()
        case .marketing:     MarketingView()
        case .menu:          MenuView()
        case .menuAddOns:    MenuAddOnsView()
        case .inventory:     InventoryView()
        case .suppliers:     SuppliersView()
        case .purchases:     PurchaseOrdersView()
        case .shifts:        ShiftsView()
        case .schedule:      ScheduleView()
        case .chat:          ChatView()
        case .staffNotes:    StaffNotesView()
        case .payroll:       PayrollView()
        case .credits:       CreditView()
        case .accounting:    AccountingView()
        case .aiAssistant:   AIChatView()
        }
    }
}

// MARK: - Owner Sections

enum OwnerSection: String, CaseIterable, Identifiable {
    case server, dashboard, orders, prepTimes, marketing, menu, menuAddOns
    case inventory, suppliers, purchases, shifts, schedule, chat, staffNotes
    case payroll, credits, accounting, aiAssistant

    var id: String { rawValue }

    var title: String {
        switch self {
        case .server:       return "Server"
        case .dashboard:    return "Dashboard"
        case .orders:       return "Comande"
        case .prepTimes:    return "Tempi"
        case .marketing:    return "Marketing"
        case .menu:         return "Menu"
        case .menuAddOns:   return "Add-on Menu"
        case .inventory:    return "Magazzino"
        case .suppliers:    return "Fornitori"
        case .purchases:    return "Acquisti"
        case .shifts:       return "Presenze"
        case .schedule:     return "Orari"
        case .chat:         return "Chat"
        case .staffNotes:   return "Note Staff"
        case .payroll:      return "Stipendi"
        case .credits:      return "Crediti"
        case .accounting:   return "Contabilità"
        case .aiAssistant:  return "Assistente AI"
        }
    }

    var icon: String {
        switch self {
        case .server:       return "server.rack"
        case .dashboard:    return "chart.bar.fill"
        case .orders:       return "list.clipboard"
        case .prepTimes:    return "clock.fill"
        case .marketing:    return "megaphone.fill"
        case .menu:         return "fork.knife"
        case .menuAddOns:   return "sparkles.rectangle.stack"
        case .inventory:    return "shippingbox.fill"
        case .suppliers:    return "truck.box.fill"
        case .purchases:    return "cart.fill"
        case .shifts:       return "clock.badge.checkmark.fill"
        case .schedule:     return "calendar"
        case .chat:         return "bubble.left.and.bubble.right.fill"
        case .staffNotes:   return "note.text.badge.plus"
        case .payroll:      return "banknote.fill"
        case .credits:      return "creditcard.fill"
        case .accounting:   return "doc.text.fill"
        case .aiAssistant:  return "sparkles"
        }
    }
}

#Preview {
    ContentView().environmentObject(APIClient.shared)
}
