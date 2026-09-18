//
//  Models.swift
//  PiazzettaKDS
//
//  Modelli dati allineati alle risposte REST dell'API (apps/api):
//  auth, board comande BAR / TAVOLA_CALDA (cucina).
//

import Foundation

// MARK: - Auth

struct Session: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresInSec: Int?
    let tokenType: String?
}

// MARK: - Postazione

enum Station: String, Codable, CaseIterable, Identifiable {
    case bar = "BAR"
    case kitchen = "TAVOLA_CALDA"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .bar: return "Bar"
        case .kitchen: return "Cucina"
        }
    }

    var emoji: String {
        switch self {
        case .bar: return "🍹"
        case .kitchen: return "👨‍🍳"
        }
    }
}

// MARK: - Board comande

enum OrderItemStatus: String, Codable {
    case sent = "SENT"
    case inPreparation = "IN_PREPARATION"
    case ready = "READY"
    case served = "SERVED"

    /// Colonna della board KDS in cui va mostrata la riga.
    var column: String {
        switch self {
        case .sent: return "Nuovo"
        case .inPreparation: return "In preparazione"
        case .ready: return "Pronto"
        case .served: return "Servito"
        }
    }

    /// Stato successivo nel flusso (bump della card).
    var next: OrderItemStatus? {
        switch self {
        case .sent: return .inPreparation
        case .inPreparation: return .ready
        case .ready: return .served
        case .served: return nil
        }
    }
}

struct BoardOrder: Codable, Identifiable {
    let id: String
    let table: String
    let status: String
    let placedAt: Date
    let waitingSec: Int
    let items: [BoardItem]
}

struct BoardItem: Codable, Identifiable {
    let id: String
    let name: String
    let quantity: Int
    let notes: String?
    let preparation: String?
    let station: String
    var status: String

    /// Emoji indicativa in base al nome del piatto/bevanda (best-effort).
    var categoryEmoji: String {
        let lower = name.lowercased()
        if lower.contains("pizza") { return "🍕" }
        if lower.contains("caffè") || lower.contains("caffe") || lower.contains("espresso") { return "☕️" }
        if lower.contains("birra") { return "🍺" }
        if lower.contains("vino") { return "🍷" }
        if lower.contains("acqua") { return "💧" }
        if lower.contains("cocktail") || lower.contains("spritz") { return "🍸" }
        if lower.contains("insalata") { return "🥗" }
        if lower.contains("pasta") || lower.contains("risotto") { return "🍝" }
        if lower.contains("dolce") || lower.contains("tiramisu") { return "🍰" }
        return "🍽️"
    }
}

struct StationBoardResponse: Codable {
    let station: String
    let orders: [BoardOrder]
}

struct APIErrorPayload: Codable {
    let error: String
}
