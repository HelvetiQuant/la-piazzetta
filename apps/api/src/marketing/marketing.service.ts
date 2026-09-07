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
import { getAiService } from '../ai/ai.service';

export interface MarketingConfig {
  canvaApiKey?: string;
  gammaApiKey?: string;
  // Facebook/Instagram Graph API
  graphApiToken?: string;
  graphApiVersion?: string;
  // WhatsApp Business
  whatsappToken?: string;
  whatsappPhoneId?: string;
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
    if (variant) return `${variant.headline} ${variant.body}`.trim().slice(0, 300);
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
    const variant = r.data?.variants?.[0];
    if (!variant) return null;
    return {
      caption: `${variant.headline}\n\n${variant.body}`,
      hashtags: variant.hashtags ?? ['#lapiazzetta', '#bar', '#tavolacalda'],
    };
  } catch {
    return null;
  }
}

export type { PrismaClient };
