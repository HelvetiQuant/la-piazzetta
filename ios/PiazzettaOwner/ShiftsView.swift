//
//  ShiftsView.swift
//  PiazzettaOwner
//

import SwiftUI

struct ShiftsView: View {
    @EnvironmentObject private var api: APIClient
    @State private var staff: [StaffMember] = []
    @State private var shifts: [Shift] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            Section("Turni attivi") {
                let open = shifts.filter { $0.status == "OPEN" }
                if open.isEmpty {
                    Text("Nessun turno aperto ora").foregroundStyle(.secondary)
                } else {
                    ForEach(open) { shift in
                        ShiftRow(shift: shift, staffName: name(for: shift.userId))
                    }
                }
            }
            Section("Storico recente") {
                let closed = shifts.filter { $0.status != "OPEN" }
                ForEach(closed) { shift in
                    ShiftRow(shift: shift, staffName: name(for: shift.userId))
                }
            }
            Section("Staff") {
                ForEach(staff) { member in
                    HStack {
                        Text(member.name)
                        Spacer()
                        ForEach(member.roles, id: \.self) { role in
                            Text(role)
                                .font(.caption2.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Brand.accent.opacity(0.15), in: Capsule())
                                .foregroundStyle(Brand.accent)
                        }
                    }
                }
            }
        }
        .navigationTitle("Presenze")
        .overlay { if isLoading && shifts.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func name(for userId: String) -> String {
        staff.first { $0.id == userId }?.name ?? "Dipendente"
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let staffTask = api.fetchStaff()
            async let shiftsTask = api.fetchShifts()
            staff = try await staffTask
            shifts = try await shiftsTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct ShiftRow: View {
    let shift: Shift
    let staffName: String

    var body: some View {
        HStack {
            Text(ShiftRole(rawValue: shift.shiftRole ?? "")?.emoji ?? "🧑‍🍳")
            VStack(alignment: .leading) {
                Text(staffName).font(.body)
                Text(shift.startedAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if shift.status == "OPEN" {
                Text("In corso")
                    .font(.caption.bold())
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(.green.opacity(0.15), in: Capsule())
                    .foregroundStyle(.green)
            }
        }
    }
}

#Preview {
    NavigationStack { ShiftsView() }.environmentObject(APIClient.shared)
}
