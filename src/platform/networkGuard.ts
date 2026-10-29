// Defense in depth for MHR08: the app must never talk to the network. The CSP already blocks it in
// the native app; this guard also covers the browser build and makes any attempt visible.
// (MediaPipe tasks-vision 1.x added usage telemetry to Google; we pin 0.10.35 which has none.)

const ALLOWED_SCHEMES = new Set(["data:", "blob:", "ipc:", "tauri:", "asset:"]);
const ALLOWED_HOSTS = new Set(["ipc.localhost", "tauri.localhost", "asset.localhost"]);

export const blockedRequests: string[] = [];

export function isAllowedUrl(raw: string | URL, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(String(raw), origin);
  } catch {
    return false;
  }
  if (ALLOWED_SCHEMES.has(url.protocol)) return true;
  if (url.origin === origin) return true;
  return ALLOWED_HOSTS.has(url.hostname);
}

function block(url: string): never {
  blockedRequests.push(url);
  console.error(`[privacy] blocked network request to ${url}`);
  throw new TypeError(`Network access is disabled (${url})`);
}

/** Wraps fetch, XMLHttpRequest, sendBeacon and WebSocket so only local URLs work. */
export function installNetworkGuard(win: Window & typeof globalThis = window): void {
  const origin = win.location.origin;
  const check = (u: string | URL) => {
    if (!isAllowedUrl(u, origin)) block(String(u));
  };

  const origFetch = win.fetch.bind(win);
  win.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      check(input instanceof Request ? input.url : input);
    } catch (err) {
      return Promise.reject(err);
    }
    return origFetch(input, init);
  };

  const origOpen = win.XMLHttpRequest.prototype.open;
  win.XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    check(url);
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof origOpen;

  if (win.navigator.sendBeacon) {
    const origBeacon = win.navigator.sendBeacon.bind(win.navigator);
    win.navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (!isAllowedUrl(url, origin)) {
        blockedRequests.push(String(url));
        return false;
      }
      return origBeacon(url, data);
    };
  }

  const OrigWS = win.WebSocket;
  win.WebSocket = class extends OrigWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      // Vite's dev server uses a WebSocket for hot reload on the same host.
      const u = new URL(String(url), origin);
      if (u.host !== win.location.host && !ALLOWED_HOSTS.has(u.hostname)) block(String(url));
      super(url, protocols);
    }
  } as typeof WebSocket;
}
