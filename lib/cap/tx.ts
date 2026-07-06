// lib/cap/tx.ts — realistic tx-hash / keccak256 generators (SIM) + basescan link builder (both modes).
//
// SIM hashes are cosmetically identical to real Base tx hashes (0x + 64 hex chars),
// so the live tx feed and basescan links look real during a simulated demo. They are
// deterministic per (seed) so a given run replays identically but still feels alive.

/** Base mainnet chain id. */
export const BASE_CHAIN_ID = 8453;

/** Default basescan tx base; overridable by config at the call site. */
export const DEFAULT_BASESCAN_TX_BASE = 'https://basescan.org/tx/';

const HEX = '0123456789abcdef';

/**
 * Small, dependency-free deterministic PRNG (mulberry32) seeded from a string.
 * Deterministic-but-lively: the same seed always yields the same stream.
 */
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate `len` hex chars from a seeded rng. */
function hex(rng: () => number, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += HEX[Math.floor(rng() * 16)];
  return out;
}

/** A realistic-looking 32-byte tx hash: 0x + 64 hex chars. Deterministic per seed. */
export function fakeTxHash(seed: string): string {
  return '0x' + hex(seededRng('tx:' + seed), 64);
}

/** A realistic-looking keccak256 deliverable hash: 0x + 64 hex chars. Deterministic per seed. */
export function fakeKeccak(seed: string): string {
  return '0x' + hex(seededRng('keccak:' + seed), 64);
}

/** A realistic-looking 20-byte EVM address: 0x + 40 hex chars. Deterministic per seed. */
export function fakeAddress(seed: string): string {
  return '0x' + hex(seededRng('addr:' + seed), 40);
}

/** A realistic ERC-8004 DID for an agent, deterministic per seed. */
export function fakeDid(seed: string): string {
  return `did:croo:base:${fakeAddress(seed).slice(2, 42)}`;
}

/** Build a basescan tx URL. `base` should already end with a slash. */
export function explorerTxUrl(txHash: string, base: string = DEFAULT_BASESCAN_TX_BASE): string {
  const b = base.endsWith('/') ? base : base + '/';
  return `${b}${txHash}`;
}

/** Export the seeded rng so adapters can share deterministic jitter off the same seed. */
export { seededRng };
