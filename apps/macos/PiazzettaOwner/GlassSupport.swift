//
//  GlassSupport.swift
//  PiazzettaShared
//
//  Helper per il design "Liquid Glass" (macOS 26 / iOS 26 / Tahoe).
//  Fallback a Material su versioni precedenti.
//  Unificato da versioni macOS e iOS.
//

import SwiftUI

// MARK: - Brand Colors (ristorante italiano)

/// Palette calda e professionale per un ristorante italiano: rosso pomodoro,
/// oro/ambra, verde oliva — coerente su KPI, azioni e header di tutte le view.
enum Brand {
    /// Rosso pomodoro intenso #C71F14 — azioni primarie, header.
    static let accent = Color(red: 0.78, green: 0.12, blue: 0.08)
    /// Oro/ambra #D9A633 — accento secondario, dettagli caldi.
    static let accentSecondary = Color(red: 0.85, green: 0.65, blue: 0.20)
    /// Verde oliva #669933 — KPI positivi, stato attivo.
    static let success = Color(red: 0.40, green: 0.60, blue: 0.20)
    /// Rosso scuro #B31A19 — KPI negativi, errori, stato scaduto.
    static let danger = Color(red: 0.70, green: 0.10, blue: 0.10)
    /// Arancio #E68C26 — warning, stati in pausa/attenzione.
    static let warning = Color(red: 0.90, green: 0.55, blue: 0.15)
    /// Grigio caldo chiaro #F8F5F0 — sfondo generale.
    static let background = Color(red: 0.97, green: 0.96, blue: 0.94)
    /// Bianco caldo — sfondo card.
    static let cardBackground = Color(red: 1.0, green: 0.99, blue: 0.97).opacity(0.85)

    /// Rosso pomodoro → oro: azioni primarie, header standard.
    static let accentGradient = LinearGradient(
        colors: [accent, accentSecondary],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    /// Verde oliva → verde chiaro: KPI e stati positivi.
    static let successGradient = LinearGradient(
        colors: [success, Color(red: 0.63, green: 0.82, blue: 0.42)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    /// Rosso scuro → arancio: errori e alert.
    static let dangerGradient = LinearGradient(
        colors: [danger, warning],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    /// Ambra → oro: header e card speciali (promozioni, add-on in evidenza).
    static let warmGradient = LinearGradient(
        colors: [accentSecondary, Color(red: 0.96, green: 0.82, blue: 0.48)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

// MARK: - Glass card

struct GlassCard: ViewModifier {
    var cornerRadius: CGFloat = 20
    var interactive: Bool = true

    func body(content: Content) -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            #if os(macOS)
            content.glassEffect(
                interactive ? .regular.interactive() : .regular,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            #else
            content.glassEffect(
                .regular,
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            #endif
        } else {
            content.background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.thinMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(.white.opacity(0.08), lineWidth: 1)
            )
        }
    }
}

extension View {
    func glassCard(cornerRadius: CGFloat = 20, interactive: Bool = true) -> some View {
        modifier(GlassCard(cornerRadius: cornerRadius, interactive: interactive))
    }

    @ViewBuilder
    func adaptiveGlassButton() -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            self.buttonStyle(.glass)
        } else {
            self.buttonStyle(.bordered)
        }
    }

    @ViewBuilder
    func adaptiveGlassProminentButton() -> some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            self.buttonStyle(.glassProminent)
        } else {
            self.buttonStyle(.borderedProminent)
        }
    }

    /// Riga di lista che si illumina leggermente al passaggio del mouse (macOS).
    /// Su iOS è un no-op (nessun hover disponibile).
    func hoverHighlight(cornerRadius: CGFloat = 12) -> some View {
        #if os(macOS)
        modifier(HoverHighlight(cornerRadius: cornerRadius))
        #else
        self
        #endif
    }

    /// Transizione di ingresso standard per card/righe che appaiono in lista.
    func entranceTransition() -> some View {
        self.transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

/// Contenitore che raggruppa più `glassCard` così le forme "liquide" si fondono
/// visivamente (macOS 26). Su versioni precedenti è un pass-through.
struct GlassGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if #available(macOS 26.0, iOS 26.0, *) {
            GlassEffectContainer { content }
        } else {
            content
        }
    }
}

#if os(macOS)
private struct HoverHighlight: ViewModifier {
    var cornerRadius: CGFloat
    @State private var hovering = false

    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Brand.accent.opacity(hovering ? 0.10 : 0))
            )
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.15), value: hovering)
    }
}
#endif

// MARK: - KPI delta indicator

/// Freccia + percentuale colorata per confrontare un KPI col periodo precedente.
/// Unificazione: `value:suffix:` (iOS) come API principale, `percent:` (macOS) come alias.
struct DeltaBadge: View {
    let value: Double?
    var suffix: String = "%"

    private var isPositive: Bool { (value ?? 0) >= 0 }

    var body: some View {
        if let value {
            HStack(spacing: 3) {
                Image(systemName: isPositive ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                    .symbolEffect(.pulse, options: .repeating, isActive: true)
                Text(String(format: "%+.1f%@", value, suffix))
                    .font(.caption.bold())
            }
            .foregroundStyle(isPositive ? Brand.success : Brand.danger)
        }
    }

    /// Alias per compatibilità con la versione macOS che usava `percent:`.
    init(percent: Double?) {
        self.value = percent
    }

    /// Inizializzatore principale (versione iOS).
    init(value: Double?, suffix: String = "%") {
        self.value = value
        self.suffix = suffix
    }
}

/// Mini sparkline per KPI card: una polilinea leggera senza assi.
struct Sparkline: View {
    let values: [Double]
    var color: Color = Brand.accent

    var body: some View {
        GeometryReader { geo in
            let maxV = values.max() ?? 1
            let minV = values.min() ?? 0
            let range = max(maxV - minV, 0.0001)
            Path { path in
                for (index, value) in values.enumerated() {
                    let x = values.count > 1 ? geo.size.width * CGFloat(index) / CGFloat(values.count - 1) : 0
                    let y = geo.size.height * (1 - CGFloat((value - minV) / range))
                    if index == 0 { path.move(to: CGPoint(x: x, y: y)) }
                    else { path.addLine(to: CGPoint(x: x, y: y)) }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
        .frame(height: 28)
    }
}

// MARK: - Badge priorità / stato (Add-on menu)

/// Colore per priorità 1-5: 1=rosso (massima urgenza) ... 5=grigio (bassa).
func priorityColor(_ priority: Int) -> Color {
    switch priority {
    case ...1: return Brand.danger
    case 2: return Brand.warning
    case 3: return Brand.accentSecondary
    case 4: return Brand.success
    default: return .secondary
    }
}

struct AddOnStatusBadge: View {
    let status: String

    private var color: Color {
        switch status.uppercased() {
        case "ACTIVE": return Brand.success
        case "PAUSED": return .secondary
        case "EXPIRED": return Brand.danger
        default: return .secondary
        }
    }

    var body: some View {
        Text(status.uppercased())
            .font(.caption2.bold())
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.18), in: Capsule())
            .foregroundStyle(color)
    }
}

// MARK: - Stato vuoto / errore riutilizzabili

struct GlassEmptyState: View {
    var icon: String
    var title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
                .symbolEffect(.pulse, options: .repeating, isActive: true)
            Text(title).font(.headline).foregroundStyle(.secondary)
            if let message {
                Text(message).font(.caption).foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding()
    }
}

struct GlassErrorState: View {
    var message: String
    var retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 34))
                .foregroundStyle(Brand.dangerGradient)
                .symbolEffect(.bounce, value: message)
            Text(message).font(.callout).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("Riprova", systemImage: "arrow.clockwise", action: retry)
                .adaptiveGlassButton()
        }
        .frame(maxWidth: .infinity, minHeight: 160)
        .padding()
    }
}
