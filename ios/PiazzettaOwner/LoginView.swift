//
//  LoginView.swift
//  PiazzettaOwner
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var api: APIClient

    @State private var venueId = ""
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "storefront.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Brand.accent)
                        Text("La Piazzetta")
                            .font(.largeTitle.bold())
                        Text("Dashboard proprietario")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 60)

                    VStack(spacing: 14) {
                        TextField("ID locale (venueId)", text: $venueId)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("Email", text: $email)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.emailAddress)
                        SecureField("Password", text: $password)
                    }
                    .textFieldStyle(.roundedBorder)
                    .padding(20)
                    .glassCard(cornerRadius: 24)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }

                    Button {
                        Task { await login() }
                    } label: {
                        HStack {
                            if isLoading { ProgressView().tint(.white) }
                            Text("Accedi")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                    }
                    .adaptiveGlassProminentButton()
                    .tint(Brand.accent)
                    .disabled(isLoading || venueId.isEmpty || email.isEmpty || password.isEmpty)
                }
                .padding(.horizontal, 24)
            }
        }
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

#Preview {
    LoginView().environmentObject(APIClient.shared)
}
