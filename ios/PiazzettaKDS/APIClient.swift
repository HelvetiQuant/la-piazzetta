//
//  APIClient.swift
//  PiazzettaKDS
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

    var baseURL = URL(string: "http://192.168.1.69:3000/api/v1")!

    @Published var session: Session?

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private init() {}

    var isAuthenticated: Bool { session != nil }

    // MARK: - Auth

    func login(venueId: String, email: String, password: String) async throws {
        let body = ["venueId": venueId, "email": email, "password": password]
        let session: Session = try await request("/auth/login", method: "POST", body: body, authorized: false)
        self.session = session
    }

    func loginPin(venueId: String, userId: String, pin: String) async throws {
        let body = ["venueId": venueId, "userId": userId, "pin": pin]
        let session: Session = try await request("/auth/login-pin", method: "POST", body: body, authorized: false)
        self.session = session
    }

    func logout() {
        session = nil
    }

    // MARK: - Board

    func fetchBoard(station: Station) async throws -> StationBoardResponse {
        try await request("/orders-tables/board?station=\(station.rawValue)", method: "GET")
    }

    func advanceItem(id: String, to status: OrderItemStatus) async throws -> BoardItem {
        try await request("/orders-tables/order-items/\(id)/status", method: "PATCH", body: ["status": status.rawValue])
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
