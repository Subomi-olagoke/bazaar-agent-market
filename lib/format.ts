// lib/format.ts — client formatting helpers (Lane B).
// Pure, dependency-free. Used by the graph, feed, tally, and briefing.

/** Format a USDC amount in human units. Keeps small demo prices legible. */
export function formatUsdc(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  // Small per-call prices (e.g. 0.05) show 2–4 dp; larger tallies show 2 dp.
  const dp = amount !== 0 && Math.abs(amount) < 1 ? 4 : 2;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: dp,
  });
}

/** "-0.0500 USDC" style signed amount for the feed (payer's ledger). */
export function formatUsdcSigned(amount: number): string {
  return `−${formatUsdc(amount)}`; // proper minus sign
}

/** Truncate a 0x hash to the "0x1234…abcd" form used across the UI. */
export function truncateHash(hash: string | undefined, lead = 6, tail = 4): string {
  if (!hash) return '';
  const h = hash.startsWith('0x') ? hash : `0x${hash}`;
  if (h.length <= lead + tail + 2) return h;
  return `${h.slice(0, lead)}…${h.slice(-tail)}`;
}

/** Compact keccak256 receipt display, slightly shorter than a tx hash. */
export function truncateReceipt(hash: string | undefined): string {
  return truncateHash(hash, 6, 4);
}

/** Relative time like "just now", "3s", "2m". Feed is short-lived. */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 2) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

/** Reputation / PTS display — integer PTS. */
export function formatPts(pts: number): string {
  return Math.round(pts).toLocaleString('en-US');
}

/** A short DID/wallet display for provenance lines. */
export function truncateAddress(addr: string | undefined): string {
  if (!addr) return '';
  return truncateHash(addr, 6, 4);
}

/** Coarse capability tag → human label for edge/annotation copy. */
export function humanizeTag(tag: string): string {
  return tag
    .split(/[-_]/g)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
