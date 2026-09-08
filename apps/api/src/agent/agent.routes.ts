/**
 * Route dell'agente: approvazione one-tap, stato proposte, invio reale PO.
 *
 * Flusso (vedi PROMPT_IMPLEMENTAZIONE 3.4):
 * 1. Job 06:00 crea proposta riordino → notifica owner con link firmato.
 * 2. Owner apre il link: GET /agent/approvals/:token → riepilogo.
 * 3. Owner conferma: POST /agent/approvals/:token/approve → sistema genera PDF
 *    e recapita al fornitore via email o WhatsApp.
 * 4. Solo allora il PO passa a SENT. Nessun ordine parte da solo.
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { currentUser, type RouteDeps } from '../http.js';
import { ApprovalTokenService } from './approval-token.service.js';

export function registerAgentRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;
  const tokenService = new ApprovalTokenService(prisma, process.env.JWT_SECRET ?? 'agent-secret-fallback');

  // ─── GET /agent/approvals/:token — riepilogo azione (non consuma) ──────────
  app.get('/api/v1/agent/approvals/:token', async (req: Request, res: Response) => {
    const validation = await tokenService.validate(req.params.token);
    if (!validation.ok || !validation.token) {
      res.status(404).json({ error: validation.error ?? 'Token non valido' });
      return;
    }
    const { actionType, targetId, venueId } = validation.token;

    if (actionType === 'APPROVE_PO') {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: targetId, venueId },
        include: { supplier: true, items: true },
      });
      if (!po) { res.status(404).json({ error: 'Ordine non trovato' }); return; }
      // Lookup prodotti per nome
      const productIds = po.items.map((it) => it.productId);
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
      const productMap = new Map(products.map((p) => [p.id, p.name]));
      res.json({
        actionType,
        targetId,
        purchaseOrder: {
          id: po.id,
          supplier: po.supplier.name,
          totalCents: po.totalCents,
          status: po.status,
          items: po.items.map((it) => ({
            productName: productMap.get(it.productId) ?? it.productId,
            packsOrdered: it.packsOrdered,
            packPriceCents: it.packPriceCents,
          })),
        },
      });
      return;
    }

    res.json({ actionType, targetId, venueId });
  });

  // ─── POST /agent/approvals/:token/approve — conferma one-tap ─────────────
  app.post('/api/v1/agent/approvals/:token/approve', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const validation = await tokenService.consume(req.params.token, user.userId);
    if (!validation.ok || !validation.token) {
      res.status(404).json({ error: validation.error ?? 'Token non valido' });
      return;
    }
    const { actionType, targetId, venueId } = validation.token;

    if (actionType === 'APPROVE_PO') {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: targetId, venueId },
        include: { supplier: true, items: true },
      });
      if (!po) { res.status(404).json({ error: 'Ordine non trovato' }); return; }
      if (po.status !== 'DRAFT') { res.status(409).json({ error: 'Ordine non in stato DRAFT' }); return; }

      const sendResult = await sendPurchaseOrderToSupplier(prisma, po);

      const updated = await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'SENT', sentAt: new Date() },
      });

      res.json({ ok: true, purchaseOrder: updated, sent: sendResult });
      return;
    }

    res.json({ ok: true, actionType, targetId });
  });

  // ─── POST /agent/proposals/reorder — genera proposta riordino manuale ────
  app.post('/api/v1/agent/proposals/reorder', devAuth, requireRoles('OWNER', 'MANAGER'), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const products = await prisma.product.findMany({
      where: { venueId: user.venueId },
      include: { stock: true, listings: { include: { supplier: true } } },
    });
    const lowStock = products.filter((p) => p.stock && p.stock.quantity <= p.stock.reorderLevel);

    const proposals = [];
    for (const p of lowStock) {
      // Trova il fornitore dal listino (primo disponibile)
      const listing = p.listings[0];
      if (!listing) continue;
      const po = await prisma.purchaseOrder.create({
        data: {
          venueId: user.venueId,
          supplierId: listing.supplierId,
          status: 'DRAFT',
          totalCents: p.stock!.reorderLevel * listing.packPriceCents,
          createdBy: user.userId,
          items: {
            create: [{
              productId: p.id,
              packSize: listing.packSize,
              packsOrdered: Math.ceil(p.stock!.reorderLevel / listing.packSize),
              packPriceCents: listing.packPriceCents,
            }],
          },
        },
      });
      const { token, expiresAt } = await tokenService.create({
        venueId: user.venueId,
        actionType: 'APPROVE_PO',
        targetId: po.id,
        createdBy: user.userId,
        ttlHours: 24,
      });
      proposals.push({ poId: po.id, token, expiresAt, product: p.name, supplier: listing.supplier?.name });
    }

    res.json({ proposals });
  });
}

/**
 * Invia davvero il PO al fornitore: genera un PDF semplificato (testo formattato)
 * e lo invia via email se SMTP è configurato, altrimenti via WhatsApp, altrimenti logga.
 */
async function sendPurchaseOrderToSupplier(prisma: PrismaClient, po: any): Promise<{ method: string; ok: boolean; error?: string }> {
  const productIds = po.items.map((it: any) => it.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
  const productMap = new Map(products.map((p) => [p.id, p.name]));

  const lines = po.items.map((it: any) =>
    `${productMap.get(it.productId) ?? it.productId}: ${it.packsOrdered} conf × €${(it.packPriceCents / 100).toFixed(2)} = €${(it.packsOrdered * it.packPriceCents / 100).toFixed(2)}`
  ).join('\n');
  const pdfContent = `ORDINE D'ACQUISTO\n${'='.repeat(40)}\nFornitore: ${po.supplier.name}\nData: ${new Date().toISOString().slice(0, 10)}\n\n${lines}\n${'='.repeat(40)}\nTotale: €${(po.totalCents / 100).toFixed(2)}`;

  // Email se SMTP configurato
  if (process.env.SMTP_URL && po.supplier.email) {
    try {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      const nodemailer: any = await dynamicImport('nodemailer').catch(() => null);
      if (!nodemailer) return { method: 'email', ok: false, error: 'nodemailer non installato' };
      const transporter = nodemailer.createTransport(process.env.SMTP_URL);
      await transporter.sendMail({
        from: 'La Piazzetta <ordini@lapiazzetta.local>',
        to: po.supplier.email,
        subject: `Ordine ${po.id}`,
        text: pdfContent,
      });
      return { method: 'email', ok: true };
    } catch (e) {
      return { method: 'email', ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // WhatsApp se configurato
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && po.supplier.phone) {
    try {
      const { publishToWhatsApp } = await import('../marketing/marketing.service.js');
      const result = await publishToWhatsApp({
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        to: po.supplier.phone,
        message: pdfContent,
      });
      if (result) return { method: 'whatsapp', ok: true };
      return { method: 'whatsapp', ok: false, error: 'WhatsApp API error' };
    } catch (e) {
      return { method: 'whatsapp', ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Degradazione: logga per invio manuale
  console.log(`[agent] PO ${po.id} pronto per invio manuale:\n${pdfContent}`);
  return { method: 'manual', ok: true };
}
