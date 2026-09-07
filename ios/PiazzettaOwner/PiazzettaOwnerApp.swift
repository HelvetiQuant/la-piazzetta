//
//  PiazzettaOwnerApp.swift
//  PiazzettaOwner
//
//  Dashboard proprietario — La Piazzetta.
//

import SwiftUI

@main
struct PiazzettaOwnerApp: App {
    @StateObject private var api = APIClient.shared
    @StateObject private var ai = AIAssistant.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
                .environmentObject(ai)
                .tint(Brand.accent)
        }
    }
}
