//
//  ServerManager.swift
//  PiazzettaShared
//
//  Gestisce il backend.
//  macOS: Docker control, NSPasteboard, localhost, LAN IP detection.
//  iOS: health check, UIPasteboard, LAN IP, QR UIImage.
//

import Foundation
import SwiftUI
#if os(iOS)
import UIKit
import CoreImage.CIFilterBuiltins
#endif

#if os(macOS)
@MainActor
final class ServerManager: ObservableObject {
    static let shared = ServerManager()

    @Published var isRunning = false
    @Published var apiHealth = false
    @Published var lanIP = ""
    @Published var port = 3000
    @Published var webApps: [WebAppInfo] = []
    @Published var lastError: String?

    struct WebAppInfo: Identifiable {
        let id = UUID()
        let name: String
        let path: String
        let icon: String
        let url: String
    }

    private init() {
        detectLANIP()
        webApps = [
            WebAppInfo(name: "Cameriere", path: "/waiter", icon: "person.2", url: "http://\(lanIP):\(port)/waiter"),
            WebAppInfo(name: "KDS Bar", path: "/kds-bar", icon: "cup.and.saucer", url: "http://\(lanIP):\(port)/kds-bar"),
            WebAppInfo(name: "KDS Cucina", path: "/kds-kitchen", icon: "fork.knife", url: "http://\(lanIP):\(port)/kds-kitchen"),
        ]
        Task { await checkStatus() }
    }

    // MARK: - Status

    func checkStatus() async {
        // Verifica se il backend risponde
        let url = URL(string: "http://localhost:\(port)/api/v1/health")!
        do {
            let (_, resp) = try await URLSession.shared.data(for: URLRequest(url: url))
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                apiHealth = true
                isRunning = true
                lastError = nil
                return
            }
        } catch {
            // Backend non raggiungibile
        }
        apiHealth = false
        isRunning = false
    }

    // MARK: - Docker control

    func startServer() async {
        // Avvia il container Docker se non è già attivo
        do {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/local/bin/docker")
            process.arguments = ["start", "piazzetta-node"]
            try process.run()
            process.waitUntilExit()

            // Aspetta che il backend sia pronto
            for _ in 0..<10 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                await checkStatus()
                if apiHealth { break }
            }
        } catch {
            lastError = "Impossibile avviare Docker: \(error.localizedDescription)"
        }
    }

    func stopServer() async {
        do {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/local/bin/docker")
            process.arguments = ["stop", "piazzetta-node"]
            try process.run()
            process.waitUntilExit()
            isRunning = false
            apiHealth = false
        } catch {
            lastError = "Impossibile fermare Docker: \(error.localizedDescription)"
        }
    }

    // MARK: - LAN IP detection

    private func detectLANIP() {
        // Legge l'IP dalla shell
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/sbin/ipconfig")
        task.arguments = ["getifaddr", "en0"]
        let pipe = Pipe()
        task.standardOutput = pipe
        try? task.run()
        task.waitUntilExit()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let ip = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !ip.isEmpty {
            lanIP = ip
        } else {
            // Fallback: prova en1
            task.arguments = ["getifaddr", "en1"]
            try? task.run()
            task.waitUntilExit()
            let data2 = pipe.fileHandleForReading.readDataToEndOfFile()
            lanIP = String(data: data2, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "localhost"
        }
    }

    var serverURL: String { "http://localhost:\(port)" }
    var lanURL: String { "http://\(lanIP):\(port)" }
}
#else
// MARK: - iOS implementation

@MainActor
class ServerManager: ObservableObject {
    @Published var isOnline: Bool = false
    @Published var isChecking: Bool = false
    @Published var lastError: String?
    @Published var lanIP: String = "192.168.1.69"
    @Published var port: Int = 3000

    var serverURL: String { "http://\(lanIP):\(port)" }
    var apiURL: String { "\(serverURL)/api/v1" }
    var healthURL: URL { URL(string: "\(apiURL)/health")! }

    // URL web app dipendenti
    var waiterURL: String { "\(serverURL)/waiter" }
    var kdsBarURL: String { "\(serverURL)/kds-bar" }
    var kdsKitchenURL: String { "\(serverURL)/kds-kitchen" }

    init() {
        checkHealth()
    }

    // MARK: - Health check

    func checkHealth() {
        guard !isChecking else { return }
        isChecking = true
        lastError = nil

        Task {
            do {
                let (data, response) = try await URLSession.shared.data(from: healthURL)
                if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       json["ok"] as? Bool == true {
                        await MainActor.run {
                            self.isOnline = true
                            self.isChecking = false
                        }
                        return
                    }
                }
                await MainActor.run {
                    self.isOnline = false
                    self.isChecking = false
                }
            } catch {
                await MainActor.run {
                    self.isOnline = false
                    self.lastError = error.localizedDescription
                    self.isChecking = false
                }
            }
        }
    }

    // MARK: - QR Code generation (CoreImage)

    func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
        filter.setValue(string.data(using: .utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let outputImage = filter.outputImage else { return nil }
        let scaledImage = outputImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    func qrCodeImage(for url: String) -> UIImage? {
        generateQRCode(from: url)
    }
}
#endif
