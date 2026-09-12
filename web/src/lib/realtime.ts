/**
 * The realtime socket. Backend: app/api/v1/realtime.py.
 *
 * One WebSocket per tab, opened while someone is signed in. It only carries
 * announcements -- every send and read still goes through REST -- so the job
 * here is small: stay connected, and hand each event to whoever subscribed.
 * `useRealtimeSync` turns those events into cache updates.
 *
 * Reconnects with capped exponential backoff plus jitter, so a server restart
 * does not get every open tab back in the same millisecond. Two close codes
 * are special:
 *
 *   4401  the token it presented had expired while the tab sat idle -- refresh
 *         once, then retry
 *   4403  the account was suspended -- final; never retry
 */

import { API_ORIGIN, getFreshAccessToken, refreshAccessToken } from "@/lib/api";

/**
 * The socket's URL, which follows the API rather than the page.
 *
 * In production they are different hosts (sahaya.life and api.sahaya.life), and
 * `ws://` from an `https://` page is blocked outright -- so the scheme comes
 * from whichever origin we are actually talking to, not from the document.
 */
function socketUrl(): string {
  const base = API_ORIGIN || window.location.origin;
  return `${base.replace(/^http/, "ws")}/api/v1/ws`;
}

export interface RealtimeMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export type RealtimeEvent =
  | {
      type: "message";
      data: { conversation_id: string; message: RealtimeMessage };
    }
  | {
      type: "read";
      data: { conversation_id: string; reader_id: string; read_at: string };
    }
  | { type: "typing"; data: { conversation_id: string; user_id: string } }
  | { type: "notification"; data: { kind: string; title: string } }
  // Ask Sahaya answered in one of this person's other tabs.
  | { type: "assistant"; data: { message_id: string } };

type Listener = (event: RealtimeEvent) => void;

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_REVOKED = 4403;
/** Under most proxies' idle timeout, so a quiet socket is not silently cut. */
const PING_MS = 25_000;
const MAX_BACKOFF_MS = 30_000;

class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<() => void>();
  private wanted = false;
  private attempt = 0;
  private connected = false;
  private reconnectTimer: number | undefined;
  private pingTimer: number | undefined;

  /** Idempotent: StrictMode's double effect cannot open two sockets. */
  start() {
    if (this.wanted) return;
    this.wanted = true;
    this.attempt = 0;
    window.addEventListener("online", this.onOnline);
    void this.open();
  }

  stop() {
    this.wanted = false;
    window.removeEventListener("online", this.onOnline);
    window.clearTimeout(this.reconnectTimer);
    this.teardown();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** For `useSyncExternalStore`: notified whenever `isConnected` flips. */
  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  isConnected(): boolean {
    return this.connected;
  }

  send(frame: object) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
    }
  }

  // ---------------------------------------------------------------------- //

  private onOnline = () => {
    // The network came back: skip whatever backoff was pending.
    if (this.connected || !this.wanted) return;
    this.attempt = 0;
    window.clearTimeout(this.reconnectTimer);
    void this.open();
  };

  private setConnected(value: boolean) {
    if (this.connected === value) return;
    this.connected = value;
    this.statusListeners.forEach((listener) => listener());
  }

  private async open(forceRefresh = false) {
    if (!this.wanted || this.socket) return;

    let token: string | null;
    try {
      token = forceRefresh ? await refreshAccessToken() : await getFreshAccessToken();
    } catch {
      // Offline, most likely. Try again later rather than giving up.
      this.scheduleReconnect();
      return;
    }
    if (!this.wanted) return;
    if (!token) {
      // No session any more -- signed out, or the refresh token was revoked.
      // Retrying cannot help; the next REST call will surface it properly.
      this.stop();
      return;
    }

    // The socket follows the API, not the page: in production they are
    // different hosts, and ws:// against an https:// page is blocked anyway,
    // so the scheme is derived from whichever origin we are actually using.
    const socket = new WebSocket(socketUrl());
    this.socket = socket;

    socket.onopen = () => socket.send(JSON.stringify({ type: "auth", token }));

    socket.onmessage = (message) => {
      let frame: { type?: string };
      try {
        frame = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if (frame.type === "ready") {
        this.attempt = 0;
        this.setConnected(true);
        this.startPing();
        return;
      }
      if (frame.type === "pong") return;
      this.listeners.forEach((listener) => listener(frame as RealtimeEvent));
    };

    // onerror is always followed by onclose, so all recovery lives here.
    socket.onclose = (event) => {
      if (this.socket === socket) this.socket = null;
      this.stopPing();
      this.setConnected(false);
      if (!this.wanted) return;

      if (event.code === CLOSE_REVOKED) {
        this.stop();
        return;
      }
      if (event.code === CLOSE_UNAUTHORIZED && this.attempt === 0) {
        this.attempt = 1;
        this.reconnectTimer = window.setTimeout(() => void this.open(true), 300);
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (!this.wanted) return;
    const ceiling = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt);
    this.attempt += 1;
    const delay = ceiling / 2 + Math.random() * (ceiling / 2);
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => void this.open(), delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = window.setInterval(() => this.send({ type: "ping" }), PING_MS);
  }

  private stopPing() {
    window.clearInterval(this.pingTimer);
  }

  private teardown() {
    this.stopPing();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000);
    this.setConnected(false);
  }
}

export const realtime = new RealtimeClient();
