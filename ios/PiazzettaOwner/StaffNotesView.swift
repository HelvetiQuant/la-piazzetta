//
//  StaffNotesView.swift
//  PiazzettaOwner (macOS)
//
//  Note Staff: comunicazioni dell'owner verso cucina/bar/sala — note, task,
//  avvisi, regole e suggerimenti, con conferma di lettura obbligatoria e
//  possibilità per lo staff di rispondere.
//

import SwiftUI

/// Colore per tipo di nota, coerente con la palette del brand.
extension StaffNoteType {
    var color: Color {
        switch self {
        case .warning: return Brand.warning
        case .task: return .blue
        case .rule: return .purple
        case .suggestion: return Brand.accentSecondary
        case .note: return Brand.success
        }
    }
}

struct StaffNotesView: View {
    @EnvironmentObject private var api: APIClient
    @State private var notes: [StaffNote] = []
    @State private var staff: [StaffMember] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showCreate = false
    @State private var selection: StaffNote.ID?
    @State private var detailNote: StaffNote?

    @State private var filterType: StaffNoteType?
    @State private var filterScope: StaffNoteScope?
    @State private var filterStatus = "ACTIVE"

    private var staffNames: [String: String] {
        Dictionary(uniqueKeysWithValues: staff.map { ($0.id, $0.name) })
    }

    private var filteredNotes: [StaffNote] {
        notes.filter { note in
            (filterType == nil || note.noteType == filterType) &&
            (filterScope == nil || note.scope == filterScope)
        }
    }

    private var unacknowledgedCount: Int {
        notes.filter { $0.requiresAck && $0.acknowledgedBy.count < expectedRecipients($0) }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header
            filters

            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }

            if isLoading && notes.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            } else if filteredNotes.isEmpty && !isLoading {
                GlassEmptyState(icon: "note.text.badge.plus", title: "Nessuna nota",
                                subtitle: "Crea una nota, un task o un avviso da inviare allo staff.")
            } else {
                notesTable
            }
        }
        .padding()
        .background(Brand.background)
        .navigationTitle("Note Staff")
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: filterStatus) { _, _ in Task { await load() } }
        .sheet(isPresented: $showCreate) {
            StaffNoteFormSheet(staff: staff) { created in
                notes.insert(created, at: 0)
            }
        }
        .sheet(item: $detailNote) { note in
            StaffNoteDetailSheet(note: note, staffNames: staffNames) { updated in
                if updated.status == filterStatus {
                    if let idx = notes.firstIndex(where: { $0.id == updated.id }) { notes[idx] = updated }
                } else {
                    notes.removeAll { $0.id == updated.id }
                }
            } onDeleted: { deletedId in
                notes.removeAll { $0.id == deletedId }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    Text("Note Staff").font(.title2.bold())
                    if unacknowledgedCount > 0 {
                        Text("\(unacknowledgedCount)")
                            .font(.caption2.bold())
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(Brand.danger, in: Capsule())
                    }
                }
                Text("Comunicazioni, task e regole per lo staff, con conferma di lettura obbligatoria.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                showCreate = true
            } label: {
                Label("Nuova nota", systemImage: "plus")
            }
            .adaptiveGlassProminentButton()
        }
    }

    private var filters: some View {
        HStack(spacing: 12) {
            Picker("Tipo", selection: $filterType) {
                Text("Tutti i tipi").tag(StaffNoteType?.none)
                ForEach(StaffNoteType.allCases) { type in
                    Label(type.label, systemImage: type.icon).tag(StaffNoteType?.some(type))
                }
            }
            Picker("Destinatari", selection: $filterScope) {
                Text("Tutti i destinatari").tag(StaffNoteScope?.none)
                ForEach(StaffNoteScope.allCases) { scope in
                    Text(scope.label).tag(StaffNoteScope?.some(scope))
                }
            }
            Picker("Stato", selection: $filterStatus) {
                Text("Attive").tag("ACTIVE")
                Text("Archiviate").tag("ARCHIVED")
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 220)
            Spacer()
        }
    }

    private var notesTable: some View {
        Table(filteredNotes, selection: $selection) {
            TableColumn("Tipo") { note in
                Label(note.noteType.label, systemImage: note.noteType.icon)
                    .foregroundStyle(note.noteType.color)
                    .font(.caption.bold())
            }
            TableColumn("Titolo") { note in
                Text(note.title).lineLimit(1)
            }
            TableColumn("Destinatari") { note in
                Text(recipientLabel(note)).font(.caption).foregroundStyle(.secondary)
            }
            TableColumn("Priorità") { note in
                Text("P\(note.priority)").font(.caption.bold()).foregroundStyle(priorityColor(note.priority))
            }
            TableColumn("Ack") { note in
                ackIndicator(note)
            }
            TableColumn("Risposte") { note in
                Text("\(note.responses.count)").foregroundStyle(.secondary)
            }
            TableColumn("Data") { note in
                Text(note.createdAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .onChange(of: selection) { _, newValue in
            if let newValue, let note = notes.first(where: { $0.id == newValue }) {
                detailNote = note
            }
        }
    }

    private func ackIndicator(_ note: StaffNote) -> some View {
        let expected = expectedRecipients(note)
        let complete = !note.requiresAck || note.acknowledgedBy.count >= expected
        return HStack(spacing: 5) {
            Circle()
                .fill(complete ? Brand.success : Brand.warning)
                .frame(width: 8, height: 8)
            Text(note.requiresAck ? "\(note.acknowledgedBy.count)/\(expected)" : "—")
                .font(.caption2).foregroundStyle(.secondary)
        }
    }

    private func recipientLabel(_ note: StaffNote) -> String {
        switch note.scope {
        case .all: return "Tutti"
        case .department: return StaffDepartment(rawValue: note.targetValue)?.label ?? note.targetValue
        case .individual: return staffNames[note.targetValue] ?? note.targetValue
        }
    }

    /// Stima quanti membri dello staff dovrebbero confermare la nota, in base al reparto/ruolo target.
    private func expectedRecipients(_ note: StaffNote) -> Int {
        switch note.scope {
        case .all: return max(staff.count, 1)
        case .individual: return 1
        case .department:
            guard let dept = StaffDepartment(rawValue: note.targetValue) else { return 1 }
            return max(staff.filter { $0.roles.contains(dept.staffRole) }.count, 1)
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let notesTask = api.fetchStaffNotes(status: filterStatus)
            async let staffTask = api.fetchStaff()
            notes = try await notesTask
            staff = try await staffTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Form creazione

private struct StaffNoteFormSheet: View {
    let staff: [StaffMember]
    let onCreated: (StaffNote) -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss

    @State private var type: StaffNoteType = .note
    @State private var priority = 3
    @State private var scope: StaffNoteScope = .all
    @State private var department: StaffDepartment = .kitchen
    @State private var staffId = ""
    @State private var title = ""
    @State private var bodyText = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date()
    @State private var requiresAck = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Tipo e priorità") {
                Picker("Tipo", selection: $type) {
                    ForEach(StaffNoteType.allCases) { t in
                        Label(t.label, systemImage: t.icon).tag(t)
                    }
                }
                Picker("Priorità", selection: $priority) {
                    ForEach(1...5, id: \.self) { p in
                        Text(priorityLabel(p)).tag(p)
                    }
                }
            }
            Section("Destinatari") {
                Picker("Destinatari", selection: $scope) {
                    ForEach(StaffNoteScope.allCases) { s in
                        Text(s.label).tag(s)
                    }
                }
                .pickerStyle(.segmented)
                if scope == .department {
                    Picker("Reparto", selection: $department) {
                        ForEach(StaffDepartment.allCases) { d in
                            Text(d.label).tag(d)
                        }
                    }
                } else if scope == .individual {
                    Picker("Persona", selection: $staffId) {
                        Text("Seleziona…").tag("")
                        ForEach(staff) { member in
                            Text(member.name).tag(member.id)
                        }
                    }
                }
            }
            Section("Contenuto") {
                TextField("Titolo", text: $title)
                TextEditor(text: $bodyText)
                    .frame(minHeight: 120)
            }
            if type == .task {
                Section("Scadenza") {
                    Toggle("Imposta scadenza", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Scadenza", selection: $dueDate, displayedComponents: [.date, .hourAndMinute])
                    }
                }
            }
            Section {
                Toggle("Conferma di lettura obbligatoria", isOn: $requiresAck)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Brand.danger).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 480, minHeight: 600)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Crea") { Task { await save() } }
                    .disabled(isSaving || title.isEmpty || bodyText.isEmpty || (scope == .individual && staffId.isEmpty))
            }
        }
    }

    private func priorityLabel(_ p: Int) -> String {
        switch p {
        case 1: return "P1 · Urgente"
        case 2: return "P2 · Alto"
        case 3: return "P3 · Normale"
        case 4: return "P4 · Basso"
        default: return "P5 · Info"
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        let targetValue: String
        switch scope {
        case .all: targetValue = "ALL"
        case .department: targetValue = department.rawValue
        case .individual: targetValue = staffId
        }
        var body: [String: Any] = [
            "targetScope": scope.rawValue,
            "targetValue": targetValue,
            "type": type.rawValue,
            "priority": priority,
            "title": title,
            "body": bodyText,
            "requiresAck": requiresAck,
        ]
        if type == .task, hasDueDate {
            body["dueDate"] = ISO8601DateFormatter().string(from: dueDate)
        }
        do {
            let created = try await api.createStaffNote(body: body)
            onCreated(created)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Dettaglio / conferme / risposte

private struct StaffNoteDetailSheet: View {
    @State var note: StaffNote
    let staffNames: [String: String]
    let onUpdated: (StaffNote) -> Void
    let onDeleted: (String) -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var isEditing = false
    @State private var isWorking = false
    @State private var errorMessage: String?

    @State private var editTitle = ""
    @State private var editBody = ""
    @State private var editPriority = 3
    @State private var editType: StaffNoteType = .note

    var body: some View {
        Form {
            if isEditing {
                editForm
            } else {
                readOnly
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Brand.danger).font(.footnote)
            }
            if !isEditing {
                Section {
                    Button {
                        editTitle = note.title
                        editBody = note.body
                        editPriority = note.priority
                        editType = note.noteType
                        isEditing = true
                    } label: {
                        Label("Modifica", systemImage: "pencil")
                    }
                    .disabled(isWorking)

                    Button {
                        Task { await archive() }
                    } label: {
                        Label(note.status == "ARCHIVED" ? "Riattiva" : "Archivia",
                              systemImage: note.status == "ARCHIVED" ? "tray.and.arrow.up" : "archivebox")
                    }
                    .disabled(isWorking)

                    Button(role: .destructive) {
                        Task { await delete() }
                    } label: {
                        Label("Elimina nota", systemImage: "trash")
                    }
                    .disabled(isWorking)
                }
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 460, minHeight: 560)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(isEditing ? "Annulla" : "Chiudi") {
                    if isEditing { isEditing = false } else { dismiss() }
                }
            }
            if isEditing {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Salva") { Task { await saveEdit() } }
                        .disabled(isWorking || editTitle.isEmpty || editBody.isEmpty)
                }
            }
        }
    }

    private var readOnly: some View {
        Group {
            Section {
                HStack {
                    Label(note.noteType.label, systemImage: note.noteType.icon)
                        .foregroundStyle(note.noteType.color)
                        .font(.headline)
                    Spacer()
                    Text("P\(note.priority)")
                        .font(.caption.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(priorityColor(note.priority).opacity(0.18), in: Capsule())
                        .foregroundStyle(priorityColor(note.priority))
                }
                Text(note.title).font(.title3.bold())
                Text(note.body).font(.callout)
                if let dueDate = note.dueDate {
                    LabeledContent("Scadenza", value: dueDate.formatted(date: .abbreviated, time: .shortened))
                }
                LabeledContent("Conferma richiesta", value: note.requiresAck ? "Sì" : "No")
            }
            Section("Conferme di lettura") {
                if note.acknowledgedBy.isEmpty {
                    Text("Nessuna conferma ancora.").foregroundStyle(.secondary).font(.caption)
                } else {
                    ForEach(note.acknowledgedBy, id: \.self) { userId in
                        Label(staffNames[userId] ?? userId, systemImage: "checkmark.circle.fill")
                            .foregroundStyle(Brand.success)
                            .font(.caption)
                    }
                }
            }
            Section("Risposte") {
                if note.responses.isEmpty {
                    Text("Nessuna risposta ancora.").foregroundStyle(.secondary).font(.caption)
                } else {
                    ForEach(note.responses) { response in
                        VStack(alignment: .leading, spacing: 3) {
                            HStack {
                                Text(staffNames[response.userId] ?? response.userId).font(.caption.bold())
                                Spacer()
                                Text(response.at.formatted(date: .abbreviated, time: .shortened))
                                    .font(.caption2).foregroundStyle(.secondary)
                            }
                            Text(response.text).font(.callout)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
    }

    private var editForm: some View {
        Section("Contenuto") {
            Picker("Tipo", selection: $editType) {
                ForEach(StaffNoteType.allCases) { t in
                    Label(t.label, systemImage: t.icon).tag(t)
                }
            }
            Picker("Priorità", selection: $editPriority) {
                ForEach(1...5, id: \.self) { p in
                    Text("P\(p)").tag(p)
                }
            }
            TextField("Titolo", text: $editTitle)
            TextEditor(text: $editBody).frame(minHeight: 120)
        }
    }

    private func saveEdit() async {
        isWorking = true
        defer { isWorking = false }
        do {
            let updated = try await api.updateStaffNote(id: note.id, body: [
                "title": editTitle,
                "body": editBody,
                "priority": editPriority,
                "type": editType.rawValue,
            ])
            note = updated
            onUpdated(updated)
            isEditing = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func archive() async {
        isWorking = true
        defer { isWorking = false }
        let newStatus = note.status == "ARCHIVED" ? "ACTIVE" : "ARCHIVED"
        do {
            let updated = try await api.updateStaffNote(id: note.id, body: ["status": newStatus])
            note = updated
            onUpdated(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete() async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.deleteStaffNote(id: note.id)
            onDeleted(note.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { StaffNotesView() }.environmentObject(APIClient.shared)
}
