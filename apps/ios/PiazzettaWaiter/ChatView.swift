//
//  ChatView.swift
//  PiazzettaWaiter
//
//  Chat staff: room visibili, invio messaggi, creazione diretta con l'owner.
//

import SwiftUI

struct ChatView: View {
    @EnvironmentObject private var api: APIClient
    @State private var rooms: [ChatRoom] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var isCreatingDirect = false

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            ForEach(rooms) { room in
                NavigationLink(value: room) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(room.name).font(.body.weight(.medium))
                        if let last = room.lastMessage {
                            Text(last.text).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        } else {
                            Text("Nessun messaggio").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Chat")
        .navigationDestination(for: ChatRoom.self) { room in
            ChatRoomDetailView(room: room)
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await createDirectToOwner() }
                } label: {
                    if isCreatingDirect { ProgressView() } else { Image(systemName: "person.crop.circle.badge.plus") }
                }
                .disabled(isCreatingDirect)
            }
        }
        .overlay { if isLoading && rooms.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            rooms = try await api.fetchChatRooms()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createDirectToOwner() async {
        isCreatingDirect = true
        defer { isCreatingDirect = false }
        do {
            let room = try await api.createDirectToOwnerRoom()
            if !rooms.contains(where: { $0.id == room.id }) {
                rooms.append(room)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct ChatRoomDetailView: View {
    let room: ChatRoom
    @EnvironmentObject private var api: APIClient
    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red).font(.footnote)
                    }
                    ForEach(messages) { message in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(message.user?.name ?? "Staff").font(.caption.bold()).foregroundStyle(Brand.accent)
                            Text(message.text)
                        }
                        .padding(10)
                        .glassCard(cornerRadius: 12)
                    }
                }
                .padding()
            }
            HStack {
                TextField("Messaggio…", text: $draft)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .adaptiveGlassButton()
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()
        }
        .navigationTitle(room.name)
        .task { await load() }
    }

    private func load() async {
        do {
            messages = try await api.fetchMessages(roomId: room.id)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func send() async {
        let text = draft
        draft = ""
        do {
            let message = try await api.sendMessage(roomId: room.id, text: text)
            messages.append(message)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { ChatView() }.environmentObject(APIClient.shared)
}
