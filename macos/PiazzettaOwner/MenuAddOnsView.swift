//
//  MenuAddOnsView.swift
//  PiazzettaOwner (macOS)
//
//  Add-on menu: consigli che l'owner prepara e lo staff propone al tavolo
//  ("Vuole aggiungere un caffè? Solo 1€ in più"). L'owner definisce script,
//  fascia oraria, ruoli target e priorità; qui vede performance e conversion.
//

import SwiftUI

struct MenuAddOnsView: View {
    @EnvironmentObject private var api: APIClient
    @State private var addOns: [MenuAddOn] = []
    @State private var products: [MenuProduct] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showCreate = false
    @State private var selection: MenuAddOn.ID?
    @State private var detailAddOn: MenuAddOn?

    private var topByConversion: MenuAddOn? {
        addOns.filter { $0.timesProposed >= 3 }.max { $0.conversionRate < $1.conversionRate }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if let top = topByConversion {
                topAddOnBanner(top)
            }

            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }

            if isLoading && addOns.isEmpty {
                ProgressView().frame(maxWidth: .infinity, minHeight: 200)
            } else if addOns.isEmpty && !isLoading {
                GlassEmptyState(icon: "sparkles.rectangle.stack", title: "Nessun add-on configurato",
                                message: "Crea un consiglio da far proporre allo staff, es. \"Vuole aggiungere un caffè?\"")
            } else {
                addOnsTable
            }
        }
        .padding()
        .background(Brand.background)
        .navigationTitle("Add-on Menu")
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showCreate) {
            AddOnFormSheet(products: products) { created in
                addOns.insert(created, at: 0)
            }
        }
        .sheet(item: $detailAddOn) { addOn in
            AddOnDetailSheet(addOn: addOn, products: products) { updated in
                if let idx = addOns.firstIndex(where: { $0.id == updated.id }) { addOns[idx] = updated }
            } onDeleted: { deletedId in
                addOns.removeAll { $0.id == deletedId }
            }
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Add-on Menu").font(.title2.bold())
                Text("Consigli che lo staff propone al tavolo per aumentare lo scontrino medio.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                showCreate = true
            } label: {
                Label("Nuovo add-on", systemImage: "plus")
            }
            .adaptiveGlassProminentButton()
        }
    }

    private func topAddOnBanner(_ addOn: MenuAddOn) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "trophy.fill")
                .foregroundStyle(Brand.warmGradient)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text("Top add-on per conversione").font(.caption.bold()).foregroundStyle(.secondary)
                Text("\(addOn.title) · \(Int(addOn.conversionRate * 100))% (\(addOn.timesAccepted)/\(addOn.timesProposed))")
                    .font(.callout.weight(.semibold))
            }
            Spacer()
        }
        .padding(14)
        .background(Brand.warmGradient.opacity(0.18), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .glassCard(cornerRadius: 14)
    }

    private var addOnsTable: some View {
        Table(addOns, selection: $selection) {
            TableColumn("Titolo") { addOn in
                HStack(spacing: 8) {
                    Circle().fill(priorityColor(addOn.priority)).frame(width: 8, height: 8)
                    Text(addOn.title)
                }
            }
            TableColumn("Prodotto") { addOn in
                Text(addOn.product?.name ?? "—").foregroundStyle(.secondary)
            }
            TableColumn("Script staff") { addOn in
                Text(addOn.staffScript).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            TableColumn("Fascia oraria") { addOn in
                Text(addOn.timeWindow ?? "Sempre").font(.caption)
            }
            TableColumn("Stato") { addOn in
                AddOnStatusBadge(status: addOn.status)
            }
            TableColumn("Priorità") { addOn in
                Text("P\(addOn.priority)").font(.caption.bold()).foregroundStyle(priorityColor(addOn.priority))
            }
        }
        .onChange(of: selection) { _, newValue in
            if let newValue, let addOn = addOns.first(where: { $0.id == newValue }) {
                detailAddOn = addOn
            }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let addOnsTask = api.fetchMenuAddOns()
            async let productsTask = api.fetchMenu()
            addOns = try await addOnsTask
            products = try await productsTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Card (usata in eventuali viste a griglia / anteprime)

struct AddOnCard: View {
    let addOn: MenuAddOn

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: categoryIcon(addOn.product?.category))
                    .foregroundStyle(priorityColor(addOn.priority))
                    .font(.title3)
                Spacer()
                AddOnStatusBadge(status: addOn.status)
            }
            Text(addOn.title).font(.headline)
            Text(addOn.staffScript).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            HStack {
                Label(addOn.timeWindow ?? "Sempre", systemImage: "clock")
                    .font(.caption2).foregroundStyle(.secondary)
                Spacer()
                Text("P\(addOn.priority)")
                    .font(.caption2.bold())
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(priorityColor(addOn.priority).opacity(0.18), in: Capsule())
                    .foregroundStyle(priorityColor(addOn.priority))
            }
        }
        .padding(14)
        .glassCard(cornerRadius: 16)
        .hoverHighlight(cornerRadius: 16)
    }

    private func categoryIcon(_ category: String?) -> String {
        switch category?.lowercased() {
        case "colazione": return "cup.and.saucer.fill"
        case "bibite", "birra", "bollicine", "cocktail", "cocktail_analcolico", "gin", "whisky", "rum": return "wineglass.fill"
        case "primi_piatti", "secondi_piatti", "tavola_calda": return "fork.knife"
        case "dolci": return "birthday.cake.fill"
        default: return "sparkles"
        }
    }
}

// MARK: - Form creazione

private struct AddOnFormSheet: View {
    let products: [MenuProduct]
    let onCreated: (MenuAddOn) -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss

    @State private var productId: String = ""
    @State private var title = ""
    @State private var staffScript = ""
    @State private var roles: Set<ShiftRole> = [.waiter]
    @State private var startTime = Date()
    @State private var endTime = Date()
    @State private var weekDays: Set<Int> = Set(1...7)
    @State private var priority = 3
    @State private var discountPct: String = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let dayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]

    var body: some View {
        Form {
            Section("Prodotto e messaggio") {
                Picker("Prodotto", selection: $productId) {
                    Text("Seleziona…").tag("")
                    ForEach(products) { product in
                        Text(product.name).tag(product.id)
                    }
                }
                TextField("Titolo (es. \"Caffè post-pranzo a 1€\")", text: $title)
                TextField("Script staff (es. \"Vuole aggiungere un caffè? Solo 1€ in più\")", text: $staffScript, axis: .vertical)
                    .lineLimit(2...4)
            }
            Section("Chi lo propone") {
                ForEach(ShiftRole.allCases) { role in
                    Toggle(role.label, isOn: Binding(
                        get: { roles.contains(role) },
                        set: { on in if on { roles.insert(role) } else { roles.remove(role) } }
                    ))
                }
            }
            Section("Quando") {
                DatePicker("Dalle", selection: $startTime, displayedComponents: .hourAndMinute)
                DatePicker("Alle", selection: $endTime, displayedComponents: .hourAndMinute)
                HStack {
                    ForEach(Array(dayLabels.enumerated()), id: \.offset) { index, label in
                        let day = index + 1
                        Toggle(label, isOn: Binding(
                            get: { weekDays.contains(day) },
                            set: { on in if on { weekDays.insert(day) } else { weekDays.remove(day) } }
                        ))
                        .toggleStyle(.button)
                        .controlSize(.small)
                    }
                }
            }
            Section("Priorità e sconto") {
                Picker("Priorità", selection: $priority) {
                    ForEach(1...5, id: \.self) { p in
                        Text("P\(p)").tag(p)
                    }
                }
                .pickerStyle(.segmented)
                TextField("Sconto % (opzionale)", text: $discountPct)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Brand.danger).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 460, minHeight: 560)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Crea") { Task { await save() } }
                    .disabled(isSaving || productId.isEmpty || title.isEmpty || staffScript.isEmpty)
            }
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        var body: [String: Any] = [
            "productId": productId,
            "title": title,
            "staffScript": staffScript,
            "targetRoles": roles.map(\.rawValue),
            "timeWindow": "\(formatted(startTime))-\(formatted(endTime))",
            "weekDays": Array(weekDays).sorted(),
            "priority": priority,
        ]
        if let discount = Double(discountPct.replacingOccurrences(of: ",", with: ".")) {
            body["discountPct"] = discount
        }
        do {
            let created = try await api.createMenuAddOn(body: body)
            onCreated(created)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func formatted(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}

// MARK: - Detail / statistiche

private struct AddOnDetailSheet: View {
    @State var addOn: MenuAddOn
    let products: [MenuProduct]
    let onUpdated: (MenuAddOn) -> Void
    let onDeleted: (String) -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var isWorking = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section {
                HStack {
                    Circle().fill(priorityColor(addOn.priority)).frame(width: 10, height: 10)
                    Text(addOn.title).font(.headline)
                    Spacer()
                    AddOnStatusBadge(status: addOn.status)
                }
                Text(addOn.staffScript).font(.callout).foregroundStyle(.secondary)
                LabeledContent("Prodotto", value: addOn.product?.name ?? "—")
                LabeledContent("Fascia oraria", value: addOn.timeWindow ?? "Sempre")
                LabeledContent("Priorità", value: "P\(addOn.priority)")
                if let discount = addOn.discountPct {
                    LabeledContent("Sconto", value: String(format: "%.0f%%", discount))
                }
            }
            Section("Statistiche") {
                LabeledContent("Volte proposto", value: "\(addOn.timesProposed)")
                LabeledContent("Volte accettato", value: "\(addOn.timesAccepted)")
                HStack {
                    Text("Conversion rate")
                    Spacer()
                    Text("\(Int(addOn.conversionRate * 100))%")
                        .font(.callout.bold())
                        .foregroundStyle(addOn.conversionRate >= 0.4 ? Brand.success : addOn.conversionRate >= 0.15 ? Brand.warning : Brand.danger)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(Brand.danger).font(.footnote)
            }
            Section {
                Button {
                    Task { await toggleStatus() }
                } label: {
                    Label(addOn.status == "ACTIVE" ? "Metti in pausa" : "Riattiva",
                          systemImage: addOn.status == "ACTIVE" ? "pause.circle" : "play.circle")
                }
                .disabled(isWorking)
                Button(role: .destructive) {
                    Task { await delete() }
                } label: {
                    Label("Elimina add-on", systemImage: "trash")
                }
                .disabled(isWorking)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 420, minHeight: 460)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Chiudi") { dismiss() }
            }
        }
    }

    private func toggleStatus() async {
        isWorking = true
        defer { isWorking = false }
        let newStatus = addOn.status == "ACTIVE" ? "PAUSED" : "ACTIVE"
        do {
            let updated = try await api.updateMenuAddOn(id: addOn.id, body: ["status": newStatus])
            addOn = updated
            onUpdated(updated)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func delete() async {
        isWorking = true
        defer { isWorking = false }
        do {
            _ = try await api.deleteMenuAddOn(id: addOn.id)
            onDeleted(addOn.id)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { MenuAddOnsView() }.environmentObject(APIClient.shared)
}
