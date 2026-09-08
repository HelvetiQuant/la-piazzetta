/**
 * Rotte Contabilità italiana: piano conti, fatture fornitori, registrazioni,
 * liquidazione IVA, conto economico, bilancio patrimoniale, export commercialista.
 *
 * Piano dei conti:
 *  GET    /api/v1/accounting/accounts              → lista conti
 *  POST   /api/v1/accounting/accounts/seed         → inizializza piano conti italiano
 *  POST   /api/v1/accounting/accounts              → crea conto
 *  PATCH  /api/v1/accounting/accounts/:id          → modifica conto
 *
 * Fatture fornitori:
 *  GET    /api/v1/accounting/invoices?status=&from=&to= → lista fatture
 *  POST   /api/v1/accounting/invoices              → registra fattura (con upload)
 *  POST   /api/v1/accounting/invoices/:id/record   → contabilizza fattura → journal entry
 *  POST   /api/v1/accounting/invoices/:id/pay      → segna come pagata
 *  GET    /api/v1/accounting/invoices/:id/file     → download file fattura
 *  DELETE /api/v1/accounting/invoices/:id          → elimina fattura
 *
 * Registrazioni (journal entries):
 *  GET    /api/v1/accounting/journal?from=&to=     → lista registrazioni
 *  POST   /api/v1/accounting/journal               → crea registrazione manuale
 *  PATCH  /api/v1/accounting/journal/:id/post      → registra (POST)
 *  DELETE /api/v1/accounting/journal/:id           → elimina (solo DRAFT)
 *
 * Liquidazione IVA:
 *  GET    /api/v1/accounting/vat-returns            → lista liquidazioni
 *  POST   /api/v1/accounting/vat-returns/calculate  → calcola IVA periodo
 *  PATCH  /api/v1/accounting/vat-returns/:id/file   → segna come presentata
 *
 * Report:
 *  GET    /api/v1/accounting/income-statement?from=&to=  → conto economico
 *  GET    /api/v1/accounting/balance-sheet?date=         → bilancio patrimoniale
 *  GET    /api/v1/accounting/trial-balance?date=         → bilancio di verifica
 *  GET    /api/v1/accounting/export?format=json|csv      → export per commercialista
 */

import type { Express, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { currentUser, type RouteDeps } from '../http.js';
import { ITALIAN_CHART_OF_ACCOUNTS } from './chart-of-accounts.js';
import path from 'path';
import fs from 'fs';

const ACCT_ROLES = ['OWNER', 'MANAGER'];

export function registerAccountingRoutes(app: Express, prisma: PrismaClient, deps: RouteDeps): void {
  const { devAuth, requireRoles } = deps;
  const invoicesDir = path.join(process.cwd(), 'invoices');
  if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });

  // ============ PIANO DEI CONTI ============
  app.get('/api/v1/accounting/accounts', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const accounts = await prisma.chartOfAccount.findMany({
      where: { venueId: user.venueId },
      orderBy: { code: 'asc' },
    });
    res.json(accounts);
  });

  app.post('/api/v1/accounting/accounts/seed', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const existing = await prisma.chartOfAccount.count({ where: { venueId: user.venueId } });
    if (existing > 0) {
      res.json({ seeded: false, count: existing, message: 'Piano conti già esistente' });
      return;
    }
    const created = await prisma.$transaction(
      ITALIAN_CHART_OF_ACCOUNTS.map(a =>
        prisma.chartOfAccount.create({
          data: {
            venueId: user.venueId,
            code: a.code,
            name: a.name,
            category: a.category,
            subcategory: a.subcategory,
            vatRate: a.vatRate ?? null,
            deductible: a.deductible ?? true,
          },
        })
      )
    );
    res.json({ seeded: true, count: created.length });
  });

  const accountSchema = z.object({
    code: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['ATTIVO', 'PASSIVO', 'COSTO', 'RICAVO', 'CONTRO']),
    subcategory: z.string().optional(),
    vatRate: z.number().optional(),
    deductible: z.boolean().default(true),
  });

  app.post('/api/v1/accounting/accounts', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = accountSchema.parse(req.body);
    const account = await prisma.chartOfAccount.create({
      data: { venueId: user.venueId, ...body, vatRate: body.vatRate ?? null },
    });
    res.status(201).json(account);
  });

  app.patch('/api/v1/accounting/accounts/:id', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const account = await prisma.chartOfAccount.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!account) { res.status(404).json({ error: 'Conto non trovato' }); return; }
    const body = req.body as Record<string, unknown>;
    const updated = await prisma.chartOfAccount.update({
      where: { id: account.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.subcategory !== undefined ? { subcategory: body.subcategory } : {}),
        ...(body.vatRate !== undefined ? { vatRate: body.vatRate } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      } as any,
    });
    res.json(updated);
  });

  // ============ FATTURE FORNITORI ============
  const invoiceQuerySchema = z.object({
    status: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  });

  app.get('/api/v1/accounting/invoices', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = invoiceQuerySchema.parse(req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 90 * 86400000);
    const invoices = await prisma.supplierInvoice.findMany({
      where: {
        venueId: user.venueId,
        ...(q.status ? { status: q.status } : {}),
        invoiceDate: { gte: from, lte: to },
      },
      orderBy: { invoiceDate: 'desc' },
    });
    res.json(invoices);
  });

  const invoiceSchema = z.object({
    supplierId: z.string().optional(),
    supplierName: z.string().min(1),
    supplierVat: z.string().optional(),
    invoiceNumber: z.string().min(1),
    invoiceDate: z.string(),
    dueDate: z.string().optional(),
    description: z.string().optional(),
    netAmountCents: z.number().int(),
    vatRate: z.number().default(22),
    withholdingRate: z.number().default(0),
    filePath: z.string().optional(),
    fileMimeType: z.string().optional(),
    note: z.string().optional(),
  });

  app.post('/api/v1/accounting/invoices', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = invoiceSchema.parse(req.body);
    const vatAmountCents = Math.round(body.netAmountCents * body.vatRate / 100);
    const withholdingCents = Math.round(body.netAmountCents * body.withholdingRate / 100);
    const totalAmountCents = body.netAmountCents + vatAmountCents;

    const invoice = await prisma.supplierInvoice.create({
      data: {
        venueId: user.venueId,
        supplierId: body.supplierId,
        supplierName: body.supplierName,
        supplierVat: body.supplierVat,
        invoiceNumber: body.invoiceNumber,
        invoiceDate: new Date(body.invoiceDate),
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        description: body.description,
        netAmountCents: body.netAmountCents,
        vatRate: body.vatRate,
        vatAmountCents,
        withholdingRate: body.withholdingRate,
        withholdingCents,
        totalAmountCents,
        filePath: body.filePath,
        fileMimeType: body.fileMimeType,
        note: body.note,
        status: 'RECEIVED',
      },
    });
    res.status(201).json(invoice);
  });

  // Upload file fattura (base64)
  app.post('/api/v1/accounting/invoices/:id/upload', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!invoice) { res.status(404).json({ error: 'Fattura non trovata' }); return; }
    const { base64, mimeType, filename } = req.body as { base64: string; mimeType: string; filename: string };
    if (!base64) { res.status(400).json({ error: 'Manca base64' }); return; }
    const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
    const fname = `invoice-${invoice.id}-${Date.now()}.${ext}`;
    const fpath = path.join(invoicesDir, fname);
    fs.writeFileSync(fpath, Buffer.from(base64.split(',').pop() ?? base64, 'base64'));
    const updated = await prisma.supplierInvoice.update({
      where: { id: invoice.id },
      data: { filePath: `/invoices/${fname}`, fileMimeType: mimeType },
    });
    res.json(updated);
  });

  // Download file fattura
  app.get('/api/v1/accounting/invoices/:id/file', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!invoice?.filePath) { res.status(404).json({ error: 'File non trovato' }); return; }
    const fp = path.join(invoicesDir, path.basename(invoice.filePath));
    if (fs.existsSync(fp)) res.sendFile(fp);
    else res.status(404).json({ error: 'File non trovato su disco' });
  });

  // Servi file fatture staticamente
  app.use('/invoices', (req: Request, res: Response) => {
    const filename = path.basename(req.path);
    const fp = path.join(invoicesDir, filename);
    if (fs.existsSync(fp)) res.sendFile(fp);
    else res.status(404).send('Not found');
  });

  // Contabilizza fattura → journal entry (partita doppia)
  app.post('/api/v1/accounting/invoices/:id/record', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!invoice) { res.status(404).json({ error: 'Fattura non trovata' }); return; }
    if (invoice.status === 'RECORDED') { res.status(400).json({ error: 'Fattura già contabilizzata' }); return; }

    const { expenseAccountId, vatAccountId, supplierAccountId } = req.body as { expenseAccountId: string; vatAccountId: string; supplierAccountId: string };
    if (!expenseAccountId || !vatAccountId || !supplierAccountId) {
      res.status(400).json({ error: 'Servono expenseAccountId, vatAccountId, supplierAccountId' });
      return;
    }

    // Verifica conti
    const [expenseAcc, vatAcc, supplierAcc] = await Promise.all([
      prisma.chartOfAccount.findFirst({ where: { id: expenseAccountId, venueId: user.venueId } }),
      prisma.chartOfAccount.findFirst({ where: { id: vatAccountId, venueId: user.venueId } }),
      prisma.chartOfAccount.findFirst({ where: { id: supplierAccountId, venueId: user.venueId } }),
    ]);
    if (!expenseAcc || !vatAcc || !supplierAcc) { res.status(400).json({ error: 'Conto non valido' }); return; }

    // Journal entry: DARE costo + DARE IVA a credito / AVERE fornitore
    const entry = await prisma.journalEntry.create({
      data: {
        venueId: user.venueId,
        date: invoice.invoiceDate,
        description: `Fattura ${invoice.supplierName} n. ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        sourceType: 'SUPPLIER_INVOICE',
        sourceId: invoice.id,
        status: 'POSTED',
        lines: {
          create: [
            { venueId: user.venueId, accountId: expenseAccountId, debitCents: invoice.netAmountCents, creditCents: 0, description: 'Costo' },
            { venueId: user.venueId, accountId: vatAccountId, debitCents: invoice.vatAmountCents, creditCents: 0, description: `IVA ${invoice.vatRate}%` },
            { venueId: user.venueId, accountId: supplierAccountId, debitCents: 0, creditCents: invoice.totalAmountCents, description: 'Fornitore' },
          ],
        },
      },
      include: { lines: true },
    });

    await prisma.supplierInvoice.update({
      where: { id: invoice.id },
      data: { status: 'RECORDED', recordedAt: new Date() },
    });

    res.json({ entry, invoice: { ...invoice, status: 'RECORDED', recordedAt: new Date() } });
  });

  // Segna fattura come pagata
  app.post('/api/v1/accounting/invoices/:id/pay', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!invoice) { res.status(404).json({ error: 'Fattura non trovata' }); return; }
    const { paymentMethod, bankAccountId } = req.body as { paymentMethod: string; bankAccountId: string };

    // Journal entry pagamento: DARE fornitore / AVERE banca/cassa
    if (bankAccountId) {
      const supplierAcc = await prisma.chartOfAccount.findFirst({ where: { code: '7.01', venueId: user.venueId } });
      if (supplierAcc) {
        await prisma.journalEntry.create({
          data: {
            venueId: user.venueId,
            date: new Date(),
            description: `Pagamento fattura ${invoice.supplierName} n. ${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            sourceType: 'PAYMENT',
            sourceId: invoice.id,
            status: 'POSTED',
            lines: {
              create: [
                { venueId: user.venueId, accountId: supplierAcc.id, debitCents: invoice.totalAmountCents, creditCents: 0 },
                { venueId: user.venueId, accountId: bankAccountId, debitCents: 0, creditCents: invoice.totalAmountCents },
              ],
            },
          },
        });
      }
    }

    const updated = await prisma.supplierInvoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidAt: new Date(), paymentMethod: paymentMethod ?? 'BONIFICO' },
    });
    res.json(updated);
  });

  app.delete('/api/v1/accounting/invoices/:id', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const invoice = await prisma.supplierInvoice.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!invoice) { res.status(404).json({ error: 'Fattura non trovata' }); return; }
    if (invoice.status === 'RECORDED') { res.status(400).json({ error: 'Fattura contabilizzata, non eliminabile' }); return; }
    if (invoice.filePath) {
      const fp = path.join(invoicesDir, path.basename(invoice.filePath));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await prisma.supplierInvoice.delete({ where: { id: invoice.id } });
    res.json({ ok: true });
  });

  // ============ JOURNAL ENTRIES ============
  app.get('/api/v1/accounting/journal', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const from = req.query.from ? new Date(req.query.from as string) : new Date(Date.now() - 90 * 86400000);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const entries = await prisma.journalEntry.findMany({
      where: { venueId: user.venueId, date: { gte: from, lte: to } },
      include: { lines: { include: { account: true } } },
      orderBy: { date: 'desc' },
      take: 200,
    });
    res.json(entries);
  });

  const journalSchema = z.object({
    date: z.string(),
    description: z.string().min(1),
    reference: z.string().optional(),
    lines: z.array(z.object({
      accountId: z.string().min(1),
      debitCents: z.number().int().min(0).default(0),
      creditCents: z.number().int().min(0).default(0),
      description: z.string().optional(),
    })).min(2),
  }).refine(data => {
    const totalDebit = data.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredit = data.lines.reduce((s, l) => s + l.creditCents, 0);
    return totalDebit === totalCredit;
  }, { message: 'Totale dare deve essere uguale a totale avere (partita doppia)' });

  app.post('/api/v1/accounting/journal', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = journalSchema.parse(req.body);
    const entry = await prisma.journalEntry.create({
      data: {
        venueId: user.venueId,
        date: new Date(body.date),
        description: body.description,
        reference: body.reference,
        sourceType: 'MANUAL',
        status: 'POSTED',
        lines: {
          create: body.lines.map(l => ({
            venueId: user.venueId,
            accountId: l.accountId,
            debitCents: l.debitCents,
            creditCents: l.creditCents,
            description: l.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
    res.status(201).json(entry);
  });

  app.delete('/api/v1/accounting/journal/:id', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const entry = await prisma.journalEntry.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!entry) { res.status(404).json({ error: 'Registrazione non trovata' }); return; }
    if (entry.status === 'POSTED' && entry.sourceType !== 'MANUAL') {
      res.status(400).json({ error: 'Registrazione di sistema, non eliminabile' });
      return;
    }
    await prisma.journalEntry.delete({ where: { id: entry.id } });
    res.json({ ok: true });
  });

  // ============ LIQUIDAZIONE IVA ============
  app.get('/api/v1/accounting/vat-returns', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const returns = await prisma.vatReturn.findMany({
      where: { venueId: user.venueId },
      orderBy: { period: 'desc' },
    });
    res.json(returns);
  });

  const vatCalcSchema = z.object({
    period: z.string().min(1), // "2026-08"
    periodType: z.enum(['MONTHLY', 'QUARTERLY']).default('MONTHLY'),
  });

  app.post('/api/v1/accounting/vat-returns/calculate', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = vatCalcSchema.parse(req.body);

    // Calcola periodo
    const [year, monthOrQ] = body.period.split('-');
    let from: Date, to: Date;
    if (body.periodType === 'MONTHLY') {
      from = new Date(Number(year), Number(monthOrQ) - 1, 1);
      to = new Date(Number(year), Number(monthOrQ), 0, 23, 59, 59);
    } else {
      const q = Number(monthOrQ.replace('T', ''));
      from = new Date(Number(year), (q - 1) * 3, 1);
      to = new Date(Number(year), q * 3, 0, 23, 59, 59);
    }

    // IVA a debito: ricavi (vendite) nel periodo
    const salesEntries = await prisma.journalEntry.findMany({
      where: {
        venueId: user.venueId,
        date: { gte: from, lte: to },
        status: 'POSTED',
        lines: { some: { account: { category: 'RICAVO' } } },
      },
      include: { lines: { include: { account: true } } },
    });
    let vatCollected = 0;
    for (const e of salesEntries) {
      for (const l of e.lines) {
        if (l.account.category === 'RICAVO' && l.creditCents > 0 && l.account.vatRate) {
          vatCollected += Math.round(l.creditCents * l.account.vatRate / 100);
        }
      }
    }

    // IVA a credito: acquisti nel periodo (dalle fatture fornitori registrate)
    const invoices = await prisma.supplierInvoice.findMany({
      where: { venueId: user.venueId, status: { in: ['RECORDED', 'PAID'] }, invoiceDate: { gte: from, lte: to } },
    });
    const vatPaid = invoices.reduce((s, i) => s + i.vatAmountCents, 0);

    const vatDue = vatCollected - vatPaid;

    const vatReturn = await prisma.vatReturn.upsert({
      where: { venueId_period: { venueId: user.venueId, period: body.period } },
      create: {
        venueId: user.venueId,
        period: body.period,
        periodType: body.periodType,
        vatCollectedCents: vatCollected,
        vatPaidCents: vatPaid,
        vatDueCents: vatDue,
      },
      update: {
        vatCollectedCents: vatCollected,
        vatPaidCents: vatPaid,
        vatDueCents: vatDue,
      },
    });
    res.json(vatReturn);
  });

  app.patch('/api/v1/accounting/vat-returns/:id/file', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const vr = await prisma.vatReturn.findFirst({ where: { id: req.params.id, venueId: user.venueId } });
    if (!vr) { res.status(404).json({ error: 'Liquidazione non trovata' }); return; }
    const updated = await prisma.vatReturn.update({
      where: { id: vr.id },
      data: { status: 'FILED', filedAt: new Date() },
    });
    res.json(updated);
  });

  // ============ REPORT: CONTO ECONOMICO ============
  app.get('/api/v1/accounting/income-statement', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), 0, 1);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();

    const lines = await prisma.journalLine.findMany({
      where: {
        venueId: user.venueId,
        journalEntry: { date: { gte: from, lte: to }, status: 'POSTED' },
        account: { category: { in: ['COSTO', 'RICAVO'] } },
      },
      include: { account: true },
    });

    // Aggrega per conto
    const byAccount = new Map<string, { code: string; name: string; category: string; subcategory: string; debit: number; credit: number }>();
    for (const l of lines) {
      const key = l.accountId;
      const existing = byAccount.get(key) ?? { code: l.account.code, name: l.account.name, category: l.account.category, subcategory: l.account.subcategory ?? '', debit: 0, credit: 0 };
      existing.debit += l.debitCents;
      existing.credit += l.creditCents;
      byAccount.set(key, existing);
    }

    // Ricavi = credit sui conti RICAVO
    const revenues = Array.from(byAccount.values()).filter(a => a.category === 'RICAVO').map(a => ({ ...a, amount: a.credit - a.debit }));
    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);

    // Costi = debit sui conti COSTO
    const costs = Array.from(byAccount.values()).filter(a => a.category === 'COSTO').map(a => ({ ...a, amount: a.debit - a.credit }));
    const totalCost = costs.reduce((s, c) => s + c.amount, 0);

    // Raggruppa per subcategory
    const revenuesBySub = groupBySubcategory(revenues);
    const costsBySub = groupBySubcategory(costs);

    const ebitda = totalRevenue - totalCost;
    // Ammortamenti separati
    const amortization = costs.filter(c => c.subcategory === 'Ammortamenti').reduce((s, c) => s + c.amount, 0);
    const ebit = ebitda; // semplificato (ammortamenti già nei costi)
    const financialCosts = costs.filter(c => c.subcategory === 'Oneri finanziari').reduce((s, c) => s + c.amount, 0);
    const financialIncome = revenues.filter(r => r.subcategory === 'Proventi finanziari').reduce((s, r) => s + r.amount, 0);
    const taxes = costs.filter(c => c.subcategory === 'Imposte').reduce((s, c) => s + c.amount, 0);
    const netIncome = ebit - financialCosts + financialIncome - taxes;

    res.json({
      range: { from: from.toISOString(), to: to.toISOString() },
      revenues: revenuesBySub,
      totalRevenue,
      costs: costsBySub,
      totalCost,
      ebitda,
      ebit,
      financialIncome,
      financialCosts,
      taxes,
      netIncome,
    });
  });

  // ============ REPORT: BILANCIO PATRIMONIALE ============
  app.get('/api/v1/accounting/balance-sheet', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    const lines = await prisma.journalLine.findMany({
      where: {
        venueId: user.venueId,
        journalEntry: { date: { lte: date }, status: 'POSTED' },
        account: { category: { in: ['ATTIVO', 'PASSIVO'] } },
      },
      include: { account: true },
    });

    const byAccount = new Map<string, { code: string; name: string; category: string; subcategory: string; debit: number; credit: number }>();
    for (const l of lines) {
      const key = l.accountId;
      const existing = byAccount.get(key) ?? { code: l.account.code, name: l.account.name, category: l.account.category, subcategory: l.account.subcategory ?? '', debit: 0, credit: 0 };
      existing.debit += l.debitCents;
      existing.credit += l.creditCents;
      byAccount.set(key, existing);
    }

    // Attivo = debit - credit (saldo dare)
    const assets = Array.from(byAccount.values()).filter(a => a.category === 'ATTIVO').map(a => ({ ...a, amount: a.debit - a.credit }));
    const totalAssets = assets.reduce((s, a) => s + a.amount, 0);

    // Passivo = credit - debit (saldo avere)
    const liabilities = Array.from(byAccount.values()).filter(a => a.category === 'PASSIVO').map(a => ({ ...a, amount: a.credit - a.debit }));
    const totalLiabilities = liabilities.reduce((s, l) => s + l.amount, 0);

    const assetsBySub = groupBySubcategory(assets);
    const liabilitiesBySub = groupBySubcategory(liabilities);

    res.json({
      date: date.toISOString(),
      assets: assetsBySub,
      totalAssets,
      liabilities: liabilitiesBySub,
      totalLiabilities,
      netEquity: totalAssets - totalLiabilities,
    });
  });

  // ============ REPORT: BILANCIO DI VERIFICA ============
  app.get('/api/v1/accounting/trial-balance', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    const lines = await prisma.journalLine.findMany({
      where: {
        venueId: user.venueId,
        journalEntry: { date: { lte: date }, status: 'POSTED' },
      },
      include: { account: true },
    });

    const byAccount = new Map<string, { code: string; name: string; category: string; debit: number; credit: number }>();
    for (const l of lines) {
      const key = l.accountId;
      const existing = byAccount.get(key) ?? { code: l.account.code, name: l.account.name, category: l.account.category, debit: 0, credit: 0 };
      existing.debit += l.debitCents;
      existing.credit += l.creditCents;
      byAccount.set(key, existing);
    }

    const accounts = Array.from(byAccount.values()).sort((a, b) => a.code.localeCompare(b.code));
    const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
    const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

    res.json({ date: date.toISOString(), accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit });
  });

  // ============ EXPORT PER COMMERCIALISTA ============
  app.get('/api/v1/accounting/export', devAuth, requireRoles(...ACCT_ROLES), async (req: Request, res: Response) => {
    const user = currentUser(req);
    const from = req.query.from ? new Date(req.query.from as string) : new Date(new Date().getFullYear(), 0, 1);
    const to = req.query.to ? new Date(req.query.to as string) : new Date();
    const format = (req.query.format as string) ?? 'json';

    const [entries, invoices, vatReturns, accounts] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { venueId: user.venueId, date: { gte: from, lte: to }, status: 'POSTED' },
        include: { lines: { include: { account: { select: { code: true, name: true, category: true } } } } },
        orderBy: { date: 'asc' },
      }),
      prisma.supplierInvoice.findMany({
        where: { venueId: user.venueId, invoiceDate: { gte: from, lte: to } },
        orderBy: { invoiceDate: 'asc' },
      }),
      prisma.vatReturn.findMany({
        where: { venueId: user.venueId },
        orderBy: { period: 'desc' },
      }),
      prisma.chartOfAccount.findMany({
        where: { venueId: user.venueId },
        orderBy: { code: 'asc' },
      }),
    ]);

    const venue = await prisma.venue.findUnique({ where: { id: user.venueId } });

    const exportData = {
      venue: { name: venue?.name, id: venue?.id },
      period: { from: from.toISOString(), to: to.toISOString() },
      generatedAt: new Date().toISOString(),
      chartOfAccounts: accounts,
      journalEntries: entries.map(e => ({
        id: e.id, date: e.date, description: e.description, reference: e.reference,
        sourceType: e.sourceType, status: e.status,
        lines: e.lines.map(l => ({
          accountCode: l.account.code, accountName: l.account.name,
          debitCents: l.debitCents, creditCents: l.creditCents,
        })),
      })),
      supplierInvoices: invoices,
      vatReturns,
      summary: {
        totalEntries: entries.length,
        totalInvoices: invoices.length,
        totalDebit: entries.flatMap(e => e.lines).reduce((s, l) => s + l.debitCents, 0),
        totalCredit: entries.flatMap(e => e.lines).reduce((s, l) => s + l.creditCents, 0),
      },
    };

    if (format === 'csv') {
      // CSV: registrazioni in formato flat
      const rows = ['Data,Descrizione,Riferimento,Conto,Dare,Avere'];
      for (const e of entries) {
        for (const l of e.lines) {
          rows.push(`${e.date.toISOString().slice(0, 10)},"${e.description}","${e.reference ?? ''}","${l.account.code} ${l.account.name}",${l.debitCents / 100},${l.creditCents / 100}`);
        }
      }
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="contabilita-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`);
      res.send(rows.join('\n'));
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="contabilita-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.json"`);
      res.json(exportData);
    }
  });
}

function groupBySubcategory(items: Array<{ subcategory: string; amount: number; code: string; name: string }>): Array<{ subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }> {
  const map = new Map<string, { subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }>();
  for (const item of items) {
    const sub = item.subcategory || 'Altro';
    const existing = map.get(sub) ?? { subcategory: sub, total: 0, items: [] };
    existing.total += item.amount;
    existing.items.push({ code: item.code, name: item.name, amount: item.amount });
    map.set(sub, existing);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
