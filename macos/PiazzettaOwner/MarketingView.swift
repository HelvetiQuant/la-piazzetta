//
//  MarketingView.swift
//  PiazzettaOwner
//
//  Marketing: creazione post AI, post social, commenti, analytics,
//  account social e campagne — 6 sotto-sezioni in stile macOS.
//

import SwiftUI
#if os(macOS)
import AppKit
#endif
import UniformTypeIdentifiers

private enum MarketingTab: String, CaseIterable, Identifiable {
    case createPost = "Crea Post"
    case posts = "Post Social"
    case comments = "Commenti"
    case analytics = "Analytics"
    case accounts = "Account Social"
    case campaigns = "Campagne"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .createPost: return "wand.and.stars"
        case .posts: return "square.and.arrow.up"
        case .comments: return "bubble.left.and.bubble.right"
        case .analytics: return "chart.bar.fill"
        case .accounts: return "person.2.circle"
        case .campaigns: return "megaphone.fill"
        }
    }
}

struct MarketingView: View {
    @State private var tab: MarketingTab = .createPost

    var body: some View {
        TabView(selection: $tab) {
            ForEach(MarketingTab.allCases) { item in
                Group {
                    switch item {
                    case .createPost: CreatePostTab()
                    case .posts: PostsTab()
                    case .comments: CommentsTab()
                    case .analytics: AnalyticsTab()
                    case .accounts: AccountsTab()
                    case .campaigns: CampaignsTab()
                    }
                }
                .tabItem { Label(item.rawValue, systemImage: item.icon) }
                .tag(item)
            }
        }
        .navigationTitle("Marketing")
        .background(Brand.background)
    }
}

// MARK: - 1. Crea Post

private struct CreatePostTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var topic = ""
    @State private var tone = "amichevole"
    @State private var channels: Set<String> = ["instagram"]
    @State private var caption = ""
    @State private var hashtags: [String] = []
    @State private var media: MediaAsset?
    @State private var isBusy = false
    @State private var statusMessage: String?
    @State private var errorMessage: String?
    #if os(iOS)
    @State private var showFilePicker = false
    #endif

    private let tones = [("amichevole", "Amichevole"), ("elegante", "Elegante"), ("divertente", "Divertente"), ("informativo", "Informativo")]
    private let allChannels = [("instagram", "Instagram"), ("facebook", "Facebook"), ("tiktok", "TikTok")]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let error = errorMessage {
                    GlassErrorState(message: error) { errorMessage = nil }
                }
                VStack(alignment: .leading, spacing: 10) {
                    Text("Argomento").font(.headline)
                    TextField("Es. piatto del giorno, evento, promozione…", text: $topic)
                        .textFieldStyle(.roundedBorder)

                    Text("Tono").font(.headline)
                    Picker("Tono", selection: $tone) {
                        ForEach(tones, id: \.0) { value, label in Text(label).tag(value) }
                    }
                    .pickerStyle(.segmented)

                    Text("Canali").font(.headline)
                    HStack {
                        ForEach(allChannels, id: \.0) { value, label in
                            Toggle(label, isOn: Binding(
                                get: { channels.contains(value) },
                                set: { on in if on { channels.insert(value) } else { channels.remove(value) } }
                            ))
                            .toggleStyle(.button)
                        }
                    }

                    HStack {
                        Button {
                            Task { await generate() }
                        } label: {
                            Label("AI Generate", systemImage: "sparkles")
                        }
                        .adaptiveGlassProminentButton()
                        .disabled(isBusy || topic.trimmingCharacters(in: .whitespaces).isEmpty)

                        Button {
                            Task { await canva() }
                        } label: {
                            Label("Canva", systemImage: "paintpalette")
                        }
                        .adaptiveGlassButton()
                        .disabled(isBusy)

                        Button {
                            Task { await gamma() }
                        } label: {
                            Label("Gamma", systemImage: "doc.richtext")
                        }
                        .adaptiveGlassButton()
                        .disabled(isBusy)

                        Button {
                            uploadMedia()
                        } label: {
                            Label("Carica media", systemImage: "photo.badge.plus")
                        }
                        .adaptiveGlassButton()
                        .disabled(isBusy)
                    }
                }
                .padding()
                .glassCard()

                VStack(alignment: .leading, spacing: 10) {
                    Text("Anteprima post").font(.headline)
                    TextEditor(text: $caption)
                        .frame(minHeight: 120)
                        .padding(6)
                        .glassCard(cornerRadius: 10)
                    if !hashtags.isEmpty {
                        Text(hashtags.map { "#\($0)" }.joined(separator: " "))
                            .font(.caption)
                            .foregroundStyle(Brand.accent)
                    }
                    if let media {
                        Label("Media collegato: \(media.type)", systemImage: "photo")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let statusMessage {
                        Label(statusMessage, systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                    Button {
                        Task { await publish() }
                    } label: {
                        Label("Pubblica / pianifica", systemImage: "paperplane.fill")
                    }
                    .adaptiveGlassProminentButton()
                    .disabled(isBusy || caption.trimmingCharacters(in: .whitespaces).isEmpty || channels.isEmpty)
                }
                .padding()
                .glassCard()
            }
            .padding()
        }
        #if os(iOS)
        .sheet(isPresented: $showFilePicker) {
            FilePickerSheet(onPick: { url in
                handlePickedFile(url)
                showFilePicker = false
            })
        }
        #endif
    }

    private func generate() async {
        isBusy = true; defer { isBusy = false }
        do {
            let result = try await api.generatePost(topic: topic, tone: tone, channels: Array(channels), mediaAssetId: media?.id)
            caption = result.caption
            hashtags = result.hashtags
            statusMessage = nil
        } catch { errorMessage = error.localizedDescription }
    }

    private func canva() async {
        isBusy = true; defer { isBusy = false }
        do {
            let result = try await api.canvaCreate(title: topic.isEmpty ? "Post La Piazzetta" : topic, mediaAssetId: media?.id)
            media = result.asset
            statusMessage = "Design Canva creato."
        } catch { errorMessage = error.localizedDescription }
    }

    private func gamma() async {
        isBusy = true; defer { isBusy = false }
        do {
            let result = try await api.gammaCreate(prompt: topic, title: topic.isEmpty ? "Post La Piazzetta" : topic)
            media = result.asset
            statusMessage = "Documento Gamma creato."
        } catch { errorMessage = error.localizedDescription }
    }

    private func uploadMedia() {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.image, .movie]
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return }
        Task {
            isBusy = true; defer { isBusy = false }
            do {
                let data = try Data(contentsOf: url)
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                let asset = try await api.uploadMedia(base64: data.base64EncodedString(), mimeType: mime, altText: url.lastPathComponent)
                media = asset
                statusMessage = "Media caricato."
            } catch { errorMessage = error.localizedDescription }
        }
        #else
        showFilePicker = true
        #endif
    }

    #if os(iOS)
    func handlePickedFile(_ url: URL) {
        Task {
            isBusy = true; defer { isBusy = false }
            do {
                let data = try Data(contentsOf: url)
                let mime = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                let asset = try await api.uploadMedia(base64: data.base64EncodedString(), mimeType: mime, altText: url.lastPathComponent)
                media = asset
                statusMessage = "Media caricato."
            } catch { errorMessage = error.localizedDescription }
        }
    }
    #endif

    private func publish() async {
        isBusy = true; defer { isBusy = false }
        do {
            _ = try await api.createMarketingPost(
                caption: caption, hashtags: hashtags, platforms: Array(channels),
                mediaAssetId: media?.id, aiGenerated: !hashtags.isEmpty, aiPrompt: topic.isEmpty ? nil : topic
            )
            statusMessage = "Post creato — vai su \"Post Social\" per pubblicarlo."
            caption = ""; hashtags = []; media = nil; topic = ""
        } catch { errorMessage = error.localizedDescription }
    }
}

// MARK: - 2. Post Social

private struct PostsTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var posts: [SocialPost] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var editingPost: SocialPost?

    var body: some View {
        List {
            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }
            if posts.isEmpty && !isLoading {
                GlassEmptyState(icon: "square.and.arrow.up", title: "Nessun post ancora")
            }
            ForEach(posts) { post in
                VStack(alignment: .leading, spacing: 6) {
                    Text(post.caption).font(.body).lineLimit(2)
                    HStack {
                        Text(post.platforms.joined(separator: ", ")).font(.caption).foregroundStyle(.secondary)
                        Spacer()
                        StatusBadge(status: post.status)
                    }
                    HStack {
                        if post.status != "PUBLISHED" {
                            Button("Pubblica") { Task { await publish(post) } }.adaptiveGlassButton()
                        }
                        Button("Modifica") { editingPost = post }.adaptiveGlassButton()
                        Button("Elimina", role: .destructive) { Task { await delete(post) } }.adaptiveGlassButton()
                    }
                }
                .padding(.vertical, 4)
                .hoverHighlight()
            }
        }
        .overlay { if isLoading && posts.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $editingPost) { post in
            EditPostSheet(post: post) { await load() }
        }
    }

    private func load() async {
        isLoading = true; errorMessage = nil; defer { isLoading = false }
        do { posts = try await api.fetchMarketingPosts() } catch { errorMessage = error.localizedDescription }
    }

    private func publish(_ post: SocialPost) async {
        do { _ = try await api.publishMarketingPost(id: post.id); await load() } catch { errorMessage = error.localizedDescription }
    }

    private func delete(_ post: SocialPost) async {
        do { _ = try await api.deleteMarketingPost(id: post.id); await load() } catch { errorMessage = error.localizedDescription }
    }
}

private struct EditPostSheet: View {
    let post: SocialPost
    let onSaved: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var caption: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(post: SocialPost, onSaved: @escaping () async -> Void) {
        self.post = post
        self.onSaved = onSaved
        _caption = State(initialValue: post.caption)
    }

    var body: some View {
        Form {
            Section("Modifica testo") {
                TextEditor(text: $caption).frame(minHeight: 140)
            }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
        }
        .formStyle(.grouped)
        .frame(minWidth: 400, minHeight: 260)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Salva") { Task { await save() } }.disabled(isSaving)
            }
        }
    }

    private func save() async {
        isSaving = true; defer { isSaving = false }
        do {
            _ = try await api.updateMarketingPost(id: post.id, body: ["caption": caption])
            await onSaved()
            dismiss()
        } catch { errorMessage = error.localizedDescription }
    }
}

private struct StatusBadge: View {
    let status: String
    var color: Color {
        switch status {
        case "PUBLISHED": return .green
        case "SCHEDULED": return .blue
        case "FAILED": return .red
        default: return .secondary
        }
    }
    var body: some View {
        Text(status)
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }
}

// MARK: - 3. Commenti

private struct CommentsTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var comments: [SocialComment] = []
    @State private var onlyNeedsReply = false
    @State private var isLoading = false
    @State private var isSyncing = false
    @State private var errorMessage: String?
    @State private var replyDrafts: [String: String] = [:]

    var body: some View {
        List {
            if let errorMessage { GlassErrorState(message: errorMessage) { Task { await load() } } }
            Section {
                Toggle("Solo da rispondere", isOn: $onlyNeedsReply)
                    .onChange(of: onlyNeedsReply) { _, _ in Task { await load() } }
                Button {
                    Task { await sync() }
                } label: {
                    Label(isSyncing ? "Sincronizzazione…" : "Sincronizza commenti", systemImage: "arrow.triangle.2.circlepath")
                        .symbolEffect(.pulse, options: .repeating, isActive: isSyncing)
                }
                .adaptiveGlassButton()
                .disabled(isSyncing)
            }
            if comments.isEmpty && !isLoading {
                GlassEmptyState(icon: "bubble.left.and.bubble.right", title: "Nessun commento")
            }
            ForEach(comments) { comment in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(comment.authorName ?? "Utente").font(.body.weight(.medium))
                        Spacer()
                        if comment.needsReply { Label("Da rispondere", systemImage: "exclamationmark.circle.fill").font(.caption2).foregroundStyle(.orange) }
                    }
                    Text(comment.text).font(.callout)
                    if let reply = comment.replyText {
                        Text("↳ \(reply)").font(.caption).foregroundStyle(.secondary)
                    } else {
                        HStack {
                            TextField("Rispondi…", text: Binding(
                                get: { replyDrafts[comment.id] ?? "" },
                                set: { replyDrafts[comment.id] = $0 }
                            ))
                            Button("Invia") { Task { await reply(comment) } }
                                .adaptiveGlassButton()
                                .disabled((replyDrafts[comment.id] ?? "").isEmpty)
                            Button {
                                Task { await autoReply(comment) }
                            } label: {
                                Image(systemName: "sparkles")
                            }
                            .adaptiveGlassButton()
                            .help("Rispondi con AI")
                        }
                    }
                }
                .padding(.vertical, 4)
                .hoverHighlight()
            }
        }
        .overlay { if isLoading && comments.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true; errorMessage = nil; defer { isLoading = false }
        do { comments = try await api.fetchSocialComments(needsReply: onlyNeedsReply ? true : nil) } catch { errorMessage = error.localizedDescription }
    }

    private func sync() async {
        isSyncing = true; defer { isSyncing = false }
        do { _ = try await api.syncComments(); await load() } catch { errorMessage = error.localizedDescription }
    }

    private func reply(_ comment: SocialComment) async {
        guard let text = replyDrafts[comment.id], !text.isEmpty else { return }
        do { _ = try await api.replyComment(id: comment.id, replyText: text); replyDrafts[comment.id] = nil; await load() }
        catch { errorMessage = error.localizedDescription }
    }

    private func autoReply(_ comment: SocialComment) async {
        do { _ = try await api.autoReplyComment(id: comment.id); await load() } catch { errorMessage = error.localizedDescription }
    }
}

// MARK: - 4. Analytics

private struct AnalyticsTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var analytics: MarketingAnalytics?
    @State private var isLoading = false
    @State private var isSyncing = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let errorMessage { GlassErrorState(message: errorMessage) { Task { await load() } } }
                HStack {
                    Text("Panoramica").font(.title3.bold())
                    Spacer()
                    Button {
                        Task { await sync() }
                    } label: {
                        Label(isSyncing ? "Sincronizzazione…" : "Sincronizza", systemImage: "arrow.triangle.2.circlepath")
                            .symbolEffect(.pulse, options: .repeating, isActive: isSyncing)
                    }
                    .adaptiveGlassButton()
                    .disabled(isSyncing)
                }
                if let analytics {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        MiniStat(title: "Follower", value: "\(analytics.followerCount)")
                        MiniStat(title: "Impression", value: "\(analytics.totals.impressions)")
                        MiniStat(title: "Reach", value: "\(analytics.totals.reach)")
                        MiniStat(title: "Like", value: "\(analytics.totals.likes)")
                        MiniStat(title: "Commenti", value: "\(analytics.totals.comments)")
                        MiniStat(title: "Condivisioni", value: "\(analytics.totals.shares)")
                    }
                    .entranceTransition()

                    Text("Top post").font(.title3.bold())
                    ForEach(analytics.topPosts) { post in
                        HStack {
                            Text(post.caption).lineLimit(1)
                            Spacer()
                            Text("\(post.totalLikes) ❤️").font(.caption).foregroundStyle(.secondary)
                            Text("\(post.totalImpressions) impr.").font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(10)
                        .glassCard(cornerRadius: 10)
                        .hoverHighlight(cornerRadius: 10)
                    }
                } else if isLoading {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 160)
                } else {
                    GlassEmptyState(icon: "chart.bar", title: "Nessun dato di analytics")
                }
            }
            .padding()
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true; errorMessage = nil; defer { isLoading = false }
        do { analytics = try await api.fetchMarketingAnalytics() } catch { errorMessage = error.localizedDescription }
    }

    private func sync() async {
        isSyncing = true; defer { isSyncing = false }
        do { _ = try await api.syncAnalytics(); await load() } catch { errorMessage = error.localizedDescription }
    }
}

private struct MiniStat: View {
    let title: String
    let value: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(.title3.bold())
            Text(title).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .glassCard(cornerRadius: 12)
    }
}

// MARK: - 5. Account Social

private struct AccountsTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var accounts: [SocialAccount] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showConnect = false

    var body: some View {
        List {
            if let errorMessage { GlassErrorState(message: errorMessage) { Task { await load() } } }
            if accounts.isEmpty && !isLoading {
                GlassEmptyState(icon: "person.2.circle", title: "Nessun account collegato")
            }
            ForEach(accounts) { account in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(account.displayName ?? account.username ?? account.platform).font(.body)
                        Text(account.platform.capitalized).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(account.active ? "Attivo" : "Disconnesso").foregroundStyle(account.active ? .green : .secondary)
                    Button("Disconnetti", role: .destructive) { Task { await disconnect(account) } }
                        .adaptiveGlassButton()
                }
                .hoverHighlight()
            }
        }
        .toolbar {
            ToolbarItem {
                Button { showConnect = true } label: { Label("Connetti account", systemImage: "plus.circle.fill") }
                    .adaptiveGlassButton()
            }
        }
        .overlay { if isLoading && accounts.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showConnect) {
            ConnectAccountSheet { await load() }
        }
    }

    private func load() async {
        isLoading = true; errorMessage = nil; defer { isLoading = false }
        do { accounts = try await api.fetchSocialAccounts() } catch { errorMessage = error.localizedDescription }
    }

    private func disconnect(_ account: SocialAccount) async {
        do { _ = try await api.disconnectSocialAccount(id: account.id); await load() } catch { errorMessage = error.localizedDescription }
    }
}

private struct ConnectAccountSheet: View {
    let onConnected: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var platform = "instagram"
    @State private var accountId = ""
    @State private var accessToken = ""
    @State private var username = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let platforms = [("instagram", "Instagram"), ("facebook", "Facebook"), ("tiktok", "TikTok")]

    var body: some View {
        Form {
            Section("Connetti account") {
                Picker("Piattaforma", selection: $platform) {
                    ForEach(platforms, id: \.0) { value, label in Text(label).tag(value) }
                }
                TextField("Account ID", text: $accountId)
                TextField("Username", text: $username)
                SecureField("Access token", text: $accessToken)
            }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
        }
        .formStyle(.grouped)
        .frame(minWidth: 400, minHeight: 280)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Connetti") { Task { await connect() } }
                    .disabled(isSaving || accountId.isEmpty || accessToken.isEmpty)
            }
        }
    }

    private func connect() async {
        isSaving = true; defer { isSaving = false }
        do {
            _ = try await api.connectSocialAccount(platform: platform, accountId: accountId, accessToken: accessToken, username: username.isEmpty ? nil : username)
            await onConnected()
            dismiss()
        } catch { errorMessage = error.localizedDescription }
    }
}

// MARK: - 6. Campagne

private struct CampaignsTab: View {
    @EnvironmentObject private var api: APIClient
    @State private var campaigns: [Campaign] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showNew = false

    var body: some View {
        List {
            if let errorMessage { GlassErrorState(message: errorMessage) { Task { await load() } } }
            if campaigns.isEmpty && !isLoading {
                GlassEmptyState(icon: "megaphone", title: "Nessuna campagna")
            }
            ForEach(campaigns) { campaign in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(campaign.name).font(.body.weight(.medium))
                        Text("\(campaign.status) · \(campaign.count?.posts ?? 0) post").font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text((Double(campaign.budgetCents) / 100.0).formatted(.currency(code: "EUR")))
                        .foregroundStyle(Brand.accent)
                    Menu {
                        Button("Attiva") { Task { await setStatus(campaign, "ACTIVE") } }
                        Button("Pausa") { Task { await setStatus(campaign, "PAUSED") } }
                        Button("Completa") { Task { await setStatus(campaign, "COMPLETED") } }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                .hoverHighlight()
            }
        }
        .toolbar {
            ToolbarItem {
                Button { showNew = true } label: { Label("Nuova campagna", systemImage: "plus.circle.fill") }
                    .adaptiveGlassButton()
            }
        }
        .overlay { if isLoading && campaigns.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNew) {
            NewCampaignSheet { await load() }
        }
    }

    private func load() async {
        isLoading = true; errorMessage = nil; defer { isLoading = false }
        do { campaigns = try await api.fetchCampaigns() } catch { errorMessage = error.localizedDescription }
    }

    private func setStatus(_ campaign: Campaign, _ status: String) async {
        do { _ = try await api.updateCampaign(id: campaign.id, body: ["status": status]); await load() } catch { errorMessage = error.localizedDescription }
    }
}

private struct NewCampaignSheet: View {
    let onCreated: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var description = ""
    @State private var budgetText = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Nuova campagna") {
                TextField("Nome", text: $name)
                TextField("Descrizione", text: $description)
                TextField("Budget (€)", text: $budgetText)
            }
            if let errorMessage { Text(errorMessage).foregroundStyle(.red).font(.footnote) }
        }
        .formStyle(.grouped)
        .frame(minWidth: 380, minHeight: 260)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Crea") { Task { await save() } }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func save() async {
        let budget = Double(budgetText.replacingOccurrences(of: ",", with: ".")) ?? 0
        isSaving = true; defer { isSaving = false }
        do {
            _ = try await api.createCampaign(name: name, description: description.isEmpty ? nil : description, budgetCents: Int((budget * 100).rounded()))
            await onCreated()
            dismiss()
        } catch { errorMessage = error.localizedDescription }
    }
}

#Preview {
    NavigationStack { MarketingView() }.environmentObject(APIClient.shared)
}

// MARK: - File Picker (iOS)

#if os(iOS)
import UIKit

struct FilePickerSheet: UIViewControllerRepresentable {
    let onPick: (URL) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image, .movie])
        picker.allowsMultipleSelection = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onPick: (URL) -> Void
        init(onPick: @escaping (URL) -> Void) { self.onPick = onPick }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            if let url = urls.first { onPick(url) }
        }
    }
}
#endif
