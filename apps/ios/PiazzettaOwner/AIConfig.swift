//
//  AIConfig.swift
//  PiazzettaOwner (macOS)
//
//  Configurazione per l'integrazione con l'API Anthropic (Claude) e
//  helper Keychain per salvare le credenziali in modo sicuro.
//
//  NOTA: Anthropic non pubblica oggi un endpoint OAuth "Login with Google/email"
//  per app di terze parti che restituisca un token utilizzabile sulla Messages
//  API: l'autenticazione ufficiale avviene tramite API key (header `x-api-key`).
//  I campi OAuth qui sotto sono un punto di estensione pronto all'uso — se in
//  futuro Anthropic espone un client OAuth reale, basta compilarli e il flusso
//  in AIAssistant funziona senza altre modifiche. Finché non lo sono,
//  `isOAuthConfigured` resta `false` e l'app usa la API key manuale.
//

import Foundation
import Security

enum AIConfig {
    /// Endpoint Messages API di Anthropic.
    static let apiBaseURL = URL(string: "https://api.anthropic.com/v1/messages")!
    static let apiVersion = "2023-06-01"
    /// Modello medio-basso, economico: sufficiente per suggerimenti pratici e concisi.
    static let model = "claude-haiku-4-5-20250929"
    /// Usato se il modello principale non è disponibile per l'account (es. accesso non ancora propagato).
    static let modelFallback = "claude-3-5-haiku-latest"
    static let maxTokens = 1024

    // MARK: - OAuth (scaffold, vedi nota sopra)

    static let oauthClientID = ""
    static let oauthAuthorizeURL = URL(string: "https://claude.ai/oauth/authorize")
    static let oauthTokenURL = URL(string: "https://api.anthropic.com/oauth/token")
    static let oauthRedirectURI = "piazzettaowner://oauth-callback"
    static let oauthScopes = ["messages:write"]

    static var isOAuthConfigured: Bool { !oauthClientID.isEmpty }
}

/// Nomi degli "account" Keychain usati per salvare le credenziali AI.
enum AIKeychainAccount {
    static let apiKey = "anthropic-api-key"
    static let oauthAccessToken = "anthropic-oauth-access-token"
    static let oauthRefreshToken = "anthropic-oauth-refresh-token"
}

/// Wrapper minimale su Security.framework per salvare stringhe sensibili
/// (API key, token OAuth) nel Keychain di macOS.
enum AIKeychain {
    private static let service = "com.piazzetta.owner.macos.ai"

    static func save(_ value: String, account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)

        var attributes = query
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(attributes as CFDictionary, nil)
    }

    static func read(account: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
