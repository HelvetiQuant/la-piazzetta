//
//  LoginView.swift
//  PiazzettaOwner (macOS)
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var api: APIClient
    @State private var venueId = "venue_piazzetta"
    @State private var email = "owner@piazzetta.it"
    @State private var password = "owner123"
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "fork.knife.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Brand.accent)

            Text("La Piazzetta — Owner")
                .font(.largeTitle.bold())

            VStack(spacing: 14) {
                TextField("Venue ID", text: $venueId)
                    .textFieldStyle(.roundedBorder)
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
            }
            .frame(maxWidth: 320)

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            Button {
                Task { await login() }
            } label: {
                if isLoading {
                    ProgressView().controlSize(.small)
                } else {
                    Text("Accedi").frame(minWidth: 120)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isLoading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.background)
    }

    private func login() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await api.login(venueId: venueId, email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
