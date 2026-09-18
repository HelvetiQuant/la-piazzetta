//
//  ClockInView.swift
//  PiazzettaWaiter
//
//  Selezione ruolo e timbratura inizio turno con card grandi ed emoji.
//

import SwiftUI

struct ClockInView: View {
    @EnvironmentObject private var api: APIClient
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()

            VStack(spacing: 28) {
                VStack(spacing: 8) {
                    Text("Buon turno! 👋")
                        .font(.largeTitle.bold())
                    Text("Seleziona il tuo ruolo per iniziare")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.top, 40)

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }

                VStack(spacing: 18) {
                    ForEach(ShiftRole.allCases) { role in
                        RoleCard(role: role, isLoading: isLoading) {
                            Task { await clockIn(role: role) }
                        }
                    }
                }
                .padding(.horizontal, 20)

                Spacer()

                Button("Esci") { api.logout() }
                    .adaptiveGlassButton()
                    .padding(.bottom, 20)
            }
        }
    }

    private func clockIn(role: ShiftRole) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            api.activeShift = try await api.clockIn(role: role)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct RoleCard: View {
    let role: ShiftRole
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 20) {
                Text(role.emoji).font(.system(size: 44))
                VStack(alignment: .leading) {
                    Text(role.label).font(.title2.bold())
                    Text("Timbra come \(role.label.lowercased())").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.secondary)
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .glassCard(cornerRadius: 24)
        }
        .buttonStyle(.plain)
        .disabled(isLoading)
    }
}

#Preview {
    ClockInView().environmentObject(APIClient.shared)
}
