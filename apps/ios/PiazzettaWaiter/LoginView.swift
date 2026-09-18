//
//  LoginView.swift
//  PiazzettaWaiter
//
//  Login con PIN numerico: venueId + userId + PIN.
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var api: APIClient

    @State private var venueId = ""
    @State private var userId = ""
    @State private var pin = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "person.badge.key.fill")
                            .font(.system(size: 48))
                            .foregroundStyle(Brand.accent)
                        Text("La Piazzetta")
                            .font(.largeTitle.bold())
                        Text("Accesso staff con PIN")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 60)

                    VStack(spacing: 14) {
                        TextField("ID locale (venueId)", text: $venueId)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        TextField("ID dipendente (userId)", text: $userId)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("PIN", text: $pin)
                            .keyboardType(.numberPad)
                    }
                    .textFieldStyle(.roundedBorder)
                    .padding(20)
                    .glassCard(cornerRadius: 24)

                    PinPad(pin: $pin)

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
                    .disabled(isLoading || venueId.isEmpty || userId.isEmpty || pin.isEmpty)
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
            try await api.loginPin(venueId: venueId, userId: userId, pin: pin)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// Tastierino numerico per il PIN, comodo su iPad in postazione fissa.
private struct PinPad: View {
    @Binding var pin: String
    private let columns = Array(repeating: GridItem(.flexible()), count: 3)

    var body: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(1...9, id: \.self) { number in
                digitButton("\(number)")
            }
            Color.clear.frame(height: 44)
            digitButton("0")
            Button {
                if !pin.isEmpty { pin.removeLast() }
            } label: {
                Image(systemName: "delete.left")
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .adaptiveGlassButton()
        }
    }

    private func digitButton(_ digit: String) -> some View {
        Button {
            pin.append(digit)
        } label: {
            Text(digit)
                .font(.title3.weight(.medium))
                .frame(maxWidth: .infinity)
                .frame(height: 44)
        }
        .adaptiveGlassButton()
    }
}

#Preview {
    LoginView().environmentObject(APIClient.shared)
}
