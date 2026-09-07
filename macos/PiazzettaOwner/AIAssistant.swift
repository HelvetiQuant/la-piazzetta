//
//  AIAssistant.swift
//  PiazzettaOwner (macOS)
//
//  Assistente AI nativo basato sull'API Anthropic (Claude Messages API),
//  con contesto sui dati del locale (vendite, magazzino, crediti) e
//  streaming SSE delle risposte.
//

import Foundation
import SwiftUI
import AppKit
import AuthenticationServices

// MARK: - Modello messaggi

struct AIChatMessage: Identifiable {
    enum Role: Equatable {
        case user, assistant
    }

    let id = UUID()
    let role: Role
    var text: String
    var isStreaming: Bool = false
    /// Id dell'AiInteraction registrata sul backend per questo messaggio (solo assistant),
    /// usato per collegare il feedback pollice su/giù.
    var interactionId: String? = nil
    /// "positive" / "negative" una volta che l'owner ha dato un feedback.
    var feedback: String? = nil
}

enum AICredentialState: Equatable {
    case none
    case apiKey
    case oauth
}

enum AIAssistantError: LocalizedError {
    case oauthNotConfigured
    case oauthCancelled
    case missingCredentials
    case server(String)

    var errorDescription: String? {
        switch self {
        case .oauthNotConfigured:
            return "Il login OAuth Anthropic non è ancora pubblico: inserisci una API key nelle impostazioni dell'assistente."
        case .oauthCancelled:
            return "Accesso annullato."
        case .missingCredentials:
            return "Nessuna credenziale Anthropic configurata. Apri le impostazioni dell'assistente."
        case .server(let message):
            return message
        }
    }
}

@MainActor
final class AIAssistant: NSObject, ObservableObject {
    static let shared = AIAssistant()

    @Published private(set) var messages: [AIChatMessage] = []
    @Published private(set) var credentialState: AICredentialState = .none
    @Published var isSending = false
    @Published var lastError: String?

    /// Preferenze adattive caricate dal backend (tono, argomenti preferiti/evitati,
    /// frequenza suggerimenti…). Si aggiornano ad ogni interazione/feedback.
    @Published private(set) var preferences: AiPreference?
    /// Suggerimento proattivo corrente per la sezione attiva, mostrato come banner
    /// discreto non invadente. `nil` quando non c'è nulla da proporre.
    @Published var suggestion: String?

    /// Riassunto testuale dei dati correnti del locale, ricostruito da
    /// `updateContext` e iniettato nel system prompt.
    private var contextSummary = ""
    private var webAuthSession: ASWebAuthenticationSession?
    private var dismissStreak = 0
    private var lastSuggestionSection: String?
    private var lastSuggestionFetchAt: Date?

    private override init() {
        super.init()
        refreshCredentialState()
        messages = [
            AIChatMessage(
                role: .assistant,
                text: "Ciao! Sono l'assistente AI de La Piazzetta. Posso aiutarti con analisi vendite, menu, marketing, turni staff e contabilità. Come posso darti una mano oggi?"
            )
        ]
    }

    // MARK: - Credenziali

    func refreshCredentialState() {
        if AIKeychain.read(account: AIKeychainAccount.oauthAccessToken) != nil {
            credentialState = .oauth
        } else if AIKeychain.read(account: AIKeychainAccount.apiKey) != nil {
            credentialState = .apiKey
        } else {
            credentialState = .none
        }
    }

    func saveAPIKey(_ key: String) {
        let trimmed = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        AIKeychain.save(trimmed, account: AIKeychainAccount.apiKey)
        refreshCredentialState()
    }

    func signOut() {
        AIKeychain.delete(account: AIKeychainAccount.apiKey)
        AIKeychain.delete(account: AIKeychainAccount.oauthAccessToken)
        AIKeychain.delete(account: AIKeychainAccount.oauthRefreshToken)
        refreshCredentialState()
    }

    /// Avvia il login OAuth via browser di sistema (Google/email) usando
    /// ASWebAuthenticationSession. Richiede che AIConfig.isOAuthConfigured
    /// sia true — vedi nota in AIConfig.swift.
    func startOAuthLogin() async throws {
        guard AIConfig.isOAuthConfigured, let authorizeURL = AIConfig.oauthAuthorizeURL else {
            throw AIAssistantError.oauthNotConfigured
        }
        guard var components = URLComponents(url: authorizeURL, resolvingAgainstBaseURL: false) else {
            throw AIAssistantError.oauthNotConfigured
        }
        components.queryItems = [
            URLQueryItem(name: "client_id", value: AIConfig.oauthClientID),
            URLQueryItem(name: "redirect_uri", value: AIConfig.oauthRedirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: AIConfig.oauthScopes.joined(separator: " ")),
        ]
        guard let url = components.url,
              let callbackScheme = URL(string: AIConfig.oauthRedirectURI)?.scheme else {
            throw AIAssistantError.oauthNotConfigured
        }

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: AIAssistantError.oauthCancelled)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.webAuthSession = session
            session.start()
        }

        guard let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "code" })?.value else {
            throw AIAssistantError.oauthCancelled
        }
        try await exchangeCodeForToken(code)
        refreshCredentialState()
    }

    private func exchangeCodeForToken(_ code: String) async throws {
        guard let tokenURL = AIConfig.oauthTokenURL else { throw AIAssistantError.oauthNotConfigured }
        var req = URLRequest(url: tokenURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "grant_type": "authorization_code",
            "code": code,
            "client_id": AIConfig.oauthClientID,
            "redirect_uri": AIConfig.oauthRedirectURI,
        ])

        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw AIAssistantError.server("Scambio del codice OAuth non riuscito.")
        }
        struct TokenResponse: Decodable {
            let access_token: String
            let refresh_token: String?
        }
        let decoded = try JSONDecoder().decode(TokenResponse.self, from: data)
        AIKeychain.save(decoded.access_token, account: AIKeychainAccount.oauthAccessToken)
        if let refresh = decoded.refresh_token {
            AIKeychain.save(refresh, account: AIKeychainAccount.oauthRefreshToken)
        }
    }

    // MARK: - Contesto app (venduto, magazzino, crediti…)

    /// Ricostruisce un riassunto testuale dei dati correnti del locale usando
    /// l'APIClient già autenticato, così i suggerimenti restano ancorati alla
    /// realtà del venue invece di essere generici.
    func updateContext(activeSection: String, api: APIClient) async {
        var lines = ["Sezione attualmente aperta nell'app: \(activeSection)."]

        if let dashboard = try? await api.fetchDashboard(range: "today") {
            let revenue = Double(dashboard.kpis.totalRevenueCents) / 100.0
            let ticket = Double(dashboard.kpis.avgTicketCents) / 100.0
            lines.append("Vendite di oggi: \(dashboard.kpis.totalOrders) ordini, incasso \(revenue.formatted(.currency(code: "EUR"))), scontrino medio \(ticket.formatted(.currency(code: "EUR"))).")
            if let top = dashboard.topProducts.byQuantity.first {
                lines.append("Prodotto più venduto oggi: \(top.name) (\(top.quantity)×).")
            }
        }
        if let stock = try? await api.fetchStock(), stock.lowCount > 0 {
            lines.append("Attenzione: \(stock.lowCount) articoli di magazzino sotto la soglia di riordino.")
        }
        if let customers = try? await api.fetchCustomers(debtorsOnly: true), !customers.customers.isEmpty {
            let total = Double(customers.totalOutstandingCents) / 100.0
            lines.append("Crediti clienti in sospeso: \(total.formatted(.currency(code: "EUR"))) su \(customers.customers.count) clienti.")
        }

        contextSummary = lines.joined(separator: "\n")
    }

    // MARK: - Preferenze adattive (impara dall'owner)

    /// Da chiamare all'avvio dell'app: carica tono/argomenti/frequenza suggerimenti.
    func loadPreferences(api: APIClient) async {
        preferences = try? await api.fetchAiPreferences()
    }

    /// Suggerimento contestuale non invadente per la sezione in cui l'owner è entrato.
    /// Rispetta il rate-limit lato backend; qui evitiamo solo richieste ripetute
    /// per la stessa sezione entro pochi secondi.
    func loadSuggestion(section: String, api: APIClient) async {
        if section == lastSuggestionSection,
           let last = lastSuggestionFetchAt, Date().timeIntervalSince(last) < 30 {
            return
        }
        lastSuggestionSection = section
        lastSuggestionFetchAt = Date()
        guard let result = try? await api.fetchAiSuggestion(section: section) else { return }
        if let prefs = result.prefs { preferences = prefs }
        if let text = result.suggestion, !text.isEmpty {
            withAnimation { suggestion = text }
        }
    }

    /// L'owner ha chiuso il banner senza aprirlo: se succede 3 volte di fila,
    /// abbassiamo automaticamente la frequenza per non essere invadenti.
    func dismissSuggestion(api: APIClient) {
        suggestion = nil
        dismissStreak += 1
        if dismissStreak >= 3 {
            dismissStreak = 0
            Task {
                if let prefs = try? await api.updateAiPreferences(["suggestionFrequency": "low"]) {
                    preferences = prefs
                }
            }
        }
    }

    /// L'owner ha accettato il suggerimento (apre la chat): resetta lo streak di dismiss
    /// e restituisce il testo da precompilare/mostrare in chat.
    @discardableResult
    func acceptSuggestion() -> String? {
        dismissStreak = 0
        let text = suggestion
        suggestion = nil
        return text
    }

    /// Registra pollice su/giù per un messaggio già loggato come AiInteraction.
    func recordFeedback(for messageId: UUID, feedback: String, api: APIClient) async {
        guard let index = messages.firstIndex(where: { $0.id == messageId }),
              let interactionId = messages[index].interactionId else { return }
        messages[index].feedback = feedback
        if let prefs = try? await api.aiFeedback(interactionId: interactionId, feedback: feedback) {
            preferences = prefs
        }
    }

    private var systemPrompt: String {
        var lines = [
            "Sei l'assistente digitale di La Piazzetta, un bar e tavola calda italiana.",
            "Sei utile, amichevole ma non invadente. Rispondi in modo conciso e pratico.",
            "Quando l'owner ti chiede consiglio, usa i dati reali del ristorante che ti fornisco.",
            "Non fare domande se non necessario. Proponi soluzioni concrete.",
        ]
        switch preferences?.tonePreference {
        case "concise": lines.append("Preferenza owner: risposte molto brevi, massimo 3-4 frasi.")
        case "detailed": lines.append("Preferenza owner: risposte più articolate e dettagliate, con esempi.")
        default: break
        }
        let preferred = preferences?.preferredTopics?.stringArray ?? []
        if !preferred.isEmpty { lines.append("Dai più peso a questi argomenti quando rilevanti: \(preferred.joined(separator: ", ")).") }
        let avoided = preferences?.avoidedTopics?.stringArray ?? []
        if !avoided.isEmpty { lines.append("Evita di soffermarti su: \(avoided.joined(separator: ", ")).") }
        lines.append("")
        lines.append("Contesto attuale del locale:")
        lines.append(contextSummary.isEmpty ? "Nessun dato disponibile al momento." : contextSummary)
        return lines.joined(separator: "\n")
    }

    // MARK: - Invio messaggi con streaming SSE

    func send(_ text: String, section: String, api: APIClient) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isSending else { return }
        guard credentialState != .none else {
            lastError = AIAssistantError.missingCredentials.errorDescription
            return
        }

        lastError = nil
        messages.append(AIChatMessage(role: .user, text: trimmed))
        let assistantIndex = messages.count
        messages.append(AIChatMessage(role: .assistant, text: "", isStreaming: true))
        isSending = true
        defer { isSending = false }

        var outputTokens = 0
        var usedModel = AIConfig.model
        do {
            outputTokens = try await streamCompletion(model: usedModel) { [weak self] delta in
                guard let self, assistantIndex < self.messages.count else { return }
                self.messages[assistantIndex].text += delta
            }
        } catch {
            // Se il modello principale non è disponibile per l'account, riprova col fallback.
            usedModel = AIConfig.modelFallback
            do {
                outputTokens = try await streamCompletion(model: usedModel) { [weak self] delta in
                    guard let self, assistantIndex < self.messages.count else { return }
                    self.messages[assistantIndex].text += delta
                }
            } catch {
                lastError = error.localizedDescription
                if assistantIndex < messages.count, messages[assistantIndex].text.isEmpty {
                    messages[assistantIndex].text = "⚠️ \(error.localizedDescription)"
                }
            }
        }
        if assistantIndex < messages.count {
            messages[assistantIndex].isStreaming = false
        }

        // Pipeline adattiva: registra l'interazione così il backend può imparare
        // (tono, argomenti, frequenza suggerimenti) — non blocca la UI.
        if assistantIndex < messages.count, !messages[assistantIndex].text.isEmpty, lastError == nil {
            let responseText = messages[assistantIndex].text
            if let result = try? await api.logAiInteraction(
                section: section, prompt: trimmed, response: responseText,
                modelUsed: usedModel, tokensUsed: outputTokens
            ) {
                if assistantIndex < self.messages.count {
                    self.messages[assistantIndex].interactionId = result.interaction.id
                }
                if let prefs = result.prefs { preferences = prefs }
            }
        }
    }

    /// Esegue la chiamata di streaming con il modello indicato; restituisce i token
    /// di output riportati dall'evento `message_delta` finale (per il logging).
    private func streamCompletion(model: String, onDelta: @escaping (String) -> Void) async throws -> Int {
        var req = URLRequest(url: AIConfig.apiBaseURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue(AIConfig.apiVersion, forHTTPHeaderField: "anthropic-version")

        switch credentialState {
        case .apiKey:
            guard let key = AIKeychain.read(account: AIKeychainAccount.apiKey) else {
                throw AIAssistantError.missingCredentials
            }
            req.setValue(key, forHTTPHeaderField: "x-api-key")
        case .oauth:
            guard let token = AIKeychain.read(account: AIKeychainAccount.oauthAccessToken) else {
                throw AIAssistantError.missingCredentials
            }
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        case .none:
            throw AIAssistantError.missingCredentials
        }

        let history = messages.dropLast().suffix(20).map { message in
            ["role": message.role == .user ? "user" : "assistant", "content": message.text]
        }
        req.httpBody = try JSONSerialization.data(withJSONObject: [
            "model": model,
            "max_tokens": AIConfig.maxTokens,
            "system": systemPrompt,
            "stream": true,
            "messages": history,
        ])

        let (bytes, response) = try await URLSession.shared.bytes(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw AIAssistantError.server("Risposta non valida dal server Anthropic.")
        }
        guard (200..<300).contains(http.statusCode) else {
            var raw = ""
            for try await line in bytes.lines { raw += line }
            throw AIAssistantError.server(Self.extractErrorMessage(from: raw) ?? "Errore Anthropic (\(http.statusCode)).")
        }

        var outputTokens = 0
        for try await line in bytes.lines {
            guard line.hasPrefix("data:") else { continue }
            let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
            guard payload != "[DONE]", let data = payload.data(using: .utf8) else { continue }
            guard let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            guard let type = event["type"] as? String else { continue }
            if type == "content_block_delta",
               let delta = event["delta"] as? [String: Any], let text = delta["text"] as? String {
                onDelta(text)
            } else if type == "message_delta",
                      let usage = event["usage"] as? [String: Any], let out = usage["output_tokens"] as? Int {
                outputTokens = out
            }
        }
        return outputTokens
    }

    private static func extractErrorMessage(from raw: String) -> String? {
        guard let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = json["error"] as? [String: Any],
              let message = error["message"] as? String else { return nil }
        return message
    }
}

extension AIAssistant: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }
}
