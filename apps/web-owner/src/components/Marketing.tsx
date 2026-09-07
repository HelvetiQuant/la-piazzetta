import { useState, useEffect, useCallback, useRef } from 'react';
import { mkt, ai, fmtEuro, type MediaAsset, type SocialPost, type SocialAccount, type SocialComment, type Campaign, type MarketingAnalytics } from '../api';

const C = {
  bg: '#f5f5f7', card: '#fff', text: '#1d1d1f', sec: '#86868b',
  acc: '#0071e3', ok: '#34c759', err: '#ff3b30', warn: '#ff9500', bd: '#d2d2d7',
};
const card: React.CSSProperties = { background: C.card, borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: 24 };
const btn: React.CSSProperties = { borderRadius: 980, padding: '8px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer', border: 'none' };
const btnPri: React.CSSProperties = { ...btn, background: C.acc, color: '#fff' };
const btnSec: React.CSSProperties = { ...btn, background: '#fff', color: C.acc, border: `1px solid ${C.acc}` };
const input: React.CSSProperties = { borderRadius: 12, border: `1px solid ${C.bd}`, padding: '10px 14px', fontSize: 15, outline: 'none', boxSizing: 'border-box', width: '100%' };

const PLATFORMS = ['instagram', 'facebook', 'whatsapp', 'tiktok'];
const PLATFORM_ICONS: Record<string, string> = { instagram: '📸', facebook: '📘', whatsapp: '💬', tiktok: '🎵' };
const STATUS_BG: Record<string, string> = { DRAFT: '#f0f0f0', SCHEDULED: '#e8f0ff', PUBLISHING: '#fff4e6', PUBLISHED: '#e8f8ed', FAILED: '#fff0f0' };
const STATUS_FG: Record<string, string> = { DRAFT: C.sec, SCHEDULED: C.acc, PUBLISHING: C.warn, PUBLISHED: C.ok, FAILED: C.err };

type SubTab = 'create' | 'posts' | 'comments' | 'analytics' | 'accounts' | 'campaigns';

export default function Marketing() {
  const [tab, setTab] = useState<SubTab>('create');
  const [aiStatus, setAiStatus] = useState<{ enabled: boolean; budgetSpentCents: number } | null>(null);

  useEffect(() => { ai.status().then(setAiStatus).catch(() => {}); }, []);

  const SUBTABS: { id: SubTab; label: string; icon: string }[] = [
    { id: 'create', label: 'Crea Post', icon: '✨' },
    { id: 'posts', label: 'Post & Scheduler', icon: '📅' },
    { id: 'comments', label: 'Commenti', icon: '💬' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'accounts', label: 'Account Social', icon: '🔗' },
    { id: 'campaigns', label: 'Campagne', icon: '🎯' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* AI status banner */}
      {aiStatus && !aiStatus.enabled && (
        <div style={{ background: '#fff4e6', borderRadius: 12, padding: '10px 16px', fontSize: 13, color: C.warn, display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚠️ AI non configurata — imposta OPENAI_API_KEY o ANTHROPIC_API_KEY nel backend per generare contenuti con AI
        </div>
      )}

      {/* Sub-tab navigation */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {SUBTABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            ...btn, background: tab === t.id ? C.acc : '#e8e8ed', color: tab === t.id ? '#fff' : C.text,
            padding: '6px 14px', fontSize: 13,
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {tab === 'create' && <CreatePost aiEnabled={aiStatus?.enabled ?? false} />}
      {tab === 'posts' && <PostsManager />}
      {tab === 'comments' && <CommentsManager />}
      {tab === 'analytics' && <AnalyticsView />}
      {tab === 'accounts' && <AccountsManager />}
      {tab === 'campaigns' && <CampaignsManager />}
    </div>
  );
}

// ============ CREATE POST ============
function CreatePost({ aiEnabled }: { aiEnabled: boolean }) {
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string>('');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('amichevole');
  const [channels, setChannels] = useState<string[]>(['instagram']);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [canvaLoading, setCanvaLoading] = useState(false);
  const [gammaLoading, setGammaLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMedia = useCallback(async () => {
    try { setMedia(await mkt.media()); } catch {}
  }, []);
  useEffect(() => { loadMedia(); }, [loadMedia]);

  const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const asset = await mkt.uploadMedia(base64, file.type, file.name);
        setMedia(prev => [asset, ...prev]);
        setSelectedMedia(asset.id);
        setUploadLoading(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) { alert(err.message); setUploadLoading(false); }
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setGenLoading(true);
    try {
      const r = await mkt.generatePost({ topic: topic.trim(), tone, channels, mediaAssetId: selectedMedia || undefined });
      setCaption(r.caption);
      setHashtags(r.hashtags);
    } catch (e: any) { alert(e.message); } finally { setGenLoading(false); }
  };

  const createCanva = async () => {
    if (!topic.trim()) return;
    setCanvaLoading(true);
    try {
      const r = await mkt.canvaCreate({ title: topic, mediaAssetId: selectedMedia || undefined });
      setMedia(prev => [r.asset, ...prev]);
      setSelectedMedia(r.asset.id);
    } catch (e: any) { alert(e.message); } finally { setCanvaLoading(false); }
  };

  const createGamma = async () => {
    if (!topic.trim()) return;
    setGammaLoading(true);
    try {
      const r = await mkt.gammaCreate({ prompt: topic, title: topic });
      setMedia(prev => [r.asset, ...prev]);
      setSelectedMedia(r.asset.id);
    } catch (e: any) { alert(e.message); } finally { setGammaLoading(false); }
  };

  const savePost = async (status: 'DRAFT' | 'SCHEDULED') => {
    if (!caption.trim() || channels.length === 0) return;
    try {
      await mkt.createPost({
        mediaAssetId: selectedMedia || undefined,
        caption, hashtags, platforms: channels,
        status, aiGenerated: true, aiPrompt: topic,
      });
      setSaveStatus(status === 'DRAFT' ? 'Bozza salvata!' : 'Post programmato!');
      setTimeout(() => setSaveStatus(''), 3000);
      setCaption(''); setHashtags([]); setTopic('');
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Media upload + gallery */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>📷 Media</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onFileSelect} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploadLoading} style={{ ...btnSec, padding: '12px 20px' }}>
            {uploadLoading ? 'Upload…' : '⬆ Carica foto'}
          </button>
          <button onClick={createCanva} disabled={canvaLoading || !topic} style={{ ...btnSec, padding: '12px 20px' }}>
            {canvaLoading ? 'Canva…' : '🎨 Canva Design'}
          </button>
          <button onClick={createGamma} disabled={gammaLoading || !topic} style={{ ...btnSec, padding: '12px 20px' }}>
            {gammaLoading ? 'Gamma…' : '📄 Gamma Doc'}
          </button>
        </div>
        {media.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {media.map(m => (
              <div key={m.id} onClick={() => setSelectedMedia(selectedMedia === m.id ? '' : m.id)} style={{
                width: 80, height: 80, borderRadius: 12, cursor: 'pointer',
                border: selectedMedia === m.id ? `3px solid ${C.acc}` : `1px solid ${C.bd}`,
                overflow: 'hidden', position: 'relative', background: '#f5f5f7',
              }}>
                {m.url.match(/\.(jpg|jpeg|png|webp)$/i) || m.source === 'CANVA' ? (
                  <img src={m.url} alt={m.altText ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 24 }}>
                    {m.source === 'GAMMA' ? '📄' : '📁'}
                  </div>
                )}
                {m.source !== 'UPLOAD' && (
                  <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 4, padding: '1px 4px' }}>
                    {m.source}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI generation form */}
      <div style={card}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>✨ Genera post con AI</div>
        <div style={{ fontSize: 13, color: C.sec, marginBottom: 16 }}>Descrivi la promozione e l'AI crea caption, hashtag e suggerimenti</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="es. Aperitivo happy hour 2x1 ogni venerdì" style={input} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
            <select value={tone} onChange={e => setTone(e.target.value)} style={input}>
              <option value="amichevole">Amichevole</option>
              <option value="formale">Formale</option>
              <option value="divertente">Divertente</option>
              <option value="elegante">Elegante</option>
            </select>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PLATFORMS.map(p => (
                <button key={p} onClick={() => setChannels(channels.includes(p) ? channels.filter(c => c !== p) : [...channels, p])} style={{
                  ...btn, padding: '8px 14px', fontSize: 13,
                  background: channels.includes(p) ? C.acc : '#fff', color: channels.includes(p) ? '#fff' : C.text,
                  border: `1px solid ${channels.includes(p) ? C.acc : C.bd}`,
                }}>{PLATFORM_ICONS[p]} {p}</button>
              ))}
            </div>
          </div>
          <button onClick={generate} disabled={genLoading || !topic.trim()} style={{
            ...btnPri, background: genLoading || !topic.trim() ? '#b0b0b5' : C.acc,
          }}>{genLoading ? 'AI sta generando…' : '✨ Genera caption + hashtag'}</button>
        </div>
      </div>

      {/* Preview & save */}
      {caption && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Anteprima post</div>
          {selectedMedia && (
            <div style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', maxHeight: 300 }}>
              {media.find(m => m.id === selectedMedia)?.url.match(/\.(jpg|jpeg|png|webp)$/i) ? (
                <img src={media.find(m => m.id === selectedMedia)?.url} alt="" style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} />
              ) : null}
            </div>
          )}
          <textarea value={caption} onChange={e => setCaption(e.target.value)} style={{ ...input, minHeight: 100, fontFamily: 'inherit', resize: 'vertical' }} />
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {hashtags.map((h, i) => (
              <span key={i} onClick={() => setHashtags(hashtags.filter((_, idx) => idx !== i))} style={{
                borderRadius: 980, padding: '3px 10px', fontSize: 12, background: '#e8f0ff', color: C.acc, cursor: 'pointer',
              }}>{h} ×</span>
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => savePost('DRAFT')} style={btnSec}>Salva bozza</button>
            <button onClick={() => savePost('SCHEDULED')} style={btnPri}>Programma post</button>
            {saveStatus && <span style={{ fontSize: 13, color: C.ok }}>{saveStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ POSTS MANAGER ============
function PostsManager() {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPosts(await mkt.posts(filter || undefined)); } catch {} finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const publish = async (id: string) => {
    if (!confirm('Pubblicare ora su tutti i canali selezionati?')) return;
    try {
      const r = await mkt.publishPost(id);
      alert(r.status === 'PUBLISHED' ? 'Pubblicato!' : 'Errore su alcune piattaforme: ' + JSON.stringify(r.perPlatform));
      await load();
    } catch (e: any) { alert(e.message); }
  };
  const del = async (id: string) => {
    if (!confirm('Eliminare questo post?')) return;
    try { await mkt.deletePost(id); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.sec }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['', 'DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ ...btn, padding: '6px 14px', fontSize: 13, background: filter === s ? C.acc : '#e8e8ed', color: filter === s ? '#fff' : C.text }}>
            {s || 'Tutti'}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.sec }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
          Nessun post. Crea il primo dalla scheda "Crea Post"
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {posts.map(p => (
            <div key={p.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ borderRadius: 980, padding: '3px 10px', fontSize: 12, fontWeight: 500, background: STATUS_BG[p.status] ?? '#f0f0f0', color: STATUS_FG[p.status] ?? C.sec }}>{p.status}</span>
                    {p.aiGenerated && <span style={{ fontSize: 12, color: C.acc }}>✨ AI</span>}
                    {p.mediaAsset && <span style={{ fontSize: 12, color: C.sec }}>📷</span>}
                    <span style={{ fontSize: 12, color: C.sec }}>{new Date(p.createdAt).toLocaleDateString('it-IT')}</span>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 8, whiteSpace: 'pre-wrap' }}>{p.caption}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {p.hashtags.map((h, i) => <span key={i} style={{ borderRadius: 6, padding: '2px 8px', fontSize: 11, background: '#e8f0ff', color: C.acc }}>{h}</span>)}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {p.platforms.map(pl => <span key={pl} style={{ fontSize: 12 }}>{PLATFORM_ICONS[pl] ?? '📄'} {pl}</span>)}
                  </div>
                  {p.scheduledAt && <div style={{ fontSize: 12, color: C.warn, marginTop: 4 }}>⏰ Programmato: {new Date(p.scheduledAt).toLocaleString('it-IT')}</div>}
                  {p.publishedAt && <div style={{ fontSize: 12, color: C.ok, marginTop: 4 }}>✓ Pubblicato: {new Date(p.publishedAt).toLocaleString('it-IT')}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  {(p.status === 'DRAFT' || p.status === 'SCHEDULED') && <button onClick={() => publish(p.id)} style={{ ...btn, padding: '6px 12px', fontSize: 12, background: C.ok, color: '#fff' }}>Pubblica ora</button>}
                  <button onClick={() => del(p.id)} style={{ ...btn, padding: '6px 12px', fontSize: 12, background: 'transparent', color: C.err, border: `1px solid ${C.err}40` }}>Elimina</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ COMMENTS MANAGER ============
function CommentsManager() {
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [aiReplyLoading, setAiReplyLoading] = useState<string | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setComments(await mkt.comments(true)); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reply = async (id: string) => {
    const text = replyText[id];
    if (!text?.trim()) return;
    try { await mkt.replyComment(id, text.trim()); setReplyText({ ...replyText, [id]: '' }); await load(); }
    catch (e: any) { alert(e.message); }
  };

  const autoReply = async (id: string) => {
    setAiReplyLoading(id);
    try { await mkt.autoReply(id); await load(); } catch (e: any) { alert(e.message); } finally { setAiReplyLoading(null); }
  };

  const sync = async () => {
    setSyncLoading(true);
    try { const r = await mkt.syncComments(); alert(`${r.synced} commenti sincronizzati`); await load(); }
    catch (e: any) { alert(e.message); } finally { setSyncLoading(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.sec }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Commenti da rispondere ({comments.length})</div>
        <button onClick={sync} disabled={syncLoading} style={btnSec}>{syncLoading ? 'Sincronizzazione…' : '🔄 Sync da social'}</button>
      </div>
      {comments.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.sec }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
          Nessun commento in attesa di risposta
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {comments.map(c => (
            <div key={c.id} style={card}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e8e8ed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                  {c.authorName?.[0] ?? '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.authorName ?? 'Anonimo'}</span>
                    <span style={{ fontSize: 12, color: C.sec }}>{PLATFORM_ICONS[c.platform] ?? '📄'} {c.platform}</span>
                    <span style={{ fontSize: 11, color: C.sec }}>{new Date(c.receivedAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    {c.likesCount > 0 && <span style={{ fontSize: 11, color: C.sec }}>❤ {c.likesCount}</span>}
                  </div>
                  <div style={{ fontSize: 14, marginTop: 4, color: C.text }}>{c.text}</div>
                  {c.socialPost && <div style={{ fontSize: 12, color: C.sec, marginTop: 4, fontStyle: 'italic' }}>Su post: "{c.socialPost.caption.slice(0, 60)}…"</div>}
                </div>
              </div>
              {c.replyText ? (
                <div style={{ marginTop: 8, padding: 12, background: '#e8f8ed', borderRadius: 12 }}>
                  <div style={{ fontSize: 12, color: C.ok, marginBottom: 4 }}>✓ Risposto {c.aiAutoReplied ? '(AI auto-reply)' : ''}</div>
                  <div style={{ fontSize: 14 }}>{c.replyText}</div>
                </div>
              ) : (
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <input type="text" value={replyText[c.id] ?? ''} onChange={e => setReplyText({ ...replyText, [c.id]: e.target.value })} placeholder="Scrivi una risposta…" style={{ ...input, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') reply(c.id); }} />
                  <button onClick={() => reply(c.id)} disabled={!replyText[c.id]?.trim()} style={{ ...btn, padding: '8px 16px', background: C.acc, color: '#fff', opacity: replyText[c.id]?.trim() ? 1 : 0.5 }}>Rispondi</button>
                  <button onClick={() => autoReply(c.id)} disabled={aiReplyLoading === c.id} style={{ ...btn, padding: '8px 16px', background: '#e8f0ff', color: C.acc, border: `1px solid ${C.acc}40` }}>
                    {aiReplyLoading === c.id ? 'AI…' : '✨ AI'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ANALYTICS ============
function AnalyticsView() {
  const [data, setData] = useState<MarketingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncLoading, setSyncLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await mkt.analytics()); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setSyncLoading(true);
    try { await mkt.syncAnalytics(); await load(); } catch (e: any) { alert(e.message); } finally { setSyncLoading(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.sec }}>Caricamento…</div>;
  if (!data) return null;

  const maxDayImpressions = Math.max(...data.byDay.map(d => d.impressions), 1);
  const kpis = [
    { label: 'Impression', value: data.totals.impressions.toLocaleString('it-IT') },
    { label: 'Reach', value: data.totals.reach.toLocaleString('it-IT') },
    { label: 'Like', value: data.totals.likes.toLocaleString('it-IT') },
    { label: 'Commenti', value: data.totals.comments.toLocaleString('it-IT') },
    { label: 'Condivisioni', value: data.totals.shares.toLocaleString('it-IT') },
    { label: 'Salvataggi', value: data.totals.saves.toLocaleString('it-IT') },
    { label: 'Visite profilo', value: data.totals.profileVisits.toLocaleString('it-IT') },
    { label: 'Click sito', value: data.totals.websiteClicks.toLocaleString('it-IT') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Analytics (ultimi 30 giorni)</div>
        <button onClick={sync} disabled={syncLoading} style={btnSec}>{syncLoading ? 'Sync…' : '🔄 Sync da social'}</button>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {kpis.map(k => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 12, color: C.sec, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* By platform */}
      {data.byPlatform.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Per piattaforma</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Piattaforma', 'Impression', 'Reach', 'Like', 'Commenti', 'Share'].map(h => <th key={h} style={{ textAlign: h === 'Piattaforma' ? 'left' : 'right', fontSize: 12, color: C.sec, padding: '6px 0', borderBottom: `1px solid ${C.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.byPlatform.map(p => (
                <tr key={p.platform}>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 14 }}>{PLATFORM_ICONS[p.platform] ?? '📄'} {p.platform}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.impressions.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.reach.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.likes.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.comments.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.shares.toLocaleString('it-IT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Impressions chart */}
      {data.byDay.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Impression per giorno</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
            {data.byDay.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div title={`${d.impressions} impression`} style={{ width: '100%', maxWidth: 20, height: Math.max((d.impressions / maxDayImpressions) * 100, 2), borderRadius: 4, background: C.acc, opacity: d.impressions > 0 ? 1 : 0.15 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top posts */}
      {data.topPosts.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Top post per impression</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Post', 'Impression', 'Reach', 'Like', 'Commenti'].map(h => <th key={h} style={{ textAlign: h === 'Post' ? 'left' : 'right', fontSize: 12, color: C.sec, padding: '6px 0', borderBottom: `1px solid ${C.bd}` }}>{h}</th>)}</tr></thead>
            <tbody>
              {data.topPosts.map(p => (
                <tr key={p.id}>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: 13 }}>{p.caption}…</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.totalImpressions.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.totalReach.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.totalLikes.toLocaleString('it-IT')}</td>
                  <td style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{p.totalComments.toLocaleString('it-IT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.totals.impressions === 0 && (
        <div style={{ ...card, textAlign: 'center', color: C.sec }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📈</div>
          Nessun dato analytics. Connetti un account social e pubblica post per vedere le metriche
        </div>
      )}
    </div>
  );
}

// ============ ACCOUNTS MANAGER ============
function AccountsManager() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);
  const [platform, setPlatform] = useState('instagram');
  const [accountId, setAccountId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setAccounts(await mkt.accounts()); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    if (!accountId || !accessToken) return;
    try {
      await mkt.connectAccount({ platform, accountId, accessToken, username });
      setShowConnect(false); setAccountId(''); setAccessToken(''); setUsername('');
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const disconnect = async (id: string) => {
    if (!confirm('Disconnettere questo account?')) return;
    try { await mkt.disconnectAccount(id); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.sec }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Account social connessi</div>
        <button onClick={() => setShowConnect(!showConnect)} style={btnPri}>+ Connetti account</button>
      </div>

      {showConnect && (
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Connetti account social</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: C.sec, display: 'block', marginBottom: 4 }}>Piattaforma</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)} style={input}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, display: 'block', marginBottom: 4 }}>Account ID</label>
              <input type="text" value={accountId} onChange={e => setAccountId(e.target.value)} placeholder="ID piattaforma" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, display: 'block', marginBottom: 4 }}>Username</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="@username" style={input} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: C.sec, display: 'block', marginBottom: 4 }}>Access Token</label>
              <input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder="OAuth token" style={input} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={connect} disabled={!accountId || !accessToken} style={{ ...btnPri, opacity: !accountId || !accessToken ? 0.5 : 1 }}>Connetti</button>
            <button onClick={() => setShowConnect(false)} style={btnSec}>Annulla</button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: C.sec, background: '#f5f5f7', borderRadius: 8, padding: 12 }}>
            💡 Per Instagram/Facebook: usa il Graph API token di Facebook Business.
            Per WhatsApp: usa il token WhatsApp Business Cloud API.
            Imposta anche SOCIAL_GRAPH_TOKEN nel backend.
          </div>
        </div>
      )}

      {accounts.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.sec }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔗</div>
          Nessun account connesso. Connetti Instagram, Facebook o WhatsApp per pubblicare automaticamente
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {accounts.map(a => (
            <div key={a.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 28 }}>{PLATFORM_ICONS[a.platform] ?? '📄'}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{a.displayName ?? a.username ?? a.accountId}</div>
                    <div style={{ fontSize: 12, color: C.sec }}>{a.platform}</div>
                  </div>
                </div>
                <button onClick={() => disconnect(a.id)} style={{ ...btn, padding: '4px 10px', fontSize: 12, background: 'transparent', color: C.err, border: `1px solid ${C.err}40` }}>Disconnetti</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: C.sec }}>
                Connesso: {new Date(a.connectedAt).toLocaleDateString('it-IT')}
                {a.lastSyncAt && ` · Ultimo sync: ${new Date(a.lastSyncAt).toLocaleDateString('it-IT')}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ CAMPAIGNS MANAGER ============
function CampaignsManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCampaigns(await mkt.campaigns()); } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await mkt.createCampaign({ name: name.trim(), description, budgetCents: Math.round(budget * 100), status: 'ACTIVE' });
      setShowCreate(false); setName(''); setDescription(''); setBudget(0);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const updateStatus = async (id: string, status: string) => {
    try { await mkt.updateCampaign(id, { status }); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.sec }}>Caricamento…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 600 }}>Campagne marketing</div>
        <button onClick={() => setShowCreate(!showCreate)} style={btnPri}>+ Nuova campagna</button>
      </div>

      {showCreate && (
        <div style={card}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome campagna" style={input} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrizione" style={{ ...input, minHeight: 60, fontFamily: 'inherit', resize: 'vertical' }} />
            <div>
              <label style={{ fontSize: 12, color: C.sec, display: 'block', marginBottom: 4 }}>Budget (€)</label>
              <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} min={0} style={input} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={create} disabled={!name.trim()} style={{ ...btnPri, opacity: !name.trim() ? 0.5 : 1 }}>Crea</button>
              <button onClick={() => setShowCreate(false)} style={btnSec}>Annulla</button>
            </div>
          </div>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.sec }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎯</div>
          Nessuna campagna. Crea la prima per organizzare i tuoi post marketing
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {campaigns.map(c => (
            <div key={c.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: 13, color: C.sec, marginTop: 4 }}>{c.description}</div>}
                  <div style={{ marginTop: 8, display: 'flex', gap: 12, fontSize: 12, color: C.sec }}>
                    <span>{c._count?.posts ?? 0} post</span>
                    {c.budgetCents > 0 && <span>Budget: {fmtEuro(c.budgetCents)}</span>}
                    <span>Creato: {new Date(c.createdAt).toLocaleDateString('it-IT')}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ borderRadius: 980, padding: '4px 12px', fontSize: 12, fontWeight: 500, background: c.status === 'ACTIVE' ? '#e8f8ed' : c.status === 'PAUSED' ? '#fff4e6' : '#f0f0f0', color: c.status === 'ACTIVE' ? C.ok : c.status === 'PAUSED' ? C.warn : C.sec }}>{c.status}</span>
                  {c.status === 'ACTIVE' && <button onClick={() => updateStatus(c.id, 'PAUSED')} style={{ ...btn, padding: '4px 10px', fontSize: 12, background: 'transparent', border: `1px solid ${C.bd}`, color: C.text }}>Pausa</button>}
                  {c.status === 'PAUSED' && <button onClick={() => updateStatus(c.id, 'ACTIVE')} style={{ ...btn, padding: '4px 10px', fontSize: 12, background: C.ok, color: '#fff' }}>Riprendi</button>}
                  {c.status !== 'COMPLETED' && <button onClick={() => updateStatus(c.id, 'COMPLETED')} style={{ ...btn, padding: '4px 10px', fontSize: 12, background: 'transparent', border: `1px solid ${C.bd}`, color: C.text }}>Completa</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
