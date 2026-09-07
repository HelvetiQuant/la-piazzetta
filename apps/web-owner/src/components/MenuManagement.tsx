import { useEffect, useMemo, useState } from 'react';
import { menu, fmtEuro, CATEGORY_LABELS, stationForCategory, type Product, type Station } from '../api';

const STATION_LABEL: Record<Station, string> = { BAR: 'Bar', TAVOLA_CALDA: 'Cucina' };

const ALL_CATEGORIES = [
  'colazione','tavola_calda','bibite','birra','bollicine','cocktail','cocktail_analcolico',
  'gin','whisky','rum','primi_piatti','secondi_piatti','contorni','dolci','varie','generic',
];

export default function MenuManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null);

  async function load() {
    try {
      setProducts(await menu.list());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => filter === 'all' || p.category === filter)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));
  }, [products, filter, search]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products],
  );

  const stats = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const p of products) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
    return byCat;
  }, [products]);

  async function handleSave(product: Product | null, data: { code: string; name: string; category: string; priceCents: number; unit: string }) {
    try {
      if (product) {
        await menu.update(product.id, data);
      } else {
        await menu.create(data);
      }
      setEditing(null);
      setCreating(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(p: Product) {
    try {
      await menu.remove(p.id);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Menu</h1>
          <p style={{ color: '#86868b', margin: '4px 0 0', fontSize: 14 }}>
            {products.length} prodotti · {categories.length} categorie
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={addBtn}>+ Nuovo prodotto</button>
      </div>

      {error && <div style={errBox}>{error}</div>}

      {/* Stats categorie */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('all')} style={{ ...chipBtn, ...(filter === 'all' ? chipActive : {}) }}>
          Tutti ({products.length})
        </button>
        {categories.map((c) => (
          <button key={c} onClick={() => setFilter(c)} style={{ ...chipBtn, ...(filter === c ? chipActive : {}) }}>
            {CATEGORY_LABELS[c] ?? c} ({stats[c]})
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        placeholder="Cerca per nome o codice…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={searchStyle}
      />

      {/* Tabella prodotti */}
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Codice</th>
              <th style={thStyle}>Nome</th>
              <th style={thStyle}>Categoria</th>
              <th style={thStyle}>Postazione</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Prezzo</th>
              <th style={thStyle}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const station = stationForCategory(p.category);
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  <td style={tdStyle}><code style={{ fontSize: 12, color: '#86868b' }}>{p.code}</code></td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                  <td style={tdStyle}>{CATEGORY_LABELS[p.category] ?? p.category}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: station === 'BAR' ? '#e3f2fd' : '#fff3e0',
                      color: station === 'BAR' ? '#1565c0' : '#e65100',
                    }}>
                      {STATION_LABEL[station]}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{fmtEuro(p.priceCents)}</td>
                  <td style={tdStyle}>
                    <button onClick={() => setEditing(p)} style={editBtn}>Modifica</button>
                    <button onClick={() => setConfirmDelete(p)} style={delBtn}>Elimina</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#86868b' }}>
            Nessun prodotto trovato.
          </div>
        )}
      </div>

      {/* Modal modifica/crea */}
      {(editing || creating) && (
        <ProductModal
          product={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={handleSave}
        />
      )}

      {/* Conferma eliminazione */}
      {confirmDelete && (
        <ConfirmModal
          product={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDelete(confirmDelete)}
        />
      )}
    </div>
  );
}

function ProductModal({
  product, onClose, onSave,
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product | null, data: { code: string; name: string; category: string; priceCents: number; unit: string }) => void;
}) {
  const [code, setCode] = useState(product?.code ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? 'bibite');
  const [priceEur, setPriceEur] = useState(product ? (product.priceCents / 100).toFixed(2) : '');
  const [unit, setUnit] = useState(product?.unit ?? 'pz');
  const [err, setErr] = useState('');

  function submit() {
    if (!code.trim()) { setErr('Codice obbligatorio'); return; }
    if (!name.trim()) { setErr('Nome obbligatorio'); return; }
    const priceCents = Math.round(parseFloat(priceEur.replace(',', '.')) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) { setErr('Prezzo non valido'); return; }
    onSave(product, { code: code.trim(), name: name.trim(), category, priceCents, unit });
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>{product ? 'Modifica prodotto' : 'Nuovo prodotto'}</h2>
        {err && <div style={errBox}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={fieldLabel}>
            Codice
            <input value={code} onChange={(e) => setCode(e.target.value)} style={inputStyle} placeholder="es. BIB-001" disabled={!!product} />
          </label>
          <label style={fieldLabel}>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="es. Caffè" />
          </label>
          <label style={fieldLabel}>
            Categoria
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Prezzo (€)
              <input value={priceEur} onChange={(e) => setPriceEur(e.target.value)} style={inputStyle} placeholder="0.00" type="number" step="0.01" />
            </label>
            <label style={{ ...fieldLabel, flex: 1 }}>
              Unità
              <input value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} placeholder="pz" />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <span style={{
              padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: stationForCategory(category) === 'BAR' ? '#e3f2fd' : '#fff3e0',
              color: stationForCategory(category) === 'BAR' ? '#1565c0' : '#e65100',
            }}>
              → {STATION_LABEL[stationForCategory(category)]}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={cancelBtn}>Annulla</button>
          <button onClick={submit} style={saveBtn}>Salva</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ product, onCancel, onConfirm }: { product: Product; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={modalOverlay} onClick={onCancel}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Elimina prodotto</h2>
        <p style={{ color: '#1d1d1f' }}>
          Vuoi eliminare <strong>{product.name}</strong> ({product.code})?
        </p>
        <p style={{ color: '#86868b', fontSize: 13 }}>
          Se il prodotto è presente in storico ordini verrà disattivato invece di eliminato, per preservare la contabilità.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onCancel} style={cancelBtn}>Annulla</button>
          <button onClick={onConfirm} style={dangerBtn}>Elimina</button>
        </div>
      </div>
    </div>
  );
}

// === Styles ===
const addBtn: React.CSSProperties = {
  background: '#0071e3', color: '#fff', border: 0, borderRadius: 12,
  padding: '10px 20px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
};
const chipBtn: React.CSSProperties = {
  border: '1px solid #d2d2d7', background: '#fff', borderRadius: 16,
  padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1d1d1f',
};
const chipActive: React.CSSProperties = {
  background: '#0071e3', color: '#fff', borderColor: '#0071e3',
};
const searchStyle: React.CSSProperties = {
  width: '100%', padding: '10px 16px', borderRadius: 12, border: '1px solid #d2d2d7',
  fontSize: 15, marginBottom: 16, boxSizing: 'border-box',
};
const tableWrap: React.CSSProperties = {
  background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e8e8e8',
};
const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 14,
};
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 700,
  color: '#86868b', textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid #e8e8e8', background: '#fafafa',
};
const tdStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 14,
};
const editBtn: React.CSSProperties = {
  border: '1px solid #d2d2d7', background: '#fff', borderRadius: 8,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600, marginRight: 4,
};
const delBtn: React.CSSProperties = {
  border: '1px solid #ffcdd2', background: '#fff', color: '#c62828', borderRadius: 8,
  padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
};
const errBox: React.CSSProperties = {
  color: '#c62828', background: '#ffebee', borderRadius: 12, padding: '10px 16px',
  marginBottom: 16, fontSize: 14,
};
const modalOverlay: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 100, backdropFilter: 'blur(4px)',
};
const modalBox: React.CSSProperties = {
  background: '#fff', borderRadius: 20, padding: 28, width: 460, maxWidth: '90vw',
  maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
};
const fieldLabel: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, fontWeight: 600, color: '#1d1d1f',
};
const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid #d2d2d7',
  fontSize: 15, fontWeight: 400, marginTop: 2,
};
const cancelBtn: React.CSSProperties = {
  border: '1px solid #d2d2d7', background: '#fff', borderRadius: 12,
  padding: '10px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
};
const saveBtn: React.CSSProperties = {
  border: 0, background: '#0071e3', color: '#fff', borderRadius: 12,
  padding: '10px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
};
const dangerBtn: React.CSSProperties = {
  border: 0, background: '#c62828', color: '#fff', borderRadius: 12,
  padding: '10px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 600,
};
