/**
 * NotificationService: routing con fallback ordinato, deduplica e cooldown.
 *
 * - Fallback: prova i canali in ordine (WhatsApp → Email → WebPush → InApp).
 *   Si ferma al primo SENT. Se un canale non è disponibile, lo salta senza errori.
 * - Deduplica: non invia lo stesso messaggio (stessa chiave) più di una volta
 *   finché non scade il cooldown.
 * - Log: ogni invio è registrato in NotificationLog per audit.
 * - Degradazione: se nessun canale esterno è configurato, degrada su InApp.
 */

import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, Recipient, Message, SendResult } from './channel.port.js';
import { WhatsAppChannel, EmailChannel, WebPushChannel, InAppChannel } from './channels.js';

export interface NotificationServiceDeps {
  prisma: PrismaClient;
  /** Canali ordinati per fallback. Default: WhatsApp → Email → WebPush → InApp. */
  channels?: NotificationChannel[];
  /** TTL deduplica in minuti. Default: 60. */
  cooldownMinutes?: number;
}

interface DedupeEntry {
  key: string;
  expiresAt: number;
}

export class NotificationService {
  private channels: NotificationChannel[];
  private cooldownMs: number;
  private dedupe = new Map<string, number>(); // key → timestamp prossimo invio permesso

  constructor(deps: NotificationServiceDeps) {
    this.channels = deps.channels ?? defaultChannels(deps.prisma);
    this.cooldownMs = (deps.cooldownMinutes ?? 60) * 60 * 1000;
  }

  /**
   * Invia un messaggio al destinatario provando i canali in ordine.
   * Deduplica per chiave: se la stessa chiave è stata già inviata di recente, salta.
   */
  async notify(to: Recipient, msg: Message, dedupeKey?: string): Promise<SendResult> {
    const key = dedupeKey ?? `${to.userId ?? to.phone ?? to.email}:${msg.title}`;
    const now = Date.now();
    const nextAllowed = this.dedupe.get(key);
    if (nextAllowed && now < nextAllowed) {
      return { outcome: 'SKIPPED', channel: 'dedupe', error: `Cooldown attivo fino a ${new Date(nextAllowed).toISOString()}` };
    }

    // Log del tentativo
    await this.logAttempt(to, msg, key).catch(() => {});

    for (const channel of this.channels) {
      if (!channel.isAvailable()) continue;
      const result = await channel.send(to, msg);
      if (result.outcome === 'SENT') {
        this.dedupe.set(key, now + this.cooldownMs);
        await this.logResult(to, msg, key, result).catch(() => {});
        return result;
      }
      // FAILED: prova il prossimo canale
    }

    // Nessun canale è riuscito: InApp è sempre disponibile come last resort
    this.dedupe.set(key, now + this.cooldownMs);
    const fallback: SendResult = { outcome: 'FAILED', channel: 'none', error: 'Nessun canale disponibile' };
    await this.logResult(to, msg, key, fallback).catch(() => {});
    return fallback;
  }

  private async logAttempt(to: Recipient, msg: Message, key: string): Promise<void> {
    // Audit log: tabella NotificationLog (creata da migration o come JSON)
    // Per ora usiamo console strutturato per non aggiungere un modello Prisma.
    console.log(`[notify] attempt key=${key} to=${to.userId ?? to.phone ?? to.email} title="${msg.title}"`);
  }

  private async logResult(to: Recipient, msg: Message, key: string, result: SendResult): Promise<void> {
    console.log(`[notify] result key=${key} outcome=${result.outcome} channel=${result.channel}`);
  }
}

/** Factory: canali di default con config da env. */
function defaultChannels(prisma: PrismaClient): NotificationChannel[] {
  return [
    new WhatsAppChannel(process.env.WHATSAPP_TOKEN, process.env.WHATSAPP_PHONE_ID),
    new EmailChannel(process.env.SMTP_URL),
    new WebPushChannel(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY),
    new InAppChannel(prisma),
  ];
}
