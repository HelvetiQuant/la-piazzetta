//
//  Models.swift
//  PiazzettaOwner
//
//  Modelli dati condivisi, allineati alle risposte REST dell'API
//  (apps/api) — login, staff/turni, dashboard, contabilità, chat.
//

import Foundation

// MARK: - Auth

struct Session: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let expiresInSec: Int?
    let tokenType: String?
    // user non è restituito dal login; ricavato dal JWT se necessario
}

struct AuthUser: Codable, Equatable, Identifiable {
    let id: String
    let venueId: String
    let email: String?
    let name: String
    let roles: [String]
}

// MARK: - Staff / Turni

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

struct StaffMember: Codable, Identifiable {
    let id: String
    let email: String?
    let name: String
    let roles: [String]
    let hourlyRateCents: Int?
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

// MARK: - Dashboard

struct DashboardKPIs: Codable {
    let totalRevenueCents: Int
    let paidRevenueCents: Int?
    let totalOrders: Int
    let avgTicketCents: Int
    let totalGuests: Int
    let avgDeliverySec: Int?
    let revenueDeltaPct: Double?
    let ordersDeltaPct: Double?
    let guestsDeltaPct: Double?
}

struct DashboardRange: Codable {
    let from: String
    let to: String
    let label: String
}

struct RevenueByDay: Codable, Identifiable {
    var id: String { date }
    let date: String
    let revenueCents: Int
}

struct OrdersByHour: Codable, Identifiable {
    var id: Int { hour }
    let hour: Int
    let count: Int
}

struct TopProduct: Codable, Identifiable {
    var id: String { name }
    let name: String
    let revenueCents: Int
    let quantity: Int
}

struct TopProducts: Codable {
    let byRevenue: [TopProduct]
    let byQuantity: [TopProduct]
}

struct StationBreakdown: Codable, Identifiable {
    var id: String { station }
    let station: String
    let count: Int?
    let revenueCents: Int?
}

struct PaymentStatus: Codable, Identifiable {
    var id: String { status }
    let status: String
    let count: Int?
    let revenueCents: Int?
}

struct DashboardResponse: Codable {
    let range: DashboardRange
    let kpis: DashboardKPIs
    let revenueByDay: [RevenueByDay]
    let ordersByHour: [OrdersByHour]
    let topProducts: TopProducts
    let stationBreakdown: [StationBreakdown]
    let paymentStatus: [PaymentStatus]
}

// MARK: - Menu

struct MenuProduct: Codable, Identifiable {
    let id: String
    let code: String
    let name: String
    let category: String
    let priceCents: Int
    let unit: String
}

// MARK: - Contabilità

struct AccountingAccount: Codable, Identifiable {
    let id: String
    let name: String
    let type: String
    let balanceCents: Int?
}

struct Invoice: Codable, Identifiable {
    let id: String
    let number: String?
    let supplier: String?
    let totalCents: Int
    let status: String
    let issuedAt: Date?
}

// MARK: - Chat staff

enum ChatRoomType: String, Codable {
    case collective = "COLLECTIVE"
    case department = "DEPARTMENT"
    case personal = "PERSONAL"
    case directToOwner = "DIRECT_TO_OWNER"
}

struct ChatRoom: Decodable, Identifiable {
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

    init(id: String, name: String, type: String, department: String?, lastMessage: ChatMessagePreview?) {
        self.id = id; self.name = name; self.type = type; self.department = department; self.lastMessage = lastMessage
    }
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

// MARK: - Comande (board)

struct BoardItem: Codable, Identifiable {
    let id: String
    let name: String
    let quantity: Int
    let station: String
    let status: String
}

struct BoardOrder: Codable, Identifiable {
    let id: String
    let table: String
    let status: String
    let placedAt: Date
    let waitingSec: Int
    let items: [BoardItem]
}

struct Board: Codable {
    let BAR: [BoardOrder]
    let TAVOLA_CALDA: [BoardOrder]
}

// MARK: - Tempi di preparazione

struct StatSummary: Codable {
    let count: Int
    let avgSec: Double?
    let medianSec: Double?
    let p90Sec: Double?
    let minSec: Double?
    let maxSec: Double?
}

struct GroupStats: Codable, Identifiable {
    var id: String { key }
    let key: String
    let label: String
    let station: String?
    let queue: StatSummary
    let prep: StatSummary
    let stationTotal: StatSummary
}

struct StationTotalEntry: Codable, Identifiable {
    var id: String { station }
    let station: String
    let stationTotal: StatSummary
}

struct PrepTimeStats: Codable {
    let groupBy: String
    let station: String
    let groups: [GroupStats]
    let delivery: StatSummary
    let byStation: [StationTotalEntry]
}

// MARK: - Marketing

struct MediaAsset: Codable, Identifiable {
    let id: String
    let type: String
    let source: String
    let url: String
    let thumbnailUrl: String?
    let mimeType: String?
    let sizeBytes: Int?
    let altText: String?
    let createdAt: Date
}

struct SocialPostMediaAsset: Codable {
    let id: String
    let url: String
}

struct SocialPostCampaignSummary: Codable {
    let id: String
    let name: String
}

struct SocialPostCount: Codable {
    let comments: Int
}

struct SocialPost: Codable, Identifiable {
    let id: String
    let mediaAssetId: String?
    let campaignId: String?
    let caption: String
    let hashtags: [String]
    let platforms: [String]
    let status: String
    let scheduledAt: Date?
    let publishedAt: Date?
    let aiGenerated: Bool
    let aiPrompt: String?
    let createdAt: Date
    let mediaAsset: SocialPostMediaAsset?
    let campaign: SocialPostCampaignSummary?
    let count: SocialPostCount?

    enum CodingKeys: String, CodingKey {
        case id, mediaAssetId, campaignId, caption, hashtags, platforms, status
        case scheduledAt, publishedAt, aiGenerated, aiPrompt, createdAt
        case mediaAsset, campaign
        case count = "_count"
    }
}

struct SocialAccount: Codable, Identifiable {
    let id: String
    let platform: String
    let accountId: String
    let username: String?
    let displayName: String?
    let avatarUrl: String?
    let active: Bool
    let connectedAt: Date
    let lastSyncAt: Date?
    let scopes: [String]
}

struct SocialCommentPostSummary: Codable {
    let id: String
    let caption: String
}

struct SocialComment: Codable, Identifiable {
    let id: String
    let socialPostId: String?
    let platform: String
    let platformCommentId: String
    let authorName: String?
    let authorAvatarUrl: String?
    let text: String
    let likesCount: Int
    let repliedAt: Date?
    let replyText: String?
    let aiAutoReplied: Bool
    let needsReply: Bool
    let receivedAt: Date
    let createdAt: Date
    let socialPost: SocialCommentPostSummary?
}

struct Campaign: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let startDate: Date?
    let endDate: Date?
    let budgetCents: Int
    let status: String
    let createdAt: Date
    let count: CampaignPostCount?

    enum CodingKeys: String, CodingKey {
        case id, name, description, startDate, endDate, budgetCents, status, createdAt
        case count = "_count"
    }
}

struct CampaignPostCount: Codable {
    let posts: Int
}

struct MarketingAnalyticsTotals: Codable {
    let impressions: Int
    let reach: Int
    let likes: Int
    let comments: Int
    let shares: Int
    let saves: Int
    let profileVisits: Int
    let websiteClicks: Int
}

struct MarketingAnalyticsRange: Codable {
    let from: String
    let to: String
}

struct MarketingAnalyticsPlatform: Codable, Identifiable {
    var id: String { platform }
    let platform: String
    let impressions: Int
    let reach: Int
    let likes: Int
    let comments: Int
    let shares: Int
}

struct MarketingAnalyticsDay: Codable, Identifiable {
    var id: String { date }
    let date: String
    let impressions: Int
    let reach: Int
    let likes: Int
    let comments: Int
}

struct MarketingAnalyticsTopPost: Codable, Identifiable {
    let id: String
    let caption: String
    let mediaUrl: String?
    let publishedAt: Date?
    let totalImpressions: Int
    let totalReach: Int
    let totalLikes: Int
    let totalComments: Int
}

struct MarketingAnalytics: Codable {
    let range: MarketingAnalyticsRange?
    let totals: MarketingAnalyticsTotals
    let byPlatform: [MarketingAnalyticsPlatform]
    let byDay: [MarketingAnalyticsDay]
    let topPosts: [MarketingAnalyticsTopPost]
    let followerCount: Int
}

// MARK: - Marketing API response types

struct GeneratePostResponse: Codable {
    let caption: String
    let hashtags: [String]
}

struct CanvaCreateResponse: Codable {
    let asset: MediaAsset
    let designId: String
    let exportUrl: String
}

struct GammaCreateResponse: Codable {
    let asset: MediaAsset
    let docId: String
    let url: String
}

struct PublishPostResponse: Codable {
    let status: String
}

struct ConnectAccountResponse: Codable {
    let id: String
    let platform: String
    let accountId: String
}

struct SyncResponse: Codable {
    let synced: Int
}

struct AutoReplyResponse: Codable {
    let replyText: String
}

struct DeleteResponse: Codable {
    let ok: Bool
}

// MARK: - Magazzino

struct StockItem: Codable, Identifiable {
    var id: String { productId }
    let productId: String
    let name: String
    let category: String
    let unit: String
    let quantity: Double
    let reorderLevel: Double
    let parLevel: Double
    let low: Bool
}

struct StockResponse: Codable {
    let items: [StockItem]
    let lowCount: Int
}

struct LowStockItem: Codable, Identifiable {
    var id: String { productId }
    let productId: String
    let name: String
    let quantity: Double
    let reorderLevel: Double
}

struct StockMovementProduct: Codable {
    let name: String
    let unit: String
}

struct StockMovement: Codable, Identifiable {
    let id: String
    let type: String
    let qtyDelta: Double
    let qtyAfter: Double
    let reason: String?
    let createdAt: Date
    let product: StockMovementProduct
}

struct MovementResponse: Codable {
    let productId: String
    let quantity: Double
}

struct StockLevelResponse: Codable {
    let productId: String
    let quantity: Double
    let reorderLevel: Double
    let parLevel: Double
}

// MARK: - Fornitori / Acquisti

struct SupplierCount: Codable {
    let listings: Int
}

struct Supplier: Codable, Identifiable {
    let id: String
    let name: String
    let email: String?
    let phone: String?
    let notes: String?
    let active: Bool
    let count: SupplierCount?

    enum CodingKeys: String, CodingKey {
        case id, name, email, phone, notes, active
        case count = "_count"
    }
}

struct ListingProduct: Codable {
    let name: String
    let unit: String
}

struct Listing: Codable, Identifiable {
    let id: String
    let productId: String
    let supplierSku: String?
    let packSize: Int
    let packPriceCents: Int
    let leadTimeDays: Int
    let preferred: Bool
    let product: ListingProduct
}

struct PoProduct: Codable {
    let name: String
    let unit: String
}

struct PoItem: Codable, Identifiable {
    let id: String
    let productId: String
    let packSize: Double
    let packsOrdered: Int
    let packsReceived: Int
    let packPriceCents: Int
    let product: PoProduct
}

struct PoSupplier: Codable {
    let name: String
}

struct PurchaseOrder: Codable, Identifiable {
    let id: String
    let status: String
    let totalCents: Int
    let note: String?
    let supplier: PoSupplier
    let items: [PoItem]
    let sentAt: Date?
    let receivedAt: Date?
    let createdAt: Date
}

struct ProposalLine: Codable, Identifiable {
    var id: String { productId }
    let productId: String
    let name: String
    let unit: String
    let quantity: Double
    let reorderLevel: Double
    let targetLevel: Double
    let packSize: Double
    let packs: Int
    let orderedBase: Double
    let packPriceCents: Int
    let lineCostCents: Int
}

struct ReorderProposal: Codable, Identifiable {
    var id: String { supplierId }
    let supplierId: String
    let supplierName: String
    let lines: [ProposalLine]
    let totalCents: Int
}

struct UnassignedProduct: Codable, Identifiable {
    var id: String { productId }
    let productId: String
    let name: String
    let deficitBase: Double
}

struct ReorderProposalsResponse: Codable {
    let proposals: [ReorderProposal]
    let unassigned: [UnassignedProduct]
}

// MARK: - Crediti clienti

struct Customer: Codable, Identifiable {
    let id: String
    let name: String
    let phone: String?
    let email: String?
    let notes: String?
    let balanceCents: Int
    let limitCents: Int
    let active: Bool
}

struct CustomersResponse: Codable {
    let customers: [Customer]
    let totalOutstandingCents: Int
}

struct CreditTransaction: Codable, Identifiable {
    let id: String
    let type: String
    let amountCents: Int
    let balanceAfterCents: Int
    let method: String?
    let note: String?
    let createdAt: Date
}

struct CustomerDetail: Codable {
    let customer: Customer
    let transactions: [CreditTransaction]
}

struct AddTransactionResponse: Codable {
    let customer: Customer
    let transaction: CreditTransaction
}

// MARK: - Stipendi

struct PayrollUser: Codable {
    let name: String
    let email: String
    let roles: [String]
}

struct PayrollEntry: Codable, Identifiable {
    let id: String
    let userId: String
    let periodStart: Date
    let periodEnd: Date
    let totalHours: Double
    let hourlyRateCents: Int
    let basePayCents: Int
    let bonusCents: Int
    let deductionCents: Int
    let netPayCents: Int
    let status: String
    let note: String?
    let user: PayrollUser
}

struct PayrollByEmployee: Codable, Identifiable {
    var id: String { userId }
    let userId: String
    let name: String
    let netPayCents: Int
    let hours: Double
    let status: String
}

struct PayrollSummary: Codable {
    let totalGrossCents: Int
    let totalNetCents: Int
    let totalDeductionsCents: Int
    let totalBonusCents: Int
    let totalHours: Double
    let count: Int
    let byEmployee: [PayrollByEmployee]
}

// MARK: - Orari (turni pianificati)

struct ScheduleUser: Codable {
    let id: String
    let name: String
    let roles: [String]
    let hourlyRateCents: Int
}

struct ScheduledShift: Codable, Identifiable {
    let id: String
    let userId: String
    let date: Date
    let startHour: Int
    let endHour: Int
    let role: String?
    let station: String?
    let status: String
    let aiSuggested: Bool
    let note: String?
    let user: ScheduleUser
}

struct AvailabilityUser: Codable {
    let id: String
    let name: String
    let roles: [String]
}

struct AvailabilitySlot: Codable, Identifiable {
    let id: String
    let userId: String
    let dayOfWeek: Int
    let startHour: Int
    let endHour: Int
    let preference: String
    let note: String?
    let user: AvailabilityUser?
}

struct APIErrorPayload: Codable {
    let error: String
}

// MARK: - AI Preferences (assistente adattivo)

/// Blob JSON grezzo, usato per campi eterogenei (sectionWeights, preferredTopics…)
/// che l'API restituisce come oggetto/array libero.
struct AnyJSON: Codable {
    let value: Any?

    init(_ value: Any?) { self.value = value }

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode([String: AnyJSON].self) { value = v.mapValues { $0.value } }
        else if let v = try? c.decode([AnyJSON].self) { value = v.map { $0.value } }
        else if let v = try? c.decode(String.self) { value = v }
        else if let v = try? c.decode(Double.self) { value = v }
        else if let v = try? c.decode(Bool.self) { value = v }
        else { value = nil }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let v as [String: Any]: try c.encode(v.mapValues { AnyJSON($0) })
        case let v as [Any]: try c.encode(v.map { AnyJSON($0) })
        case let v as String: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Bool: try c.encode(v)
        default: try c.encodeNil()
        }
    }

    /// Elenco di stringhe se il valore sottostante è un array di stringhe.
    var stringArray: [String] {
        (value as? [Any])?.compactMap { $0 as? String } ?? []
    }
}

struct AiPreference: Codable {
    let sectionWeights: AnyJSON?
    let tonePreference: String
    let language: String?
    let suggestionFrequency: String
    let lastSuggestionAt: Date?
    let interactionCount: Int
    let positiveFeedback: Int
    let negativeFeedback: Int
    let preferredTopics: AnyJSON?
    let avoidedTopics: AnyJSON?
}

struct AiInteraction: Codable, Identifiable {
    let id: String
    let venueId: String?
    let section: String
    let prompt: String
    let response: String
    let feedback: String?
    let modelUsed: String?
    let tokensUsed: Int?
    let createdAt: Date?
}

struct AiInteractionLogResponse: Codable {
    let interaction: AiInteraction
    let prefs: AiPreference?
}

struct AiSuggestionResponse: Codable {
    let suggestion: String?
    let prefs: AiPreference?
}

// MARK: - Menu Add-on (consigli staff)

struct AddOnProduct: Codable {
    let id: String?
    let name: String
    let code: String?
    let priceCents: Int?
    let category: String?
}

// MARK: - Note Staff

enum StaffNoteType: String, Codable, CaseIterable, Identifiable {
    case note = "NOTE"
    case task = "TASK"
    case warning = "WARNING"
    case rule = "RULE"
    case suggestion = "SUGGESTION"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .note: return "Nota"
        case .task: return "Task"
        case .warning: return "Avviso"
        case .rule: return "Regola"
        case .suggestion: return "Suggerimento"
        }
    }

    var icon: String {
        switch self {
        case .note: return "note.text"
        case .task: return "checklist"
        case .warning: return "exclamationmark.triangle.fill"
        case .rule: return "scroll.fill"
        case .suggestion: return "lightbulb.fill"
        }
    }
}

enum StaffNoteScope: String, Codable, CaseIterable, Identifiable {
    case all = "ALL"
    case department = "DEPARTMENT"
    case individual = "INDIVIDUAL"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "Tutti"
        case .department: return "Reparto"
        case .individual: return "Singolo"
        }
    }
}

/// Reparti usati come targetValue quando targetScope == DEPARTMENT.
enum StaffDepartment: String, Codable, CaseIterable, Identifiable {
    case kitchen = "KITCHEN"
    case bar = "BAR"
    case waiters = "WAITERS"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .kitchen: return "Cucina"
        case .bar: return "Bar"
        case .waiters: return "Sala"
        }
    }

    /// Ruolo staff corrispondente, per stimare i destinatari del reparto.
    var staffRole: String {
        switch self {
        case .kitchen: return "COOK"
        case .bar: return "BARMAN"
        case .waiters: return "WAITER"
        }
    }
}

struct StaffNoteResponse: Codable, Identifiable {
    let userId: String
    let text: String
    let at: Date

    var id: String { "\(userId)-\(at.timeIntervalSince1970)" }
}

struct StaffNote: Codable, Identifiable {
    let id: String
    let venueId: String
    let senderId: String
    let targetScope: String
    let targetValue: String
    let type: String
    let priority: Int
    let title: String
    let body: String
    let dueDate: Date?
    let requiresAck: Bool
    let acknowledgedBy: [String]
    let responses: [StaffNoteResponse]
    let status: String
    let createdAt: Date
    let updatedAt: Date

    var noteType: StaffNoteType { StaffNoteType(rawValue: type) ?? .note }
    var scope: StaffNoteScope { StaffNoteScope(rawValue: targetScope) ?? .all }
}

struct AckNoteResponse: Codable {
    let ok: Bool
    let acknowledgedBy: [String]
}

struct MenuAddOn: Codable, Identifiable {
    let id: String
    let venueId: String?
    let productId: String
    let product: AddOnProduct?
    let title: String
    let staffScript: String
    let targetRoles: AnyJSON?
    let activeFrom: Date?
    let activeTo: Date?
    let timeWindow: String?
    let weekDays: AnyJSON?
    let priority: Int
    let discountPct: Double?
    let status: String
    let timesProposed: Int
    let timesAccepted: Int
    let createdAt: Date?
    let updatedAt: Date?

    var conversionRate: Double {
        timesProposed > 0 ? Double(timesAccepted) / Double(timesProposed) : 0
    }
}
