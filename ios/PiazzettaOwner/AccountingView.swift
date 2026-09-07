//
//  AccountingView.swift
//  PiazzettaOwner
//

import SwiftUI

struct AccountingView: View {
    @EnvironmentObject private var api: APIClient
    @State private var accounts: [AccountingAccount] = []
    @State private var invoices: [Invoice] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            Section("Conti") {
                ForEach(accounts) { account in
                    HStack {
                        Text(account.name)
                        Spacer()
                        if let balance = account.balanceCents {
                            Text((Double(balance) / 100.0).formatted(.currency(code: "EUR")))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section("Fatture") {
                ForEach(invoices) { invoice in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(invoice.supplier ?? invoice.number ?? "Fattura")
                            Text(invoice.status).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text((Double(invoice.totalCents) / 100.0).formatted(.currency(code: "EUR")))
                    }
                }
            }
        }
        .navigationTitle("Contabilità")
        .overlay { if isLoading && accounts.isEmpty && invoices.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let accountsTask = api.fetchAccounts()
            async let invoicesTask = api.fetchInvoices()
            accounts = try await accountsTask
            invoices = try await invoicesTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { AccountingView() }.environmentObject(APIClient.shared)
}
