//
//  ContentView.swift
//  PiazzettaKDS
//
//  Root view: selettore postazione (Bar/Cucina) all'avvio, poi board KDS.
//

import SwiftUI

struct ContentView: View {
    @State private var station: Station?

    var body: some View {
        Group {
            if let station {
                BoardView(station: station) { self.station = nil }
            } else {
                StationPickerView(onSelect: { station = $0 })
            }
        }
        .animation(.default, value: station)
        .preferredColorScheme(.dark)
    }
}

#Preview {
    ContentView().environmentObject(APIClient.shared)
}
