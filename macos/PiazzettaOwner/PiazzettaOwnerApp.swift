//
//  PiazzettaOwnerApp.swift
//  PiazzettaShared
//
//  Dashboard proprietario — La Piazzetta.
//  macOS: windowStyle(.titleBar), defaultSize, frame(minWidth:).
//  iOS: tint(Brand.accent).
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
                #if os(macOS)
                .frame(minWidth: 900, minHeight: 600)
                #else
                .tint(Brand.accent)
                #endif
        }
        #if os(macOS)
        .windowStyle(.titleBar)
        .defaultSize(width: 1200, height: 750)
        #endif
    }
}
