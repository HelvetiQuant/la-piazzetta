//
//  GlassSupport.swift
//  PiazzettaWaiter
//
//  Helper per il design "Liquid Glass" introdotto in iOS 26 (WWDC).
//  Ogni modifier degrada elegantemente su iOS 17-25 (min deployment target)
//  usando i material di sistema, così l'app resta compatibile ma sfrutta
//  il vetro liquido quando disponibile.
//

import SwiftUI

enum Brand {
    /// Colore accento del brand La Piazzetta.
    static let accent = Color(red: 0x00 / 255, green: 0x71 / 255, blue: 0xE3 / 255)
    /// Sfondo chiaro brand.
    static let background = Color(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255)
}

/// Applica `.glassEffect` (iOS 26+) con fallback a `.thinMaterial`.
struct GlassCard: ViewModifier {
    var cornerRadius: CGFloat = 20

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.glassEffect(.regular, in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
        } else {
            content.background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.thinMaterial)
            )
        }
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = 20) -> some View {
        modifier(GlassCard(cornerRadius: cornerRadius))
    }

    /// `.buttonStyle(.glass)` su iOS 26+, `.bordered` come fallback.
    @ViewBuilder
    func adaptiveGlassButton() -> some View {
        if #available(iOS 26.0, *) {
            self.buttonStyle(.glass)
        } else {
            self.buttonStyle(.bordered)
        }
    }

    /// `.buttonStyle(.glassProminent)` su iOS 26+, `.borderedProminent` come fallback.
    @ViewBuilder
    func adaptiveGlassProminentButton() -> some View {
        if #available(iOS 26.0, *) {
            self.buttonStyle(.glassProminent)
        } else {
            self.buttonStyle(.borderedProminent)
        }
    }
}
