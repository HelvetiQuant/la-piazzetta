/**
 * Dialoghi custom per sostituire alert()/confirm() nativi.
 * Vanilla DOM (no React): usabili da qualunque componente senza Provider.
 * Overlay blur + card coerente col design system (bordi 20px, accent #0071e3).
 *
 *   uiAlert('Errore')                    → Promise<void> (fire-and-forget ok)
 *   if (!(await uiConfirm('Sicuro?'))) … → Promise<boolean>
 */

function mount(opts: {
  title: string;
  message: string;
  okLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,0.4);backdrop-filter:blur(4px);' +
      'display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#fff;border-radius:20px;padding:28px;width:380px;max-width:90vw;' +
      'box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:system-ui,-apple-system,sans-serif;';

    const h = document.createElement('div');
    h.textContent = opts.title;
    h.style.cssText = 'font-size:18px;font-weight:700;color:#1d1d1f;margin-bottom:8px;';
    box.appendChild(h);

    const p = document.createElement('div');
    p.textContent = opts.message;
    p.style.cssText = 'font-size:14px;color:#555;line-height:1.45;margin-bottom:20px;white-space:pre-wrap;';
    box.appendChild(p);

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    const btn = (label: string, primary: boolean, danger = false) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        `border-radius:12px;padding:10px 18px;font-size:15px;font-weight:${primary ? '700' : '600'};cursor:pointer;` +
        (primary
          ? `border:none;background:${danger ? '#ff3b30' : '#0071e3'};color:#fff;`
          : 'border:1px solid #d2d2d7;background:#fff;color:#1d1d1f;');
      return b;
    };

    const done = (v: boolean) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter') done(true);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });

    if (opts.cancelLabel) {
      const cancel = btn(opts.cancelLabel, false);
      cancel.onclick = () => done(false);
      row.appendChild(cancel);
    }
    const ok = btn(opts.okLabel, true, opts.danger);
    ok.onclick = () => done(true);
    row.appendChild(ok);

    box.appendChild(row);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    ok.focus();
  });
}

/** Equivalente di alert(): mostra un messaggio con solo "OK". */
export function uiAlert(message: string, title = 'Attenzione'): Promise<void> {
  return mount({ title, message, okLabel: 'OK' }).then(() => undefined);
}

/** Equivalente di confirm(): true su Conferma/Enter, false su Annulla/Esc/overlay. */
export function uiConfirm(
  message: string,
  opts: { title?: string; okLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
  return mount({
    title: opts.title ?? 'Conferma',
    message,
    okLabel: opts.okLabel ?? 'Conferma',
    cancelLabel: 'Annulla',
    danger: opts.danger,
  });
}
