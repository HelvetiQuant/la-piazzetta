//
//  APIClient.swift
//  PiazzettaOwner
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

    /// Base URL dell'API (apps/api). Configurabile per test/staging.
    var baseURL = URL(string: "http://192.168.1.69:3000/api/v1")!

    @Published var session: Session?
    @Published var isReady: Bool = false

    // Credenziali preconfigurate per auto-login (demo)
    private let autoVenueId = "venue_piazzetta"
    private let autoEmail = "owner@piazzetta.it"
    private let autoPassword = "owner123"

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private init() {
        // Auto-login al primo avvio
        Task { await autoLogin() }
    }

    var isAuthenticated: Bool { session != nil }

    // MARK: - Auth

    /// Auto-login con credenziali preconfigurate (no schermata login)
    func autoLogin() async {
        do {
            try await login(venueId: autoVenueId, email: autoEmail, password: autoPassword)
        } catch {
            // Riprova tra 3 secondi
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            await autoLogin()
        }
        isReady = true
    }

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

    // MARK: - Dashboard

    func fetchDashboard(range: String = "today") async throws -> DashboardResponse {
        try await request("/stats/dashboard?range=\(range)", method: "GET")
    }

    // MARK: - Staff / Turni

    func fetchStaff() async throws -> [StaffMember] {
        try await request("/staff", method: "GET")
    }

    func fetchShifts(from: String? = nil, to: String? = nil) async throws -> [Shift] {
        var path = "/staff/shifts"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?" + query.joined(separator: "&") }
        return try await request(path, method: "GET")
    }

    // MARK: - Menu

    func fetchMenu() async throws -> [MenuProduct] {
        try await request("/products", method: "GET")
    }

    func updateProductPrice(id: String, priceCents: Int) async throws -> MenuProduct {
        try await request("/products/\(id)", method: "PATCH", body: ["priceCents": priceCents])
    }

    // MARK: - Contabilità

    func fetchAccounts() async throws -> [AccountingAccount] {
        try await request("/accounting/accounts", method: "GET")
    }

    func fetchInvoices() async throws -> [Invoice] {
        try await request("/accounting/invoices", method: "GET")
    }

    // MARK: - Comande (board)

    func fetchBoard() async throws -> Board {
        try await request("/orders-tables/board", method: "GET")
    }

    // MARK: - Tempi di preparazione

    func fetchPrepStats(groupBy: String = "station", station: String? = nil, from: String? = nil, to: String? = nil) async throws -> PrepTimeStats {
        var query = ["groupBy=\(groupBy)"]
        if let station { query.append("station=\(station)") }
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        return try await request("/stats/prep-times?" + query.joined(separator: "&"), method: "GET")
    }

    // MARK: - Marketing — Media

    func fetchMedia() async throws -> [MediaAsset] {
        try await request("/marketing/media", method: "GET")
    }

    func uploadMedia(base64: String, mimeType: String, altText: String? = nil) async throws -> MediaAsset {
        var body: [String: Any] = ["base64": base64, "mimeType": mimeType]
        if let altText, !altText.isEmpty { body["altText"] = altText }
        return try await request("/marketing/media/upload", method: "POST", body: body)
    }

    func deleteMedia(id: String) async throws -> DeleteResponse {
        try await request("/marketing/media/\(id)", method: "DELETE")
    }

    // MARK: - Marketing — AI Generation

    func generatePost(topic: String, tone: String, channels: [String], mediaAssetId: String? = nil) async throws -> GeneratePostResponse {
        var body: [String: Any] = ["topic": topic, "tone": tone, "channels": channels]
        if let mediaAssetId { body["mediaAssetId"] = mediaAssetId }
        return try await request("/marketing/generate-post", method: "POST", body: body)
    }

    func canvaCreate(title: String, mediaAssetId: String? = nil) async throws -> CanvaCreateResponse {
        var body: [String: Any] = ["title": title]
        if let mediaAssetId { body["mediaAssetId"] = mediaAssetId }
        return try await request("/marketing/canva/create", method: "POST", body: body)
    }

    func gammaCreate(prompt: String, title: String) async throws -> GammaCreateResponse {
        try await request("/marketing/gamma/create", method: "POST", body: ["prompt": prompt, "title": title])
    }

    // MARK: - Marketing — Posts

    func fetchMarketingPosts(status: String? = nil) async throws -> [SocialPost] {
        try await request("/marketing/posts" + (status.map { "?status=\($0)" } ?? ""), method: "GET")
    }

    func createMarketingPost(caption: String, hashtags: [String], platforms: [String], mediaAssetId: String? = nil, campaignId: String? = nil, scheduledAt: String? = nil, aiGenerated: Bool = false, aiPrompt: String? = nil) async throws -> SocialPost {
        var body: [String: Any] = ["caption": caption, "hashtags": hashtags, "platforms": platforms, "aiGenerated": aiGenerated]
        if let mediaAssetId { body["mediaAssetId"] = mediaAssetId }
        if let campaignId { body["campaignId"] = campaignId }
        if let scheduledAt { body["scheduledAt"] = scheduledAt }
        if let aiPrompt { body["aiPrompt"] = aiPrompt }
        return try await request("/marketing/posts", method: "POST", body: body)
    }

    func updateMarketingPost(id: String, body: [String: Any]) async throws -> SocialPost {
        try await request("/marketing/posts/\(id)", method: "PATCH", body: body)
    }

    func deleteMarketingPost(id: String) async throws -> DeleteResponse {
        try await request("/marketing/posts/\(id)", method: "DELETE")
    }

    func publishMarketingPost(id: String) async throws -> PublishPostResponse {
        try await request("/marketing/posts/\(id)/publish", method: "POST")
    }

    // MARK: - Marketing — Accounts

    func fetchSocialAccounts() async throws -> [SocialAccount] {
        try await request("/marketing/accounts", method: "GET")
    }

    func connectSocialAccount(platform: String, accountId: String, accessToken: String, username: String? = nil, displayName: String? = nil) async throws -> ConnectAccountResponse {
        var body: [String: Any] = ["platform": platform, "accountId": accountId, "accessToken": accessToken]
        if let username { body["username"] = username }
        if let displayName { body["displayName"] = displayName }
        return try await request("/marketing/accounts/connect", method: "POST", body: body)
    }

    func disconnectSocialAccount(id: String) async throws -> DeleteResponse {
        try await request("/marketing/accounts/\(id)", method: "DELETE")
    }

    // MARK: - Marketing — Comments

    func fetchSocialComments(needsReply: Bool? = nil) async throws -> [SocialComment] {
        try await request("/marketing/comments" + (needsReply == true ? "?needsReply=true" : ""), method: "GET")
    }

    func replyComment(id: String, replyText: String) async throws -> SocialComment {
        try await request("/marketing/comments/\(id)/reply", method: "POST", body: ["replyText": replyText])
    }

    func autoReplyComment(id: String) async throws -> AutoReplyResponse {
        try await request("/marketing/comments/\(id)/auto-reply", method: "POST")
    }

    func syncComments() async throws -> SyncResponse {
        try await request("/marketing/comments/sync", method: "POST")
    }

    // MARK: - Marketing — Analytics

    func fetchMarketingAnalytics(from: String? = nil, to: String? = nil) async throws -> MarketingAnalytics {
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        let suffix = query.isEmpty ? "" : "?" + query.joined(separator: "&")
        return try await request("/marketing/analytics" + suffix, method: "GET")
    }

    func syncAnalytics() async throws -> SyncResponse {
        try await request("/marketing/analytics/sync", method: "POST")
    }

    // MARK: - Marketing — Campaigns

    func fetchCampaigns() async throws -> [Campaign] {
        try await request("/marketing/campaigns", method: "GET")
    }

    func createCampaign(name: String, description: String?, budgetCents: Int, status: String = "ACTIVE") async throws -> Campaign {
        var body: [String: Any] = ["name": name, "budgetCents": budgetCents, "status": status]
        if let description, !description.isEmpty { body["description"] = description }
        return try await request("/marketing/campaigns", method: "POST", body: body)
    }

    func updateCampaign(id: String, body: [String: Any]) async throws -> Campaign {
        try await request("/marketing/campaigns/\(id)", method: "PATCH", body: body)
    }

    // MARK: - Magazzino

    func fetchStock() async throws -> StockResponse {
        try await request("/inventory/stock", method: "GET")
    }

    func fetchLowStock() async throws -> [LowStockItem] {
        try await request("/inventory/low-stock", method: "GET")
    }

    func fetchMovements(productId: String? = nil) async throws -> [StockMovement] {
        try await request("/inventory/movements" + (productId.map { "?productId=\($0)" } ?? ""), method: "GET")
    }

    func addMovement(productId: String, type: String, qty: Int, reason: String? = nil) async throws -> MovementResponse {
        var body: [String: Any] = ["productId": productId, "type": type, "qty": qty]
        if let reason, !reason.isEmpty { body["reason"] = reason }
        return try await request("/inventory/movements", method: "POST", body: body)
    }

    func setStockLevels(productId: String, reorderLevel: Int? = nil, parLevel: Int? = nil) async throws -> StockLevelResponse {
        var body: [String: Any] = [:]
        if let reorderLevel { body["reorderLevel"] = reorderLevel }
        if let parLevel { body["parLevel"] = parLevel }
        return try await request("/inventory/stock/\(productId)/levels", method: "PATCH", body: body)
    }

    // MARK: - Fornitori / Acquisti

    func fetchSuppliers() async throws -> [Supplier] {
        try await request("/suppliers", method: "GET")
    }

    func createSupplier(name: String, phone: String? = nil, email: String? = nil, notes: String? = nil) async throws -> Supplier {
        var body: [String: Any] = ["name": name]
        if let phone, !phone.isEmpty { body["phone"] = phone }
        if let email, !email.isEmpty { body["email"] = email }
        if let notes, !notes.isEmpty { body["notes"] = notes }
        return try await request("/suppliers", method: "POST", body: body)
    }

    func updateSupplier(id: String, body: [String: Any]) async throws -> Supplier {
        try await request("/suppliers/\(id)", method: "PATCH", body: body)
    }

    func fetchListings(supplierId: String) async throws -> [Listing] {
        try await request("/suppliers/\(supplierId)/listings", method: "GET")
    }

    func addListing(supplierId: String, productId: String, packSize: Int, packPriceCents: Int, leadTimeDays: Int = 2, preferred: Bool = false, supplierSku: String? = nil) async throws -> Listing {
        var body: [String: Any] = ["productId": productId, "packSize": packSize, "packPriceCents": packPriceCents, "leadTimeDays": leadTimeDays, "preferred": preferred]
        if let supplierSku, !supplierSku.isEmpty { body["supplierSku"] = supplierSku }
        return try await request("/suppliers/\(supplierId)/listings", method: "POST", body: body)
    }

    func fetchReorderProposals() async throws -> ReorderProposalsResponse {
        try await request("/suppliers/reorder-proposals", method: "GET")
    }

    func createPurchaseOrder(supplierId: String, items: [[String: Any]]) async throws -> PurchaseOrder {
        try await request("/purchase-orders", method: "POST", body: ["supplierId": supplierId, "items": items])
    }

    func fetchPurchaseOrders(status: String? = nil) async throws -> [PurchaseOrder] {
        try await request("/purchase-orders" + (status.map { "?status=\($0)" } ?? ""), method: "GET")
    }

    func sendPurchaseOrder(id: String) async throws -> PurchaseOrder {
        try await request("/purchase-orders/\(id)/send", method: "POST")
    }

    func cancelPurchaseOrder(id: String) async throws -> PurchaseOrder {
        try await request("/purchase-orders/\(id)/cancel", method: "POST")
    }

    // MARK: - Crediti clienti

    func fetchCustomers(debtorsOnly: Bool = false, query: String? = nil) async throws -> CustomersResponse {
        var params: [String] = []
        if debtorsOnly { params.append("debtors=true") }
        if let query, !query.isEmpty { params.append("q=\(query)") }
        let suffix = params.isEmpty ? "" : "?" + params.joined(separator: "&")
        return try await request("/credit/customers" + suffix, method: "GET")
    }

    func fetchCustomerDetail(id: String) async throws -> CustomerDetail {
        try await request("/credit/customers/\(id)", method: "GET")
    }

    func createCustomer(name: String, phone: String?, email: String?, limitCents: Int) async throws -> Customer {
        var body: [String: Any] = ["name": name, "limitCents": limitCents]
        if let phone, !phone.isEmpty { body["phone"] = phone }
        if let email, !email.isEmpty { body["email"] = email }
        return try await request("/credit/customers", method: "POST", body: body)
    }

    func addCreditTransaction(customerId: String, type: String, amountCents: Int, method: String? = nil, note: String? = nil) async throws -> AddTransactionResponse {
        var body: [String: Any] = ["type": type, "amountCents": amountCents]
        if let method { body["method"] = method }
        if let note { body["note"] = note }
        return try await request("/credit/customers/\(customerId)/transactions", method: "POST", body: body)
    }

    // MARK: - Stipendi

    func fetchPayroll(from: String? = nil, to: String? = nil, status: String? = nil) async throws -> [PayrollEntry] {
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if let status { query.append("status=\(status)") }
        let suffix = query.isEmpty ? "" : "?" + query.joined(separator: "&")
        return try await request("/staff/payroll" + suffix, method: "GET")
    }

    func fetchPayrollSummary(from: String? = nil, to: String? = nil) async throws -> PayrollSummary {
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        let suffix = query.isEmpty ? "" : "?" + query.joined(separator: "&")
        return try await request("/staff/payroll/summary" + suffix, method: "GET")
    }

    // MARK: - Orari (turni pianificati)

    func fetchSchedule(from: String? = nil, to: String? = nil) async throws -> [ScheduledShift] {
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        let suffix = query.isEmpty ? "" : "?" + query.joined(separator: "&")
        return try await request("/staff/schedule" + suffix, method: "GET")
    }

    func fetchAvailability() async throws -> [AvailabilitySlot] {
        try await request("/staff/availability", method: "GET")
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

    func createDirectRoom(name: String) async throws -> ChatRoom {
        try await request("/staff/chat/rooms", method: "POST", body: ["name": name, "type": "DIRECT_TO_OWNER"])
    }

    // MARK: - AI Preferences (assistente adattivo)

    func fetchAiPreferences() async throws -> AiPreference {
        try await request("/ai-preferences", method: "GET")
    }

    func updateAiPreferences(_ body: [String: Any]) async throws -> AiPreference {
        try await request("/ai-preferences", method: "PATCH", body: body)
    }

    func aiFeedback(interactionId: String, feedback: String) async throws -> AiPreference {
        try await request("/ai-preferences/feedback", method: "POST", body: ["interactionId": interactionId, "feedback": feedback])
    }

    func logAiInteraction(section: String, prompt: String, response: String, modelUsed: String, tokensUsed: Int) async throws -> AiInteractionLogResponse {
        try await request("/ai-preferences/interaction", method: "POST", body: [
            "section": section, "prompt": prompt, "response": response,
            "modelUsed": modelUsed, "tokensUsed": tokensUsed,
        ])
    }

    func fetchAiSuggestion(section: String) async throws -> AiSuggestionResponse {
        try await request("/ai-preferences/suggestions?section=\(section)", method: "GET")
    }

    // MARK: - Menu Add-on

    func fetchMenuAddOns(status: String? = nil) async throws -> [MenuAddOn] {
        try await request("/menu-addons" + (status.map { "?status=\($0)" } ?? ""), method: "GET")
    }

    func fetchActiveAddOns() async throws -> [MenuAddOn] {
        try await request("/menu-addons/active", method: "GET")
    }

    func createMenuAddOn(body: [String: Any]) async throws -> MenuAddOn {
        try await request("/menu-addons", method: "POST", body: body)
    }

    func updateMenuAddOn(id: String, body: [String: Any]) async throws -> MenuAddOn {
        try await request("/menu-addons/\(id)", method: "PATCH", body: body)
    }

    func deleteMenuAddOn(id: String) async throws -> DeleteResponse {
        try await request("/menu-addons/\(id)", method: "DELETE")
    }

    func trackAddOn(id: String, accepted: Bool) async throws -> MenuAddOn {
        try await request("/menu-addons/\(id)/track", method: "POST", body: ["accepted": accepted])
    }

    // MARK: - Note Staff

    func fetchStaffNotes(status: String? = nil) async throws -> [StaffNote] {
        try await request("/staff-notes" + (status.map { "?status=\($0)" } ?? ""), method: "GET")
    }

    func fetchPendingNotes() async throws -> [StaffNote] {
        try await request("/staff-notes/pending", method: "GET")
    }

    func createStaffNote(body: [String: Any]) async throws -> StaffNote {
        try await request("/staff-notes", method: "POST", body: body)
    }

    func ackStaffNote(id: String) async throws -> AckNoteResponse {
        try await request("/staff-notes/\(id)/ack", method: "POST")
    }

    func respondStaffNote(id: String, text: String) async throws -> StaffNote {
        try await request("/staff-notes/\(id)/respond", method: "POST", body: ["text": text])
    }

    func updateStaffNote(id: String, body: [String: Any]) async throws -> StaffNote {
        try await request("/staff-notes/\(id)", method: "PATCH", body: body)
    }

    func deleteStaffNote(id: String) async throws -> DeleteResponse {
        try await request("/staff-notes/\(id)", method: "DELETE")
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
            // Auto-relogin invece di mostrare login screen
            self.session = nil
            await autoLogin()
            if let token = session?.accessToken {
                req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                let (retryData, retryResp) = try await URLSession.shared.data(for: req)
                guard let retryHttp = retryResp as? HTTPURLResponse else {
                    throw APIError.server("Risposta non valida dal server.")
                }
                guard (200..<300).contains(retryHttp.statusCode) else {
                    if let err = try? decoder.decode(APIErrorPayload.self, from: retryData) {
                        throw APIError.server(err.error)
                    }
                    throw APIError.server("Errore server (\(retryHttp.statusCode)).")
                }
                do {
                    return try decoder.decode(T.self, from: retryData)
                } catch {
                    throw APIError.decoding(error)
                }
            }
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
