/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Sparkles } from 'lucide-react';

interface Keyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
}

interface SubPage {
  id: number;
  title: string;
  keywords: Keyword[];
}

interface PillarPage {
  id: number;
  title: string;
  keywords: Keyword[];
}

interface Topic {
  id: number;
  title: string;
  pillarPage: PillarPage | null;
  subPages: SubPage[];
}

interface CampaignStructure {
  topics: Topic[];
}

interface CampaignGraphProps {
  campaignStructure: CampaignStructure;
  selectedTopics: Set<number>;
}

type GraphNodeType = 'campaign' | 'topic' | 'pillar' | 'subpage' | 'keyword';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: GraphNodeType;
  depth: number;
  topicId?: number;
  meta?: {
    volume?: number;
    difficulty?: string;
    pageCount?: number;
    keywordCount?: number;
  };
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

const NODE_STYLE: Record<GraphNodeType, { radius: number; fill: string; stroke: string; label: string }> = {
  campaign: { radius: 18, fill: '#111111', stroke: '#111111', label: 'Campaign' },
  topic: { radius: 12, fill: '#2563eb', stroke: '#dbeafe', label: 'Topic' },
  pillar: { radius: 10, fill: '#0f172a', stroke: '#e2e8f0', label: 'Pillar Page' },
  subpage: { radius: 8, fill: '#475569', stroke: '#e2e8f0', label: 'Sub-page' },
  keyword: { radius: 4.5, fill: '#cbd5e1', stroke: '#ffffff', label: 'Keyword' },
};

const RING_BY_DEPTH: Record<number, number> = {
  0: 0,
  1: 180,
  2: 330,
  3: 500,
};

const CampaignGraph: React.FC<CampaignGraphProps> = ({ campaignStructure, selectedTopics }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 860 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width && height) {
        setDimensions({
          width: Math.round(width),
          height: Math.round(height),
        });
      }
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const filteredTopics = campaignStructure.topics.filter((topic) => selectedTopics.size === 0 || selectedTopics.has(topic.id));

    nodes.push({
      id: 'campaign-root',
      label: 'Campaign',
      type: 'campaign',
      depth: 0,
      meta: {
        pageCount: filteredTopics.reduce((count, topic) => count + (topic.pillarPage ? 1 : 0) + topic.subPages.length, 0),
        keywordCount: filteredTopics.reduce((count, topic) => {
          const pillarKeywords = topic.pillarPage?.keywords.length || 0;
          const subKeywords = topic.subPages.reduce((sum, page) => sum + page.keywords.length, 0);
          return count + pillarKeywords + subKeywords;
        }, 0),
      },
    });

    filteredTopics.forEach((topic) => {
      const topicNodeId = `topic-${topic.id}`;
      nodes.push({
        id: topicNodeId,
        label: topic.title,
        type: 'topic',
        depth: 1,
        topicId: topic.id,
        meta: {
          pageCount: (topic.pillarPage ? 1 : 0) + topic.subPages.length,
          keywordCount:
            (topic.pillarPage?.keywords.length || 0) +
            topic.subPages.reduce((sum, page) => sum + page.keywords.length, 0),
        },
      });
      links.push({ source: 'campaign-root', target: topicNodeId });

      if (topic.pillarPage) {
        const pillarNodeId = `pillar-${topic.pillarPage.id}`;
        nodes.push({
          id: pillarNodeId,
          label: topic.pillarPage.title,
          type: 'pillar',
          depth: 2,
          topicId: topic.id,
          meta: { keywordCount: topic.pillarPage.keywords.length },
        });
        links.push({ source: topicNodeId, target: pillarNodeId });

        topic.pillarPage.keywords.forEach((keyword) => {
          const keywordNodeId = `keyword-${keyword.id}`;
          nodes.push({
            id: keywordNodeId,
            label: keyword.term,
            type: 'keyword',
            depth: 3,
            topicId: topic.id,
            meta: {
              volume: keyword.volume,
              difficulty: keyword.difficulty,
            },
          });
          links.push({ source: pillarNodeId, target: keywordNodeId });
        });
      }

      topic.subPages.forEach((subPage) => {
        const subPageNodeId = `subpage-${subPage.id}`;
        nodes.push({
          id: subPageNodeId,
          label: subPage.title,
          type: 'subpage',
          depth: 2,
          topicId: topic.id,
          meta: { keywordCount: subPage.keywords.length },
        });
        links.push({ source: topicNodeId, target: subPageNodeId });

        subPage.keywords.forEach((keyword) => {
          const keywordNodeId = `keyword-${keyword.id}`;
          nodes.push({
            id: keywordNodeId,
            label: keyword.term,
            type: 'keyword',
            depth: 3,
            topicId: topic.id,
            meta: {
              volume: keyword.volume,
              difficulty: keyword.difficulty,
            },
          });
          links.push({ source: subPageNodeId, target: keywordNodeId });
        });
      });
    });

    const dedupedNodes = Array.from(new Map(nodes.map((node) => [node.id, node])).values());

    return {
      nodes: dedupedNodes,
      links,
      topicCount: filteredTopics.length,
      hasRenderableTopics: filteredTopics.length > 0,
    };
  }, [campaignStructure, selectedTopics]);

  useEffect(() => {
    if (!svgRef.current) return;

    const { width, height } = dimensions;
    const { nodes, links } = graphData;
    if (!width || !height) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const defs = svg.append('defs');
    const gridPattern = defs
      .append('pattern')
      .attr('id', 'campaign-grid')
      .attr('width', 40)
      .attr('height', 40)
      .attr('patternUnits', 'userSpaceOnUse');

    gridPattern.append('path').attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none').attr('stroke', '#f3f4f6').attr('stroke-width', 1);

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#fcfcfd');
    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#campaign-grid)').style('opacity', 0.8);

    const rootLayer = svg.append('g');
    const scene = rootLayer.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.45, 2.2])
      .on('zoom', (event) => {
        scene.attr('transform', event.transform);
      });

    svg.call(zoom as any);
    svg.call(zoom.transform as any, d3.zoomIdentity.translate(width / 2, height / 2));

    const ringLayer = scene.append('g');
    [180, 330, 500].forEach((radius) => {
      ringLayer
        .append('circle')
        .attr('r', radius)
        .attr('fill', 'none')
        .attr('stroke', '#f1f5f9')
        .attr('stroke-width', 1);
    });

    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((link) => {
            const source = typeof link.source === 'string' ? nodes.find((node) => node.id === link.source) : link.source;
            const target = typeof link.target === 'string' ? nodes.find((node) => node.id === link.target) : link.target;
            if (!source || !target) return 120;
            if (target.depth === 1) return 180;
            if (target.depth === 2) return 130;
            return 85;
          })
          .strength(0.9)
      )
      .force(
        'charge',
        d3.forceManyBody<GraphNode>().strength((node) => {
          if (node.depth === 0) return -1800;
          if (node.depth === 1) return -1000;
          if (node.depth === 2) return -500;
          return -90;
        })
      )
      .force('center', d3.forceCenter<GraphNode>(0, 0))
      .force(
        'collision',
        d3.forceCollide<GraphNode>().radius((node) => NODE_STYLE[node.type].radius + (node.depth <= 2 ? 18 : 6))
      )
      .force(
        'radial',
        d3.forceRadial<GraphNode>((node) => RING_BY_DEPTH[node.depth] ?? 0, 0, 0).strength((node) => (node.depth === 0 ? 1 : 0.12))
      )
      .alpha(1)
      .alphaDecay(0.03);

    const linkSelection = scene
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', '#dbe4ee')
      .attr('stroke-width', (d) => {
        const target = typeof d.target === 'string' ? null : d.target;
        return target?.depth === 1 ? 1.4 : 1;
      })
      .attr('stroke-linecap', 'round')
      .attr('opacity', 0.9);

    const nodeSelection = scene
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, node) => {
            if (!event.active) simulation.alphaTarget(0.16).restart();
            node.fx = node.x;
            node.fy = node.y;
          })
          .on('drag', (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on('end', (event, node) => {
            if (!event.active) simulation.alphaTarget(0);
            node.fx = null;
            node.fy = null;
          }) as any
      )
      .on('mouseenter', (_, node) => setHoveredNode(node))
      .on('mouseleave', () => setHoveredNode(null));

    nodeSelection
      .append('circle')
      .attr('r', (node) => NODE_STYLE[node.type].radius)
      .attr('fill', (node) => NODE_STYLE[node.type].fill)
      .attr('stroke', (node) => NODE_STYLE[node.type].stroke)
      .attr('stroke-width', (node) => (node.type === 'keyword' ? 1.25 : 2))
      .style('filter', (node) => (node.depth <= 2 ? 'drop-shadow(0 8px 20px rgba(15,23,42,0.08))' : 'none'));

    nodeSelection
      .filter((node) => node.type !== 'keyword')
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (node) => -(NODE_STYLE[node.type].radius + 16))
      .attr('fill', '#475569')
      .attr('font-size', (node) => (node.type === 'topic' ? 12 : 11))
      .attr('font-weight', 500)
      .text((node) => (node.label.length > 24 ? `${node.label.slice(0, 22)}...` : node.label));

    nodeSelection
      .filter((node) => node.type === 'keyword')
      .append('text')
      .attr('text-anchor', 'start')
      .attr('dx', 10)
      .attr('dy', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', 10)
      .text((node) => (node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label));

    simulation.on('tick', () => {
      linkSelection
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0);

      nodeSelection.attr('transform', (node) => `translate(${node.x ?? 0},${node.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [dimensions, graphData]);

  const activeNode = hoveredNode;
  const legendItems = ['Topic', 'Pillar Page', 'Sub-page', 'Keyword'].map((label) => {
    const type = label === 'Topic' ? 'topic' : label === 'Pillar Page' ? 'pillar' : label === 'Sub-page' ? 'subpage' : 'keyword';
    return {
      label,
      color: NODE_STYLE[type].fill,
    };
  });

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <svg ref={svgRef} className="h-full w-full" role="img" aria-label="Campaign relationship graph" />

      {!graphData.hasRenderableTopics && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm">
            <Sparkles className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-xl font-light text-gray-900">No campaign structure to map</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Add topics, pages, and keywords to see the campaign relationship graph fill the screen.
          </p>
        </div>
      )}

      <div className="pointer-events-none absolute left-6 top-6 flex flex-wrap gap-2">
        {legendItems.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm backdrop-blur-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute right-6 top-6 max-w-sm rounded-[24px] border border-gray-200 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {activeNode ? NODE_STYLE[activeNode.type].label : 'Campaign Map'}
        </p>
        <h3 className="mt-1 text-lg font-medium tracking-tight text-gray-900">
          {activeNode?.label || 'Explore the campaign structure'}
        </h3>
        {activeNode?.meta?.pageCount ? <p className="mt-2 text-sm text-gray-500">Pages: {activeNode.meta.pageCount}</p> : null}
        {activeNode?.meta?.keywordCount ? <p className="mt-1 text-sm text-gray-500">Keywords: {activeNode.meta.keywordCount}</p> : null}
        {activeNode?.meta?.volume ? <p className="mt-1 text-sm text-gray-500">Volume: {activeNode.meta.volume.toLocaleString()}</p> : null}
        {activeNode?.meta?.difficulty ? <p className="mt-1 text-sm text-gray-500">Difficulty: {activeNode.meta.difficulty}</p> : null}
        {!activeNode && (
          <p className="mt-2 text-sm leading-6 text-gray-500">
            Topics sit closest to the center, pages spread outward, and keywords form the outer discovery layer. Drag nodes, pan, or zoom to explore.
          </p>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-[11px] font-medium text-gray-500 shadow-sm backdrop-blur-sm">
        Drag nodes • Scroll to zoom • Drag canvas to pan
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 rounded-[22px] border border-gray-200 bg-white/95 px-4 py-3 text-right shadow-sm backdrop-blur-sm">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">Overview</p>
        <p className="mt-1 text-sm text-gray-700">{graphData.topicCount} topic{graphData.topicCount === 1 ? '' : 's'} in view</p>
      </div>
    </div>
  );
};

export default CampaignGraph;
