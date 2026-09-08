/**
 * Rotte Marketing avanzato.
 *
 * Media:
 *  POST   /api/v1/marketing/media/upload        → upload foto (multipart)
 *  GET    /api/v1/marketing/media                → lista media
 *  DELETE /api/v1/marketing/media/:id            → elimina media
 *
 * AI Generation:
 *  POST   /api/v1/marketing/generate-post        → AI caption + hashtags da topic/foto
 *  POST   /api/v1/marketing/canva/create         → crea design Canva
 *  POST   /api/v1/marketing/gamma/create         → crea doc Gamma
 *
 * Posts:
 *  GET    /api/v1/marketing/posts?status=        → lista post
 *  POST   /api/v1/marketing/posts                → crea post (bozza o programmato)
 *  PATCH  /api/v1/marketing/posts/:id            → modifica post
 *  DELETE /api/v1/marketing/posts/:id            → elimina post
 *  POST   /api/v1/marketing/posts/:id/publish    → pubblica subito
 *  POST   /api/v1/marketing/posts/:id/schedule   → programma pubblicazione
 *
 * Social Accounts:
 *  GET    /api/v1/marketing/accounts             → lista account connessi
 *  POST   /api/v1/marketing/accounts/connect     → connetti account (OAuth token)
 *  DELETE /api/v1/marketing/accounts/:id         → disconnetti account
 *
 * Comments:
 *  GET    /api/v1/marketing/comments?needsReply= → lista commenti
 *  POST   /api/v1/marketing/comments/:id/reply   → rispondi a commento
 *  POST   /api/v1/marketing/comments/:id/auto-reply → AI auto-reply
 *  POST   /api/v1/marketing/comments/sync        → sync commenti da social
 *
 * Analytics:
 *  GET    /api/v1/marketing/analytics?from=&to=  → analytics aggregate
 *  GET    /api/v1/marketing/analytics/posts/:id  → analytics per post
 *
 * Campaigns:
 *  GET    /api/v1/marketing/campaigns            → lista campagne
 *  POST   /api/v1/marketing/campaigns            → crea campagna
 *  PATCH  /api/v1/marketing/campaigns/:id        → modifica campagna
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http.js';
import {
  getMarketingConfig, createCanvaDesign, createGammaDoc,
  publishToInstagram, publishToFacebook, publishToWhatsApp,
  fetchSocialComments, replyToComment, fetchInstagramInsights,
  generateAiReply, generateAiPost,
} from './marketing.service.js';
import { getAiService } from '../ai/ai.service.js';
import path from 'path';
import fs from 'fs';

const MKT_ROLES = ['OWNER', 'MANAGER'];

export function registerMarketingRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;
  const cfg = getMarketingConfig();

  // Assicura che la directory media esista
  const mediaDir = path.join(process.cwd(), 'media');
  if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });

  // ============ MEDIA UPLOAD ============
  app.post('/api/v1/marketing/media/upload', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    // Riceve base64 o multipart semplice
    const body = req.body as { base64?: string; mimeType?: string; filename?: string; altText?: string };
    if (!body.base64) {
      res.status(400).json({ error: 'Manca base64 o file' });
      return;
    }
    const buf = Buffer.from(body.base64.split(',').pop() ?? body.base64, 'base64');
    const ext = body.mimeType?.includes('png') ? 'png' : body.mimeType?.includes('webp') ? 'webp' : 'jpg';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(mediaDir, filename);
    fs.writeFileSync(filepath, buf);

    const asset = await prisma.mediaAsset.create({
      data: {
        venueId: user.venueId,
        type: 'IMAGE',
        source: 'UPLOAD',
        url: `/media/${filename}`,
        mimeType: body.mimeType ?? 'image/jpeg',
        sizeBytes: buf.length,
        altText: body.altText,
        createdBy: user.userId,
      },
    });
    res.status(201).json(asset);
  });

  app.get('/api/v1/marketing/media', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const assets = await prisma.mediaAsset.findMany({
      where: { venueId: user.venueId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(assets);
  });

  app.delete('/api/v1/marketing/media/:id', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const asset = await prisma.mediaAsset.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!asset) { res.status(404).json({ error: 'Media non trovato' }); return; }
    // Elimina file fisico
    const fp = path.join(mediaDir, path.basename(asset.url));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    res.json({ ok: true });
  });

  // Servi file media staticamente
  app.use('/media', (req: Request, res: Response) => {
    const filename = path.basename(req.path);
    const fp = path.join(mediaDir, filename);
    if (fs.existsSync(fp)) {
      res.sendFile(fp);
    } else {
      res.status(404).send('Not found');
    }
  });

  // ============ AI POST GENERATION ============
  const generateSchema = z.object({
    topic: z.string().min(1),
    tone: z.string().default('amichevole'),
    channels: z.array(z.string()).default(['instagram']),
    mediaAssetId: z.string().optional(),
  });

  app.post('/api/v1/marketing/generate-post', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = generateSchema.parse(req.body);
    const venue = await prisma.venue.findUnique({ where: { id: user.venueId } });

    const result = await generateAiPost({
      topic: body.topic,
      tone: body.tone,
      channels: body.channels,
      venueName: venue?.name ?? 'La Piazzetta',
    });
    if (!result) {
      res.status(503).json({ error: 'AI non disponibile' });
      return;
    }
    res.json(result);
  });

  // ============ CANVA DESIGN ============
  const canvaSchema = z.object({
    title: z.string().min(1),
    templateId: z.string().optional(),
    brandColor: z.string().optional(),
    mediaAssetId: z.string().optional(),
  });

  app.post('/api/v1/marketing/canva/create', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = canvaSchema.parse(req.body);
    if (!cfg.canvaApiKey) {
      res.status(503).json({ error: 'Canva API non configurata. Imposta CANVA_API_KEY.' });
      return;
    }
    let imageUrl: string | undefined;
    if (body.mediaAssetId) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: body.mediaAssetId, venueId: user.venueId } });
      if (asset) imageUrl = `${cfg.publicBaseUrl}${asset.url}`;
    }
    const design = await createCanvaDesign({
      apiKey: cfg.canvaApiKey,
      title: body.title,
      templateId: body.templateId,
      brandColor: body.brandColor,
      imageUrl,
    });
    if (!design) {
      res.status(502).json({ error: 'Errore creazione design Canva' });
      return;
    }
    // Salva come media asset
    const asset = await prisma.mediaAsset.create({
      data: {
        venueId: user.venueId,
        type: 'DESIGN',
        source: 'CANVA',
        url: design.exportUrl,
        meta: { canvaDesignId: design.designId } as any,
        createdBy: user.userId,
      },
    });
    res.json({ asset, designId: design.designId, exportUrl: design.exportUrl });
  });

  // ============ GAMMA DOC ============
  const gammaSchema = z.object({
    prompt: z.string().min(1),
    title: z.string().min(1),
  });

  app.post('/api/v1/marketing/gamma/create', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = gammaSchema.parse(req.body);
    if (!cfg.gammaApiKey) {
      res.status(503).json({ error: 'Gamma API non configurata. Imposta GAMMA_API_KEY.' });
      return;
    }
    const doc = await createGammaDoc({
      apiKey: cfg.gammaApiKey,
      prompt: body.prompt,
      title: body.title,
    });
    if (!doc) {
      res.status(502).json({ error: 'Errore creazione doc Gamma' });
      return;
    }
    const asset = await prisma.mediaAsset.create({
      data: {
        venueId: user.venueId,
        type: 'DESIGN',
        source: 'GAMMA',
        url: doc.url,
        meta: { gammaDocId: doc.docId } as any,
        createdBy: user.userId,
      },
    });
    res.json({ asset, docId: doc.docId, url: doc.url });
  });

  // ============ SOCIAL POSTS ============
  const postSchema = z.object({
    mediaAssetId: z.string().optional(),
    caption: z.string().min(1),
    hashtags: z.array(z.string()).default([]),
    platforms: z.array(z.string()).min(1),
    campaignId: z.string().optional(),
    scheduledAt: z.string().datetime().optional(),
    aiGenerated: z.boolean().default(false),
    aiPrompt: z.string().optional(),
  });

  app.get('/api/v1/marketing/posts', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const status = req.query.status as string | undefined;
    const posts = await prisma.socialPost.findMany({
      where: { venueId: user.venueId, ...(status ? { status } : {}) },
      include: { mediaAsset: true, campaign: true, _count: { select: { comments: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(posts);
  });

  app.post('/api/v1/marketing/posts', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = postSchema.parse(req.body);
    const post = await prisma.socialPost.create({
      data: {
        venueId: user.venueId,
        mediaAssetId: body.mediaAssetId,
        caption: body.caption,
        hashtags: body.hashtags,
        platforms: body.platforms,
        campaignId: body.campaignId,
        status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        aiGenerated: body.aiGenerated,
        aiPrompt: body.aiPrompt,
        createdBy: user.userId,
      },
    });
    res.status(201).json(post);
  });

  app.patch('/api/v1/marketing/posts/:id', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const post = await prisma.socialPost.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!post) { res.status(404).json({ error: 'Post non trovato' }); return; }
    const body = req.body as Record<string, unknown>;
    const updated = await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        ...(body.caption !== undefined ? { caption: body.caption } : {}),
        ...(body.hashtags !== undefined ? { hashtags: body.hashtags } : {}),
        ...(body.platforms !== undefined ? { platforms: body.platforms } : {}),
        ...(body.mediaAssetId !== undefined ? { mediaAssetId: body.mediaAssetId } : {}),
        ...(body.scheduledAt !== undefined ? { scheduledAt: new Date(body.scheduledAt as string), status: 'SCHEDULED' } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      } as any,
    });
    res.json(updated);
  });

  app.delete('/api/v1/marketing/posts/:id', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const post = await prisma.socialPost.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!post) { res.status(404).json({ error: 'Post non trovato' }); return; }
    await prisma.socialPost.delete({ where: { id: post.id } });
    res.json({ ok: true });
  });

  // Pubblica subito
  app.post('/api/v1/marketing/posts/:id/publish', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const post = await prisma.socialPost.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { mediaAsset: true },
    });
    if (!post) { res.status(404).json({ error: 'Post non trovato' }); return; }
    if (!cfg.graphApiToken) {
      res.status(503).json({ error: 'Social API non configurata. Imposta SOCIAL_GRAPH_TOKEN.' });
      return;
    }

    await prisma.socialPost.update({ where: { id: post.id }, data: { status: 'PUBLISHING' } });

    const fullCaption = `${post.caption}\n\n${post.hashtags.join(' ')}`;
    const imageUrl = post.mediaAsset ? `${cfg.publicBaseUrl}${post.mediaAsset.url}` : undefined;
    const perPlatform: Record<string, any> = {};
    const accounts = await prisma.socialAccount.findMany({ where: { venueId: user.venueId, active: true } });

    for (const platform of post.platforms) {
      const account = accounts.find(a => a.platform === platform);
      if (!account) { perPlatform[platform] = { error: 'Account non connesso' }; continue; }

      if (platform === 'instagram' && imageUrl) {
        const r = await publishToInstagram({
          graphToken: cfg.graphApiToken,
          graphVersion: cfg.graphApiVersion!,
          igUserId: account.accountId,
          imageUrl,
          caption: fullCaption,
        });
        perPlatform.instagram = r ? { postId: r.igPostId, permalink: r.permalink } : { error: 'Pubblicazione fallita' };
      } else if (platform === 'facebook') {
        const r = await publishToFacebook({
          graphToken: cfg.graphApiToken,
          graphVersion: cfg.graphApiVersion!,
          fbPageId: account.accountId,
          message: fullCaption,
          imageUrl,
        });
        perPlatform.facebook = r ? { postId: r.fbPostId, permalink: r.permalink } : { error: 'Pubblicazione fallita' };
      } else if (platform === 'whatsapp') {
        // WhatsApp: broadcast a lista contatti (semplificato)
        perPlatform.whatsapp = { error: 'WhatsApp richiede destinatari specifici' };
      }
    }

    const hasErrors = Object.values(perPlatform).some((v: any) => v.error);
    await prisma.socialPost.update({
      where: { id: post.id },
      data: {
        status: hasErrors ? 'FAILED' : 'PUBLISHED',
        publishedAt: hasErrors ? null : new Date(),
        perPlatform: perPlatform as any,
      },
    });
    res.json({ status: hasErrors ? 'FAILED' : 'PUBLISHED', perPlatform });
  });

  // ============ SOCIAL ACCOUNTS ============
  app.get('/api/v1/marketing/accounts', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const accounts = await prisma.socialAccount.findMany({
      where: { venueId: user.venueId },
      orderBy: { connectedAt: 'desc' },
    });
    // Non restituire i token
    res.json(accounts.map(a => ({
      id: a.id, platform: a.platform, accountId: a.accountId, username: a.username,
      displayName: a.displayName, avatarUrl: a.avatarUrl, active: a.active,
      connectedAt: a.connectedAt, lastSyncAt: a.lastSyncAt, scopes: a.scopes,
    })));
  });

  const connectSchema = z.object({
    platform: z.enum(['instagram', 'facebook', 'whatsapp', 'tiktok']),
    accountId: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().optional(),
    tokenExpiresAt: z.string().datetime().optional(),
    username: z.string().optional(),
    displayName: z.string().optional(),
    avatarUrl: z.string().optional(),
    scopes: z.array(z.string()).default([]),
  });

  app.post('/api/v1/marketing/accounts/connect', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = connectSchema.parse(req.body);
    const account = await prisma.socialAccount.upsert({
      where: { venueId_platform_accountId: { venueId: user.venueId, platform: body.platform, accountId: body.accountId } },
      create: {
        venueId: user.venueId,
        platform: body.platform,
        accountId: body.accountId,
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        username: body.username,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
        scopes: body.scopes,
      },
      update: {
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        username: body.username,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
        scopes: body.scopes,
        active: true,
      },
    });
    res.json({ id: account.id, platform: account.platform, accountId: account.accountId });
  });

  app.delete('/api/v1/marketing/accounts/:id', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const account = await prisma.socialAccount.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!account) { res.status(404).json({ error: 'Account non trovato' }); return; }
    await prisma.socialAccount.delete({ where: { id: account.id } });
    res.json({ ok: true });
  });

  // ============ COMMENTS ============
  app.get('/api/v1/marketing/comments', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const needsReply = req.query.needsReply === 'true';
    const comments = await prisma.socialComment.findMany({
      where: { venueId: user.venueId, ...(needsReply ? { needsReply: true } : {}) },
      include: { socialPost: { select: { caption: true, id: true } } },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
    res.json(comments);
  });

  const replySchema = z.object({ replyText: z.string().min(1) });
  app.post('/api/v1/marketing/comments/:id/reply', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = replySchema.parse(req.body);
    const comment = await prisma.socialComment.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { socialPost: true },
    });
    if (!comment) { res.status(404).json({ error: 'Commento non trovato' }); return; }

    // Pubblica la risposta sulla piattaforma
    if (cfg.graphApiToken && (comment.platform === 'instagram' || comment.platform === 'facebook')) {
      await replyToComment({
        graphToken: cfg.graphApiToken,
        graphVersion: cfg.graphApiVersion!,
        commentId: comment.platformCommentId,
        replyText: body.replyText,
      });
    }

    const updated = await prisma.socialComment.update({
      where: { id: comment.id },
      data: { replyText: body.replyText, repliedAt: new Date(), needsReply: false, aiAutoReplied: false },
    });
    res.json(updated);
  });

  app.post('/api/v1/marketing/comments/:id/auto-reply', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const comment = await prisma.socialComment.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { socialPost: true },
    });
    if (!comment) { res.status(404).json({ error: 'Commento non trovato' }); return; }

    const venue = await prisma.venue.findUnique({ where: { id: user.venueId } });
    const replyText = await generateAiReply({
      comment: comment.text,
      venueName: venue?.name ?? 'La Piazzetta',
      postCaption: comment.socialPost?.caption,
    });

    // Pubblica la risposta
    if (cfg.graphApiToken && (comment.platform === 'instagram' || comment.platform === 'facebook')) {
      await replyToComment({
        graphToken: cfg.graphApiToken,
        graphVersion: cfg.graphApiVersion!,
        commentId: comment.platformCommentId,
        replyText,
      });
    }

    const updated = await prisma.socialComment.update({
      where: { id: comment.id },
      data: { replyText, repliedAt: new Date(), needsReply: false, aiAutoReplied: true },
    });
    res.json({ comment: updated, replyText });
  });

  // Sync commenti da social
  app.post('/api/v1/marketing/comments/sync', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!cfg.graphApiToken) {
      res.status(503).json({ error: 'Social API non configurata' });
      return;
    }
    const publishedPosts = await prisma.socialPost.findMany({
      where: { venueId: user.venueId, status: 'PUBLISHED' },
    });
    let synced = 0;
    for (const post of publishedPosts) {
      const perPlatform = post.perPlatform as Record<string, any> | null;
      if (!perPlatform) continue;
      for (const [platform, info] of Object.entries(perPlatform)) {
        if (!info.postId || info.error) continue;
        const comments = await fetchSocialComments({
          graphToken: cfg.graphApiToken,
          graphVersion: cfg.graphApiVersion!,
          postPlatformId: info.postId,
          platform: platform as 'instagram' | 'facebook',
        });
        if (!comments) continue;
        for (const c of comments) {
          try {
            await prisma.socialComment.upsert({
              where: { venueId_platform_platformCommentId: { venueId: user.venueId, platform, platformCommentId: c.id } },
              create: {
                venueId: user.venueId,
                socialPostId: post.id,
                platform,
                platformCommentId: c.id,
                authorName: c.author,
                text: c.text,
                likesCount: c.likes,
                needsReply: true,
              },
              update: {
                likesCount: c.likes,
              },
            });
            synced++;
          } catch {}
        }
      }
    }
    await prisma.socialAccount.updateMany({ where: { venueId: user.venueId }, data: { lastSyncAt: new Date() } });
    res.json({ synced, total: synced });
  });

  // ============ ANALYTICS ============
  app.get('/api/v1/marketing/analytics', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 30 * 86400000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();

    const analytics = await prisma.socialAnalytics.findMany({
      where: { venueId: user.venueId, date: { gte: from, lte: to } },
      orderBy: { date: 'asc' },
    });

    // Aggregate
    const totals = analytics.reduce((acc, a) => ({
      impressions: acc.impressions + a.impressions,
      reach: acc.reach + a.reach,
      likes: acc.likes + a.likes,
      comments: acc.comments + a.comments,
      shares: acc.shares + a.shares,
      saves: acc.saves + a.saves,
      profileVisits: acc.profileVisits + a.profileVisits,
      websiteClicks: acc.websiteClicks + a.websiteClicks,
    }), { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, profileVisits: 0, websiteClicks: 0 });

    // Per platform
    const byPlatform = new Map<string, any>();
    for (const a of analytics) {
      const p = byPlatform.get(a.platform) ?? { platform: a.platform, impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 };
      p.impressions += a.impressions;
      p.reach += a.reach;
      p.likes += a.likes;
      p.comments += a.comments;
      p.shares += a.shares;
      byPlatform.set(a.platform, p);
    }

    // Per day
    const byDayMap = new Map<string, any>();
    for (const a of analytics) {
      const day = a.date.toISOString().slice(0, 10);
      const d = byDayMap.get(day) ?? { date: day, impressions: 0, reach: 0, likes: 0, comments: 0 };
      d.impressions += a.impressions;
      d.reach += a.reach;
      d.likes += a.likes;
      d.comments += a.comments;
      byDayMap.set(day, d);
    }

    // Top posts
    const posts = await prisma.socialPost.findMany({
      where: { venueId: user.venueId, status: 'PUBLISHED' },
      include: { mediaAsset: true, analytics: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
    const topPosts = posts.map(p => ({
      id: p.id,
      caption: p.caption.slice(0, 80),
      mediaUrl: p.mediaAsset?.url,
      publishedAt: p.publishedAt,
      totalImpressions: p.analytics.reduce((s, a) => s + a.impressions, 0),
      totalReach: p.analytics.reduce((s, a) => s + a.reach, 0),
      totalLikes: p.analytics.reduce((s, a) => s + a.likes, 0),
      totalComments: p.analytics.reduce((s, a) => s + a.comments, 0),
    })).sort((a, b) => b.totalImpressions - a.totalImpressions).slice(0, 10);

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      byPlatform: Array.from(byPlatform.values()),
      byDay: Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      topPosts,
      followerCount: analytics.length > 0 ? analytics[analytics.length - 1].followerCount : 0,
    });
  });

  // Sync analytics da Instagram
  app.post('/api/v1/marketing/analytics/sync', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!cfg.graphApiToken) {
      res.status(503).json({ error: 'Social API non configurata' });
      return;
    }
    const posts = await prisma.socialPost.findMany({
      where: { venueId: user.venueId, status: 'PUBLISHED' },
    });
    let synced = 0;
    for (const post of posts) {
      const perPlatform = post.perPlatform as Record<string, any> | null;
      if (!perPlatform) continue;
      for (const [platform, info] of Object.entries(perPlatform)) {
        if (!info.postId || info.error) continue;
        if (platform === 'instagram') {
          const insights = await fetchInstagramInsights({
            graphToken: cfg.graphApiToken,
            graphVersion: cfg.graphApiVersion!,
            igPostId: info.postId,
          });
          if (!insights) continue;
          await prisma.socialAnalytics.upsert({
            where: { id: `${post.id}-${platform}-${new Date().toISOString().slice(0, 10)}` },
            create: {
              venueId: user.venueId,
              socialPostId: post.id,
              platform,
              date: new Date(),
              impressions: insights.impressions,
              reach: insights.reach,
              likes: insights.likes,
              comments: insights.comments,
              saves: insights.saves,
            },
            update: {
              impressions: insights.impressions,
              reach: insights.reach,
              likes: insights.likes,
              comments: insights.comments,
              saves: insights.saves,
            },
          });
          synced++;
        }
      }
    }
    res.json({ synced });
  });

  // ============ CAMPAIGNS ============
  app.get('/api/v1/marketing/campaigns', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const campaigns = await prisma.campaign.findMany({
      where: { venueId: user.venueId },
      include: { _count: { select: { posts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  });

  const campaignSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    budgetCents: z.number().int().default(0),
    status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED']).default('ACTIVE'),
  });

  app.post('/api/v1/marketing/campaigns', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = campaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({
      data: {
        venueId: user.venueId,
        name: body.name,
        description: body.description,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        budgetCents: body.budgetCents,
        status: body.status,
      },
    });
    res.status(201).json(campaign);
  });

  app.patch('/api/v1/marketing/campaigns/:id', devAuth, requireRoles(...MKT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!campaign) { res.status(404).json({ error: 'Campagna non trovata' }); return; }
    const body = req.body as Record<string, unknown>;
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.budgetCents !== undefined ? { budgetCents: body.budgetCents } : {}),
      } as any,
    });
    res.json(updated);
  });
}
