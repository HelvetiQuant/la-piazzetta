/**
 * Servizio token di approvazione one-tap.
 *
 * - Token firmato HMAC-SHA256 (non JWT di sessione).
 * - Monouso: dopo l'uso, status=USED. Non riutilizzabile.
 * - TTL breve (default 24h). Scaduto → status=EXPIRED.
 * - Legato a venueId e targetId (azione specifica).
 */

import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';

const DEFAULT_TTL_HOURS = 24;

export interface CreateTokenInput {
  venueId: string;
  actionType: string; // APPROVE_PO | CONFIRM_SHIFT | ACK_NOTE
  targetId: string;   // purchaseOrder.id, scheduledShift.id, staffNote.id
  createdBy: string;
  ttlHours?: number;
}

export interface ValidateResult {
  ok: boolean;
  token?: { id: string; venueId: string; actionType: string; targetId: string };
  error?: string;
}

export class ApprovalTokenService {
  constructor(private prisma: PrismaClient, private secret: string) {}

  /** Crea un token firmato monouso per un'azione specifica. */
  async create(input: CreateTokenInput): Promise<{ token: string; expiresAt: Date }> {
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (input.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000);
    const payload = `${id}:${input.venueId}:${input.actionType}:${input.targetId}`;
    const signature = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    const token = `${id}.${signature}`;

    await this.prisma.approvalToken.create({
      data: {
        id,
        venueId: input.venueId,
        actionType: input.actionType,
        targetId: input.targetId,
        token,
        createdBy: input.createdBy,
        expiresAt,
        status: 'PENDING',
      },
    });

    return { token, expiresAt };
  }

  /** Valida un token: verifica firma, scadenza, stato. Non lo consuma. */
  async validate(token: string): Promise<ValidateResult> {
    const [id, signature] = token.split('.');
    if (!id || !signature) return { ok: false, error: 'Token malformato' };

    const record = await this.prisma.approvalToken.findUnique({ where: { token } });
    if (!record) return { ok: false, error: 'Token non trovato' };
    if (record.status === 'USED') return { ok: false, error: 'Token già utilizzato' };
    if (record.expiresAt < new Date()) {
      await this.prisma.approvalToken.update({ where: { id: record.id }, data: { status: 'EXPIRED' } });
      return { ok: false, error: 'Token scaduto' };
    }

    // Verifica firma
    const payload = `${record.id}:${record.venueId}:${record.actionType}:${record.targetId}`;
    const expectedSig = crypto.createHmac('sha256', this.secret).update(payload).digest('hex');
    if (signature !== expectedSig) return { ok: false, error: 'Firma non valida' };

    return { ok: true, token: { id: record.id, venueId: record.venueId, actionType: record.actionType, targetId: record.targetId } };
  }

  /** Consuma il token (monouso) e lo marca come USED. */
  async consume(token: string, usedBy: string): Promise<ValidateResult> {
    const validation = await this.validate(token);
    if (!validation.ok || !validation.token) return validation;

    await this.prisma.approvalToken.update({
      where: { id: validation.token.id },
      data: { status: 'USED', usedAt: new Date(), usedBy },
    });

    return validation;
  }
}
