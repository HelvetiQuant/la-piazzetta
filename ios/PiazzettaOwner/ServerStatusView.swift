//
//  ServerStatusView.swift
//  PiazzettaOwner
//
//  Stato del server per iOS. Mostra URL LAN, stato backend,
//  e QR code per i dipendenti. Niente controlli Docker su iOS.
//

import SwiftUI

struct ServerStatusView: View {
    @StateObject private var server = ServerManager()
    @State private var copiedURL: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Stato backend
                serverStatusCard

                // URL server
                urlCard

                // Web app dipendenti con QR
                employeeAppsCard

                // Istruzioni
                instructionsCard
            }
            .padding()
        }
        .navigationTitle("Server")
        .background(Brand.background)
        .refreshable {
            server.checkHealth()
        }
    }

    // MARK: - Server status

    private var serverStatusCard: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: server.isOnline ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(server.isOnline ? Brand.success : Brand.danger)
                    .symbolEffect(.bounce, value: server.isOnline)

                VStack(alignment: .leading) {
                    Text(server.isOnline ? "Server Online" : "Server Offline")
                        .font(.title2.bold())
                    Text(server.isOnline ? "Backend connesso e operativo" : "Impossibile connettersi al backend")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }

            if server.isChecking {
                ProgressView("Verifica connessione...")
            }

            if let error = server.lastError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(Brand.danger)
                    .padding(8)
                    .background(Brand.danger.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            Button("Ricontrolla") {
                server.checkHealth()
            }
            .adaptiveGlassProminentButton()
        }
        .padding()
        .glassCard()
    }

    // MARK: - URL

    private var urlCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("URL del Server", systemImage: "link")
                .font(.headline)

            urlRow(label: "API", url: server.apiURL)
            urlRow(label: "Locale", url: "http://localhost:\(server.port)")
            urlRow(label: "LAN", url: server.serverURL)
        }
        .padding()
        .glassCard()
    }

    private func urlRow(label: String, url: String) -> some View {
        HStack {
            Text(label)
                .font(.caption.bold())
                .foregroundStyle(.secondary)
                .frame(width: 60, alignment: .leading)
            Text(url)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
            Spacer()
            Button {
                UIPasteboard.general.string = url
                copiedURL = url
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    if copiedURL == url { copiedURL = nil }
                }
            } label: {
                Image(systemName: copiedURL == url ? "checkmark" : "doc.on.doc")
                    .font(.caption)
            }
        }
    }

    // MARK: - Employee apps

    private var employeeAppsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("App Dipendenti", systemImage: "person.2.fill")
                .font(.headline)

            Text("I dipendenti possono aprire queste URL dal browser del loro dispositivo:")
                .font(.caption)
                .foregroundStyle(.secondary)

            employeeAppRow(name: "Cameriere", icon: "tray.fill", url: server.waiterURL)
            employeeAppRow(name: "KDS Bar", icon: "cup.and.saucer.fill", url: server.kdsBarURL)
            employeeAppRow(name: "KDS Cucina", icon: "fork.knife", url: server.kdsKitchenURL)
        }
        .padding()
        .glassCard()
    }

    private func employeeAppRow(name: String, icon: String, url: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .foregroundStyle(Brand.accent)
                    .font(.title3)
                Text(name)
                    .font(.subheadline.bold())
                Spacer()
                if let qr = server.qrCodeImage(for: url) {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 60, height: 60)
                }
            }
            Text(url)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
        }
        .padding(.vertical, 4)
    }

    // MARK: - Instructions

    private var instructionsCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Come collegarsi", systemImage: "info.circle.fill")
                .font(.headline)

            VStack(alignment: .leading, spacing: 6) {
                instruction("1", "Assicurati che il Mac sia acceso e connesso alla stessa rete WiFi")
                instruction("2", "Il backend Docker deve essere attivo sul Mac")
                instruction("3", "I dipendenti scansionano il QR code o aprono l'URL dal browser")
                instruction("4", "Ogni dipendente fa login con le sue credenziali")
            }
        }
        .padding()
        .glassCard()
    }

    private func instruction(_ num: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(num)
                .font(.caption.bold())
                .foregroundStyle(.white)
                .frame(width: 20, height: 20)
                .background(Brand.accent)
                .clipShape(Circle())
            Text(text)
                .font(.caption)
        }
    }
}
