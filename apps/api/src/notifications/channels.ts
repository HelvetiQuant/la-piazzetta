/**
 * Driver canali di notifica concreti.
 *
 * - WhatsAppChannel: riusa publishToWhatsApp di marketing.service.ts (no duplicazione).
 * - EmailChannel: SMTP via nodemailer (lazy import, degrada se non configurato).
 * - WebPushChannel: VAPID via web-push (lazy import, degrada se non configurato).
 * - InAppChannel: crea uno StaffNote con ack obbligatorio (riusa il modello esistente).
 */

import type { PrismaClient } from '@prisma/client';
import type { NotificationChannel, Recipient, Message, SendResult } from './channel.port.js';
import { publishToWhatsApp } from '../marketing/marketing.service.js';

// ─── WhatsApp ─────────────────────────────────────────────────────────────
export class WhatsAppChannel implements NotificationChannel {
  readonly name = 'whatsapp';
  constructor(
    private token: string | undefined,
    private phoneId: string | undefined,
  ) {}

  isAvailable(): boolean {
    return !!(this.token && this.phoneId);
  }

  async send(to: Recipient, msg: Message): Promise<SendResult> {
    if (!this.isAvailable() || !to.phone) return { outcome: 'SKIPPED', channel: this.name };
    const text = msg.actionUrl ? `${msg.title}\n${msg.body}\n${msg.actionUrl}` : `${msg.title}\n${msg.body}`;
    const result = await publishToWhatsApp({
      token: this.token!,
      phoneId: this.phoneId!,
      to: to.phone,
      message: text,
    });
    if (!result) return { outcome: 'FAILED', channel: this.name, error: 'WhatsApp API error' };
    return { outcome: 'SENT', channel: this.name, externalId: result.waMessageId };
  }
}

// ─── Email (SMTP via nodemailer, lazy import) ──────────────────────────────
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  constructor(
    private smtpUrl: string | undefined,
  ) {}

  isAvailable(): boolean {
    return !!this.smtpUrl;
  }

  async send(to: Recipient, msg: Message): Promise<SendResult> {
    if (!this.isAvailable() || !to.email) return { outcome: 'SKIPPED', channel: this.name };
    try {
      // Dynamic import con fallback: se il pacchetto non è installato, degrada.
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      const nodemailer: any = await dynamicImport('nodemailer').catch(() => null);
      if (!nodemailer) return { outcome: 'FAILED', channel: this.name, error: 'nodemailer non installato' };
      const transporter = nodemailer.createTransport(this.smtpUrl);
      const info = await transporter.sendMail({
        from: 'La Piazzetta <noreply@lapiazzetta.local>',
        to: to.email,
        subject: msg.title,
        text: msg.actionUrl ? `${msg.body}\n\nLink: ${msg.actionUrl}` : msg.body,
      });
      return { outcome: 'SENT', channel: this.name, externalId: info.messageId };
    } catch (e) {
      return { outcome: 'FAILED', channel: this.name, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── WebPush (VAPID via web-push, lazy import) ─────────────────────────────
export class WebPushChannel implements NotificationChannel {
  readonly name = 'webpush';
  constructor(
    private vapidSubject: string | undefined,
    private vapidPublicKey: string | undefined,
    private vapidPrivateKey: string | undefined,
  ) {}

  isAvailable(): boolean {
    return !!(this.vapidSubject && this.vapidPublicKey && this.vapidPrivateKey);
  }

  async send(to: Recipient, msg: Message): Promise<SendResult> {
    if (!this.isAvailable() || !to.pushEndpoint) return { outcome: 'SKIPPED', channel: this.name };
    try {
      const dynamicImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>;
      const webpush: any = await dynamicImport('web-push').catch(() => null);
      if (!webpush) return { outcome: 'FAILED', channel: this.name, error: 'web-push non installato' };
      webpush.setVapidDetails(this.vapidSubject!, this.vapidPublicKey!, this.vapidPrivateKey!);
      const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.actionUrl });
      const result = await webpush.sendNotification({ endpoint: to.pushEndpoint }, payload);
      return { outcome: 'SENT', channel: this.name, externalId: result.headers.location };
    } catch (e) {
      return { outcome: 'FAILED', channel: this.name, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// ─── InApp (StaffNote con ack obbligatorio) ────────────────────────────────
export class InAppChannel implements NotificationChannel {
  readonly name = 'inapp';
  constructor(private prisma: PrismaClient) {}

  isAvailable(): boolean {
    return true; // sempre disponibile, non ha dipendenze esterne
  }

  async send(to: Recipient, msg: Message): Promise<SendResult> {
    if (!to.userId) return { outcome: 'SKIPPED', channel: this.name };
    try {
      const note = await this.prisma.staffNote.create({
        data: {
          venueId: '', // valorizzato dal chiamante via NotificationService
          senderId: 'system', // messaggio di sistema
          targetScope: 'USER',
          targetValue: to.userId,
          type: msg.severity === 'urgent' ? 'ALERT' : 'NOTE',
          priority: msg.severity === 'urgent' ? 1 : msg.severity === 'warning' ? 2 : 3,
          title: msg.title,
          body: msg.actionUrl ? `${msg.body}\n\nLink: ${msg.actionUrl}` : msg.body,
          requiresAck: true,
          status: 'ACTIVE',
        },
      });
      return { outcome: 'SENT', channel: this.name, externalId: note.id };
    } catch (e) {
      return { outcome: 'FAILED', channel: this.name, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
