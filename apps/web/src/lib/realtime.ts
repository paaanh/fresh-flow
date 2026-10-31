import { API_BASE, authToken } from './api';
export type FreshFlowEvent<T = unknown> = { event_id?: string; type: string; occurred_at?: string; data: T };

export const websocketUrl = () => {
  const configured = process.env.NEXT_PUBLIC_WS_URL;

  const apiUrl = new URL(configured || `${API_BASE}/ws`, typeof window === 'undefined' ? undefined : window.location.origin);
  apiUrl.protocol = apiUrl.protocol === 'https:' || apiUrl.protocol === 'wss:' ? 'wss:' : 'ws:';

  apiUrl.search = '';
  const token = authToken.get();
  if (token) apiUrl.searchParams.set('token', token);
  return apiUrl.toString();
};

/** JWT-authenticated WSS client with bounded reconnect and resync signal. */
export class RealtimeClient {
  private socket?: WebSocket;
  private stopped = false;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private onEvent: (event: FreshFlowEvent) => void, private onState?: (state: 'connecting'|'connected'|'offline') => void) {}
  connect() {
    if (this.socket && this.socket.readyState < 2) return;
    clearTimeout(this.timer);
    this.stopped = false;
    this.open();
  }
  close() { this.stopped = true; clearTimeout(this.timer); this.socket?.close(); this.onState?.('offline'); }
  private open() {
    if (this.stopped || !authToken.get()) return;
    this.onState?.('connecting');
    try {
      this.socket = new WebSocket(websocketUrl());
      this.socket.onopen = () => { this.retry = 0; this.onState?.('connected'); };
      this.socket.onmessage = e => { try { this.onEvent(JSON.parse(e.data) as FreshFlowEvent); } catch { /* ignore malformed frames */ } };
      this.socket.onclose = () => this.reconnect();
      this.socket.onerror = () => this.socket?.close();
    } catch { this.reconnect(); }
  }
  private reconnect() {
    if (this.stopped || !authToken.get()) return;
    this.onState?.('offline');
    const delay = Math.min(30_000, 800 * 2 ** this.retry++);
    this.timer = setTimeout(() => this.open(), delay);
  }
}
