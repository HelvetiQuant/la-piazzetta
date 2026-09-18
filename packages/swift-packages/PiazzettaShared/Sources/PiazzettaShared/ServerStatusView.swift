//
//  ServerStatusView.swift
//  PiazzettaShared
//
//  Pannello "Server" — mostra stato backend, URL LAN per i dipendenti,
//  controlli avvio/stop, e QR code per collegarsi velocemente.
//  macOS: Docker control, NSPasteboard, NSImage QR.
//  iOS: health check, UIPasteboard, UIImage QR.
//

import SwiftUI
import CoreImage.CIFilterBuiltins
#if os(macOS)
import AppKit
#else
import UIKit
#endif

#if os(macOS)
struct ServerStatusView: View {
    @ObservedObject private var server = ServerManager.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Header stato
                headerCard

                // URL server
                urlCard

                // Web app dipendenti
                webAppsSection

                // QR code per collegamento rapido
                qrSection
            }
            .padding(28)
        }
        .background(Brand.background)
        .navigationTitle("Server Ristorante")
        .task { await server.checkStatus() }
        .refreshable { await server.checkStatus() }
    }

    // MARK: - Header

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 16) {
                Image(systemName: server.isRunning ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(server.isRunning ? .green : .red)

                VStack(alignment: .leading, spacing: 4) {
                    Text(server.isRunning ? "Server attivo" : "Server spento")
                        .font(.title2.bold())
                    Text(server.isRunning ? "Backend + web app dipendenti online" : "Premi avvia per far partire il server")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if server.isRunning {
                    Button {
                        Task { await server.stopServer() }
                    } label: {
                        Label("Ferma", systemImage: "stop.fill")
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)
                } else {
                    Button {
                        Task { await server.startServer() }
                    } label: {
                        Label("Avvia server", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }

            if let err = server.lastError {
                Text(err)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(10)
                    .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(24)
        .glassCard(cornerRadius: 20)
    }

    // MARK: - URL

    private var urlCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("URL del server", systemImage: "link")
                .font(.headline)

            VStack(spacing: 8) {
                urlRow(label: "Locale (Mac)", url: server.serverURL, icon: "macbook")
                urlRow(label: "LAN (dipendenti)", url: server.lanURL, icon: "wifi")
            }
        }
        .padding(24)
        .glassCard(cornerRadius: 20)
    }

    private func urlRow(label: String, url: String, icon: String) -> some View {
        HStack {
            Image(systemName: icon)
                .foregroundStyle(Brand.accent)
                .frame(width: 24)
            Text(label).font(.subheadline)
            Spacer()
            Text(url)
                .font(.system(.subheadline, design: .monospaced))
                .foregroundStyle(.secondary)
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(url, forType: .string)
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.borderless)
            .help("Copia URL")
        }
    }

    // MARK: - Web Apps

    private var webAppsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Web app dipendenti", systemImage: "apps.iphone")
                .font(.headline)

            VStack(spacing: 10) {
                ForEach(server.webApps) { app in
                    HStack {
                        Image(systemName: app.icon)
                            .foregroundStyle(Brand.accent)
                            .frame(width: 24)
                        VStack(alignment: .leading) {
                            Text(app.name).font(.subheadline.bold())
                            Text(app.url)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if server.isRunning {
                            Link(destination: URL(string: app.url)!) {
                                Image(systemName: "safari")
                            }
                            .buttonStyle(.borderless)
                            .help("Apri nel browser")
                        }
                    }
                    .padding(14)
                    .background(.white.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
        .padding(24)
        .glassCard(cornerRadius: 20)
    }

    // MARK: - QR Code

    private var qrSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("QR Code — collega i dipendenti", systemImage: "qrcode")
                .font(.headline)

            Text("I dipendenti possono scansionare questo QR code con il telefono per aprire l'app cameriere.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let qr = generateQR(string: server.lanURL + "/waiter") {
                Image(nsImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 200, height: 200)
                    .padding(20)
                    .background(.white, in: RoundedRectangle(cornerRadius: 16))
            }
        }
        .padding(24)
        .glassCard(cornerRadius: 20)
    }

    // MARK: - QR generation

    private func generateQR(string: String) -> NSImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
        guard let cg = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return NSImage(cgImage: cg, size: NSSize(width: 200, height: 200))
    }
}
#else
// MARK: - iOS implementation

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
#endif
