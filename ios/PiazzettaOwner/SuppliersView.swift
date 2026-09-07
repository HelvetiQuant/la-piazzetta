//
//  SuppliersView.swift
//  PiazzettaOwner
//
//  Elenco fornitori, listini articoli e proposte di riordino automatiche.
//

import SwiftUI

struct SuppliersView: View {
    @EnvironmentObject private var api: APIClient
    @State private var suppliers: [Supplier] = []
    @State private var proposals: ReorderProposalsResponse?
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selection: Set<Supplier.ID> = []
    @State private var showNewSupplier = false
    @State private var editingSupplier: Supplier?
    @State private var creatingOrderFor: ReorderProposal?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }.padding()
            }

            Table(suppliers, selection: $selection) {
                TableColumn("Nome") { supplier in
                    Text(supplier.name)
                }
                TableColumn("Telefono") { supplier in
                    Text(supplier.phone ?? "—").foregroundStyle(.secondary)
                }
                TableColumn("Email") { supplier in
                    Text(supplier.email ?? "—").foregroundStyle(.secondary)
                }
                TableColumn("Articoli") { supplier in
                    Text("\(supplier.count?.listings ?? 0)").foregroundStyle(.secondary)
                }
                TableColumn("Stato") { supplier in
                    Text(supplier.active ? "Attivo" : "Inattivo")
                        .foregroundStyle(supplier.active ? .green : .secondary)
                }
                TableColumn("") { supplier in
                    Button {
                        editingSupplier = supplier
                    } label: {
                        Image(systemName: "pencil.circle")
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(minHeight: 200)
            .contextMenu(forSelectionType: Supplier.ID.self) { ids in
                if let id = ids.first, let supplier = suppliers.first(where: { $0.id == id }) {
                    Button("Modifica") { editingSupplier = supplier }
                }
            }

            HStack {
                Spacer()
                Button {
                    showNewSupplier = true
                } label: {
                    Label("Nuovo fornitore", systemImage: "plus.circle.fill")
                }
                .adaptiveGlassProminentButton()
            }
            .padding()

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Proposte di riordino").font(.title3.bold())
                    if let proposals, !proposals.proposals.isEmpty {
                        ForEach(proposals.proposals) { proposal in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(proposal.supplierName).font(.body.weight(.medium))
                                    Spacer()
                                    Text((Double(proposal.totalCents) / 100.0).formatted(.currency(code: "EUR")))
                                        .foregroundStyle(Brand.accent)
                                    Button("Crea ordine") { creatingOrderFor = proposal }
                                        .adaptiveGlassButton()
                                }
                                ForEach(proposal.lines) { line in
                                    HStack {
                                        Text(line.name).font(.caption)
                                        Spacer()
                                        Text("\(line.packs) confezioni").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .padding(14)
                            .glassCard(cornerRadius: 14)
                            .hoverHighlight()
                        }
                    } else {
                        GlassEmptyState(icon: "checkmark.seal", title: "Nessuna proposta al momento", subtitle: "Il magazzino è sopra le soglie di riordino.")
                    }
                }
                .padding()
            }
        }
        .background(Brand.background)
        .navigationTitle("Fornitori")
        .overlay { if isLoading && suppliers.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $showNewSupplier) {
            SupplierFormSheet(supplier: nil) { await load() }
        }
        .sheet(item: $editingSupplier) { supplier in
            SupplierFormSheet(supplier: supplier) { await load() }
        }
        .sheet(item: $creatingOrderFor) { proposal in
            CreateOrderSheet(proposal: proposal) { await load() }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let suppliersTask = api.fetchSuppliers()
            async let proposalsTask = api.fetchReorderProposals()
            suppliers = try await suppliersTask
            proposals = try await proposalsTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Nuovo / modifica fornitore + listini

private struct SupplierFormSheet: View {
    let supplier: Supplier?
    let onSaved: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var phone: String
    @State private var email: String
    @State private var notes: String
    @State private var listings: [Listing] = []
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(supplier: Supplier?, onSaved: @escaping () async -> Void) {
        self.supplier = supplier
        self.onSaved = onSaved
        _name = State(initialValue: supplier?.name ?? "")
        _phone = State(initialValue: supplier?.phone ?? "")
        _email = State(initialValue: supplier?.email ?? "")
        _notes = State(initialValue: supplier?.notes ?? "")
    }

    var body: some View {
        Form {
            Section(supplier == nil ? "Nuovo fornitore" : "Modifica fornitore") {
                TextField("Nome", text: $name)
                TextField("Telefono", text: $phone)
                TextField("Email", text: $email)
                TextField("Note", text: $notes)
            }
            if let supplier {
                Section("Listino articoli") {
                    if listings.isEmpty {
                        Text("Nessun articolo collegato").foregroundStyle(.secondary)
                    }
                    ForEach(listings) { listing in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(listing.product.name).font(.body)
                                Text("Confezione da \(listing.packSize) \(listing.product.unit)").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text((Double(listing.packPriceCents) / 100.0).formatted(.currency(code: "EUR")))
                                .foregroundStyle(Brand.accent)
                        }
                    }
                }
                .task { await loadListings(supplierId: supplier.id) }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 420, minHeight: 420)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(supplier == nil ? "Crea" : "Salva") { Task { await save() } }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func loadListings(supplierId: String) async {
        do {
            listings = try await api.fetchListings(supplierId: supplierId)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func save() async {
        isSaving = true
        defer { isSaving = false }
        do {
            if let supplier {
                var body: [String: Any] = ["name": name]
                body["phone"] = phone.isEmpty ? NSNull() : phone
                body["email"] = email.isEmpty ? NSNull() : email
                body["notes"] = notes.isEmpty ? NSNull() : notes
                _ = try await api.updateSupplier(id: supplier.id, body: body)
            } else {
                _ = try await api.createSupplier(name: name, phone: phone.isEmpty ? nil : phone, email: email.isEmpty ? nil : email, notes: notes.isEmpty ? nil : notes)
            }
            await onSaved()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Crea ordine da proposta di riordino

private struct CreateOrderSheet: View {
    let proposal: ReorderProposal
    let onCreated: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var created = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Ordine per \(proposal.supplierName)").font(.title3.bold())
            ForEach(proposal.lines) { line in
                HStack {
                    Text(line.name)
                    Spacer()
                    Text("\(line.packs)×").foregroundStyle(.secondary)
                    Text((Double(line.lineCostCents) / 100.0).formatted(.currency(code: "EUR")))
                }
                .padding(10)
                .glassCard(cornerRadius: 10)
            }
            HStack {
                Text("Totale").font(.headline)
                Spacer()
                Text((Double(proposal.totalCents) / 100.0).formatted(.currency(code: "EUR")))
                    .font(.headline)
                    .foregroundStyle(Brand.accent)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            if created {
                Label("Ordine creato", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
            }
            HStack {
                Spacer()
                Button("Chiudi") { dismiss() }.adaptiveGlassButton()
                Button("Crea ordine") { Task { await createOrder() } }
                    .adaptiveGlassProminentButton()
                    .disabled(isSaving || created)
            }
        }
        .padding()
        .frame(minWidth: 420, minHeight: 320)
    }

    private func createOrder() async {
        isSaving = true
        defer { isSaving = false }
        let items = proposal.lines.map { line -> [String: Any] in
            ["productId": line.productId, "packs": line.packs, "packPriceCents": line.packPriceCents]
        }
        do {
            _ = try await api.createPurchaseOrder(supplierId: proposal.supplierId, items: items)
            created = true
            await onCreated()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { SuppliersView() }.environmentObject(APIClient.shared)
}
