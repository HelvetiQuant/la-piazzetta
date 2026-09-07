//
//  ContentView.swift
//  PiazzettaWaiter
//
//  Root view: login PIN → clock-in con selezione ruolo → tab principali
//  (Turno, Sala, Chat) con stile Liquid Glass.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var api: APIClient
    @State private var isLoadingShift = true

    var body: some View {
        Group {
            if !api.isAuthenticated {
                LoginView()
            } else if isLoadingShift {
                ProgressView().task { await loadShift() }
            } else if api.activeShift == nil {
                ClockInView()
            } else {
                MainTabView()
            }
        }
        .animation(.default, value: api.isAuthenticated)
        .onChange(of: api.isAuthenticated) { _, authenticated in
            if authenticated { isLoadingShift = true }
        }
    }

    private func loadShift() async {
        defer { isLoadingShift = false }
        api.activeShift = try? await api.fetchMyShift()
    }
}

struct MainTabView: View {
    var body: some View {
        if #available(iOS 18.0, *) {
            TabView {
                Tab("Turno", systemImage: "clock.fill") {
                    NavigationStack { ShiftActiveView() }
                }
                Tab("Sala", systemImage: "table.furniture") {
                    NavigationStack { TablesView() }
                }
                Tab("Chat", systemImage: "bubble.left.and.bubble.right") {
                    NavigationStack { ChatView() }
                }
            }
            .tabViewStyle(.sidebarAdaptable)
        } else {
            TabView {
                NavigationStack { ShiftActiveView() }
                    .tabItem { Label("Turno", systemImage: "clock.fill") }
                NavigationStack { TablesView() }
                    .tabItem { Label("Sala", systemImage: "table.furniture") }
                NavigationStack { ChatView() }
                    .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
            }
        }
    }
}

#Preview {
    ContentView().environmentObject(APIClient.shared)
}
