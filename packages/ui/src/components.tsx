// Design system Apple-style condiviso per la dashboard proprietario.
// Token colore/tipografia + primitivi riutilizzabili (Card, KpiCard, Badge,
// Button, Input, Segmented, Spinner, EmptyState). Tutto CSS-in-JS, nessuna
// dipendenza esterna.
import React, { useEffect } from 'react';

export const FONT =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif";

export const colors = {
  bg: '#f5f5f7',
  card: '#ffffff',
  text: '#1d1d1f',
  secondary: '#86868b',
  accent: '#0071e3',
  success: '#34c759',
  danger: '#ff3b30',
  warning: '#ff9500',
  border: '#d2d2d7',
  hairline: '#f0f0f0',
  bar: '#0a84ff',
  kitchen: '#ff9500',
} as const;

// ---- Card ----------------------------------------------------------------
export const cardStyle: React.CSSProperties = {
  background: colors.card,
  borderRadius: 16,
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  padding: 20,
};

export function Card({
  children,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div style={{ ...cardStyle, ...style }} {...rest}>
      {children}
    </div>
  );
}

// ---- Section (titolo pagina) ---------------------------------------------
export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: colors.text, letterSpacing: '-0.02em' }}>
          {title}
        </h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 15, color: colors.secondary }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ---- KPI card ------------------------------------------------------------
export function KpiCard({
  label,
  value,
  deltaPct,
  sub,
  accent,
}: {
  label: string;
  value: string;
  deltaPct?: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 13, color: colors.secondary }}>{label}</span>
      <span
        style={{
          fontSize: 32,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: accent ?? colors.text,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 18 }}>
        {deltaPct !== undefined && Number.isFinite(deltaPct) && <Delta pct={deltaPct} />}
        {sub && <span style={{ fontSize: 13, color: colors.secondary }}>{sub}</span>}
      </div>
    </Card>
  );
}

export function Delta({ pct }: { pct: number }) {
  const up = pct >= 0;
  const color = up ? colors.success : colors.danger;
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ---- Badge ---------------------------------------------------------------
export function Badge({
  children,
  color = colors.secondary,
  bg,
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        borderRadius: 980,
        padding: '2px 10px',
        fontSize: 12,
        fontWeight: 500,
        color,
        background: bg ?? `${color}1a`,
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  );
}

// ---- Button --------------------------------------------------------------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ variant = 'primary', size = 'md', style, disabled, ...rest }: BtnProps) {
  const pad = size === 'sm' ? '5px 14px' : '8px 20px';
  const base: React.CSSProperties = {
    borderRadius: 980,
    padding: pad,
    fontSize: size === 'sm' ? 13 : 14,
    fontWeight: 500,
    fontFamily: FONT,
    cursor: disabled ? 'default' : 'pointer',
    transition: 'opacity .15s, background .15s',
    opacity: disabled ? 0.45 : 1,
    border: 0,
    whiteSpace: 'nowrap',
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: colors.accent, color: '#fff' },
    secondary: { background: 'transparent', border: `1px solid ${colors.accent}`, color: colors.accent },
    ghost: { background: '#f0f0f2', color: colors.text },
    danger: { background: 'transparent', border: `1px solid ${colors.danger}`, color: colors.danger },
  };
  return <button style={{ ...base, ...variants[variant], ...style }} disabled={disabled} {...rest} />;
}

// ---- Input / Select ------------------------------------------------------
export const inputStyle: React.CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${colors.border}`,
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: FONT,
  color: colors.text,
  background: '#fff',
  outline: 'none',
};

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...props.style }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = colors.accent;
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = colors.border;
        props.onBlur?.(e);
      }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...inputStyle, cursor: 'pointer', ...props.style }} />;
}

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, color: colors.secondary, ...style }}>
      {children}
    </label>
  );
}

// ---- Segmented control ---------------------------------------------------
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        background: '#e9e9eb',
        borderRadius: 10,
        padding: 2,
        gap: 2,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 0,
              borderRadius: 8,
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              fontFamily: FONT,
              cursor: 'pointer',
              background: active ? '#fff' : 'transparent',
              color: colors.text,
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'background .15s',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---- Spinner (Apple-style) ----------------------------------------------
export function Spinner({ size = 20, color = colors.secondary }: { size?: number; color?: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${Math.max(2, size / 10)}px solid ${color}33`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'pzspin 0.7s linear infinite',
      }}
    />
  );
}

// ---- Empty / Error / Loading stati --------------------------------------
export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: colors.secondary }}>
      <div style={{ fontSize: 40, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: colors.text }}>{title}</div>
      {hint && <div style={{ fontSize: 14, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Loading({ label = 'Caricamento…' }: { label?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 48, color: colors.secondary }}>
      <Spinner />
      <span style={{ fontSize: 15 }}>{label}</span>
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        background: `${colors.danger}14`,
        color: colors.danger,
        borderRadius: 12,
        padding: '12px 16px',
        fontSize: 14,
        fontWeight: 500,
        marginBottom: 16,
      }}
    >
      {message}
    </div>
  );
}

export function InfoBanner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning';
  title: string;
  children?: React.ReactNode;
}) {
  const c = tone === 'warning' ? colors.warning : colors.accent;
  return (
    <div style={{ background: `${c}14`, borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
      <div style={{ fontWeight: 600, color: c, fontSize: 15 }}>{title}</div>
      {children && <div style={{ fontSize: 14, color: colors.text, marginTop: 4 }}>{children}</div>}
    </div>
  );
}

// Inietta le keyframes globali una sola volta (spinner + fade-in card).
export function GlobalStyles() {
  useEffect(() => {
    if (document.getElementById('pz-global-styles')) return;
    const el = document.createElement('style');
    el.id = 'pz-global-styles';
    el.textContent = `
      @keyframes pzspin { to { transform: rotate(360deg); } }
      @keyframes pzfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
      * { box-sizing: border-box; }
      body { margin: 0; }
      .pz-fade { animation: pzfade .3s ease both; }
      ::selection { background: ${colors.accent}33; }
    `;
    document.head.appendChild(el);
  }, []);
  return null;
}

// ---- Tabella ------------------------------------------------------------
export const thStyle: React.CSSProperties = {
  fontSize: 12,
  color: colors.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  fontWeight: 600,
  textAlign: 'left',
  padding: '10px 12px',
};
export const tdStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: 14,
  color: colors.text,
  borderBottom: `1px solid ${colors.hairline}`,
};
