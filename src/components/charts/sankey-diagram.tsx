"use client";

import { useMemo } from "react";

interface SankeyNode {
  id: string;
  label: string;
  value: number;
  color: string;
  column: number;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyDiagramProps {
  totalDebtors: number;
  called: number;
  notCalled: number;
  pending: number;
  contacted: number;
  notReached: number;
  paymentPromised: number;
  declined: number;
}

export function SankeyDiagram({
  totalDebtors,
  called,
  notCalled,
  pending,
  contacted,
  notReached,
  paymentPromised,
  declined,
}: SankeyDiagramProps) {
  const width = 900;
  const height = 400;
  const nodeWidth = 20;
  const nodePadding = 4;
  const columnGap = 180;
  const leftMargin = 100;

  const { nodes, links, nodePositions } = useMemo(() => {
    // Define nodes with payment-focused labels
    const nodes: SankeyNode[] = [
      { id: "total", label: "Total Debtors", value: totalDebtors, color: "var(--fg-muted)", column: 0 },
      { id: "called", label: "Called", value: called, color: "var(--accent-primary)", column: 1 },
      { id: "not-called", label: "Not Called", value: notCalled, color: "var(--fg-disabled)", column: 1 },
      { id: "pending", label: "Pending", value: pending, color: "var(--color-warning)", column: 1 },
      { id: "contacted", label: "Contacted", value: contacted, color: "var(--color-success)", column: 2 },
      { id: "not-reached", label: "Not Reached", value: notReached, color: "var(--color-danger)", column: 2 },
      { id: "promised", label: "Promised", value: paymentPromised, color: "var(--color-reactivado)", column: 3 },
      { id: "declined", label: "Declined", value: declined, color: "var(--fg-muted)", column: 3 },
    ];

    // Define links
    const links: SankeyLink[] = [
      { source: "total", target: "called", value: called },
      { source: "total", target: "not-called", value: notCalled },
      { source: "total", target: "pending", value: pending },
      { source: "called", target: "contacted", value: contacted },
      { source: "called", target: "not-reached", value: notReached },
      { source: "contacted", target: "promised", value: paymentPromised },
      { source: "contacted", target: "declined", value: declined },
    ].filter(l => l.value > 0);

    // Calculate positions
    const columns: { [key: number]: SankeyNode[] } = {};
    nodes.forEach(node => {
      if (!columns[node.column]) columns[node.column] = [];
      columns[node.column].push(node);
    });

    // Position nodes - each column scales to fit its own content
    const nodePositions: { [id: string]: { x: number; y: number; height: number } } = {};
    const availableHeight = height - 60; // Leave margin for labels
    const startY = 30;

    Object.entries(columns).forEach(([col, colNodes]) => {
      const colNum = Number(col);
      const x = leftMargin + colNum * columnGap;

      // Filter to nodes with value > 0
      const activeNodes = colNodes.filter(n => n.value > 0);

      if (activeNodes.length === 0) {
        colNodes.forEach(node => {
          nodePositions[node.id] = { x, y: startY, height: 0 };
        });
        return;
      }

      // Each column scales to fit its own total - this makes each column fill the height
      const colTotal = activeNodes.reduce((sum, n) => sum + n.value, 0);
      const totalPadding = Math.max(0, (activeNodes.length - 1) * nodePadding);
      const availableForNodes = availableHeight - totalPadding;
      const scale = colTotal > 0 ? availableForNodes / colTotal : 0;

      let currentY = startY;
      activeNodes.forEach(node => {
        const nodeHeight = Math.max(node.value * scale, 2);
        nodePositions[node.id] = { x, y: currentY, height: nodeHeight };
        currentY += nodeHeight + nodePadding;
      });

      // Also set position for zero-value nodes
      colNodes.filter(n => n.value === 0).forEach(node => {
        nodePositions[node.id] = { x, y: 0, height: 0 };
      });
    });

    return { nodes, links, nodePositions };
  }, [totalDebtors, called, notCalled, pending, contacted, notReached, paymentPromised, declined]);

  // Generate bezier path for a link
  const generateLinkPath = (
    link: SankeyLink,
    sourceOffset: number,
    targetOffset: number,
    sourceHeight: number,
    targetHeight: number
  ) => {
    const source = nodePositions[link.source];
    const target = nodePositions[link.target];

    if (!source || !target) return "";

    // Source edge coordinates
    const x0 = source.x + nodeWidth;
    const y0Top = source.y + sourceOffset;
    const y0Bottom = source.y + sourceOffset + sourceHeight;

    // Target edge coordinates
    const x1 = target.x;
    const y1Top = target.y + targetOffset;
    const y1Bottom = target.y + targetOffset + targetHeight;

    // Control points - horizontal midpoint
    const midX = (x0 + x1) / 2;

    // Draw path: top edge (left to right), right edge (down), bottom edge (right to left), left edge (up)
    return `M${x0},${y0Top}
            C${midX},${y0Top} ${midX},${y1Top} ${x1},${y1Top}
            L${x1},${y1Bottom}
            C${midX},${y1Bottom} ${midX},${y0Bottom} ${x0},${y0Bottom}
            Z`;
  };

  // Calculate link heights and offsets
  const linkPaths = useMemo(() => {
    const sourceOffsets: { [id: string]: number } = {};
    const targetOffsets: { [id: string]: number } = {};

    nodes.forEach(node => {
      sourceOffsets[node.id] = 0;
      targetOffsets[node.id] = 0;
    });

    return links.map(link => {
      const source = nodePositions[link.source];
      const target = nodePositions[link.target];
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);

      if (!source || !target || !sourceNode || !targetNode || source.height === 0 || target.height === 0) {
        return null;
      }

      // Calculate link heights proportionally at source and target
      const sourceHeight = sourceNode.value > 0
        ? (link.value / sourceNode.value) * source.height
        : 0;
      const targetHeight = targetNode.value > 0
        ? (link.value / targetNode.value) * target.height
        : 0;

      if (sourceHeight === 0 || targetHeight === 0) return null;

      const path = generateLinkPath(
        link,
        sourceOffsets[link.source],
        targetOffsets[link.target],
        sourceHeight,
        targetHeight
      );

      // Get color from target node
      const color = targetNode.color;

      sourceOffsets[link.source] += sourceHeight;
      targetOffsets[link.target] += targetHeight;

      return { path, color, value: link.value };
    }).filter(Boolean);
  }, [links, nodes, nodePositions]);

  if (totalDebtors === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-[14px]" style={{ color: "var(--fg-muted)" }}>
        No data to display
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden">
      <svg width={width} height={height} className="mx-auto" style={{ overflow: "hidden" }}>
        <defs>
          <clipPath id="sankey-clip">
            <rect x="0" y="0" width={width} height={height} />
          </clipPath>
        </defs>
        {/* Links */}
        <g clipPath="url(#sankey-clip)">
          {linkPaths.map((link, i) => link && (
            <path
              key={i}
              d={link.path}
              fill={link.color}
              fillOpacity={0.3}
              stroke={link.color}
              strokeWidth={0.5}
              strokeOpacity={0.5}
              className="transition-opacity duration-200 hover:fill-opacity-50"
            />
          ))}
        </g>

        {/* Nodes */}
        <g>
          {nodes.filter(node => node.value > 0).map(node => {
            const pos = nodePositions[node.id];
            if (!pos || pos.height === 0) return null;

            return (
              <g key={node.id}>
                {/* Node rectangle */}
                <rect
                  x={pos.x}
                  y={pos.y}
                  width={nodeWidth}
                  height={pos.height}
                  fill={node.color}
                  className="transition-opacity duration-200"
                />

                {/* Label */}
                <text
                  x={node.column === 0 ? pos.x - 8 : pos.x + nodeWidth + 8}
                  y={pos.y + pos.height / 2}
                  dy="0.35em"
                  textAnchor={node.column === 0 ? "end" : "start"}
                  fill="var(--fg-secondary)"
                  fontSize={12}
                  fontWeight={500}
                >
                  {node.label}
                </text>

                {/* Value */}
                <text
                  x={node.column === 0 ? pos.x - 8 : pos.x + nodeWidth + 8}
                  y={pos.y + pos.height / 2 + 14}
                  dy="0.35em"
                  textAnchor={node.column === 0 ? "end" : "start"}
                  fill="var(--fg-muted)"
                  fontSize={11}
                  fontFamily="monospace"
                >
                  {node.value.toLocaleString()}
                </text>
              </g>
            );
          })}
        </g>

        {/* Column headers */}
        <g>
          {[
            { x: leftMargin, label: "Imported" },
            { x: leftMargin + columnGap, label: "Call Status" },
            { x: leftMargin + columnGap * 2, label: "Contact Result" },
            { x: leftMargin + columnGap * 3, label: "Outcome" },
          ].map((col, i) => (
            <text
              key={i}
              x={col.x + nodeWidth / 2}
              y={14}
              textAnchor="middle"
              fill="var(--fg-muted)"
              fontSize={10}
              fontWeight={600}
              style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              {col.label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
