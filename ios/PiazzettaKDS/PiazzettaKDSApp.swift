//
//  PiazzettaKDSApp.swift
//  PiazzettaKDS
//
//  Kitchen Display System — Bar + Cucina (Tavola calda) — La Piazzetta.
//

import SwiftUI

@main
struct PiazzettaKDSApp: App {
    @StateObject private var api = APIClient.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
                .tint(Brand.accent)
                .preferredColorScheme(.dark)
        }
    }
}
