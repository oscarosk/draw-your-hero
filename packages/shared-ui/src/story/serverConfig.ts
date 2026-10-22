import { Platform } from 'react-native';

/**
 * Where the TV app finds the story service.
 *
 * - Fire TV (Vega / Fire OS): set DEFAULT_SERVER_URL to your HTTPS address,
 *   e.g. a Cloudflare tunnel in development or the hosted service for judging.
 * - Web build: served by the story service itself, so it uses its own origin
 *   (or ?server=https://... in the page URL).
 */
export const DEFAULT_SERVER_URL = 'https://sanyo-cycles-calculations-titten.trycloudflare.com';

export function getServerUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('server');
    if (fromQuery) return fromQuery.replace(/\/+$/, '');
    // The web build is served by the story service itself, so its own address is the service.
    return window.location.origin;
  }
  return DEFAULT_SERVER_URL.replace(/\/+$/, '');
}

export function toWebSocketUrl(httpUrl: string, path: string): string {
  return httpUrl.replace(/^http/, 'ws') + path;
}
