//
//  GlassSupport.swift
//  PiazzettaOwner
//
//  Helper per il design "Liquid Glass" introdotto in iOS 26 (WWDC).
//  Palette colori ristorante italiano + glass effects con fallback.
//

import SwiftUI

// MARK: - Brand Colors (ristorante italiano)

enum Brand {
    /// Rosso pomodoro — azioni primarie, header
    static let accent = Color(red: 0xC7/255, green: 0x1F/255, blue: 0x14/255)
    /// Oro/ambra — accenti, badge
    static let accentSecondary = Color(red: 0xD9/255, green: 0xA6/255, blue: 0x33/255)
    /// Verde oliva — KPI positivi, conferme
    static let success = Color(red: 0x66/255, green: 0x99/255, blue: 0x33/255)
    /// Rosso scuro — KPI negativi, errori
    static let danger = Color(red: 0xB3/255, green: 0x1A/255, blue: 0x19/255)
    /// Arancio — alert, warning
    static let warning = Color(red: 0xE6/255, green: 0x8C/255, blue: 0x26/255)
    /// Grigio caldo — sfondo app
    static let background = Color(red: 0xF8/255, green: 0xF5/255, blue: 0xF0/255)
    /// Bianco caldo con opacity — card background
    static let cardBackground = Color.white.opacity(0.85)

    // MARK: - Gradienti

    static let accentGradient = LinearGradient(
        colors: [accent, accentSecondary],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let successGradient = LinearGradient(
        colors: [success, Color(red: 0x88/255, green: 0xBB/255, blue: 0x44/255)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let dangerGradient = LinearGradient(
        colors: [danger, warning],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let warmGradient = LinearGradient(
        colors: [accentSecondary, Color(red: 0xE8/255, green: 0xC8/255, blue: 0x6E/255)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

// MARK: - Glass Effects

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

    /// Transizione di entrata standard
    func entranceTransition() -> some View {
        self.transition(.move(edge: .leading).combined(with: .opacity))
    }
}

// MARK: - Priority Color Helper

func priorityColor(_ priority: Int) -> Color {
    switch priority {
    case 1: return Brand.danger
    case 2: return Brand.warning
    case 3: return Brand.accentSecondary
    case 4: return Brand.success
    default: return Color.secondary
    }
}

// MARK: - Delta Badge (KPI positivo/negativo)

struct DeltaBadge: View {
    let value: Double?
    var suffix: String = "%"

    var body: some View {
        if let v = value {
            let positive = v >= 0
            HStack(spacing: 2) {
                Image(systemName: positive ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .symbolEffect(.bounce, value: v)
                Text(String(format: "%+.1f%@", v, suffix))
            }
            .font(.caption.bold())
            .foregroundStyle(positive ? Brand.success : Brand.danger)
        }
    }
}

// MARK: - Sparkline (mini grafico)

struct Sparkline: View {
    let values: [Double]
    var color: Color = Brand.accent

    var body: some View {
        GeometryReader { geo in
            if values.count > 1 {
                let maxV = values.max() ?? 1
                let minV = values.min() ?? 0
                let range = max(maxV - minV, 1)
                Path { p in
                    for (i, v) in values.enumerated() {
                        let x = geo.size.width * CGFloat(i) / CGFloat(values.count - 1)
                        let y = geo.size.height * (1 - CGFloat((v - minV) / range))
                        if i == 0 { p.move(to: CGPoint(x: x, y: y)) }
                        else { p.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(color, lineWidth: 2)
            }
        }
        .frame(height: 30)
    }
}

// MARK: - Empty State

struct GlassEmptyState: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 48))
                .foregroundStyle(.secondary)
                .symbolEffect(.pulse, options: .repeating)
            Text(title)
                .font(.headline)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Error State

struct GlassErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 48))
                .foregroundStyle(Brand.danger)
                .symbolEffect(.bounce, options: .repeating)
            Text("Errore")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Riprova", action: retry)
                .adaptiveGlassProminentButton()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}

// MARK: - Status Badge

struct AddOnStatusBadge: View {
    let status: String

    var body: some View {
        let color: Color = status == "ACTIVE" ? Brand.success :
                          status == "PAUSED" ? Color.secondary : Brand.danger
        Text(status)
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.2))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }
}

// MARK: - hoverHighlight (no-op su iOS, effetto hover solo su macOS)

extension View {
    @ViewBuilder
    func hoverHighlight() -> some View {
        // Su iOS non c'è hover, restituiamo la view invariata
        self
    }
}
