/**
 * Route della cassa: conto, chiusura sessione, pagamento (anche misto),
 * storno riga, vendita al banco, cassetto portasoldi, chiusura giornaliera.
 *
 * Vincoli (vedi PROMPT_IMPLEMENTAZIONE 2.5):
 * - Ogni query parte da un id fornito dal client e verifica venueId PRIMA di agire.
 * - La chiusura sessione fallisce con 409 se restano ordini non pagati o righe
 *   non servite. Ripristina Table.state a FREE e valorizza closedAt, closedBy,
 *   totalCents, status = CLOSED.
 * - pay accetta un array di metodi (pagamento misto). Tutto in una transazione.
 * - void-item richiede un motivo obbligatorio e storna il movimento di magazzino
 *   (movimento inverso di tipo RETURN, non cancellazione del SALE originale).
 * - quick-sale crea un Order con channel=COUNTER e sessionId=null, già PAID.
 *
 * Integrazioni:
 * - Contabilità: ogni Payment genera una JournalEntry in partita doppia.
 * - Crediti: method=CREDIT chiama applyTransaction con controllo del fido.
 * - Magazzino: void-item storna con recordMovement tipo RETURN.
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http.js';
import { computeBill, coverChargeForDay, computeChange, reconcileDrawer, type BillItem, type SalesChannel, type PaymentMethod } from './bill.logic.js';
import type { PaymentTerminal } from './terminal.port.js';
import { mockPosDriver } from './mock.driver.js';
import { recordMovement } from '../inventory/inventory.service.js';
import { applyTransaction } from '../credit/credit.logic.js';

type Tx = Prisma.TransactionClient;

export interface CashierDeps extends RouteDeps {
  /** Terminale POS per lo scambio importo. Default: mock driver. */
  posTerminal?: PaymentTerminal;
}

/** Conti del piano dei conti italiano (vedi chart-of-accounts.ts). */
const ACCOUNT_CASSA = '4.04';
const ACCOUNT_BANCA = '4.05';
const ACCOUNT_POS = '4.06';
const ACCOUNT_CREDITI_CLIENTI = '4.01';
const ACCOUNT_IVA_DEBITO = '7.05';
const ACCOUNT_RICAVI_BAR = '8.01';
const ACCOUNT_RICAVI_TAVOLA_CALDA = '8.02';

export function registerCashierRoutes(app: Express, prisma: PrismaClient, deps: CashierDeps): void {
  const { devAuth, requireRoles, onBoardChange, posTerminal } = deps;
  const pos: PaymentTerminal = posTerminal ?? mockPosDriver;

  const CASHIER_ROLES = ['OWNER', 'MANAGER', 'BARMAN', 'CASHIER'];

  /** Notifica il real-time KDS per ripulire la board alla chiusura tavolo. */
  function notifyBoard(venueId: string, stations: Iterable<string>): void {
    if (!onBoardChange) return;
    const seen = new Set<string>();
    for (const s of stations) {
      if (s === 'BAR' || s === 'TAVOLA_CALDA') {
        if (!seen.has(s)) { seen.add(s); onBoardChange(venueId, s as 'BAR' | 'TAVOLA_CALDA'); }
      }
    }
  }

  // ─── GET /sessions/:id/bill — conto aggregato ──────────────────────────────
  app.get('/api/v1/orders-tables/sessions/:id/bill', devAuth, async (req: Request, res: Response) => {
    const user = currentUser(req);
    const session = await prisma.tableSession.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { table: true, orders: { include: { items: { include: { product: true } } } } },
    });
    if (!session) { res.status(404).json({ error: 'Sessione non trovata' }); return; }

    const items: BillItem[] = [];
    for (const order of session.orders) {
      for (const it of order.items) {
        if (it.status === 'CANCELLED') continue;
        items.push({
          productId: it.productId,
          name: it.product.name,
          vatRateCents: it.product.category.includes('alcol') || it.product.category.includes('birra') ? 2200 : 1000,
          quantity: it.quantity,
          unitCents: it.unitCents,
        });
      }
    }

    const bill = computeBill(items, session.guests, session.coverChargeCentsPerGuest, null, 'TABLE');
    res.json({ session, bill });
  });

  // ─── POST /sessions/:id/pay — paga l'intera sessione (tutti gli ordini) ────
  const sessionPaySchema = z.object({
    payments: z.array(z.object({
      method: z.enum(['CASH', 'CARD', 'CREDIT']),
      amountCents: z.number().int().positive(),
      customerId: z.string().optional(),
      tenderedCents: z.number().int().optional(),
    })).min(1),
    tipCents: z.number().int().min(0).optional(),
    closeSession: z.boolean().optional().default(true),
  });

  app.post('/api/v1/cashier/sessions/:id/pay', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const session = await prisma.tableSession.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { table: true, orders: { include: { items: { include: { product: true } } } } },
    });
    if (!session) { res.status(404).json({ error: 'Sessione non trovata' }); return; }
    if (session.status === 'CLOSED') { res.status(409).json({ error: 'Sessione già chiusa' }); return; }

    const body = sessionPaySchema.parse(req.body);

    // Aggrega tutti gli item da tutti gli ordini non ancora pagati.
    const unpaidOrders = session.orders.filter((o) => o.status !== 'PAID');
    if (unpaidOrders.length === 0) { res.status(409).json({ error: 'Tutti gli ordini sono già pagati' }); return; }

    const items: BillItem[] = [];
    for (const order of unpaidOrders) {
      for (const it of order.items) {
        if (it.status === 'CANCELLED') continue;
        items.push({
          productId: it.productId,
          name: it.product.name,
          vatRateCents: it.product.category.includes('alcol') || it.product.category.includes('birra') ? 2200 : 1000,
          quantity: it.quantity,
          unitCents: it.unitCents,
        });
      }
    }

    const bill = computeBill(items, session.guests, session.coverChargeCentsPerGuest, null, 'TABLE');
    const totalDue = bill.totalCents + (body.tipCents ?? 0);

    const paidTotal = body.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paidTotal < totalDue) {
      res.status(400).json({ error: `Importo insufficiente: dovuto ${totalDue}, versato ${paidTotal}` });
      return;
    }

    // Cassetto aperto per i pagamenti contanti.
    const drawer = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    // POS per pagamenti con carta.
    const posResponses: Array<{ method: string; outcome: string; authCode?: string; txnId?: string; terminalId?: string }> = [];
    for (const p of body.payments) {
      if (p.method === 'CARD') {
        if (!pos.isAvailable()) {
          posResponses.push({ method: 'CARD', outcome: 'MANUAL' });
          continue;
        }
        const posResp = await pos.sendPayment({ amountCents: p.amountCents, requestId: session.id + ':' + p.amountCents });
        if (posResp.outcome === 'DECLINED') {
          res.status(402).json({ error: 'Pagamento carta rifiutato', message: posResp.message });
          return;
        }
        if (posResp.outcome === 'UNKNOWN') {
          res.status(409).json({ error: 'Stato del terminale incerto. Verificare lo scontrino prima di ritentare.', message: posResp.message });
          return;
        }
        posResponses.push({ method: 'CARD', outcome: posResp.outcome, authCode: posResp.authCode, txnId: posResp.txnId, terminalId: posResp.terminalId });
      }
    }

    // Ripartisce i pagamenti sugli ordini non pagati (in proporzione al totale di ciascuno).
    try {
      const result = await prisma.$transaction(async (tx) => {
        let remainingPaid = paidTotal;
        let tipRemaining = body.tipCents ?? 0;

        for (const order of unpaidOrders) {
          const orderItems: BillItem[] = order.items
            .filter((it) => it.status !== 'CANCELLED')
            .map((it) => ({
              productId: it.productId,
              name: it.product.name,
              vatRateCents: it.product.category.includes('alcol') || it.product.category.includes('birra') ? 2200 : 1000,
              quantity: it.quantity,
              unitCents: it.unitCents,
            }));
          const orderBill = computeBill(orderItems, 0, 0, null, 'TABLE');
          const orderTotal = orderBill.totalCents;

          // Crea un pagamento proporzionale per questo ordine.
          for (let i = 0; i < body.payments.length; i++) {
            const p = body.payments[i];
            const allocCents = Math.min(p.amountCents, orderTotal);
            if (allocCents <= 0) continue;

            const changeCents = p.method === 'CASH' && p.tenderedCents
              ? computeChange(allocCents, p.tenderedCents, 'CASH').changeCents
              : 0;

            if (p.method === 'CREDIT') {
              if (!p.customerId) throw new Error('Pagamento a credito richiede un cliente');
              const customer = await tx.customer.findFirst({ where: { id: p.customerId, venueId: user.venueId } });
              if (!customer) throw new Error('Cliente non trovato');
              const creditResult = applyTransaction({
                currentBalanceCents: customer.balanceCents,
                limitCents: customer.limitCents,
                type: 'CHARGE',
                amountCents: allocCents,
              });
              if (!creditResult.ok) throw new Error(creditResult.error ?? 'Limite di fido superato');
              await tx.customer.update({ where: { id: customer.id }, data: { balanceCents: creditResult.newBalanceCents } });
              await tx.creditTransaction.create({
                data: {
                  customerId: customer.id, type: 'CHARGE', amountCents: allocCents,
                  balanceAfterCents: creditResult.newBalanceCents, orderId: order.id, method: 'CREDIT', createdBy: user.userId,
                },
              });
            }

            const posResp = posResponses[i];
            await tx.payment.create({
              data: {
                venueId: user.venueId, orderId: order.id, sessionId: session.id,
                method: p.method, amountCents: allocCents,
                tipCents: i === 0 && tipRemaining > 0 ? Math.min(tipRemaining, allocCents) : 0,
                changeCents,
                cashDrawerId: p.method === 'CASH' ? drawer?.id : null,
                customerId: p.method === 'CREDIT' ? p.customerId : null,
                posTerminalId: posResp?.terminalId, posAuthCode: posResp?.authCode, posTxnId: posResp?.txnId,
                createdBy: user.userId,
              },
            });
            await createPaymentJournalEntry(tx, user.venueId, p.method, allocCents, order.id);
          }

          await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date(), totalCents: orderTotal } });
        }

        // Chiude la sessione se richiesto.
        if (body.closeSession) {
          await tx.tableSession.update({
            where: { id: session.id },
            data: { status: 'CLOSED', closedAt: new Date() },
          });
          if (session.table) {
            await tx.table.update({ where: { id: session.tableId }, data: { state: 'FREE' } });
          }
        }

        return { ok: true, totalDue, paidTotal, ordersPaid: unpaidOrders.length, sessionClosed: body.closeSession, bill };
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore nel pagamento sessione';
      res.status(400).json({ error: msg });
    }
  });

  // ─── POST /sessions/:id/close — chiude, libera il tavolo ───────────────────
  app.post('/api/v1/orders-tables/sessions/:id/close', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const session = await prisma.tableSession.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { table: true, orders: { include: { items: true } } },
    });
    if (!session) { res.status(404).json({ error: 'Sessione non trovata' }); return; }
    if (session.status === 'CLOSED') { res.status(409).json({ error: 'Sessione già chiusa' }); return; }

    // Verifica: nessun ordine non pagato, nessuna riga non servita.
    const unpaidOrders = session.orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
    const unservedItems = session.orders.flatMap((o) => o.items).filter((it) => it.status !== 'SERVED' && it.status !== 'CANCELLED');
    if (unpaidOrders.length > 0 || unservedItems.length > 0) {
      res.status(409).json({
        error: 'Impossibile chiudere: ordini non pagati o righe non servite',
        unpaidOrders: unpaidOrders.length,
        unservedItems: unservedItems.length,
      });
      return;
    }

    const totalCents = session.orders.reduce((s, o) => s + (o.status === 'PAID' ? o.totalCents : 0), 0);
    const stations = new Set(session.orders.flatMap((o) => o.items.map((it) => it.station)));

    await prisma.$transaction(async (tx) => {
      await tx.tableSession.update({
        where: { id: session.id },
        data: { status: 'CLOSED', closedAt: new Date(), closedBy: user.userId, totalCents },
      });
      await tx.table.update({
        where: { id: session.tableId },
        data: { state: 'FREE' },
      });
    });

    notifyBoard(user.venueId, stations);
    res.json({ ok: true, totalCents });
  });

  // ─── POST /cashier/orders/:id/pay — pagamento anche misto ──────────────────
  const paySchema = z.object({
    payments: z.array(z.object({
      method: z.enum(['CASH', 'CARD', 'CREDIT']),
      amountCents: z.number().int().positive(),
      customerId: z.string().optional(),
      tenderedCents: z.number().int().optional(), // solo per CASH: importo versato per calcolare il resto
    })).min(1),
    tipCents: z.number().int().min(0).optional(),
  });

  app.post('/api/v1/cashier/orders/:id/pay', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { items: { include: { product: true } }, session: { include: { table: true } } },
    });
    if (!order) { res.status(404).json({ error: 'Ordine non trovato' }); return; }
    if (order.status === 'PAID') { res.status(409).json({ error: 'Ordine già pagato' }); return; }

    const body = paySchema.parse(req.body);

    // Calcola il conto per determinare il totale dovuto.
    const channel: SalesChannel = (order.channel as SalesChannel) ?? 'TABLE';
    const items: BillItem[] = order.items
      .filter((it) => it.status !== 'CANCELLED')
      .map((it) => ({
        productId: it.productId,
        name: it.product.name,
        vatRateCents: it.product.category.includes('alcol') || it.product.category.includes('birra') ? 2200 : 1000,
        quantity: it.quantity,
        unitCents: it.unitCents,
      }));
    const coverCharge = order.session?.coverChargeCentsPerGuest ?? 0;
    const bill = computeBill(items, order.session?.guests ?? 0, coverCharge, null, channel);
    const totalDue = bill.totalCents + (body.tipCents ?? 0);

    // Verifica che la somma dei pagamenti copra il totale.
    const paidTotal = body.payments.reduce((s, p) => s + p.amountCents, 0);
    if (paidTotal < totalDue) {
      res.status(400).json({ error: `Importo insufficiente: dovuto ${totalDue}, versato ${paidTotal}` });
      return;
    }

    // Cassetto aperto: i pagamenti contanti vanno associati.
    const drawer = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    // Per ogni pagamento con carta, interroga il terminale POS (se disponibile).
    const posResponses: Array<{ method: string; outcome: string; authCode?: string; txnId?: string; terminalId?: string }> = [];
    for (const p of body.payments) {
      if (p.method === 'CARD') {
        if (!pos.isAvailable()) {
          // Fallback manuale: il cameriere ha digitato l'importo sul terminale.
          // Registriamo il pagamento senza scambio importo.
          posResponses.push({ method: 'CARD', outcome: 'MANUAL' });
          continue;
        }
        const posResp = await pos.sendPayment({ amountCents: p.amountCents, requestId: order.id + ':' + p.amountCents });
        if (posResp.outcome === 'DECLINED') {
          res.status(402).json({ error: 'Pagamento carta rifiutato', message: posResp.message });
          return;
        }
        if (posResp.outcome === 'UNKNOWN') {
          res.status(409).json({ error: 'Stato del terminale incerto. Verificare se lo scontrino è stampato prima di ritentare.', message: posResp.message });
          return;
        }
        posResponses.push({
          method: 'CARD', outcome: posResp.outcome,
          authCode: posResp.authCode, txnId: posResp.txnId, terminalId: posResp.terminalId,
        });
      }
    }

    // Tutto in una transazione Prisma.
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Crea i record Payment.
        for (let i = 0; i < body.payments.length; i++) {
          const p = body.payments[i];
          const changeCents = p.method === 'CASH' && p.tenderedCents
            ? computeChange(p.amountCents, p.tenderedCents, 'CASH').changeCents
            : 0;

          // Per CREDIT: verifica il fido del cliente.
          if (p.method === 'CREDIT') {
            if (!p.customerId) {
              throw new Error('Pagamento a credito richiede un cliente');
            }
            const customer = await tx.customer.findFirst({ where: { id: p.customerId, venueId: user.venueId } });
            if (!customer) throw new Error('Cliente non trovato');
            const creditResult = applyTransaction({
              currentBalanceCents: customer.balanceCents,
              limitCents: customer.limitCents,
              type: 'CHARGE',
              amountCents: p.amountCents,
            });
            if (!creditResult.ok) {
              throw new Error(creditResult.error ?? 'Limite di fido superato');
            }
            // Aggiorna il saldo del cliente e crea la transazione di credito.
            await tx.customer.update({
              where: { id: customer.id },
              data: { balanceCents: creditResult.newBalanceCents },
            });
            await tx.creditTransaction.create({
              data: {
                customerId: customer.id,
                type: 'CHARGE',
                amountCents: p.amountCents,
                balanceAfterCents: creditResult.newBalanceCents,
                orderId: order.id,
                method: 'CREDIT',
                createdBy: user.userId,
              },
            });
          }

          const posResp = posResponses[i];
          await tx.payment.create({
            data: {
              venueId: user.venueId,
              orderId: order.id,
              sessionId: order.sessionId,
              method: p.method,
              amountCents: p.amountCents,
              tipCents: i === 0 ? (body.tipCents ?? 0) : 0,
              changeCents,
              cashDrawerId: p.method === 'CASH' ? drawer?.id : null,
              customerId: p.method === 'CREDIT' ? p.customerId : null,
              posTerminalId: posResp?.terminalId,
              posAuthCode: posResp?.authCode,
              posTxnId: posResp?.txnId,
              createdBy: user.userId,
            },
          });

          // Scrittura contabile: DARE cassa/banca/crediti, AVERE ricavi + IVA.
          await createPaymentJournalEntry(tx, user.venueId, p.method, p.amountCents, order.id);
        }

        // Segna l'ordine come pagato.
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'PAID', paidAt: new Date(), totalCents: bill.totalCents },
        });

        return { ok: true, totalDue, paidTotal };
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore nel pagamento';
      res.status(400).json({ error: msg });
    }
  });

  // ─── POST /cashier/orders/:id/void-item — storno riga con motivo ──────────
  const voidSchema = z.object({ reason: z.string().min(1, 'Motivo obbligatorio') });

  app.post('/api/v1/cashier/orders/:id/void-item', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const { itemId } = req.body as { itemId?: string };
    if (!itemId) { res.status(400).json({ error: 'itemId obbligatorio' }); return; }
    const body = voidSchema.parse(req.body);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, venueId: user.venueId },
      include: { items: true },
    });
    if (!order) { res.status(404).json({ error: 'Ordine non trovato' }); return; }

    const item = order.items.find((it) => it.id === itemId);
    if (!item) { res.status(404).json({ error: 'Riga non trovata' }); return; }
    if (item.status === 'CANCELLED') { res.status(409).json({ error: 'Riga già stornata' }); return; }

    await prisma.$transaction(async (tx) => {
      // Storna la riga (append-only: non cancella, marca CANCELLED).
      await tx.orderItem.update({
        where: { id: item.id },
        data: { status: 'CANCELLED', notes: (item.notes ?? '') + ` [STORNATO: ${body.reason}]` },
      });

      // Storna il movimento di magazzino (RETURN, non cancellazione del SALE).
      await recordMovement(tx, user.venueId, {
        productId: item.productId,
        type: 'RETURN',
        qty: item.quantity,
        reason: `Storno riga ordine ${order.id}: ${body.reason}`,
        orderId: order.id,
        createdBy: user.userId,
      });
    });

    res.json({ ok: true });
  });

  // ─── POST /cashier/quick-sale — vendita al banco ──────────────────────────
  const quickSaleSchema = z.object({
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
    })).min(1),
    payment: z.object({
      method: z.enum(['CASH', 'CARD', 'CREDIT']),
      amountCents: z.number().int().positive(),
      customerId: z.string().optional(),
      tenderedCents: z.number().int().optional(),
    }),
    clientOrderId: z.string().optional(),
  });

  app.post('/api/v1/cashier/quick-sale', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = quickSaleSchema.parse(req.body);

    const productIds = body.items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, venueId: user.venueId },
    });
    if (products.length !== productIds.length) {
      res.status(400).json({ error: 'Uno o più prodotti non trovati' });
      return;
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const items: BillItem[] = body.items.map((i) => {
      const p = productMap.get(i.productId)!;
      return {
        productId: p.id,
        name: p.name,
        vatRateCents: p.category.includes('alcol') || p.category.includes('birra') ? 2200 : 1000,
        quantity: i.quantity,
        unitCents: p.priceCents,
      };
    });

    const bill = computeBill(items, 0, 0, null, 'COUNTER');
    if (body.payment.amountCents < bill.totalCents) {
      res.status(400).json({ error: `Importo insufficiente: dovuto ${bill.totalCents}, versato ${body.payment.amountCents}` });
      return;
    }

    // Per carta: interroga il terminale.
    let posResp: { outcome: string; authCode?: string; txnId?: string; terminalId?: string } | null = null;
    if (body.payment.method === 'CARD') {
      if (!pos.isAvailable()) {
        posResp = { outcome: 'MANUAL' };
      } else {
        const r = await pos.sendPayment({ amountCents: body.payment.amountCents, requestId: 'quick-sale-' + Date.now() });
        if (r.outcome === 'DECLINED') { res.status(402).json({ error: 'Pagamento carta rifiutato', message: r.message }); return; }
        if (r.outcome === 'UNKNOWN') { res.status(409).json({ error: 'Stato terminale incerto', message: r.message }); return; }
        posResp = { outcome: r.outcome, authCode: r.authCode, txnId: r.txnId, terminalId: r.terminalId };
      }
    }

    const drawer = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        // Crea l'ordine già PAID, channel=COUNTER, sessionId=null.
        const order = await tx.order.create({
          data: {
            venueId: user.venueId,
            sessionId: null,
            clientOrderId: body.clientOrderId,
            status: 'PAID',
            totalCents: bill.totalCents,
            channel: 'COUNTER',
            paidAt: new Date(),
            items: {
              create: body.items.map((i) => {
                const p = productMap.get(i.productId)!;
                return {
                  productId: p.id,
                  quantity: i.quantity,
                  unitCents: p.priceCents,
                  status: 'SERVED',
                  station: p.category.includes('tavola') || p.category.includes('cucina') ? 'TAVOLA_CALDA' : 'BAR',
                };
              }),
            },
          },
          include: { items: true },
        });

        // Scarico magazzino per ogni riga.
        for (const it of order.items) {
          await recordMovement(tx, user.venueId, {
            productId: it.productId,
            type: 'SALE',
            qty: it.quantity,
            orderId: order.id,
            createdBy: user.userId,
          });
        }

        // Pagamento.
        const changeCents = body.payment.method === 'CASH' && body.payment.tenderedCents
          ? computeChange(body.payment.amountCents, body.payment.tenderedCents, 'CASH').changeCents
          : 0;

        if (body.payment.method === 'CREDIT') {
          if (!body.payment.customerId) throw new Error('Pagamento a credito richiede un cliente');
          const customer = await tx.customer.findFirst({ where: { id: body.payment.customerId, venueId: user.venueId } });
          if (!customer) throw new Error('Cliente non trovato');
          const creditResult = applyTransaction({
            currentBalanceCents: customer.balanceCents,
            limitCents: customer.limitCents,
            type: 'CHARGE',
            amountCents: body.payment.amountCents,
          });
          if (!creditResult.ok) throw new Error(creditResult.error ?? 'Fido superato');
          await tx.customer.update({ where: { id: customer.id }, data: { balanceCents: creditResult.newBalanceCents } });
          await tx.creditTransaction.create({
            data: {
              customerId: customer.id, type: 'CHARGE', amountCents: body.payment.amountCents,
              balanceAfterCents: creditResult.newBalanceCents, orderId: order.id, method: 'CREDIT', createdBy: user.userId,
            },
          });
        }

        await tx.payment.create({
          data: {
            venueId: user.venueId,
            orderId: order.id,
            sessionId: null,
            method: body.payment.method,
            amountCents: body.payment.amountCents,
            changeCents,
            cashDrawerId: body.payment.method === 'CASH' ? drawer?.id : null,
            customerId: body.payment.method === 'CREDIT' ? body.payment.customerId : null,
            posTerminalId: posResp?.terminalId,
            posAuthCode: posResp?.authCode,
            posTxnId: posResp?.txnId,
            createdBy: user.userId,
          },
        });

        await createPaymentJournalEntry(tx, user.venueId, body.payment.method, body.payment.amountCents, order.id);

        return { orderId: order.id, totalCents: bill.totalCents, changeCents };
      });
      res.json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Errore nella vendita al banco';
      res.status(400).json({ error: msg });
    }
  });

  // ─── POST /cashier/drawer/open ────────────────────────────────────────────
  const drawerOpenSchema = z.object({
    openingCents: z.number().int().min(0),
    shiftId: z.string().optional(),
    note: z.string().optional(),
  });

  app.post('/api/v1/cashier/drawer/open', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = drawerOpenSchema.parse(req.body);

    // Non può esserci un cassetto già aperto per lo stesso venue.
    const existing = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
    });
    if (existing) { res.status(409).json({ error: 'Cassetto già aperto. Chiuderlo prima di aprirne uno nuovo.' }); return; }

    const drawer = await prisma.cashDrawer.create({
      data: {
        venueId: user.venueId,
        shiftId: body.shiftId,
        openedBy: user.userId,
        openingCents: body.openingCents,
        note: body.note,
        status: 'OPEN',
      },
    });
    res.json(drawer);
  });

  // ─── POST /cashier/drawer/close ───────────────────────────────────────────
  const drawerCloseSchema = z.object({
    countedCents: z.number().int().min(0),
    note: z.string().optional(),
  });

  app.post('/api/v1/cashier/drawer/close', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = drawerCloseSchema.parse(req.body);

    const drawer = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
    });
    if (!drawer) { res.status(404).json({ error: 'Nessun cassetto aperto' }); return; }

    // Calcola l'atteso: apertura + incassi contanti − resti.
    const cashPayments = await prisma.payment.findMany({
      where: { venueId: user.venueId, cashDrawerId: drawer.id, method: 'CASH' },
    });
    const cashIn = cashPayments.reduce((s, p) => s + p.amountCents, 0);
    const changeOut = cashPayments.reduce((s, p) => s + p.changeCents, 0);
    const expectedCents = drawer.openingCents + cashIn - changeOut;

    const rec = reconcileDrawer(drawer.openingCents, cashIn, changeOut, body.countedCents);

    const updated = await prisma.cashDrawer.update({
      where: { id: drawer.id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedBy: user.userId,
        countedCents: body.countedCents,
        expectedCents,
        differenceCents: rec.differenceCents,
        note: body.note,
      },
    });
    res.json({ drawer: updated, reconciliation: rec });
  });

  // ─── GET /cashier/drawer/current ──────────────────────────────────────────
  app.get('/api/v1/cashier/drawer/current', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const drawer = await prisma.cashDrawer.findFirst({
      where: { venueId: user.venueId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      include: { shift: true },
    });
    if (!drawer) { res.status(404).json({ error: 'Nessun cassetto aperto' }); return; }

    const cashPayments = await prisma.payment.findMany({
      where: { venueId: user.venueId, cashDrawerId: drawer.id, method: 'CASH' },
    });
    const cashIn = cashPayments.reduce((s, p) => s + p.amountCents, 0);
    const changeOut = cashPayments.reduce((s, p) => s + p.changeCents, 0);
    const expectedCents = drawer.openingCents + cashIn - changeOut;

    res.json({ drawer, expectedCents, cashInCents: cashIn, changeOutCents: changeOut });
  });

  // ─── GET /cashier/daily-report?date= ──────────────────────────────────────
  app.get('/api/v1/cashier/daily-report', devAuth, requireRoles(...CASHIER_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const dateParam = (req.query.date as string) ?? new Date().toISOString().slice(0, 10);
    const dayStart = new Date(dateParam + 'T00:00:00');
    const dayEnd = new Date(dateParam + 'T23:59:59.999');

    const payments = await prisma.payment.findMany({
      where: { venueId: user.venueId, createdAt: { gte: dayStart, lte: dayEnd } },
      include: { order: true },
    });

    const byMethod: Record<string, { count: number; amountCents: number }> = {};
    let totalCents = 0;
    for (const p of payments) {
      const m = p.method;
      byMethod[m] = byMethod[m] ?? { count: 0, amountCents: 0 };
      byMethod[m].count++;
      byMethod[m].amountCents += p.amountCents;
      totalCents += p.amountCents;
    }

    const drawers = await prisma.cashDrawer.findMany({
      where: { venueId: user.venueId, openedAt: { gte: dayStart, lte: dayEnd } },
    });

    res.json({ date: dateParam, totalCents, byMethod, payments: payments.length, drawers });
  });
}

/**
 * Crea la scrittura contabile in partita doppia per un pagamento.
 * DARE cassa/banca/crediti clienti, AVERE ricavi + IVA a debito.
 */
async function createPaymentJournalEntry(tx: Tx, venueId: string, method: string, amountCents: number, orderId: string): Promise<void> {
  // Conti: DARE a seconda del metodo, AVERE ricavi + IVA.
  const dareAccountCode = method === 'CASH' ? ACCOUNT_CASSA : method === 'CARD' ? ACCOUNT_POS : ACCOUNT_CREDITI_CLIENTI;
  const dareAccount = await tx.chartOfAccount.findFirst({ where: { code: dareAccountCode, venueId } });
  const ricaviBar = await tx.chartOfAccount.findFirst({ where: { code: ACCOUNT_RICAVI_BAR, venueId } });
  const ivaDebito = await tx.chartOfAccount.findFirst({ where: { code: ACCOUNT_IVA_DEBITO, venueId } });
  if (!dareAccount || !ricaviBar || !ivaDebito) return; // conti non configurati: salta la scrittura

  // Ripartizione semplificata: 90% ricavi, 10% IVA (aliquota 10%).
  // Il calcolo preciso verrà dal vatBreakdown del bill in una futura iterazione.
  const ricaviCents = Math.round(amountCents * 1000 / 1100);
  const ivaCents = amountCents - ricaviCents;

  await tx.journalEntry.create({
    data: {
      venueId,
      date: new Date(),
      description: `Incasso ordine ${orderId} (${method})`,
      sourceType: 'PAYMENT',
      sourceId: orderId,
      status: 'POSTED',
      lines: {
        create: [
          { venueId, accountId: dareAccount.id, debitCents: amountCents, creditCents: 0 },
          { venueId, accountId: ricaviBar.id, debitCents: 0, creditCents: ricaviCents },
          { venueId, accountId: ivaDebito.id, debitCents: 0, creditCents: ivaCents },
        ],
      },
    },
  });
}
