//
//  ShiftActiveView.swift
//  PiazzettaWaiter
//
//  Turno attivo con timer di durata e clock-out.
//

import SwiftUI

struct ShiftActiveView: View {
    @EnvironmentObject private var api: APIClient
    @State private var now = Date()
    @State private var isClockingOut = false
    @State private var errorMessage: String?

    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let shift = api.activeShift {
                    VStack(spacing: 10) {
                        Text(ShiftRole(rawValue: shift.shiftRole ?? "")?.emoji ?? "🧑‍🍳")
                            .font(.system(size: 56))
                        Text(ShiftRole(rawValue: shift.shiftRole ?? "")?.label ?? "In turno")
                            .font(.title2.bold())
                        Text("Iniziato alle \(shift.startedAt.formatted(date: .omitted, time: .shortened))")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 30)

                    Text(elapsed(since: shift.startedAt))
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(Brand.accent)
                        .padding(30)
                        .glassCard(cornerRadius: 28)

                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red).font(.footnote)
                    }

                    Button {
                        Task { await clockOut() }
                    } label: {
                        HStack {
                            if isClockingOut { ProgressView().tint(.white) }
                            Text("Termina turno").font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .adaptiveGlassProminentButton()
                    .tint(.red)
                    .disabled(isClockingOut)
                    .padding(.horizontal, 30)
                } else {
                    Text("Nessun turno attivo").foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .background(Brand.background)
        .navigationTitle("Turno")
        .onReceive(timer) { now = $0 }
    }

    private func elapsed(since start: Date) -> String {
        let seconds = max(0, Int(now.timeIntervalSince(start)))
        let h = seconds / 3600
        let m = (seconds % 3600) / 60
        let s = seconds % 60
        return String(format: "%02d:%02d:%02d", h, m, s)
    }

    private func clockOut() async {
        isClockingOut = true
        errorMessage = nil
        defer { isClockingOut = false }
        do {
            _ = try await api.clockOut()
            api.activeShift = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    NavigationStack { ShiftActiveView() }.environmentObject(APIClient.shared)
}
