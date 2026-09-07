//
//  Models.swift
//  PiazzettaWaiter
//
//  Modelli dati allineati alle risposte REST dell'API (apps/api):
//  auth PIN, turni, tavoli/board ordini, chat staff.
//

import Foundation

// MARK: - Auth

struct Session: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresInSec: Int?
    let tokenType: String?
}

// MARK: - Turni

enum ShiftRole: String, Codable, CaseIterable, Identifiable {
    case waiter = "WAITER"
    case barman = "BARMAN"
    case cook = "COOK"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .waiter: return "Cameriere"
        case .barman: return "Barman"
        case .cook: return "Cuoco"
        }
    }

    var emoji: String {
        switch self {
        case .waiter: return "🧑‍🍳"
        case .barman: return "🍹"
        case .cook: return "👨‍🍳"
        }
    }
}

struct Shift: Codable, Identifiable {
    let id: String
    let userId: String
    let venueId: String
    let startedAt: Date
    let endedAt: Date?
    let breakMinutes: Int?
    let shiftRole: String?
    let status: String
    let note: String?
}

// MARK: - Sala / Tavoli

struct RestaurantTable: Codable, Identifiable {
    let id: String
    let code: String
    let name: String
    let area: String
    let seats: Int
    let state: String
    let sessions: [TableSessionSummary]?
}

struct TableSessionSummary: Codable {
    let id: String
    let guests: Int
}

// MARK: - Board ordini (comande)

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
    let status: String
}

struct BoardResponse: Codable {
    let BAR: [BoardOrder]?
    let TAVOLA_CALDA: [BoardOrder]?

    var allOrders: [BoardOrder] { (BAR ?? []) + (TAVOLA_CALDA ?? []) }
    var readyTableNames: Set<String> {
        Set(allOrders.filter { $0.status == "READY" }.map(\.table))
    }
}

// MARK: - Chat staff

struct ChatRoom: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let type: String
    let department: String?
    let lastMessage: ChatMessagePreview?

    enum CodingKeys: String, CodingKey {
        case id, name, type, department, messages
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        type = try c.decode(String.self, forKey: .type)
        department = try c.decodeIfPresent(String.self, forKey: .department)
        lastMessage = try c.decodeIfPresent([ChatMessagePreview].self, forKey: .messages)?.first
    }

    static func == (lhs: ChatRoom, rhs: ChatRoom) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct ChatMessagePreview: Codable {
    let text: String
    let createdAt: Date?
    let userId: String?
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    let roomId: String
    let userId: String
    let text: String
    let type: String
    let createdAt: Date
    let user: ChatUserSummary?
}

struct ChatUserSummary: Codable {
    let id: String
    let name: String
    let roles: [String]
}

struct APIErrorPayload: Codable {
    let error: String
}
