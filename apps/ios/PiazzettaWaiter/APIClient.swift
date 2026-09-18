//
//  APIClient.swift
//  PiazzettaWaiter
//
//  Client REST verso l'API La Piazzetta (URLSession + async/await).
//

import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case server(String)
    case decoding(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "URL non valido."
        case .server(let message): return message
        case .decoding: return "Errore nel formato della risposta."
        case .unauthorized: return "Sessione scaduta, accedi di nuovo."
        }
    }
}

@MainActor
final class APIClient: ObservableObject {
    static let shared = APIClient()

    var baseURL = URL(string: "http://192.168.1.203:3000/api/v1")!

    @Published var session: Session?
    @Published var activeShift: Shift?

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private init() {}

    var isAuthenticated: Bool { session != nil }

    // MARK: - Auth

    func loginPin(venueId: String, userId: String, pin: String) async throws {
        let body = ["venueId": venueId, "userId": userId, "pin": pin]
        let session: Session = try await request("/auth/login-pin", method: "POST", body: body, authorized: false)
        self.session = session
    }

    func logout() {
        session = nil
        activeShift = nil
    }

    // MARK: - Turni

    func fetchMyShift() async throws -> Shift? {
        try await request("/staff/me/shift", method: "GET")
    }

    func clockIn(role: ShiftRole) async throws -> Shift {
        try await request("/staff/shifts/clock-in", method: "POST", body: ["shiftRole": role.rawValue])
    }

    func clockOut(breakMinutes: Int = 0) async throws -> Shift {
        try await request("/staff/me/shift/clock-out", method: "POST", body: ["breakMinutes": breakMinutes])
    }

    // MARK: - Sala / Tavoli

    func fetchTables() async throws -> [RestaurantTable] {
        try await request("/orders-tables/tables", method: "GET")
    }

    func fetchBoard() async throws -> BoardResponse {
        try await request("/orders-tables/board", method: "GET")
    }

    // MARK: - Chat

    func fetchChatRooms() async throws -> [ChatRoom] {
        try await request("/staff/chat/rooms", method: "GET")
    }

    func fetchMessages(roomId: String) async throws -> [ChatMessage] {
        try await request("/staff/chat/rooms/\(roomId)/messages", method: "GET")
    }

    func sendMessage(roomId: String, text: String) async throws -> ChatMessage {
        try await request("/staff/chat/rooms/\(roomId)/messages", method: "POST", body: ["text": text, "type": "TEXT"])
    }

    func createDirectToOwnerRoom() async throws -> ChatRoom {
        try await request("/staff/chat/rooms", method: "POST", body: ["name": "Owner", "type": "DIRECT_TO_OWNER"])
    }

    // MARK: - Core

    private func request<T: Decodable>(
        _ path: String,
        method: String,
        body: [String: Any]? = nil,
        authorized: Bool = true
    ) async throws -> T {
        guard let url = URL(string: baseURL.absoluteString + path) else { throw APIError.invalidURL }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if authorized, let token = session?.accessToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.server("Risposta non valida dal server.")
        }

        if http.statusCode == 401 {
            self.session = nil
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            if let err = try? decoder.decode(APIErrorPayload.self, from: data) {
                throw APIError.server(err.error)
            }
            throw APIError.server("Errore server (\(http.statusCode)).")
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}
