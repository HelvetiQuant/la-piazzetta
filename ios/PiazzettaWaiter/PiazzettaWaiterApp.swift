//
//  PiazzettaWaiterApp.swift
//  PiazzettaWaiter
//
//  App staff di sala — La Piazzetta.
//

import SwiftUI

@main
struct PiazzettaWaiterApp: App {
    @StateObject private var api = APIClient.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
                .tint(Brand.accent)
        }
    }
}
