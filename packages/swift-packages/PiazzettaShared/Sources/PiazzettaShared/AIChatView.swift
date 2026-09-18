//
//  AIChatView.swift
//  PiazzettaOwner (macOS)
//
//  Chat con l'assistente AI: bolle messaggio, azioni rapide, indicatore
//  di digitazione animato e impostazioni credenziali (API key / OAuth).
//

import SwiftUI

struct AIChatView: View {
    @EnvironmentObject private var assistant: AIAssistant
    @EnvironmentObject private var api: APIClient
    @State private var draft = ""
    @State private var showSettings = false

    /// Sezione attiva nell'app, usata per suggerimenti contestuali e per il
    /// contesto passato al modello.
    var activeSection: String = "Assistente AI"

    private let quickActions: [(icon: String, title: String, prompt: String)] = [
        ("chart.line.uptrend.xyaxis", "Analizza vendite", "Analizza le vendite di oggi e dammi 3 spunti concreti per migliorare l'incasso."),
        ("fork.knife", "Suggerisci menu", "In base ai prodotti più e meno venduti, suggerisci 2 modifiche al menu."),
        ("calendar.badge.clock", "Ottimizza turni", "Suggerisci come ottimizzare i turni dello staff per la prossima settimana in base al traffico abituale."),
        ("camera.on.rectangle", "Post Instagram", "Scrivi un post Instagram nel tono del brand La Piazzetta per promuovere il piatto del giorno, con hashtag."),
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            messageList
            if let error = assistant.lastError {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .padding(.horizontal)
                    .padding(.top, 6)
            }
            quickActionsBar
            Divider()
            inputBar
        }
        .frame(minWidth: 380, idealWidth: 420, minHeight: 480, idealHeight: 620)
        .background(Brand.background)
        .task { await assistant.updateContext(activeSection: activeSection, api: api) }
        .onChange(of: activeSection) { _, newValue in
            Task { await assistant.updateContext(activeSection: newValue, api: api) }
        }
        .sheet(isPresented: $showSettings) { AISettingsView() }
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundStyle(Brand.accentGradient)
                .symbolEffect(.variableColor.iterative, options: .repeating, isActive: assistant.isSending)
            VStack(alignment: .leading, spacing: 0) {
                Text("Assistente AI").font(.headline)
                Text("La Piazzetta · \(activeSection)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
            }
            .adaptiveGlassButton()
            .help("Impostazioni assistente AI")
        }
        .padding()
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    ForEach(assistant.messages) { message in
                        AIMessageBubble(message: message)
                            .id(message.id)
                    }
                }
                .padding()
                .animation(.spring(duration: 0.35), value: assistant.messages.count)
            }
            .onChange(of: assistant.messages.count) { _, _ in
                if let last = assistant.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private var quickActionsBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(quickActions, id: \.title) { action in
                    Button {
                        Task { await assistant.send(action.prompt, section: activeSection, api: api) }
                    } label: {
                        Label(action.title, systemImage: action.icon)
                            .font(.caption.weight(.medium))
                    }
                    .adaptiveGlassButton()
                    .disabled(assistant.isSending)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 8)
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Scrivi all'assistente…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .textFieldStyle(.plain)
                .padding(10)
                .glassCard(cornerRadius: 14)
                .onSubmit(send)
            Button(action: send) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title)
                    .symbolEffect(.bounce, value: assistant.isSending)
            }
            .adaptiveGlassProminentButton()
            .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || assistant.isSending)
        }
        .padding()
    }

    private func send() {
        let text = draft
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        draft = ""
        Task { await assistant.send(text, section: activeSection, api: api) }
    }
}

// MARK: - Bolla messaggio

private struct AIMessageBubble: View {
    let message: AIChatMessage
    @EnvironmentObject private var assistant: AIAssistant
    @EnvironmentObject private var api: APIClient

    var body: some View {
        HStack(alignment: .top) {
            if message.role == .user { Spacer(minLength: 40) }

            VStack(alignment: .leading, spacing: 6) {
                Group {
                    if message.text.isEmpty && message.isStreaming {
                        TypingIndicator()
                    } else {
                        Text(message.text)
                            .textSelection(.enabled)
                    }
                }
                .padding(12)
                .foregroundStyle(message.role == .user ? Color.white : Color.primary)
                .background {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(message.role == .user ? Brand.accentGradient : LinearGradient(colors: [Brand.cardBackground], startPoint: .top, endPoint: .bottom))
                }
                .glassCard(cornerRadius: 16)

                // Feedback pollice su/giù: alimenta la pipeline adattiva sul backend.
                if message.role == .assistant, !message.isStreaming, message.interactionId != nil {
                    HStack(spacing: 8) {
                        feedbackButton(value: "positive", icon: "hand.thumbsup", activeIcon: "hand.thumbsup.fill", color: Brand.success)
                        feedbackButton(value: "negative", icon: "hand.thumbsdown", activeIcon: "hand.thumbsdown.fill", color: Brand.danger)
                    }
                    .padding(.leading, 4)
                }
            }

            if message.role != .user { Spacer(minLength: 40) }
        }
        .transition(.move(edge: message.role == .user ? .trailing : .leading).combined(with: .opacity))
    }

    private func feedbackButton(value: String, icon: String, activeIcon: String, color: Color) -> some View {
        Button {
            Task { await assistant.recordFeedback(for: message.id, feedback: value, api: api) }
        } label: {
            Image(systemName: message.feedback == value ? activeIcon : icon)
                .font(.caption)
        }
        .buttonStyle(.plain)
        .foregroundStyle(message.feedback == value ? color : .secondary)
        .disabled(message.feedback != nil)
    }
}

private struct TypingIndicator: View {
    @State private var animate = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .frame(width: 6, height: 6)
                    .foregroundStyle(.secondary)
                    .scaleEffect(animate ? 1 : 0.5)
                    .animation(.easeInOut(duration: 0.5).repeatForever().delay(Double(i) * 0.15), value: animate)
            }
        }
        .onAppear { animate = true }
        .accessibilityLabel("L'assistente sta scrivendo")
    }
}

// MARK: - Impostazioni credenziali

private struct AISettingsView: View {
    @EnvironmentObject private var assistant: AIAssistant
    @Environment(\.dismiss) private var dismiss
    @State private var apiKeyText = ""
    @State private var isAuthenticating = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Stato") {
                HStack {
                    Text("Credenziali Anthropic")
                    Spacer()
                    statusLabel
                }
            }
            Section("Login con account Anthropic (Google / email)") {
                Button {
                    Task {
                        isAuthenticating = true
                        defer { isAuthenticating = false }
                        do {
                            try await assistant.startOAuthLogin()
                            errorMessage = nil
                        } catch {
                            errorMessage = error.localizedDescription
                        }
                    }
                } label: {
                    Label("Accedi con Google / email", systemImage: "person.crop.circle.badge.checkmark")
                }
                .adaptiveGlassButton()
                .disabled(isAuthenticating)
                Text("Apre il browser di sistema per il login. Richiede un endpoint OAuth Anthropic pubblico non ancora disponibile: se non funziona, usa la API key qui sotto.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Section("API key manuale") {
                SecureField("sk-ant-...", text: $apiKeyText)
                Button("Salva API key") {
                    assistant.saveAPIKey(apiKeyText)
                    apiKeyText = ""
                }
                .adaptiveGlassProminentButton()
                .disabled(apiKeyText.isEmpty)
                Text("La API key viene salvata in modo sicuro nel Keychain di macOS.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            Section {
                Button("Disconnetti", role: .destructive) { assistant.signOut() }
                    .disabled(assistant.credentialState == .none)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 420, minHeight: 380)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Chiudi") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch assistant.credentialState {
        case .none:
            Text("Non configurate").foregroundStyle(.secondary)
        case .apiKey:
            Label("API key attiva", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        case .oauth:
            Label("Account collegato", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
        }
    }
}

// MARK: - Pulsante flottante per aprire la chat da qualsiasi sezione

struct AIFloatingButton: View {
    @Binding var isPresented: Bool
    @EnvironmentObject private var assistant: AIAssistant

    var body: some View {
        Button {
            withAnimation(.spring(duration: 0.3)) { isPresented = true }
        } label: {
            Image(systemName: "sparkles")
                .font(.title2)
                .foregroundStyle(.white)
                .frame(width: 52, height: 52)
                .background(Brand.accentGradient, in: Circle())
                .symbolEffect(.pulse, options: .repeating, isActive: assistant.isSending)
        }
        .buttonStyle(.plain)
        .shadow(radius: 8, y: 4)
        .accessibilityLabel("Apri assistente AI")
    }
}

// MARK: - Banner suggerimento proattivo (discreto, mai modale)

/// Banner sottile in alto per i suggerimenti contestuali dell'assistente.
/// Scorre via se dismissato, non è mai un popup/modal. L'owner può accettare
/// (apre la chat AI) o ignorarlo con la X.
struct AISuggestionBanner: View {
    @EnvironmentObject private var assistant: AIAssistant
    @EnvironmentObject private var api: APIClient
    @Binding var showChat: Bool

    var body: some View {
        if let text = assistant.suggestion {
            HStack(spacing: 12) {
                Image(systemName: "sparkles")
                    .foregroundStyle(Brand.accentGradient)
                Text(text)
                    .font(.callout)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button("Apri") {
                    _ = assistant.acceptSuggestion()
                    withAnimation(.spring(duration: 0.3)) { showChat = true }
                }
                .adaptiveGlassButton()
                .controlSize(.small)
                Button {
                    withAnimation(.easeOut(duration: 0.2)) { assistant.dismissSuggestion(api: api) }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ignora suggerimento")
            }
            .padding(12)
            .glassCard(cornerRadius: 14)
            .padding(.horizontal)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

#Preview {
    AIChatView()
        .environmentObject(APIClient.shared)
        .environmentObject(AIAssistant.shared)
}
