'use client';

// components/MarketGraph.tsx — the @xyflow/react money-flow canvas (Lane B).
//
// Derives nodes + edges from MarketState: the orchestrator is pinned center-left
// and specialists are placed on an arc to the right, spaced by discovery order.
// Custom AgentNode + JobEdge do all the cinema. No default dotted background,
// no controls chrome — the Vellum overrides in globals.css strip React Flow's
// default look; here we just disable interactivity we don't want.

import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Agent, Job, MarketState } from '@/lib/types';
import { AgentNode, type AgentNodeData } from './AgentNode';
import { JobEdge, type JobEdgeData } from './JobEdge';

const nodeTypes: NodeTypes = { agent: AgentNode as unknown as NodeTypes[string] };
const edgeTypes: EdgeTypes = { job: JobEdge as unknown as EdgeTypes[string] };

// Layout constants — an arc of specialists to the right of the orchestrator.
const ORCH_X = 60;
const ORCH_Y = 300;
const ARC_X = 520;
const ARC_TOP = 40;
const ROW_H = 150;

interface MarketGraphProps {
  state: MarketState;
  /** monotonically increasing counter per agent when a settlement lands (for node flash) */
  settledPulses: Record<string, number>;
}

function buildGraph(
  state: MarketState,
  settledPulses: Record<string, number>,
): { nodes: Node[]; edges: Edge[] } {
  const agents = Object.values(state.agents);
  const orchestrator = agents.find((a) => a.role === 'orchestrator');
  const specialists = agents.filter((a) => a.role === 'specialist');

  // Which specialist is actively delivering right now (node breathes).
  const deliveringBy = new Set(
    Object.values(state.jobs)
      .filter((j) => j.phase === 'delivering')
      .map((j) => j.providerAgentId),
  );

  // A representative service per specialist for price/capability display.
  const serviceByAgent = new Map<string, { price: number; capability: string }>();
  for (const svc of Object.values(state.services)) {
    if (!serviceByAgent.has(svc.agentId)) {
      serviceByAgent.set(svc.agentId, { price: svc.priceUsdc, capability: svc.name });
    }
  }

  const nodes: Node[] = [];

  if (orchestrator) {
    nodes.push(agentNode(orchestrator, ORCH_X, ORCH_Y, {}, deliveringBy, settledPulses, serviceByAgent));
  }

  // Center the arc vertically around the orchestrator.
  const n = specialists.length;
  const totalH = Math.max(0, (n - 1) * ROW_H);
  const startY = Math.max(ARC_TOP, ORCH_Y - totalH / 2);

  specialists.forEach((agent, i) => {
    const y = startY + i * ROW_H;
    // Slight horizontal fan so edges don't overlap: alternate a small x offset.
    const x = ARC_X + (i % 2 === 0 ? 0 : 60);
    nodes.push(agentNode(agent, x, y, {}, deliveringBy, settledPulses, serviceByAgent));
  });

  const edges: Edge[] = Object.values(state.jobs).map((job: Job) => ({
    id: `edge_${job.id}`,
    source: job.requesterAgentId,
    target: job.providerAgentId,
    type: 'job',
    data: { job } satisfies JobEdgeData,
    // Static hairline base is drawn by JobEdge; disable default marker.
    markerEnd: undefined,
    selectable: false,
    focusable: false,
  }));

  return { nodes, edges };
}

function agentNode(
  agent: Agent,
  x: number,
  y: number,
  _extra: Record<string, unknown>,
  deliveringBy: Set<string>,
  settledPulses: Record<string, number>,
  serviceByAgent: Map<string, { price: number; capability: string }>,
): Node {
  const svc = serviceByAgent.get(agent.id);
  const data: AgentNodeData = {
    agent,
    priceUsdc: svc?.price,
    capability: svc?.capability,
    working: deliveringBy.has(agent.id),
    settledPulse: settledPulses[agent.id] ?? 0,
  };
  return {
    id: agent.id,
    type: 'agent',
    position: { x, y },
    data: data as unknown as Record<string, unknown>,
    draggable: true,
    selectable: false,
    connectable: false,
  };
}

export function MarketGraph({ state, settledPulses }: MarketGraphProps) {
  const { nodes, edges } = useMemo(
    () => buildGraph(state, settledPulses),
    [state, settledPulses],
  );

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.5, maxZoom: 1.1 }}
        minZoom={0.4}
        maxZoom={1.4}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        className="h-full w-full"
      />
    </ReactFlowProvider>
  );
}
