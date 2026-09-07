//
//  ServerStatusView.swift
//  PiazzettaOwner (macOS)
//
//  Pannello "Server" — mostra stato backend, URL LAN per i dipendenti,
//  controlli avvio/stop, e QR code per collegarsi velocemente.
//

import SwiftUI
import CoreImage.CIFilterBuiltins

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
