//
//  ContentView.swift
//  PiazzettaShared
//
//  Root view con NavigationSplitView (Liquid Glass sidebar).
//  Basato sulla versione macOS (più completa, con AI banner, floating button, SidebarItem).
//

import SwiftUI

enum SidebarItem: String, CaseIterable, Identifiable {
    case server = "Server"
    case dashboard = "Dashboard"
    case board = "Comande"
    case stats = "Tempi"
    case aiAssistant = "Assistente AI"
    case marketing = "Marketing"
    case menu = "Menu"
    case menuAddOns = "Add-on Menu"
    case inventory = "Magazzino"
    case suppliers = "Fornitori"
    case purchases = "Acquisti"
    case staff = "Presenze"
    case schedule = "Orari"
    case chat = "Chat"
    case staffNotes = "Note Staff"
    case payroll = "Stipendi"
    case credit = "Crediti"
    case accounting = "Contabilità"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .server: return "server.rack"
        case .dashboard: return "gauge.with.dots.needle.67percent"
        case .board: return "fork.knife.circle"
        case .stats: return "timer"
        case .aiAssistant: return "sparkles"
        case .marketing: return "megaphone"
        case .menu: return "fork.knife"
        case .menuAddOns: return "sparkles.rectangle.stack"
        case .inventory: return "shippingbox"
        case .suppliers: return "truck.box"
        case .purchases: return "doc.text"
        case .staff: return "clock.badge.checkmark"
        case .schedule: return "calendar"
        case .chat: return "bubble.left.and.bubble.right"
        case .staffNotes: return "note.text.badge.plus"
        case .payroll: return "banknote"
        case .credit: return "creditcard"
        case .accounting: return "eurosign.circle"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject private var api: APIClient
    @EnvironmentObject private var assistant: AIAssistant
    @State private var selectedItem: SidebarItem? = .server
    @State private var showFloatingChat = false

    var body: some View {
        Group {
            if api.isAuthenticated {
                mainContent
            } else if !api.isReady {
                VStack(spacing: 16) {
                    ProgressView()
                        .scaleEffect(1.5)
                    Text("Connessione a La Piazzetta…")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                LoginView()
            }
        }
        .animation(.default, value: api.isAuthenticated)
    }

    private var mainContent: some View {
        NavigationSplitView {
            // Sidebar con Liquid Glass
            List(SidebarItem.allCases, selection: $selectedItem) { item in
                Label(item.rawValue, systemImage: item.icon)
                    .tag(item)
                    .symbolEffect(.bounce, value: selectedItem == item)
            }
            .navigationTitle("La Piazzetta")
            #if os(macOS)
            .frame(minWidth: 200)
            #endif
        } detail: {
            ZStack(alignment: .bottomTrailing) {
                VStack(spacing: 0) {
                    // Banner suggerimento AI: discreto, mai modale, scorre via se ignorato.
                    AISuggestionBanner(showChat: $showFloatingChat)

                    detailContent
                }

                // Pulsante flottante per aprire rapidamente la chat AI da qualsiasi sezione,
                // tranne quando siamo già nella sezione Assistente AI.
                if selectedItem != .aiAssistant {
                    AIFloatingButton(isPresented: $showFloatingChat)
                        .padding(24)
                }
            }
        }
        #if os(macOS)
        .popover(isPresented: $showFloatingChat, arrowEdge: .trailing) {
            AIChatView(activeSection: selectedItem?.rawValue ?? "Dashboard")
        }
        #else
        .sheet(isPresented: $showFloatingChat) {
            AIChatView(activeSection: selectedItem?.rawValue ?? "Dashboard")
        }
        #endif
        .task {
            await assistant.loadPreferences(api: api)
        }
        .task(id: selectedItem) {
            await assistant.loadSuggestion(section: selectedItem?.rawValue ?? "Dashboard", api: api)
        }
    }

    @ViewBuilder
    private var detailContent: some View {
        Group {
            switch selectedItem {
            case .server:
                ServerStatusView()
            case .dashboard:
                DashboardView()
            case .board:
                OrdersBoardView()
            case .stats:
                PrepTimeStatsView()
            case .aiAssistant:
                AIChatView(activeSection: "Assistente AI")
            case .marketing:
                MarketingView()
            case .menu:
                MenuView()
            case .menuAddOns:
                MenuAddOnsView()
            case .inventory:
                InventoryView()
            case .suppliers:
                SuppliersView()
            case .purchases:
                PurchaseOrdersView()
            case .staff:
                ShiftsView()
            case .schedule:
                ScheduleView()
            case .chat:
                ChatView()
            case .staffNotes:
                StaffNotesView()
            case .payroll:
                PayrollView()
            case .credit:
                CreditView()
            case .accounting:
                AccountingView()
            case .none:
                DashboardView()
            }
        }
        .transition(.opacity.combined(with: .move(edge: .trailing)))
        .animation(.easeInOut(duration: 0.25), value: selectedItem)
    }
}

#Preview {
    ContentView()
        .environmentObject(APIClient.shared)
        .environmentObject(AIAssistant.shared)
}
