//
//  ScheduleView.swift
//  PiazzettaOwner
//
//  Orari: turni pianificati per la settimana e disponibilità dello staff.
//

import SwiftUI

struct ScheduleView: View {
    @EnvironmentObject private var api: APIClient
    @State private var shifts: [ScheduledShift] = []
    @State private var availability: [AvailabilitySlot] = []
    @State private var isLoading = false
    @State private var errorMessage: String?

    private var grouped: [(String, [ScheduledShift])] {
        let groups = Dictionary(grouping: shifts) { shift in
            shift.date.formatted(date: .abbreviated, time: .omitted)
        }
        return groups.sorted { $0.key < $1.key }
    }

    var body: some View {
        List {
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.footnote)
            }
            if shifts.isEmpty && !isLoading {
                Text("Nessun turno pianificato").foregroundStyle(.secondary)
            }
            ForEach(grouped, id: \.0) { day, dayShifts in
                Section(day) {
                    ForEach(dayShifts) { shift in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(shift.user.name).font(.body)
                                Text("\(shift.startHour):00 – \(shift.endHour):00\(shift.station.map { " · \($0)" } ?? "")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if shift.aiSuggested {
                                Image(systemName: "sparkles").foregroundStyle(Brand.accent)
                            }
                            Text(shift.status)
                                .font(.caption2.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Brand.accent.opacity(0.15), in: Capsule())
                                .foregroundStyle(Brand.accent)
                        }
                    }
                }
            }
            Section("Disponibilità staff") {
                if availability.isEmpty {
                    Text("Nessuna disponibilità registrata").foregroundStyle(.secondary)
                } else {
                    ForEach(availability) { slot in
                        HStack {
                            Text(slot.user?.name ?? "Dipendente")
                            Spacer()
                            Text("\(dayLabel(slot.dayOfWeek)) \(slot.startHour):00–\(slot.endHour):00")
                                .font(.caption).foregroundStyle(.secondary)
                            Text(slot.preference).font(.caption2).foregroundStyle(Brand.accent)
                        }
                    }
                }
            }
        }
        .navigationTitle("Orari")
        .overlay { if isLoading && shifts.isEmpty { ProgressView() } }
        .task { await load() }
        .refreshable { await load() }
    }

    private func dayLabel(_ day: Int) -> String {
        let names = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"]
        return names.indices.contains(day) ? names[day] : "?"
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let shiftsTask = api.fetchSchedule()
            async let availabilityTask = api.fetchAvailability()
            shifts = try await shiftsTask
            availability = try await availabilityTask
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { ScheduleView() }.environmentObject(APIClient.shared)
}
