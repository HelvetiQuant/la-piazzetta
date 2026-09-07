import { apiFetch } from './lib/client';

export type ItemStatus = 'PENDING' | 'IN_PREPARATION' | 'READY' | 'SERVED' | 'CANCELLED';
export const NEXT_STATUS: Record<ItemStatus, ItemStatus | null> = {
  PENDING: 'IN_PREPARATION',
  IN_PREPARATION: 'READY',
  READY: 'SERVED',
  SERVED: null,
  CANCELLED: null,
};

export interface BoardItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string | null;
  preparation?: string | null;
  station: 'BAR' | 'TAVOLA_CALDA';
  status: ItemStatus;
}
export interface BoardOrder {
  id: string;
  table: string;
  status: string;
  placedAt: string;
  waitingSec: number;
  items: BoardItem[];
}

export const api = {
  board: (station: 'BAR' | 'TAVOLA_CALDA') =>
    apiFetch<{ station: string; orders: BoardOrder[] }>(`/orders-tables/board?station=${station}`),
  bumpItem: (itemId: string, status: ItemStatus) =>
    apiFetch(`/orders-tables/order-items/${itemId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
};
