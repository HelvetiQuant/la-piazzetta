/**
 * Marketing service: integrazioni Canva, Gamma, social publishing,
 * comment management e analytics.
 *
 * Tutte le integrazioni esterne hanno graceful degradation:
 * - Canva API: se CANVA_API_KEY non settata → skip design generation
 * - Gamma API: se GAMMA_API_KEY non settata → skip
 * - Instagram/Facebook Graph API: se SOCIAL_GRAPH_TOKEN non settato → skip publishing
 * - WhatsApp Business: se WHATSAPP_TOKEN non settato → skip
 * - AI auto-reply: usa AiService esistente, fallback a template statici
 */

import type { PrismaClient } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAiService } from '../ai/ai.service.js';

/** Variante di copy marketing generata dall'AI; `hashtags` è opzionale
 *  perché non tutti i provider lo restituiscono nel payload. */
interface MarketingVariant {
  channel: string;
  text: string;
  hashtags?: string[];
}

export interface MarketingConfig {
  canvaApiKey?: string;
  gammaApiKey?: string;
  // Facebook/Instagram Graph API
  graphApiToken?: string;
  graphApiVersion?: string;
  // WhatsApp Business
  whatsappToken?: string;
  whatsappPhoneId?: string;
  // OAuth Meta (Facebook Login → pagina FB + account IG business)
  metaAppId?: string;
  metaAppSecret?: string;
  // Segreto per firmare lo `state` OAuth (anti-CSRF). Default: JWT_SECRET.
  oauthStateSecret?: string;
  // URL dell'app owner dove riportare il browser dopo il callback OAuth.
  ownerAppUrl?: string;
  // Base URL per media (es. https://piazzetta.example.com)
  publicBaseUrl?: string;
}

export function getMarketingConfig(): MarketingConfig {
  return {
    canvaApiKey: process.env.CANVA_API_KEY,
    gammaApiKey: process.env.GAMMA_API_KEY,
    graphApiToken: process.env.SOCIAL_GRAPH_TOKEN,
    graphApiVersion: process.env.GRAPH_API_VERSION ?? 'v21.0',
    whatsappToken: process.env.WHATSAPP_TOKEN,
    whatsappPhoneId: process.env.WHATSAPP_PHONE_ID,
    metaAppId: process.env.META_APP_ID,
    metaAppSecret: process.env.META_APP_SECRET,
    // `||` (non `??`): un valore vuoto in .env deve comunque fare fallback.
    oauthStateSecret: process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET,
    ownerAppUrl: process.env.WEB_OWNER_URL || undefined,
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
  };
}

// ---- Canva API: crea design da template ----
export async function createCanvaDesign(opts: {
  apiKey: string;
  templateId?: string;
  title: string;
  brandColor?: string;
  imageUrl?: string;
}): Promise<{ designId: string; exportUrl: string } | null> {
  try {
    // Canva Connect API: crea un design da template
    const resp = await fetch('https://api.canva.com/v1/designs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        design_type: { type: 'instagramPost', width: 1080, height: 1080 },
        title: opts.title,
        ...(opts.templateId ? { template_id: opts.templateId } : {}),
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    // Export come immagine
    const exportResp = await fetch(`https://api.canva.com/v1/designs/${data.id}/exports`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'png' }),
    });
    if (!exportResp.ok) return { designId: data.id, exportUrl: data.preview_url ?? '' };
    const exportData = await exportResp.json() as any;
    return { designId: data.id, exportUrl: exportData.url ?? data.preview_url ?? '' };
  } catch {
    return null;
  }
}

// ---- Gamma API: genera presentazione/landing ----
export async function createGammaDoc(opts: {
  apiKey: string;
  prompt: string;
  title: string;
}): Promise<{ docId: string; url: string } | null> {
  try {
    const resp = await fetch('https://api.gamma.app/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: opts.prompt,
        title: opts.title,
        format: 'social_post',
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return { docId: data.id, url: data.url ?? `https://gamma.app/docs/${data.id}` };
  } catch {
    return null;
  }
}

// ---- Instagram Graph API: pubblica post ----
export async function publishToInstagram(opts: {
  graphToken: string;
  graphVersion: string;
  igUserId: string;
  imageUrl: string;
  caption: string;
}): Promise<{ igPostId: string; permalink?: string } | null> {
  try {
    // Step 1: crea media container
    const containerResp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.igUserId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: opts.imageUrl,
          caption: opts.caption,
          access_token: opts.graphToken,
        }),
      },
    );
    if (!containerResp.ok) return null;
    const container = await containerResp.json() as any;
    const creationId = container.id;

    // Step 2: pubblica
    const publishResp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.igUserId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: opts.graphToken,
        }),
      },
    );
    if (!publishResp.ok) return null;
    const published = await publishResp.json() as any;

    // Fetch permalink
    let permalink: string | undefined;
    try {
      const detailResp = await fetch(
        `https://graph.facebook.com/${opts.graphVersion}/${published.id}?fields=permalink&access_token=${opts.graphToken}`,
      );
      if (detailResp.ok) {
        const detail = await detailResp.json() as any;
        permalink = detail.permalink;
      }
    } catch {}

    return { igPostId: published.id, permalink };
  } catch {
    return null;
  }
}

// ---- Facebook Graph API: pubblica post ----
export async function publishToFacebook(opts: {
  graphToken: string;
  graphVersion: string;
  fbPageId: string;
  message: string;
  imageUrl?: string;
}): Promise<{ fbPostId: string; permalink?: string } | null> {
  try {
    const body: Record<string, string> = {
      message: opts.message,
      access_token: opts.graphToken,
    };
    if (opts.imageUrl) body.link = opts.imageUrl;

    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.fbPageId}/feed`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return { fbPostId: data.id, permalink: `https://facebook.com/${data.id}` };
  } catch {
    return null;
  }
}

// ---- WhatsApp Business API: invia messaggio ----
export async function publishToWhatsApp(opts: {
  token: string;
  phoneId: string;
  to: string; // numero con prefisso
  message: string;
  imageUrl?: string;
}): Promise<{ waMessageId: string } | null> {
  try {
    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: opts.to,
      type: 'text',
      text: { body: opts.message },
    };
    if (opts.imageUrl) {
      body.type = 'image';
      body.image = { link: opts.imageUrl, caption: opts.message };
    }
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/${opts.phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return { waMessageId: data.messages?.[0]?.id ?? '' };
  } catch {
    return null;
  }
}

// ---- Fetch commenti da Instagram/Facebook ----
export async function fetchSocialComments(opts: {
  graphToken: string;
  graphVersion: string;
  postPlatformId: string;
  platform: 'instagram' | 'facebook';
}): Promise<Array<{ id: string; author: string; text: string; likes: number }> | null> {
  try {
    const fields = 'id,text,username,like_count';
    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.postPlatformId}/comments?fields=${fields}&access_token=${opts.graphToken}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return (data.data ?? []).map((c: any) => ({
      id: c.id,
      author: c.username ?? 'Unknown',
      text: c.text ?? '',
      likes: c.like_count ?? 0,
    }));
  } catch {
    return null;
  }
}

// ---- Rispondi a commento Instagram/Facebook ----
export async function replyToComment(opts: {
  graphToken: string;
  graphVersion: string;
  commentId: string;
  replyText: string;
}): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.commentId}/replies`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: opts.replyText,
          access_token: opts.graphToken,
        }),
      },
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ---- Fetch analytics Instagram ----
export async function fetchInstagramInsights(opts: {
  graphToken: string;
  graphVersion: string;
  igPostId: string;
}): Promise<{
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
} | null> {
  try {
    const fields = 'impressions,reach,likes,comments,saved';
    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/${opts.igPostId}/insights?metric=${fields}&access_token=${opts.graphToken}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const extract = (name: string): number => {
      const item = data.data?.find((d: any) => d.name === name);
      return item?.values?.[0]?.value ?? 0;
    };
    return {
      impressions: extract('impressions'),
      reach: extract('reach'),
      likes: extract('likes'),
      comments: extract('comments'),
      saves: extract('saved'),
    };
  } catch {
    return null;
  }
}

// ---- AI auto-reply generation ----
export async function generateAiReply(opts: {
  comment: string;
  venueName: string;
  postCaption?: string;
}): Promise<string> {
  const ai = getAiService();
  if (!ai.isEnabled()) {
    // Fallback templates
    const templates = [
      `Grazie mille! 🙏 Ti aspettiamo presto!`,
      `Grazie per il tuo commento! Seguici per restare aggiornato! ✨`,
      `Ciao! Grazie, speriamo di vederti presto! 😊`,
      `Grazie! Prenota un tavolo ti aspettiamo! 🍕`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
  try {
    const prompt = `Sei il social media manager di "${opts.venueName}", un locale bar/tavola calda.
Rispondi in modo amichevole, breve (max 2 righe) e professionale al seguente commento di un cliente.
${opts.postCaption ? `Contesto del post: "${opts.postCaption}"` : ''}
Commento del cliente: "${opts.comment}"
Risposta (solo il testo, senza virgolette):`;

    const r = await ai.marketingCopy({
      topic: prompt,
      tone: 'amichevole',
      channels: ['instagram'],
    });
    const variant = r.data?.variants?.[0];
    if (variant) return `${variant.text} ${variant.text}`.trim().slice(0, 300);
  } catch {}
  return 'Grazie mille! Ti aspettiamo! 😊';
}

// ---- AI post generation (caption + hashtags da foto/promo) ----
export async function generateAiPost(opts: {
  topic: string;
  tone: string;
  channels: string[];
  venueName: string;
  imageUrl?: string;
}): Promise<{ caption: string; hashtags: string[] } | null> {
  const ai = getAiService();
  if (!ai.isEnabled()) {
    // Fallback
    return {
      caption: `✨ ${opts.topic} — solo da ${opts.venueName}! Vieni a trovarci! 🍕`,
      hashtags: ['#lapiazzetta', '#bar', '#tavolacalda', '#happyhour', '#' + opts.topic.toLowerCase().replace(/\s+/g, '').slice(0, 20)],
    };
  }
  try {
    const r = await ai.marketingCopy({
      topic: opts.topic,
      tone: opts.tone,
      channels: opts.channels,
    });
    const variant = r.data?.variants?.[0] as MarketingVariant | undefined;
    if (!variant) return null;
    return {
      caption: `${variant.text}\n\n${variant.text}`,
      hashtags: variant.hashtags ?? ['#lapiazzetta', '#bar', '#tavolacalda'],
    };
  } catch {
    return null;
  }
}

// ============ OAuth Meta (Facebook Login → pagina FB + account IG business) ============
// Flow: /authorize emette un URL facebook.com/dialog/oauth con `state` firmato
// HMAC (anti-CSRF, stateless — niente tabella). Il callback pubblico verifica
// lo state, scambia code→short token→long-lived token (~60gg), scopre le
// pagine FB dell'utente e gli account IG business collegati, e salva i token
// pagina in SocialAccount.

/** Scope richiesti: lettura pagine, pubblicazione FB, pubblicazione IG. */
export const META_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minuti

export interface OAuthStatePayload {
  /** venueId del locale che ha avviato il flow. */
  v: string;
  /** userId dell'utente (owner/manager). */
  u: string;
  /** nonce anti-replay. */
  n: string;
  /** scadenza (epoch ms). */
  exp: number;
}

export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOAuthState(state: string, secret: string): OAuthStatePayload | null {
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (!p.v || !p.u || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

export function newOAuthState(venueId: string, userId: string): OAuthStatePayload {
  return { v: venueId, u: userId, n: randomBytes(12).toString('hex'), exp: Date.now() + OAUTH_STATE_TTL_MS };
}

// ---- URL di autorizzazione Facebook Login ----
export function buildMetaAuthorizeUrl(opts: {
  appId: string;
  redirectUri: string;
  state: string;
  graphVersion: string;
}): string {
  const q = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: META_OAUTH_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${opts.graphVersion}/dialog/oauth?${q.toString()}`;
}

// ---- Scambio code → user access token (short-lived) ----
export async function exchangeMetaCode(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
  graphVersion: string;
}): Promise<{ accessToken: string; expiresInSec: number } | null> {
  try {
    const q = new URLSearchParams({
      client_id: opts.appId,
      client_secret: opts.appSecret,
      redirect_uri: opts.redirectUri,
      code: opts.code,
    });
    const resp = await fetch(`https://graph.facebook.com/${opts.graphVersion}/oauth/access_token?${q.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (!data.access_token) return null;
    return { accessToken: data.access_token, expiresInSec: Number(data.expires_in) || 3600 };
  } catch {
    return null;
  }
}

// ---- Upgrade short token → long-lived token (~60 giorni) ----
// La stessa chiamata serve anche come refresh: passando un token long-lived
// ancora valido Meta ne restituisce uno nuovo con scadenza estesa.
export async function exchangeMetaLongLived(opts: {
  appId: string;
  appSecret: string;
  token: string;
  graphVersion: string;
}): Promise<{ accessToken: string; expiresInSec: number } | null> {
  try {
    const q = new URLSearchParams({
      client_id: opts.appId,
      client_secret: opts.appSecret,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: opts.token,
    });
    const resp = await fetch(`https://graph.facebook.com/${opts.graphVersion}/oauth/access_token?${q.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (!data.access_token) return null;
    return { accessToken: data.access_token, expiresInSec: Number(data.expires_in) || 0 };
  } catch {
    return null;
  }
}

// ---- Pagine FB dell'utente + account IG business collegati ----
export interface MetaPageWithIg {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igUserId?: string;
  igUsername?: string;
  igName?: string;
  igAvatarUrl?: string;
}

export async function fetchMetaPagesWithInstagram(opts: {
  userToken: string;
  graphVersion: string;
}): Promise<MetaPageWithIg[] | null> {
  try {
    const fields = 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}';
    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/me/accounts?fields=${fields}&access_token=${opts.userToken}`,
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    return ((data.data ?? []) as any[]).map(p => ({
      pageId: p.id,
      pageName: p.name ?? '',
      pageAccessToken: p.access_token ?? '',
      igUserId: p.instagram_business_account?.id,
      igUsername: p.instagram_business_account?.username,
      igName: p.instagram_business_account?.name,
      igAvatarUrl: p.instagram_business_account?.profile_picture_url,
    })).filter(p => p.pageId && p.pageAccessToken);
  } catch {
    return null;
  }
}

// ---- Scope effettivamente concessi dall'utente (diagnostica) ----
export async function fetchMetaGrantedScopes(opts: {
  userToken: string;
  graphVersion: string;
}): Promise<string[]> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/${opts.graphVersion}/me/permissions?access_token=${opts.userToken}`,
    );
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return ((data.data ?? []) as Array<{ permission: string; status: string }>)
      .filter(p => p.status === 'granted')
      .map(p => p.permission);
  } catch {
    return [];
  }
}

export type { PrismaClient };
