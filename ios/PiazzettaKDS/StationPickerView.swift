//
//  StationPickerView.swift
//  PiazzettaKDS
//
//  Selettore iniziale della postazione: Bar o Cucina.
//

import SwiftUI

struct StationPickerView: View {
    let onSelect: (Station) -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 32) {
                VStack(spacing: 8) {
                    Text("La Piazzetta")
                        .font(.largeTitle.bold())
                        .foregroundStyle(.white)
                    Text("Kitchen Display System")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                }
                .padding(.top, 80)

                HStack(spacing: 24) {
                    ForEach(Station.allCases) { station in
                        Button {
                            onSelect(station)
                        } label: {
                            VStack(spacing: 16) {
                                Text(station.emoji).font(.system(size: 64))
                                Text(station.label)
                                    .font(.title.bold())
                                    .foregroundStyle(.white)
                            }
                            .frame(width: 220, height: 220)
                            .glassCard(cornerRadius: 32)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Spacer()
            }
        }
    }
}

#Preview {
    StationPickerView(onSelect: { _ in })
}
