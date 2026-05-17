declare global {
  interface Window {
    __API_BASE__?: string;
  }
}

/** Всегда тот же хост, что у открытой страницы (CloudPub / LAN). Без localhost из .env. */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "/api";
  }
  if (window.__API_BASE__) {
    return window.__API_BASE__.replace(/\/$/, "");
  }
  return `${window.location.origin}/api`;
}
