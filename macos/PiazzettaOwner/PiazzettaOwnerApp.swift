//
//  PiazzettaOwnerApp.swift
//  PiazzettaOwner (macOS)
//

import SwiftUI

@main
struct PiazzettaOwnerApp: App {
    @StateObject private var api = APIClient.shared
    @StateObject private var assistant = AIAssistant.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(api)
                .environmentObject(assistant)
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 750)
    }
}
