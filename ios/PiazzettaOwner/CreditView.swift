//
//  CreditView.swift
//  PiazzettaOwner
//
//  Crediti clienti: saldi e movimenti (ricariche/consumi).
//

import SwiftUI

struct CreditView: View {
    @EnvironmentObject private var api: APIClient
    @State private var customers: [Customer] = []
    @State private var totalOutstandingCents: Int = 0
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var selectedCustomer: Customer?
    @State private var showNewCustomer = false

    var body: some View {
        List {
            if let errorMessage {
                GlassErrorState(message: errorMessage) { Task { await load() } }
            }
            Section {
                HStack {
                    Text("Saldo scoperto totale")
                    Spacer()
                    Text(currency(totalOutstandingCents)).font(.body.bold()).foregroundStyle(.orange)
                }
            }
            Section("Clienti") {
                if customers.isEmpty && !isLoading {
                    GlassEmptyState(icon: "person.crop.circle.badge.questionmark", title: "Nessun cliente registrato")
                }
                ForEach(customers) { customer in
                    Button {
                        selectedCustomer = customer
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(customer.name).font(.body)
                                Text(customer.phone ?? customer.email ?? "—").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(currency(customer.balanceCents))
                                .foregroundStyle(customer.balanceCents > 0 ? .orange : .secondary)
                        }
                    }
                    .buttonStyle(.plain)
                    .hoverHighlight()
                }
            }
        }
        .navigationTitle("Crediti")
        .toolbar {
            ToolbarItem {
                Button {
                    showNewCustomer = true
                } label: {
                    Label("Nuovo cliente", systemImage: "person.badge.plus")
                }
                .adaptiveGlassButton()
            }
        }
        .overlay { if isLoading && customers.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $selectedCustomer) { customer in
            CustomerDetailSheet(customer: customer) { await load() }
        }
        .sheet(isPresented: $showNewCustomer) {
            NewCustomerSheet { await load() }
        }
    }

    private func currency(_ cents: Int) -> String {
        (Double(cents) / 100.0).formatted(.currency(code: "EUR"))
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await api.fetchCustomers()
            customers = response.customers
            totalOutstandingCents = response.totalOutstandingCents
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct CustomerDetailSheet: View {
    let customer: Customer
    let onChanged: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var transactions: [CreditTransaction] = []
    @State private var amountText = ""
    @State private var type = "PAYMENT"
    @State private var note = ""
    @State private var errorMessage: String?

    private let types = [("CHARGE", "Consumo"), ("PAYMENT", "Pagamento"), ("ADJUST", "Correzione")]

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section(customer.name) {
                    HStack {
                        Text("Saldo attuale")
                        Spacer()
                        Text((Double(customer.balanceCents) / 100.0).formatted(.currency(code: "EUR")))
                            .foregroundStyle(Brand.accent)
                    }
                }
                Section("Nuovo movimento") {
                    Picker("Tipo", selection: $type) {
                        ForEach(types, id: \.0) { value, label in
                            Text(label).tag(value)
                        }
                    }
                    TextField("Importo (€)", text: $amountText)
                    TextField("Nota (opzionale)", text: $note)
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red).font(.footnote)
                    }
                    Button("Registra movimento") { Task { await addTransaction() } }
                        .adaptiveGlassProminentButton()
                        .disabled(Double(amountText.replacingOccurrences(of: ",", with: ".")) == nil)
                }
                Section("Storico") {
                    ForEach(transactions) { tx in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tx.type).font(.caption.bold())
                                if let note = tx.note { Text(note).font(.caption2).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text((Double(tx.amountCents) / 100.0).formatted(.currency(code: "EUR")))
                        }
                    }
                }
            }
            .formStyle(.grouped)
            HStack {
                Spacer()
                Button("Chiudi") { dismiss() }.adaptiveGlassButton()
            }
            .padding()
        }
        .frame(minWidth: 420, minHeight: 480)
        .task { await load() }
    }

    private func load() async {
        do {
            let detail = try await api.fetchCustomerDetail(id: customer.id)
            transactions = detail.transactions
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func addTransaction() async {
        guard let amount = Double(amountText.replacingOccurrences(of: ",", with: ".")) else { return }
        do {
            let result = try await api.addCreditTransaction(
                customerId: customer.id,
                type: type,
                amountCents: Int((amount * 100).rounded()),
                note: note.isEmpty ? nil : note
            )
            transactions.insert(result.transaction, at: 0)
            amountText = ""
            note = ""
            await onChanged()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct NewCustomerSheet: View {
    let onCreated: () async -> Void

    @EnvironmentObject private var api: APIClient
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var limitText = "0"
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Nuovo cliente") {
                TextField("Nome", text: $name)
                TextField("Telefono", text: $phone)
                TextField("Email", text: $email)
                TextField("Limite di credito (€)", text: $limitText)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 380, minHeight: 280)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Annulla") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("Crea") { Task { await save() } }
                    .disabled(isSaving || name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func save() async {
        let limit = Double(limitText.replacingOccurrences(of: ",", with: ".")) ?? 0
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await api.createCustomer(
                name: name, phone: phone.isEmpty ? nil : phone, email: email.isEmpty ? nil : email,
                limitCents: Int((limit * 100).rounded())
            )
            await onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { CreditView() }.environmentObject(APIClient.shared)
}
