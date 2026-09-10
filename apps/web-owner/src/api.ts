// Client API della dashboard proprietario. Stessa interfaccia di prima
// (api.*, inv.*, fmtSec, fmtEuro) ma ora sopra il fetch autenticato JWT reale
// (vedi lib/client.ts) invece degli header dev-auth statici.
import { apiFetch } from '@la-piazzetta/api-client';

function req<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init);
}

// ---- Tipi ----
export type Station = 'BAR' | 'TAVOLA_CALDA';

// ---- Prodotti / Menu ----
export interface Product {
  id: string;
  venueId: string;
  code: string;
  name: string;
  category: string;
  priceCents: number;
  unit: string;
  stock?: { quantity: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoardItem {
  id: string;
  name: string;
  quantity: number;
  station: Station;
  status: string;
}
export interface BoardOrder {
  id: string;
  table: string;
  status: string;
  placedAt: string;
  waitingSec: number;
  items: BoardItem[];
}
export interface Board {
  BAR: BoardOrder[];
  TAVOLA_CALDA: BoardOrder[];
}

export interface Summary {
  count: number;
  avgSec: number | null;
  medianSec: number | null;
  p90Sec: number | null;
  minSec: number | null;
  maxSec: number | null;
}
export interface GroupStats {
  key: string;
  label: string;
  station?: string;
  queue: Summary;
  prep: Summary;
  stationTotal: Summary;
}
export interface PrepStats {
  range: { from: string; to: string };
  groupBy: 'station' | 'category' | 'product';
  station: string;
  groups: GroupStats[];
  delivery: Summary;
  byStation: { station: Station; stationTotal: Summary }[];
}

export interface Customer {
  id: string;
  name: string;
  surname?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  balanceCents: number;
  limitCents: number;
  active: boolean;
}
export interface CreditTx {
  id: string;
  type: 'CHARGE' | 'PAYMENT' | 'ADJUST';
  amountCents: number;
  balanceAfterCents: number;
  method?: string | null;
  note?: string | null;
  createdAt: string;
}

// ---- Endpoint ----
export const api = {
  board: () => req<Board>('/orders-tables/board'),

  prepStats: (p: { groupBy?: string; station?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (p.groupBy) qs.set('groupBy', p.groupBy);
    if (p.station) qs.set('station', p.station);
    if (p.from) qs.set('from', p.from);
    if (p.to) qs.set('to', p.to);
    return req<PrepStats>(`/stats/prep-times?${qs.toString()}`);
  },

  customers: (opts: { debtors?: boolean; q?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.debtors) qs.set('debtors', 'true');
    if (opts.q) qs.set('q', opts.q);
    return req<{ customers: Customer[]; totalOutstandingCents: number }>(`/credit/customers?${qs.toString()}`);
  },
  customerDetail: (id: string) => req<{ customer: Customer; transactions: CreditTx[] }>(`/credit/customers/${id}`),
  createCustomer: (body: Record<string, unknown>) =>
    req<Customer>('/credit/customers', { method: 'POST', body: JSON.stringify(body) }),
  addTransaction: (id: string, body: Record<string, unknown>) =>
    req<{ customer: Customer; transaction: CreditTx }>(`/credit/customers/${id}/transactions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  remind: (id: string, channel?: string) =>
    req<{ ok: boolean; channel: string; error?: string }>(`/credit/customers/${id}/remind`, {
      method: 'POST',
      body: JSON.stringify({ channel: channel ?? 'auto' }),
    }),
};

// ---- Staff Notes (disposizioni owner → dipendenti con ack) ----
export interface StaffNote {
  id: string;
  senderId: string;
  targetScope: 'ALL' | 'DEPARTMENT' | 'INDIVIDUAL';
  targetValue: string;
  type: 'NOTE' | 'TASK' | 'WARNING' | 'RULE' | 'SUGGESTION';
  priority: number;
  title: string;
  body: string;
  dueDate: string | null;
  requiresAck: boolean;
  acknowledgedBy: string[];
  responses: Array<{ userId: string; text: string; at: string }>;
  status: string;
  createdAt: string;
}

export const notesApi = {
  list: (status?: string) =>
    req<StaffNote[]>(`/staff-notes${status ? `?status=${status}` : ''}`),
  create: (body: {
    targetScope: 'ALL' | 'DEPARTMENT' | 'INDIVIDUAL';
    targetValue: string;
    type?: string;
    priority?: number;
    title: string;
    body: string;
    dueDate?: string;
    requiresAck?: boolean;
  }) => req<StaffNote>('/staff-notes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    req<StaffNote>(`/staff-notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ ok: boolean }>(`/staff-notes/${id}`, { method: 'DELETE' }),
};

// ---- Magazzino ----
export interface StockRow {
  productId: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  parLevel: number;
  low: boolean;
}
export interface Movement {
  id: string;
  type: string;
  qtyDelta: number;
  qtyAfter: number;
  reason?: string | null;
  createdAt: string;
  product: { name: string; unit: string };
}

// ---- Fornitori ----
export interface Supplier {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  active: boolean;
  _count?: { listings: number };
}
export interface Listing {
  id: string;
  productId: string;
  supplierSku?: string | null;
  packSize: number;
  packPriceCents: number;
  leadTimeDays: number;
  preferred: boolean;
  product: { name: string; unit: string };
}
export interface ProposalLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  reorderLevel: number;
  targetLevel: number;
  packSize: number;
  packs: number;
  orderedBase: number;
  packPriceCents: number;
  lineCostCents: number;
}
export interface Proposal {
  supplierId: string;
  supplierName: string;
  lines: ProposalLine[];
  totalCents: number;
}

export interface PoItem {
  id: string;
  productId: string;
  packSize: number;
  packsOrdered: number;
  packsReceived: number;
  packPriceCents: number;
  product: { name: string; unit: string };
}
export interface PurchaseOrder {
  id: string;
  status: string;
  totalCents: number;
  note?: string | null;
  supplier: { name: string };
  items: PoItem[];
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
}

// Endpoint magazzino/fornitori (namespace separato).
export const inv = {
  // magazzino
  stock: () => req<{ items: StockRow[]; lowCount: number }>('/inventory/stock'),
  movements: (productId?: string) =>
    req<Movement[]>(`/inventory/movements${productId ? `?productId=${productId}` : ''}`),
  addMovement: (body: Record<string, unknown>) =>
    req<{ productId: string; quantity: number }>('/inventory/movements', { method: 'POST', body: JSON.stringify(body) }),
  setLevels: (productId: string, body: Record<string, unknown>) =>
    req(`/inventory/stock/${productId}/levels`, { method: 'PATCH', body: JSON.stringify(body) }),
  // fornitori
  suppliers: () => req<Supplier[]>('/suppliers'),
  createSupplier: (body: Record<string, unknown>) => req<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(body) }),
  listings: (id: string) => req<Listing[]>(`/suppliers/${id}/listings`),
  addListing: (id: string, body: Record<string, unknown>) =>
    req<Listing>(`/suppliers/${id}/listings`, { method: 'POST', body: JSON.stringify(body) }),
  reorderProposals: () =>
    req<{ proposals: Proposal[]; unassigned: { productId: string; name: string; deficitBase: number }[] }>(
      '/suppliers/reorder-proposals',
    ),
  // ordini d'acquisto
  purchaseOrders: (status?: string) =>
    req<PurchaseOrder[]>(`/purchase-orders${status ? `?status=${status}` : ''}`),
  createPurchaseOrder: (body: Record<string, unknown>) =>
    req<PurchaseOrder>('/purchase-orders', { method: 'POST', body: JSON.stringify(body) }),
  sendPurchaseOrder: (id: string) => req<PurchaseOrder>(`/purchase-orders/${id}/send`, { method: 'POST' }),
  cancelPurchaseOrder: (id: string) => req<PurchaseOrder>(`/purchase-orders/${id}/cancel`, { method: 'POST' }),
  receivePurchaseOrder: (id: string, lines: { itemId: string; packs: number }[]) =>
    req<PurchaseOrder>(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ lines }) }),
};

// ---- Menu / Prodotti CRUD ----
export const menu = {
  list: () => req<Product[]>('/products'),
  create: (body: { code: string; name: string; category: string; priceCents: number; unit?: string }) =>
    req<Product>('/products', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<{ code: string; name: string; category: string; priceCents: number; unit: string }>) =>
    req<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) =>
    req<{ ok: boolean; deactivated?: boolean }>(`/products/${id}`, { method: 'DELETE' }),
};

export const CATEGORY_LABELS: Record<string, string> = {
  colazione: 'Colazione',
  tavola_calda: 'Tavola Calda',
  bibite: 'Bibite',
  birra: 'Birre',
  bollicine: 'Bollicine',
  cocktail: 'Cocktail',
  cocktail_analcolico: 'Analcolici',
  gin: 'Gin',
  whisky: 'Whisky',
  rum: 'Rum',
  primi_piatti: 'Primi Piatti',
  secondi_piatti: 'Secondi Piatti',
  contorni: 'Contorni',
  dolci: 'Dolci',
  varie: 'Varie',
  generic: 'Generale',
};

export function stationForCategory(category: string): Station {
  const c = category.trim().toLowerCase();
  const KITCHEN = new Set([
    'pizza','primo','primi_piatti','secondo','secondi_piatti','contorno','contorni',
    'panino','piadina','toast','insalata','dolce','dolci','piatto','tavola_calda','griglia','frittura',
  ]);
  if (KITCHEN.has(c)) return 'TAVOLA_CALDA';
  return 'BAR';
}

export function fmtSec(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
export function fmtEuro(cents: number): string {
  return '€ ' + (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Dashboard KPI ----
export interface DashboardKpis {
  totalRevenueCents: number;
  paidRevenueCents: number;
  totalOrders: number;
  avgTicketCents: number;
  totalGuests: number;
  avgDeliverySec: number;
  revenueDeltaPct: number;
  ordersDeltaPct: number;
  guestsDeltaPct: number;
}
export interface RevenueByDay { date: string; cents: number; }
export interface OrdersByHour { hour: number; count: number; }
export interface TopProduct { name: string; quantity: number; revenueCents: number; station: string; }
export interface StationBreakdown { station: string; revenueCents: number; itemCount: number; orderCount: number; }
export interface PaymentStatus { status: string; count: number; }
export interface DashboardData {
  range: { from: string; to: string; label: string };
  kpis: DashboardKpis;
  revenueByDay: RevenueByDay[];
  ordersByHour: OrdersByHour[];
  topProducts: { byRevenue: TopProduct[]; byQuantity: TopProduct[] };
  stationBreakdown: StationBreakdown[];
  paymentStatus: PaymentStatus[];
}

// ---- Marketing AI ----
export interface MarketingVariant {
  channel: string;
  headline: string;
  body: string;
  hashtags?: string[];
}
export interface AiStatus { enabled: boolean; budgetSpentCents: number; }

// ---- Staff ----
export interface StaffMember {
  id: string;
  email: string;
  name: string;
  roles: string[];
  hourlyRateCents: number;
  createdAt: string;
}
export interface Shift {
  id: string;
  userId: string;
  venueId: string;
  startedAt: string;
  endedAt: string | null;
  shiftRole?: string | null;
  user?: { id: string; name: string; roles: string[]; hourlyRateCents: number };
  breakMinutes: number;
  note: string | null;
  status: 'OPEN' | 'CLOSED';
  hoursWorked: number;
  payCents: number;
}
export interface PayrollEntry {
  id: string;
  userId: string;
  venueId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  hourlyRateCents: number;
  basePayCents: number;
  bonusCents: number;
  deductionCents: number;
  netPayCents: number;
  status: 'DRAFT' | 'APPROVED' | 'PAID';
  note: string | null;
  user: { name: string; email: string; roles: string[] };
}
export interface PayrollSummary {
  totalGrossCents: number;
  totalNetCents: number;
  totalDeductionsCents: number;
  totalBonusCents: number;
  totalHours: number;
  count: number;
  byStatus: { DRAFT: number; APPROVED: number; PAID: number };
  byEmployee: { userId: string; name: string; netPayCents: number; hours: number; status: string }[];
}

export const dash = {
  metrics: (range: string = 'today') => req<DashboardData>(`/stats/dashboard?range=${range}`),
};

// ---- Provisioning iniziale (wizard di primo avvio) --------------------------
const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  `${location.protocol}//${location.hostname}:3000/api/v1`;

export interface SetupStatus { needsSetup: boolean; hasVenue: boolean; }
export interface ProvisionInput {
  token: string;
  venueName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
}

export const setup = {
  status: async (): Promise<SetupStatus> => {
    const r = await fetch(`${API_BASE}/setup/status`);
    if (!r.ok) throw new Error(`Errore ${r.status}`);
    return r.json();
  },
  provision: async (input: ProvisionInput): Promise<{ ok: true; venueId: string; ownerEmail: string; note?: string }> => {
    const r = await fetch(`${API_BASE}/setup/provision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data as { error?: string }).error || `Errore ${r.status}`);
    return data;
  },
};

// ---- Real-time dashboard: stesso canale WebSocket dei KDS -------------------
export type DashboardEventKind = 'order.paid' | 'session.closed' | 'stock.critical';
export interface DashboardEvent {
  type: 'dashboard-event';
  kind: DashboardEventKind;
  amountCents?: number;
  productName?: string;
  quantity?: number;
  reorderLevel?: number;
  at: number;
}

/**
 * Sottoscrive gli eventi operativi (incassi, chiusure, scorte critiche) via
 * WebSocket. Ritorna una funzione di cleanup. Degradazione graceful: se il WS
 * non è disponibile il chiamante continua col polling periodico.
 */
export function subscribeDashboard(onEvent: (ev: DashboardEvent) => void): () => void {
  let ws: WebSocket | null = null;
  try {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = JSON.parse(localStorage.getItem('piazzetta.tokens') || '{}').accessToken;
    if (token) {
      ws = new WebSocket(`${protocol}//${location.hostname}:3000/ws?token=${token}`);
      ws.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data);
          if (msg.type === 'dashboard-event') onEvent(msg as DashboardEvent);
        } catch { /* ignore */ }
      };
    }
  } catch { /* ignore */ }
  return () => { if (ws) { ws.onmessage = null; ws.close(); } };
}

export const ai = {
  status: () => req<AiStatus>('/ai/status'),
  marketingCopy: (body: { topic: string; tone: string; channels: string[] }) =>
    req<{ variants: MarketingVariant[]; provider: string }>('/ai/marketing-copy', {
      method: 'POST', body: JSON.stringify(body),
    }),
};

export const staff = {
  list: () => req<StaffMember[]>('/staff'),
  setRate: (userId: string, hourlyRateCents: number) =>
    req<StaffMember>(`/staff/${userId}/rate`, { method: 'PATCH', body: JSON.stringify({ hourlyRateCents }) }),
  clockIn: (userId: string, shiftRole?: string, note?: string) =>
    req<Shift>('/staff/shifts/clock-in', { method: 'POST', body: JSON.stringify({ userId, shiftRole, note }) }),
  clockOut: (shiftId: string, breakMinutes: number = 0, note?: string) =>
    req<Shift>(`/staff/shifts/${shiftId}/clock-out`, { method: 'POST', body: JSON.stringify({ breakMinutes, note }) }),
  shifts: (params: { from?: string; to?: string; userId?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.userId) qs.set('userId', params.userId);
    if (params.status) qs.set('status', params.status);
    return req<Shift[]>(`/staff/shifts?${qs.toString()}`);
  },
  updateShift: (id: string, body: Record<string, unknown>) =>
    req<Shift>(`/staff/shifts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteShift: (id: string) => req<{ ok: boolean }>(`/staff/shifts/${id}`, { method: 'DELETE' }),
  calculatePayroll: (body: { userId: string; periodStart: string; periodEnd: string; bonusCents?: number; deductionCents?: number; note?: string }) =>
    req<PayrollEntry>('/staff/payroll/calculate', { method: 'POST', body: JSON.stringify(body) }),
  payroll: (params: { from?: string; to?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.status) qs.set('status', params.status);
    return req<PayrollEntry[]>(`/staff/payroll?${qs.toString()}`);
  },
  updatePayroll: (id: string, body: Record<string, unknown>) =>
    req<PayrollEntry>(`/staff/payroll/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  payrollSummary: (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    return req<PayrollSummary>(`/staff/payroll/summary?${qs.toString()}`);
  },
};

// ---- Marketing avanzato ----
export interface MediaAsset {
  id: string; venueId: string; type: string; source: string; url: string;
  thumbnailUrl?: string | null; mimeType?: string | null; sizeBytes?: number | null;
  width?: number | null; height?: number | null; altText?: string | null;
  createdAt: string;
}
export interface SocialAccount {
  id: string; platform: string; accountId: string; username?: string | null;
  displayName?: string | null; avatarUrl?: string | null; active: boolean;
  connectedAt: string; lastSyncAt?: string | null; scopes: string[];
}
export interface SocialPost {
  id: string; venueId: string; campaignId?: string | null; mediaAssetId?: string | null;
  caption: string; hashtags: string[]; platforms: string[];
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHING' | 'PUBLISHED' | 'FAILED';
  scheduledAt?: string | null; publishedAt?: string | null;
  aiGenerated: boolean; aiPrompt?: string | null;
  canvaDesignId?: string | null; gammaDocId?: string | null;
  perPlatform?: Record<string, any> | null;
  createdAt: string; updatedAt: string;
  mediaAsset?: MediaAsset | null;
  campaign?: { id: string; name: string } | null;
  _count?: { comments: number };
}
export interface SocialComment {
  id: string; venueId: string; socialPostId?: string | null;
  platform: string; platformCommentId: string;
  authorName?: string | null; authorAvatarUrl?: string | null;
  text: string; likesCount: number;
  repliedAt?: string | null; replyText?: string | null;
  aiAutoReplied: boolean; needsReply: boolean;
  receivedAt: string; createdAt: string;
  socialPost?: { id: string; caption: string } | null;
}
export interface Campaign {
  id: string; venueId: string; name: string; description?: string | null;
  startDate?: string | null; endDate?: string | null;
  budgetCents: number; status: string;
  createdAt: string; _count?: { posts: number };
}
export interface MarketingAnalytics {
  range: { from: string; to: string };
  totals: { impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; profileVisits: number; websiteClicks: number };
  byPlatform: { platform: string; impressions: number; reach: number; likes: number; comments: number; shares: number }[];
  byDay: { date: string; impressions: number; reach: number; likes: number; comments: number }[];
  topPosts: { id: string; caption: string; mediaUrl?: string | null; publishedAt?: string | null; totalImpressions: number; totalReach: number; totalLikes: number; totalComments: number }[];
  followerCount: number;
}

export const mkt = {
  // Media
  media: () => req<MediaAsset[]>('/marketing/media'),
  uploadMedia: (base64: string, mimeType: string, altText?: string) =>
    req<MediaAsset>('/marketing/media/upload', { method: 'POST', body: JSON.stringify({ base64, mimeType, altText }) }),
  deleteMedia: (id: string) => req<{ ok: boolean }>(`/marketing/media/${id}`, { method: 'DELETE' }),

  // AI generation
  generatePost: (body: { topic: string; tone: string; channels: string[]; mediaAssetId?: string }) =>
    req<{ caption: string; hashtags: string[] }>('/marketing/generate-post', { method: 'POST', body: JSON.stringify(body) }),
  canvaCreate: (body: { title: string; templateId?: string; brandColor?: string; mediaAssetId?: string }) =>
    req<{ asset: MediaAsset; designId: string; exportUrl: string }>('/marketing/canva/create', { method: 'POST', body: JSON.stringify(body) }),
  gammaCreate: (body: { prompt: string; title: string }) =>
    req<{ asset: MediaAsset; docId: string; url: string }>('/marketing/gamma/create', { method: 'POST', body: JSON.stringify(body) }),

  // Posts
  posts: (status?: string) => req<SocialPost[]>(`/marketing/posts${status ? `?status=${status}` : ''}`),
  createPost: (body: Record<string, unknown>) =>
    req<SocialPost>('/marketing/posts', { method: 'POST', body: JSON.stringify(body) }),
  updatePost: (id: string, body: Record<string, unknown>) =>
    req<SocialPost>(`/marketing/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePost: (id: string) => req<{ ok: boolean }>(`/marketing/posts/${id}`, { method: 'DELETE' }),
  publishPost: (id: string) => req<{ status: string; perPlatform: Record<string, any> }>(`/marketing/posts/${id}/publish`, { method: 'POST' }),

  // Accounts
  accounts: () => req<SocialAccount[]>('/marketing/accounts'),
  connectAccount: (body: Record<string, unknown>) =>
    req<{ id: string; platform: string; accountId: string }>('/marketing/accounts/connect', { method: 'POST', body: JSON.stringify(body) }),
  disconnectAccount: (id: string) => req<{ ok: boolean }>(`/marketing/accounts/${id}`, { method: 'DELETE' }),

  // Comments
  comments: (needsReply?: boolean) => req<SocialComment[]>(`/marketing/comments${needsReply ? '?needsReply=true' : ''}`),
  replyComment: (id: string, replyText: string) =>
    req<SocialComment>(`/marketing/comments/${id}/reply`, { method: 'POST', body: JSON.stringify({ replyText }) }),
  autoReply: (id: string) =>
    req<{ comment: SocialComment; replyText: string }>(`/marketing/comments/${id}/auto-reply`, { method: 'POST' }),
  syncComments: () => req<{ synced: number }>('/marketing/comments/sync', { method: 'POST' }),

  // Analytics
  analytics: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<MarketingAnalytics>(`/marketing/analytics?${qs.toString()}`);
  },
  syncAnalytics: () => req<{ synced: number }>('/marketing/analytics/sync', { method: 'POST' }),

  // Campaigns
  campaigns: () => req<Campaign[]>('/marketing/campaigns'),
  createCampaign: (body: Record<string, unknown>) =>
    req<Campaign>('/marketing/campaigns', { method: 'POST', body: JSON.stringify(body) }),
  updateCampaign: (id: string, body: Record<string, unknown>) =>
    req<Campaign>(`/marketing/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};

// ---- Scheduling & Chat ----
export interface AvailabilitySlot {
  id: string; userId: string; dayOfWeek: number; startHour: number; endHour: number;
  preference: 'AVAILABLE' | 'PREFERRED' | 'UNAVAILABLE'; note?: string | null;
  user?: { id: string; name: string; roles: string[] };
}
export interface ScheduledShift {
  id: string; userId: string; venueId: string; date: string; startHour: number; endHour: number;
  role?: string | null; station?: string | null; status: string;
  aiSuggested: boolean; aiConfidence?: number | null; note?: string | null;
  user: { id: string; name: string; roles: string[]; hourlyRateCents: number };
}
export interface ChatRoom {
  id: string; venueId: string; name: string; type: string;
  department?: string | null; targetUserId?: string | null;
  createdBy?: string | null; visibility: string; members: string[];
  messages?: { text: string; createdAt: string; userId?: string | null; type: string }[];
  _count?: { messages: number };
  createdAt: string;
}
export interface ChatMessage {
  id: string; roomId: string; userId?: string | null; venueId: string;
  text: string; type: string; aiGenerated: boolean; meta?: any;
  readBy: string[]; createdAt: string;
  user?: { id: string; name: string; roles: string[] } | null;
}
export interface ChatStaffUser {
  id: string; name: string; roles: string[];
}
export interface AIShiftSuggestion {
  userId: string; userName: string; date: string;
  startHour: number; endHour: number; station?: string;
  confidence: number;
}

export const schedule = {
  availability: () => req<AvailabilitySlot[]>('/staff/availability'),
  setAvailability: (userId: string, slots: Array<{ dayOfWeek: number; startHour: number; endHour: number; preference: string; note?: string }>) =>
    req<AvailabilitySlot[]>(`/staff/availability/${userId}`, { method: 'PUT', body: JSON.stringify({ slots }) }),
  list: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<ScheduledShift[]>(`/staff/schedule?${qs.toString()}`);
  },
  create: (body: { userId: string; date: string; startHour: number; endHour: number; role?: string; station?: string; note?: string }) =>
    req<ScheduledShift>('/staff/schedule', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    req<ScheduledShift>(`/staff/schedule/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (id: string) => req<{ ok: boolean }>(`/staff/schedule/${id}`, { method: 'DELETE' }),
  confirm: (id: string) => req<ScheduledShift>(`/staff/schedule/${id}/confirm`, { method: 'POST' }),
  cancel: (id: string) => req<ScheduledShift>(`/staff/schedule/${id}/cancel`, { method: 'POST' }),
  aiOptimize: (body: { weekStart: string; coverage: Array<{ dayOfWeek: number; slots: Array<{ startHour: number; endHour: number; minStaff: number; requiredRoles?: string[]; station?: string }> }>; constraints?: { maxHoursPerWeek?: number; minRestBetweenShifts?: number } }) =>
    req<{ aiApplied: boolean; suggestions: AIShiftSuggestion[]; coverage: any[] }>('/staff/schedule/ai-optimize', { method: 'POST', body: JSON.stringify(body) }),
  apply: (suggestions: Array<{ userId: string; date: string; startHour: number; endHour: number; station?: string; role?: string }>) =>
    req<{ created: number }>('/staff/schedule/apply', { method: 'POST', body: JSON.stringify({ suggestions }) }),
};

export const chat = {
  rooms: () => req<ChatRoom[]>('/staff/chat/rooms'),
  createRoom: (data: { name: string; type: string; department?: string; targetUserId?: string; visibility?: string }) =>
    req<ChatRoom>('/staff/chat/rooms', { method: 'POST', body: JSON.stringify(data) }),
  staffList: () => req<ChatStaffUser[]>('/staff/chat/staff-list'),
  messages: (roomId: string) => req<ChatMessage[]>(`/staff/chat/rooms/${roomId}/messages`),
  send: (roomId: string, text: string, type: string = 'TEXT', meta?: any) =>
    req<ChatMessage>(`/staff/chat/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ text, type, meta }) }),
  aiSuggest: (roomId: string, context?: string) =>
    req<{ suggestions: string[]; aiEnabled: boolean }>(`/staff/chat/rooms/${roomId}/ai-suggest`, { method: 'POST', body: JSON.stringify({ context }) }),
  markRead: (roomId: string, msgId: string) =>
    req<ChatMessage>(`/staff/chat/rooms/${roomId}/messages/${msgId}/read`, { method: 'POST' }),
};

// ---- Contabilità italiana ----
export interface ChartOfAccount {
  id: string; code: string; name: string;
  category: 'ATTIVO' | 'PASSIVO' | 'COSTO' | 'RICAVO' | 'CONTRO';
  subcategory?: string | null; vatRate?: number | null; deductible: boolean; active: boolean;
}
export interface SupplierInvoice {
  id: string; supplierId?: string | null; supplierName: string; supplierVat?: string | null;
  invoiceNumber: string; invoiceDate: string; dueDate?: string | null; description?: string | null;
  netAmountCents: number; vatRate: number; vatAmountCents: number; withholdingRate: number; withholdingCents: number;
  totalAmountCents: number; status: 'RECEIVED' | 'RECORDED' | 'PAID'; filePath?: string | null; fileMimeType?: string | null;
  recordedAt?: string | null; paidAt?: string | null; paymentMethod?: string | null; note?: string | null;
  createdAt: string;
}
export interface JournalEntry {
  id: string; date: string; description: string; reference?: string | null;
  sourceType: string; sourceId?: string | null; status: string;
  lines?: JournalLine[];
}
export interface JournalLine {
  id: string; accountId: string; debitCents: number; creditCents: number; description?: string | null;
  account?: { code: string; name: string; category: string };
}
export interface VatReturn {
  id: string; period: string; periodType: string;
  vatCollectedCents: number; vatPaidCents: number; vatDueCents: number;
  status: string; filedAt?: string | null;
}
export interface IncomeStatement {
  range: { from: string; to: string };
  revenues: Array<{ subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }>;
  totalRevenue: number;
  costs: Array<{ subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }>;
  totalCost: number;
  ebitda: number; ebit: number; financialIncome: number; financialCosts: number; taxes: number; netIncome: number;
}
export interface BalanceSheet {
  date: string;
  assets: Array<{ subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }>;
  totalAssets: number;
  liabilities: Array<{ subcategory: string; total: number; items: Array<{ code: string; name: string; amount: number }> }>;
  totalLiabilities: number;
  netEquity: number;
}
export interface TrialBalance {
  date: string;
  accounts: Array<{ code: string; name: string; category: string; debit: number; credit: number }>;
  totalDebit: number; totalCredit: number; balanced: boolean;
}

export const acct = {
  // Piano conti
  accounts: () => req<ChartOfAccount[]>('/accounting/accounts'),
  seedAccounts: () => req<{ seeded: boolean; count: number; message?: string }>('/accounting/accounts/seed', { method: 'POST' }),
  createAccount: (body: { code: string; name: string; category: string; subcategory?: string; vatRate?: number; deductible?: boolean }) =>
    req<ChartOfAccount>('/accounting/accounts', { method: 'POST', body: JSON.stringify(body) }),
  updateAccount: (id: string, body: Record<string, unknown>) =>
    req<ChartOfAccount>(`/accounting/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Fatture
  invoices: (status?: string, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<SupplierInvoice[]>(`/accounting/invoices?${qs.toString()}`);
  },
  createInvoice: (body: { supplierName: string; supplierVat?: string; invoiceNumber: string; invoiceDate: string; dueDate?: string; description?: string; netAmountCents: number; vatRate: number; withholdingRate?: number; note?: string }) =>
    req<SupplierInvoice>('/accounting/invoices', { method: 'POST', body: JSON.stringify(body) }),
  uploadInvoiceFile: (id: string, base64: string, mimeType: string, filename: string) =>
    req<SupplierInvoice>(`/accounting/invoices/${id}/upload`, { method: 'POST', body: JSON.stringify({ base64, mimeType, filename }) }),
  recordInvoice: (id: string, expenseAccountId: string, vatAccountId: string, supplierAccountId: string) =>
    req<{ entry: JournalEntry; invoice: SupplierInvoice }>(`/accounting/invoices/${id}/record`, { method: 'POST', body: JSON.stringify({ expenseAccountId, vatAccountId, supplierAccountId }) }),
  payInvoice: (id: string, paymentMethod: string, bankAccountId?: string) =>
    req<SupplierInvoice>(`/accounting/invoices/${id}/pay`, { method: 'POST', body: JSON.stringify({ paymentMethod, bankAccountId }) }),
  deleteInvoice: (id: string) => req<{ ok: boolean }>(`/accounting/invoices/${id}`, { method: 'DELETE' }),

  // Journal
  journal: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<JournalEntry[]>(`/accounting/journal?${qs.toString()}`);
  },
  createJournal: (body: { date: string; description: string; reference?: string; lines: Array<{ accountId: string; debitCents: number; creditCents: number; description?: string }> }) =>
    req<JournalEntry>('/accounting/journal', { method: 'POST', body: JSON.stringify(body) }),
  deleteJournal: (id: string) => req<{ ok: boolean }>(`/accounting/journal/${id}`, { method: 'DELETE' }),

  // IVA
  vatReturns: () => req<VatReturn[]>('/accounting/vat-returns'),
  calcVat: (period: string, periodType: 'MONTHLY' | 'QUARTERLY' = 'MONTHLY') =>
    req<VatReturn>('/accounting/vat-returns/calculate', { method: 'POST', body: JSON.stringify({ period, periodType }) }),
  fileVat: (id: string) => req<VatReturn>(`/accounting/vat-returns/${id}/file`, { method: 'PATCH' }),

  // Report
  incomeStatement: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<IncomeStatement>(`/accounting/income-statement?${qs.toString()}`);
  },
  balanceSheet: (date?: string) => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    return req<BalanceSheet>(`/accounting/balance-sheet?${qs.toString()}`);
  },
  trialBalance: (date?: string) => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    return req<TrialBalance>(`/accounting/trial-balance?${qs.toString()}`);
  },

  // Export
  exportUrl: (format: 'json' | 'csv', from?: string, to?: string) => {
    const qs = new URLSearchParams({ format });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return `/accounting/export?${qs.toString()}`;
  },
};

// ---- Cassa: chiusura giornaliera ----
export interface DailyReport {
  date: string;
  totalCents: number;
  byMethod: Record<string, { count: number; amountCents: number }>;
  payments: number;
  drawers: Array<{
    id: string;
    openedAt: string;
    closedAt: string | null;
    openingCents: number;
    countedCents: number | null;
    expectedCents: number | null;
    differenceCents: number | null;
    status: string;
  }>;
}

export const cashierApi = {
  dailyReport: (date?: string) =>
    req<DailyReport>(`/cashier/daily-report${date ? `?date=${date}` : ''}`),
  openDrawer: (openingCents: number, shiftId?: string, note?: string) =>
    req('/cashier/drawer/open', { method: 'POST', body: JSON.stringify({ openingCents, shiftId, note }) }),
  closeDrawer: (countedCents: number, note?: string) =>
    req('/cashier/drawer/close', { method: 'POST', body: JSON.stringify({ countedCents, note }) }),
  currentDrawer: () =>
    req<{ drawer: { id: string; openingCents: number; openedAt: string; status: string }; expectedCents: number; cashInCents: number; changeOutCents: number }>('/cashier/drawer/current'),
};


