//
//  ServerManager.swift
//  PiazzettaOwner
//
//  Gestisce la connessione al backend. Su iOS l'iPad è client:
//  non può controllare Docker, ma può verificare lo stato del server.
//

import Foundation
import SwiftUI

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
