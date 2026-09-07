import { headers } from 'next/headers';

/**
 * Resolve the public app origin for auth email redirects.
 * Prefers the incoming request host so production never accidentally
 * embeds localhost from a mis-set NEXT_PUBLIC_APP_URL.
 */
export async function getAppUrl(): Promise<string> {
  const h = await headers();

  const origin = h.get('origin');
  if (origin) return stripTrailingSlash(origin);

  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    const proto = h.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }

  if (host) {
    const proto = h.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
  }

  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return stripTrailingSlash(configured);

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, '')}`;
  }

  return 'http://localhost:3000';
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}
