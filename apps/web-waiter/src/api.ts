import { apiFetch } from '@la-piazzetta/api-client';

export type OrderStatus = 'DRAFT' | 'SENT' | 'IN_PREPARATION' | 'READY' | 'SERVED' | 'CANCELLED' | 'PAID';
export type Station = 'BAR' | 'TAVOLA_CALDA';

export interface TableSession {
  id: string;
  guests: number;
  state: 'OPEN' | 'CLOSED';
}
export interface TableRow {
  id: string;
  code: string;
  name: string;
  area: 'indoor' | 'outdoor';
  seats: number;
  state: 'FREE' | 'OCCUPIED';
  sessions: TableSession[];
}

export interface StockInfo {
  quantity: number;
}
export interface Product {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  unit: string;
  stock?: StockInfo | null;
}
export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitCents: number;
  notes?: string | null;
  status: OrderStatus | 'PENDING';
  station: Station;
  product: { name: string; unit: string };
}
export interface OrderRow {
  id: string;
  status: OrderStatus;
  totalCents: number;
  placedAt: string;
  items: OrderItem[];
}

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

export const STATION_LABEL: Record<Station, string> = {
  BAR: 'Bar',
  TAVOLA_CALDA: 'Cucina',
};

/** Mappa category → station (deve riflettere il backend stations.ts) */
export function stationForCategory(category: string): Station {
  const c = category.trim().toLowerCase();
  const KITCHEN = new Set([
    'pizza','primo','primi_piatti','secondo','secondi_piatti','contorno','contorni',
    'panino','piadina','toast','insalata','dolce','dolci','piatto','tavola_calda','griglia','frittura',
  ]);
  if (KITCHEN.has(c)) return 'TAVOLA_CALDA';
  return 'BAR';
}

export interface BoardItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  station: Station;
  status: OrderStatus | 'PENDING';
}
export interface BoardOrder {
  id: string;
  table: string;
  status: OrderStatus;
  placedAt: string;
  waitingSec: number;
  items: BoardItem[];
}
export interface BoardResponse {
  BAR: BoardOrder[];
  TAVOLA_CALDA: BoardOrder[];
}

export const api = {
  tables: () => apiFetch<TableRow[]>('/orders-tables/tables'),
  openSession: (tableId: string, guests: number) =>
    apiFetch<TableSession>(`/orders-tables/tables/${tableId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ guests }),
    }),
  sessionOrders: (sessionId: string) => apiFetch<OrderRow[]>(`/orders-tables/sessions/${sessionId}/orders`),
  board: () => apiFetch<BoardResponse>('/orders-tables/board'),
  products: () => apiFetch<Product[]>('/products'),
  createOrder: (
    sessionId: string,
    items: { productId: string; quantity: number; notes?: string }[],
    clientOrderId?: string,
  ) =>
    apiFetch<OrderRow>('/orders-tables/orders', {
      method: 'POST',
      body: JSON.stringify({ sessionId, items, clientOrderId }),
    }),
  setOrderStatus: (orderId: string, status: OrderStatus) =>
    apiFetch<OrderRow>(`/orders-tables/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

export function fmtEuro(cents: number): string {
  return '€ ' + (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---- Chat staff ----
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

export const chatApi = {
  rooms: () => apiFetch<ChatRoom[]>('/staff/chat/rooms'),
  createRoom: (data: { name: string; type: string }) =>
    apiFetch<ChatRoom>('/staff/chat/rooms', { method: 'POST', body: JSON.stringify(data) }),
  messages: (roomId: string) => apiFetch<ChatMessage[]>(`/staff/chat/rooms/${roomId}/messages`),
  send: (roomId: string, text: string) =>
    apiFetch<ChatMessage>(`/staff/chat/rooms/${roomId}/messages`, { method: 'POST', body: JSON.stringify({ text }) }),
  markRead: (roomId: string, msgId: string) =>
    apiFetch<ChatMessage>(`/staff/chat/rooms/${roomId}/messages/${msgId}/read`, { method: 'POST' }),
};

// ---- Shift / Clock-in ----
export interface MyShift {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  shiftRole: string | null;
  status: 'OPEN' | 'CLOSED';
  user?: { id: string; name: string; roles: string[] };
}

export const shiftApi = {
  myShift: () => apiFetch<MyShift | null>('/staff/me/shift'),
  clockIn: (shiftRole: string) =>
    apiFetch<MyShift>('/staff/shifts/clock-in', { method: 'POST', body: JSON.stringify({ shiftRole }) }),
  clockOut: (breakMinutes: number = 0) =>
    apiFetch<MyShift>('/staff/me/shift/clock-out', { method: 'POST', body: JSON.stringify({ breakMinutes }) }),
};

// ---- Menu Add-On (consigli dell'owner da promuovere ai clienti) ----
export interface MenuAddOn {
  id: string;
  productId: string;
  product: { id: string; name: string; code: string; priceCents: number; category: string };
  title: string;
  staffScript: string;
  targetRoles: string[];
  timeWindow: string | null;
  priority: number;
  discountPct: number;
  status: string;
  timesProposed: number;
  timesAccepted: number;
}

export const addOnApi = {
  active: () => apiFetch<MenuAddOn[]>('/menu-addons/active'),
  track: (id: string, accepted: boolean) =>
    apiFetch<MenuAddOn>(`/menu-addons/${id}/track`, { method: 'POST', body: JSON.stringify({ accepted }) }),
};
