//
//  AccountingView.swift
//  PiazzettaOwner
//
//  Contabilità: conti, fatture fornitori e scansione AI da foto
//  (fotocamera/libreria → OCR → revisione → carico magazzino → partita doppia).
//

import SwiftUI
import PhotosUI
import UIKit

struct AccountingView: View {
    @EnvironmentObject private var api: APIClient
    @State private var accounts: [AccountingAccount] = []
    @State private var invoices: [Invoice] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Scansione
    @State private var showSourcePicker = false
    @State private var showCamera = false
    @State private var showPhotoPicker = false
    @State private var pickedPhoto: PhotosPickerItem?
    @State private var isScanning = false
    @State private var scanResult: ScanInvoiceResult?
    @State private var stockInvoice: Invoice?
    @State private var recordInvoice: Invoice?

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            Section("Conti") {
                ForEach(accounts) { account in
                    HStack {
                        Text(account.code.map { "\($0) " } ?? "").foregroundStyle(.secondary)
                        Text(account.name)
                        Spacer()
                        Text(account.category ?? "").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section("Fatture") {
                ForEach(invoices) { invoice in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(invoice.supplierName)
                                Text("N. \(invoice.invoiceNumber) · \(invoice.status)")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text((Double(invoice.totalAmountCents) / 100.0).formatted(.currency(code: "EUR")))
                        }
                        HStack(spacing: 8) {
                            if invoice.ocrData?.scannedAt != nil {
                                Label("AI \(Int(((invoice.ocrData?.confidence ?? 0)) * 100))%", systemImage: "sparkles")
                                    .font(.caption2).foregroundStyle(.purple)
                            }
                            if invoice.ocrData?.stockLoadedAt != nil {
                                Label("Merce caricata", systemImage: "shippingbox")
                                    .font(.caption2).foregroundStyle(.green)
                            }
                            if let note = invoice.note, note.contains("⚠️") {
                                Label("Da verificare", systemImage: "exclamationmark.triangle")
                                    .font(.caption2).foregroundStyle(.orange)
                            }
                            Spacer()
                            if invoice.status == "RECEIVED" {
                                if (invoice.ocrData?.lineItems?.isEmpty == false) && invoice.ocrData?.stockLoadedAt == nil {
                                    Button("📦 Merce") { stockInvoice = invoice }
                                        .font(.caption).buttonStyle(.bordered)
                                }
                                Button("Contabilizza") { recordInvoice = invoice }
                                    .font(.caption).buttonStyle(.bordered)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Contabilità")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showSourcePicker = true } label: {
                    Label("Scansiona fattura", systemImage: "doc.viewfinder")
                }
            }
        }
        .confirmationDialog("Scansiona fattura", isPresented: $showSourcePicker) {
            Button("📷 Fotocamera") { showCamera = true }
            Button("🖼 Libreria foto") { showPhotoPicker = true }
            Button("Annulla", role: .cancel) {}
        }
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                showCamera = false
                if let image { Task { await scan(image) } }
            }
            .ignoresSafeArea()
        }
        .photosPicker(isPresented: $showPhotoPicker, selection: $pickedPhoto, matching: .images)
        .onChange(of: pickedPhoto) { _, item in
            guard let item else { return }
            pickedPhoto = nil
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await scan(image)
                }
            }
        }
        .sheet(item: scanResultItem) { result in
            InvoiceScanReviewSheet(result: result) { await load() }
        }
        .sheet(item: $stockInvoice) { inv in
            InvoiceStockSheet(invoice: inv) { await load() }
        }
        .sheet(item: $recordInvoice) { inv in
            InvoiceRecordSheet(invoice: inv, accounts: accounts) { await load() }
        }
        .overlay {
            if isScanning {
                ZStack {
                    Color.black.opacity(0.35).ignoresSafeArea()
                    VStack(spacing: 12) {
                        ProgressView().scaleEffect(1.4).tint(.white)
                        Text("Analisi AI della fattura…").foregroundStyle(.white).font(.headline)
                    }
                    .padding(28).background(.ultraThinMaterial).clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
            if isLoading && accounts.isEmpty && invoices.isEmpty { ProgressView() }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // Binding adattato per .sheet(item:) su ScanInvoiceResult (non Identifiable di default)
    private var scanResultItem: Binding<ScanInvoiceResult?> {
        Binding(get: { scanResult }, set: { scanResult = $0 })
    }

    private func scan(_ image: UIImage) async {
        isScanning = true
        errorMessage = nil
        defer { isScanning = false }
        // Riduce la foto prima dell'upload (base64 ~2-3MB per foto iPhone altrimenti)
        let resized = image.resized(maxDimension: 1600)
        guard let data = resized.jpegData(compressionQuality: 0.75) else { return }
        do {
            scanResult = try await api.scanInvoice(base64: data.base64EncodedString(), mimeType: "image/jpeg", filename: "fattura.jpg")
        } catch {
            errorMessage = "Scansione fallita: \(error.localizedDescription)"
        }
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

// MARK: - Fotocamera (UIImagePickerController, adatta a iPad)

private struct CameraPicker: UIViewControllerRepresentable {
    let onPick: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPick: onPick) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPick: (UIImage?) -> Void
        init(onPick: @escaping (UIImage?) -> Void) { self.onPick = onPick }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPick(info[.originalImage] as? UIImage)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onPick(nil) }
    }
}

private extension UIImage {
    func resized(maxDimension: CGFloat) -> UIImage {
        let scale = min(1, maxDimension / max(size.width, size.height))
        guard scale < 1 else { return self }
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)
        return UIGraphicsImageRenderer(size: newSize).image { _ in draw(in: CGRect(origin: .zero, size: newSize)) }
    }
}

extension ScanInvoiceResult: Identifiable {
    var id: String { invoice.id }
}

// MARK: - Review dati estratti

private struct InvoiceScanReviewSheet: View {
    @EnvironmentObject private var api: APIClient
    let result: ScanInvoiceResult
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var supplierName: String
    @State private var supplierVat: String
    @State private var invoiceNumber: String
    @State private var invoiceDate: String
    @State private var netEur: String
    @State private var vatRate: String
    @State private var saving = false

    init(result: ScanInvoiceResult, onDone: @escaping () async -> Void) {
        self.result = result
        self.onDone = onDone
        let inv = result.invoice
        _supplierName = State(initialValue: inv.supplierName)
        _supplierVat = State(initialValue: inv.supplierVat ?? "")
        _invoiceNumber = State(initialValue: inv.invoiceNumber)
        _invoiceDate = State(initialValue: (inv.invoiceDate.map { InvoiceScanReviewSheet.df.string(from: $0) }) ?? "")
        _netEur = State(initialValue: String(format: "%.2f", Double(inv.netAmountCents) / 100))
        _vatRate = State(initialValue: String(format: "%.0f", inv.vatRate))
    }

    private static let df: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
    }()

    var body: some View {
        NavigationStack {
            Form {
                if result.duplicate == true {
                    Section {
                        Label("Fattura già presente — nessun duplicato creato", systemImage: "doc.on.doc")
                            .foregroundStyle(.orange)
                    }
                }
                if result.buyerDetected == true {
                    Section {
                        Label("L'AI ha letto il destinatario come fornitore — correggi il nome", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
                Section("Fornitore") {
                    if let s = result.supplier {
                        Label(result.supplierCreated ? "\(s.name) (nuovo, creato)" : "\(s.name) (riconosciuto)",
                              systemImage: result.supplierCreated ? "plus.circle" : "checkmark.circle")
                            .foregroundStyle(result.supplierCreated ? .blue : .green)
                    }
                    TextField("Ragione sociale", text: $supplierName)
                    TextField("P.IVA", text: $supplierVat).keyboardType(.numberPad)
                }
                Section("Documento") {
                    TextField("Numero", text: $invoiceNumber)
                    TextField("Data (aaaa-mm-gg)", text: $invoiceDate)
                    TextField("Imponibile €", text: $netEur).keyboardType(.decimalPad)
                    TextField("IVA %", text: $vatRate).keyboardType(.decimalPad)
                }
                if let items = result.parsed.lineItems, !items.isEmpty {
                    Section("Righe merce (\(items.count))") {
                        ForEach(items) { li in
                            HStack {
                                Text(li.description).font(.caption)
                                Spacer()
                                Text("×\(li.qty, specifier: "%g") · \((Double(li.unitPriceCents)/100).formatted(.currency(code: "EUR")))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                if let conf = result.parsed.confidence as Double?, conf < 0.6 {
                    Section {
                        Label("Confidenza bassa — controlla bene i dati", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Verifica scansione")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Chiudi") { Task { await onDone(); dismiss() } }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Salvo…" : "Conferma") {
                        saving = true
                        Task {
                            _ = try? await api.updateInvoice(id: result.invoice.id, body: [
                                "supplierName": supplierName,
                                "supplierVat": supplierVat.isEmpty ? NSNull() : supplierVat,
                                "invoiceNumber": invoiceNumber,
                                "invoiceDate": invoiceDate,
                                "netAmountCents": Int((Double(netEur.replacingOccurrences(of: ",", with: ".")) ?? 0) * 100),
                                "vatRate": Double(vatRate.replacingOccurrences(of: ",", with: ".")) ?? 22,
                                "note": NSNull(),
                            ])
                            await onDone()
                            dismiss()
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Carico merce a magazzino

private struct InvoiceStockSheet: View {
    @EnvironmentObject private var api: APIClient
    let invoice: Invoice
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var products: [MenuProduct] = []
    @State private var rows: [StockRow] = []
    @State private var saving = false
    @State private var error: String?

    struct StockRow: Identifiable {
        let id = UUID()
        let description: String
        var qty: Double
        var productId: String?
        var skip = false
    }

    var body: some View {
        NavigationStack {
            List {
                if let error { Text(error).foregroundStyle(.red) }
                ForEach($rows) { $row in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(row.description).font(.subheadline)
                        HStack {
                            Picker("Prodotto", selection: $row.productId) {
                                Text("— ignora —").tag(String?.none)
                                ForEach(products) { p in
                                    Text(p.name).tag(String?.some(p.id))
                                }
                            }
                            .pickerStyle(.menu)
                            Stepper("×\(row.qty, specifier: "%g")", value: $row.qty, in: 0...10000, step: 1)
                        }
                    }
                }
            }
            .navigationTitle("Carico merce")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Carico…" : "Carica") { Task { await submit() } }
                }
            }
            .task { await loadProducts() }
        }
    }

    private func loadProducts() async {
        do {
            products = try await api.fetchMenu()
            let norm = { (s: String) in s.lowercased().components(separatedBy: CharacterSet.alphanumerics.inverted).joined(separator: " ").trimmingCharacters(in: .whitespaces) }
            rows = (invoice.ocrData?.lineItems ?? []).map { li in
                let ln = norm(li.description)
                let match = products.first(where: { norm($0.name) == ln })
                    ?? products.first(where: { let pn = norm($0.name); return pn.count >= 4 && (ln.contains(pn) || pn.contains(ln)) })
                return StockRow(description: li.description, qty: li.qty, productId: match?.id)
            }
        } catch { self.error = error.localizedDescription }
    }

    private func submit() async {
        let items = rows.compactMap { r -> [String: Any]? in
            guard !r.skip, let pid = r.productId, r.qty > 0 else { return nil }
            return ["productId": pid, "qty": r.qty, "note": r.description]
        }
        guard !items.isEmpty else { error = "Nessuna riga mappata"; return }
        saving = true
        do {
            _ = try await api.loadInvoiceStock(id: invoice.id, items: items)
            await onDone()
            dismiss()
        } catch { self.error = error.localizedDescription }
        saving = false
    }
}

// MARK: - Contabilizzazione (partita doppia)

private struct InvoiceRecordSheet: View {
    @EnvironmentObject private var api: APIClient
    let invoice: Invoice
    let accounts: [AccountingAccount]
    let onDone: () async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var expenseId: String = ""
    @State private var saving = false
    @State private var error: String?

    private var costAccounts: [AccountingAccount] { accounts.filter { $0.category == "COSTO" } }
    private var vatAccount: AccountingAccount? { accounts.first { $0.code == "4.03" } }
    private var supplierAccount: AccountingAccount? { accounts.first { $0.code == "7.01" } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("DARE costo", value: (Double(invoice.netAmountCents)/100).formatted(.currency(code: "EUR")))
                    LabeledContent("DARE IVA \(Int(invoice.vatRate))%", value: (Double(invoice.vatAmountCents)/100).formatted(.currency(code: "EUR")))
                    LabeledContent("AVERE fornitore", value: (Double(invoice.totalAmountCents)/100).formatted(.currency(code: "EUR")))
                }
                Section("Conto costo (DARE)") {
                    Picker("Conto", selection: $expenseId) {
                        ForEach(costAccounts) { a in Text("\(a.code ?? "") \(a.name)").tag(a.id) }
                    }
                }
                if vatAccount == nil || supplierAccount == nil {
                    Section { Text("Manca il conto IVA a credito (4.03) o Fornitori (7.01) nel piano conti").foregroundStyle(.red) }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("Contabilizza \(invoice.invoiceNumber)")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Annulla") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Registro…" : "Contabilizza") { Task { await record() } }
                        .disabled(expenseId.isEmpty || vatAccount == nil || supplierAccount == nil)
                }
            }
            .onAppear { expenseId = costAccounts.first?.id ?? "" }
        }
    }

    private func record() async {
        guard let vat = vatAccount, let sup = supplierAccount else { return }
        saving = true
        do {
            _ = try await api.recordInvoice(id: invoice.id, expenseAccountId: expenseId, vatAccountId: vat.id, supplierAccountId: sup.id)
            await onDone()
            dismiss()
        } catch { self.error = error.localizedDescription }
        saving = false
    }
}

#Preview {
    NavigationStack { AccountingView() }.environmentObject(APIClient.shared)
}
