export interface Identity {
  email: string;
  display_name: string;
}

/**
 * Fetch the Databricks-forwarded user identity from the backend.
 * In local dev (ENVIRONMENT=local on the backend), returns the configured fallback.
 * In production, returns the real Databricks identity from forwarded headers.
 */
export async function fetchIdentity(): Promise<Identity> {
  try {
    const res = await fetch('/api/identity');
    if (!res.ok) throw new Error(`Identity fetch failed: ${res.status}`);
    return (await res.json()) as Identity;
  } catch {
    // Graceful degradation — never crash the shell over identity
    return { email: '', display_name: '' };
  }
}

/** Returns initials (up to 2 chars) from a display name or email for the avatar. */
export function getInitials(identity: Identity): string {
  const src = identity.display_name || identity.email;
  if (!src) return '?';
  const parts = src.trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? '?').toUpperCase();
}
