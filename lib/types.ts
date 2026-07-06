// lib/types.ts — the single shared contract. Frozen after authoring.

/** Runtime mode. */
export type Mode = 'sim' | 'live';

/** Where a discovered agent came from — external teams preferred for the "wow". */
export type AgentOrigin = 'external' | 'own';

/** An agent participating in the market (orchestrator or a specialist provider). */
export interface Agent {
  id: string;                 // stable id (e.g. "orch" or "agent_market_data")
  name: string;               // display name, e.g. "Semiconductor Sentiment Agent"
  role: 'orchestrator' | 'specialist';
  origin: AgentOrigin;        // 'external' (another team) or 'own' (our fallback)
  did?: string;               // ERC-8004 DID when known (live)
  walletAddress?: string;     // ERC-4337 AA wallet address when known (live)
  reputation: number;         // PTS / Merit — ticks up on each cleared order
  avatarSeed: string;         // deterministic seed for the node glyph
}

/** A listed capability the orchestrator can hire. Bazaar's "store" entry. */
export interface Service {
  serviceId: string;          // CROO serviceId (live) or synthetic id (sim)
  agentId: string;            // provider Agent.id
  name: string;               // capability name
  description: string;
  priceUsdc: number;          // price per call, in USDC (human units, e.g. 0.05)
  slaMinutes: number;         // SLA window
  reputation: number;         // snapshot of provider PTS at discovery time
  origin: AgentOrigin;
  deliverableType: 'text' | 'schema';
  capabilityTag: string;      // coarse tag for matching subtasks, e.g. "market-data"
}

/** Lifecycle phase of a single hire (drives edge animation state). */
export type JobPhase =
  | 'discovered'   // candidate found
  | 'negotiating'  // negotiateOrder sent
  | 'accepted'     // provider accepted -> on-chain order created
  | 'funded'       // escrow locked (payOrder) -> USDC coin travels, padlock closes
  | 'delivering'   // provider working
  | 'verified'     // deliverable hash written -> "no proof, no payment" stamp
  | 'settled'      // escrow released -> funds land, reputation ticks
  | 'rejected'
  | 'expired';

/** One subtask hired out to one specialist. The animated edge in the graph. */
export interface Job {
  id: string;                 // Bazaar job id
  subtask: string;            // the natural-language subtask given to the specialist
  requesterAgentId: string;   // always the orchestrator
  providerAgentId: string;    // the hired specialist
  serviceId: string;
  phase: JobPhase;
  priceUsdc: number;
  // CROO on-chain proof trail (populated as it advances; undefined in early phases)
  negotiationId?: string;
  orderId?: string;
  chainOrderId?: string;
  createTxHash?: string;
  payTxHash?: string;         // escrow-lock tx -> basescan link
  deliverTxHash?: string;
  clearTxHash?: string;       // settlement tx
  deliverableHash?: string;   // keccak256 of the deliverable = the "verified" receipt
  deliverableText?: string;   // the actual work product
  createdAt: number;          // epoch ms
  updatedAt: number;
}

/** The event stream both adapters emit and the UI consumes. Discriminated union. */
export type JobEvent =
  | { type: 'run.started'; runId: string; task: string; mode: Mode; at: number }
  | { type: 'task.decomposed'; runId: string; subtasks: string[]; at: number }
  | { type: 'agent.discovered'; runId: string; agent: Agent; service: Service; at: number }
  | { type: 'job.created'; runId: string; job: Job; at: number }
  | { type: 'job.phase'; runId: string; jobId: string; phase: JobPhase; job: Job; at: number }
  | { type: 'settlement'; runId: string; settlement: Settlement; at: number }
  | { type: 'reputation.updated'; runId: string; agentId: string; reputation: number; delta: number; at: number }
  | { type: 'briefing.delta'; runId: string; text: string; at: number }   // streamed synthesis token/chunk
  | { type: 'briefing.done'; runId: string; text: string; at: number }
  | { type: 'run.completed'; runId: string; totalUsdc: number; jobsSettled: number; at: number }
  | { type: 'run.error'; runId: string; message: string; at: number }
  | { type: 'raw'; runId: string; raw: Record<string, unknown>; at: number }; // passthrough of a CROO wire event

/** A completed USDC payment — one row in the live tx feed. */
export interface Settlement {
  id: string;
  jobId: string;
  fromAgentId: string;        // orchestrator (payer)
  toAgentId: string;          // specialist (payee)
  amountUsdc: number;
  token: 'USDC';
  chainId: number;            // 8453 base mainnet
  payTxHash: string;          // escrow lock
  clearTxHash: string;        // release/settlement
  deliverableHash: string;    // keccak256 proof
  explorerUrl: string;        // basescan link for clearTxHash
  at: number;
}

/** The full client-side reduced state the graph + panels render from. */
export interface MarketState {
  runId: string | null;
  mode: Mode;
  task: string | null;
  status: 'idle' | 'running' | 'completed' | 'error';
  agents: Record<string, Agent>;        // by agent.id
  services: Record<string, Service>;    // by serviceId
  jobs: Record<string, Job>;            // by job.id
  settlements: Settlement[];            // append-only, newest last
  briefing: string;                     // accumulates from briefing.delta
  totalUsdc: number;
  jobsSettled: number;
  error: string | null;
}

/** Public config the UI reads from /api/config (no secrets). */
export interface PublicConfig {
  mode: Mode;
  chainId: number;
  basescanBase: string;       // "https://basescan.org/tx/"
  exampleTasks: string[];
}
