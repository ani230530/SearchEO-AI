/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Sparkles, X } from 'lucide-react';
import type { GenerationPageStatus } from '@/types';

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
  publishStatus?: string;
}

interface PillarPage {
  id: number;
  title: string;
  keywords: Keyword[];
  publishStatus?: string;
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

type DraftStatusMap = Map<number, { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }>;

interface CampaignGraphProps {
  campaignStructure: CampaignStructure;
  selectedTopics: Set<number>;
  generationJobs: Map<number, GenerationPageStatus>;
  draftStatuses: DraftStatusMap;
}

type GraphMode = 'structure' | 'status' | 'opportunity';
type GraphNodeType = 'campaign' | 'topic' | 'pillar' | 'subpage' | 'keyword' | 'keyword-group';
type GraphStatus = 'idle' | 'generating' | 'draft' | 'published' | 'failed';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: GraphNodeType;
  topicId?: number;
  pageId?: number;
  parentId?: string | null;
  depth: number;
  targetX: number;
  targetY: number;
  status?: GraphStatus;
  volume?: number;
  difficulty?: string;
  keywordCount?: number;
  hiddenLabel?: boolean;
  aggregated?: boolean;
  currentX?: number;
  currentY?: number;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

const PAGE_STATUS_LABEL: Record<GraphStatus, string> = {
  idle: 'Ready to plan',
  generating: 'Generating',
  draft: 'Draft ready',
  published: 'Published',
  failed: 'Needs attention',
};

const STATUS_COLORS: Record<GraphStatus, { fill: string; stroke: string; link: string }> = {
  idle: { fill: '#0f172a', stroke: '#dbe3ef', link: '#d8dee8' },
  generating: { fill: '#2563eb', stroke: '#dbeafe', link: '#bfdbfe' },
  draft: { fill: '#3b82f6', stroke: '#dbeafe', link: '#c7d2fe' },
  published: { fill: '#111111', stroke: '#d1d5db', link: '#cbd5e1' },
  failed: { fill: '#dc2626', stroke: '#fecaca', link: '#fecaca' },
};

const BASE_NODE_STYLE: Record<GraphNodeType, { radius: number; fill: string; stroke: string; label: string }> = {
  campaign: { radius: 18, fill: '#111111', stroke: '#111111', label: 'Campaign' },
  topic: { radius: 12, fill: '#2563eb', stroke: '#dbeafe', label: 'Topic' },
  pillar: { radius: 10, fill: '#0f172a', stroke: '#e2e8f0', label: 'Pillar Page' },
  subpage: { radius: 8, fill: '#475569', stroke: '#e2e8f0', label: 'Sub-page' },
  keyword: { radius: 4.5, fill: '#cbd5e1', stroke: '#ffffff', label: 'Keyword' },
  'keyword-group': { radius: 7, fill: '#94a3b8', stroke: '#ffffff', label: 'Keyword Group' },
};

const LABEL_REVEAL_ZOOM = 1.12;
const KEYWORD_PREVIEW_LIMIT = 4;

const CampaignGraph: React.FC<CampaignGraphProps> = ({
  campaignStructure,
  selectedTopics,
  generationJobs,
  draftStatuses,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomScaleRef = useRef(1);
  const [dimensions, setDimensions] = useState({ width: 1280, height: 860 });
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  const [graphMode, setGraphMode] = useState<GraphMode>('structure');

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width && height) {
        setDimensions({ width: Math.round(width), height: Math.round(height) });
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

  const pageStatusFor = (pageId: number, pagePublishStatus?: string): GraphStatus => {
    const draftStatus = draftStatuses.get(pageId);
    const jobStatus = generationJobs.get(pageId);

    if (draftStatus?.isPublished || pagePublishStatus === 'published') return 'published';
    if (draftStatus?.isFailed || jobStatus?.status === 'failed') return 'failed';
    if (jobStatus?.status === 'completed' || jobStatus?.hasHtml) return 'draft';
    if (jobStatus?.status === 'generating' || jobStatus?.status === 'pending') return 'generating';
    return 'idle';
  };

  const graphData = useMemo(() => {
    const { width, height } = dimensions;
    const filteredTopics = campaignStructure.topics.filter((topic) => selectedTopics.size === 0 || selectedTopics.has(topic.id));
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    const laneX = {
      campaign: width * 0.1,
      topic: width * 0.24,
      page: width * 0.5,
      keyword: width * 0.8,
    };

    const topicGap = Math.max(120, Math.min(170, (height - 140) / Math.max(filteredTopics.length, 1)));
    const topStart = Math.max(110, (height - topicGap * Math.max(filteredTopics.length - 1, 0)) / 2);

    nodes.push({
      id: 'campaign-root',
      label: 'Campaign',
      type: 'campaign',
      depth: 0,
      targetX: laneX.campaign,
      targetY: height / 2,
      keywordCount: filteredTopics.reduce((count, topic) => count + (topic.pillarPage?.keywords.length || 0) + topic.subPages.reduce((sum, page) => sum + page.keywords.length, 0), 0),
    });

    filteredTopics.forEach((topic, topicIndex) => {
      const topicY = topStart + topicIndex * topicGap;
      const topicNodeId = `topic-${topic.id}`;
      const pages = [
        ...(topic.pillarPage ? [{ id: topic.pillarPage.id, title: topic.pillarPage.title, type: 'pillar' as const, keywords: topic.pillarPage.keywords, publishStatus: topic.pillarPage.publishStatus }] : []),
        ...topic.subPages.map((page) => ({ id: page.id, title: page.title, type: 'subpage' as const, keywords: page.keywords, publishStatus: page.publishStatus })),
      ];

      const statusCounts = pages.reduce(
        (acc, page) => {
          acc[pageStatusFor(page.id, page.publishStatus)] += 1;
          return acc;
        },
        { published: 0, draft: 0, generating: 0, failed: 0, idle: 0 } as Record<GraphStatus, number>
      );

      nodes.push({
        id: topicNodeId,
        label: topic.title,
        type: 'topic',
        topicId: topic.id,
        parentId: 'campaign-root',
        depth: 1,
        targetX: laneX.topic,
        targetY: topicY,
        keywordCount: pages.reduce((sum, page) => sum + page.keywords.length, 0),
        status: statusCounts.failed > 0 ? 'failed' : statusCounts.generating > 0 ? 'generating' : statusCounts.draft > 0 ? 'draft' : statusCounts.published > 0 ? 'published' : 'idle',
      });
      links.push({ source: 'campaign-root', target: topicNodeId });

      const pageGap = Math.max(58, Math.min(86, 200 / Math.max(pages.length, 1)));
      const pageStart = topicY - ((pages.length - 1) * pageGap) / 2;

      pages.forEach((page, pageIndex) => {
        const pageNodeId = `${page.type}-${page.id}`;
        const pageY = pageStart + pageIndex * pageGap;
        const pageStatus = pageStatusFor(page.id, page.publishStatus);

        nodes.push({
          id: pageNodeId,
          label: page.title,
          type: page.type,
          topicId: topic.id,
          pageId: page.id,
          parentId: topicNodeId,
          depth: 2,
          targetX: laneX.page,
          targetY: pageY,
          status: pageStatus,
          keywordCount: page.keywords.length,
        });
        links.push({ source: topicNodeId, target: pageNodeId });

        const sortedKeywords = [...page.keywords].sort((a, b) => (b.volume || 0) - (a.volume || 0));
        const visibleKeywords = sortedKeywords.slice(0, KEYWORD_PREVIEW_LIMIT);
        const hiddenKeywords = sortedKeywords.slice(KEYWORD_PREVIEW_LIMIT);
        const keywordGap = 24;
        const keywordStart = pageY - ((visibleKeywords.length - 1) * keywordGap) / 2;

        visibleKeywords.forEach((keyword, keywordIndex) => {
          nodes.push({
            id: `keyword-${keyword.id}`,
            label: keyword.term,
            type: 'keyword',
            topicId: topic.id,
            pageId: page.id,
            parentId: pageNodeId,
            depth: 3,
            targetX: laneX.keyword,
            targetY: keywordStart + keywordIndex * keywordGap,
            volume: keyword.volume,
            difficulty: keyword.difficulty,
            hiddenLabel: true,
          });
          links.push({ source: pageNodeId, target: `keyword-${keyword.id}` });
        });

        if (hiddenKeywords.length > 0) {
          const aggregateId = `keyword-group-${page.id}`;
          nodes.push({
            id: aggregateId,
            label: `+${hiddenKeywords.length} more`,
            type: 'keyword-group',
            topicId: topic.id,
            pageId: page.id,
            parentId: pageNodeId,
            depth: 3,
            targetX: laneX.keyword,
            targetY: keywordStart + visibleKeywords.length * keywordGap,
            aggregated: true,
            keywordCount: hiddenKeywords.length,
          });
          links.push({ source: pageNodeId, target: aggregateId });
        }
      });
    });

    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    const branchIds = (() => {
      if (!focusedNodeId) return null;
      const ids = new Set<string>();
      const start = nodesById.get(focusedNodeId);
      if (!start) return null;

      nodes.forEach((node) => {
        let current: GraphNode | undefined = node;
        while (current) {
          if (current.id === focusedNodeId) {
            ids.add(node.id);
            break;
          }
          current = current.parentId ? nodesById.get(current.parentId) : undefined;
        }
      });

      let current: GraphNode | undefined = start;
      while (current) {
        ids.add(current.id);
        current = current.parentId ? nodesById.get(current.parentId) : undefined;
      }

      return ids;
    })();

    const visibleNodes = branchIds ? nodes.filter((node) => branchIds.has(node.id)) : nodes;
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    const visibleLinks = links.filter((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const targetId = typeof link.target === 'string' ? link.target : link.target.id;
      return visibleNodeIds.has(sourceId) && visibleNodeIds.has(targetId);
    });

    const topicMetrics = filteredTopics.map((topic) => {
      const pages = [
        ...(topic.pillarPage ? [{ id: topic.pillarPage.id, publishStatus: topic.pillarPage.publishStatus }] : []),
        ...topic.subPages.map((page) => ({ id: page.id, publishStatus: page.publishStatus })),
      ];
      return {
        id: topic.id,
        title: topic.title,
        pages: pages.length,
        draftsReady: pages.filter((page) => pageStatusFor(page.id, page.publishStatus) === 'draft').length,
        failed: pages.filter((page) => pageStatusFor(page.id, page.publishStatus) === 'failed').length,
        published: pages.filter((page) => pageStatusFor(page.id, page.publishStatus) === 'published').length,
      };
    });

    return {
      nodes: visibleNodes,
      links: visibleLinks,
      topicCount: filteredTopics.length,
      hasRenderableTopics: filteredTopics.length > 0,
      topicMetrics,
    };
  }, [campaignStructure, selectedTopics, dimensions, draftStatuses, generationJobs, focusedNodeId]);

  const nodeVisual = (node: GraphNode) => {
    const base = BASE_NODE_STYLE[node.type];

    if (graphMode === 'status' && (node.type === 'topic' || node.type === 'pillar' || node.type === 'subpage')) {
      const status = node.status || 'idle';
      return { ...base, fill: STATUS_COLORS[status].fill, stroke: STATUS_COLORS[status].stroke };
    }

    if (graphMode === 'opportunity' && node.type === 'keyword') {
      const volume = node.volume || 0;
      if (volume > 1000) return { ...base, fill: '#111111', stroke: '#111111' };
      if (volume > 300) return { ...base, fill: '#475569', stroke: '#cbd5e1' };
      return { ...base, fill: '#cbd5e1', stroke: '#ffffff' };
    }

    return base;
  };

  useEffect(() => {
    if (!svgRef.current) return;
    const { width, height } = dimensions;
    const { nodes, links } = graphData;
    if (!width || !height || !nodes.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', '#fbfbfc');

    const laneXs = [width * 0.1, width * 0.24, width * 0.5, width * 0.8];
    svg
      .append('g')
      .selectAll('line')
      .data(laneXs)
      .enter()
      .append('line')
      .attr('x1', (x) => x)
      .attr('x2', (x) => x)
      .attr('y1', 64)
      .attr('y2', height - 64)
      .attr('stroke', '#eef2f7')
      .attr('stroke-width', 1);

    const scene = svg.append('g');
    let keywordLabelSelection: d3.Selection<SVGTextElement, GraphNode, SVGGElement, unknown> | null = null;
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.8, 2.4])
      .on('zoom', (event) => {
        scene.attr('transform', event.transform);
        zoomScaleRef.current = event.transform.k;
        keywordLabelSelection?.attr('opacity', (node) => {
          const shouldShow = zoomScaleRef.current >= LABEL_REVEAL_ZOOM || focusedNodeId === node.parentId || node.aggregated;
          return shouldShow ? 1 : 0;
        });
      });

    svg.call(zoom as any);
    svg.on('click', () => setFocusedNodeId(null));

    const positionedNodes = nodes.map((node) => {
      const currentX = node.currentX ?? node.targetX;
      const currentY = node.currentY ?? node.targetY;
      node.x = currentX;
      node.y = currentY;
      return node;
    });

    const nodesById = new Map(positionedNodes.map((node) => [node.id, node]));
    const linkEndpoint = (endpoint: string | GraphNode) =>
      typeof endpoint === 'string' ? nodesById.get(endpoint) ?? null : endpoint;
    const focusedLinkIds = new Set<string>();

    if (focusedNodeId) {
      let current = nodesById.get(focusedNodeId);
      while (current?.parentId) {
        focusedLinkIds.add(`${current.parentId}->${current.id}`);
        current = nodesById.get(current.parentId);
      }
    }

    const linkSelection = scene
      .append('g')
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke', (link) => {
        const target = typeof link.target === 'string' ? nodesById.get(link.target) : link.target;
        if (!target) return '#d8dee8';
        if (graphMode === 'status' && (target.type === 'topic' || target.type === 'pillar' || target.type === 'subpage')) {
          return STATUS_COLORS[target.status || 'idle'].link;
        }
        return '#d8dee8';
      })
      .attr('stroke-width', (link) => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        return focusedLinkIds.has(`${sourceId}->${targetId}`) ? 2.6 : 1.2;
      })
      .attr('opacity', 0.65)
      .attr('x1', (d) => linkEndpoint(d.source)?.x ?? 0)
      .attr('y1', (d) => linkEndpoint(d.source)?.y ?? 0)
      .attr('x2', (d) => linkEndpoint(d.target)?.x ?? 0)
      .attr('y2', (d) => linkEndpoint(d.target)?.y ?? 0);

    const nodeSelection = scene
      .append('g')
      .selectAll('g')
      .data(positionedNodes)
      .enter()
      .append('g')
      .style('cursor', 'pointer')
      .attr('transform', (node) => `translate(${node.x ?? 0},${node.y ?? 0})`)
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', (event, node) => {
            d3.select(event.sourceEvent.target.closest('g')).raise();
          })
          .on('drag', (event, node) => {
            node.currentX = event.x;
            node.currentY = event.y;
            node.x = event.x;
            node.y = event.y;
            d3.select<SVGGElement, GraphNode>(event.subject ? event.sourceEvent.currentTarget : event.sourceEvent.currentTarget)
              .attr('transform', `translate(${event.x},${event.y})`);
            linkSelection
              .attr('x1', (d) => linkEndpoint(d.source)?.x ?? 0)
              .attr('y1', (d) => linkEndpoint(d.source)?.y ?? 0)
              .attr('x2', (d) => linkEndpoint(d.target)?.x ?? 0)
              .attr('y2', (d) => linkEndpoint(d.target)?.y ?? 0);
          })
          .on('end', (event, node) => {
            const nextX = node.targetX;
            const nextY = node.targetY;
            node.currentX = nextX;
            node.currentY = nextY;
            node.x = nextX;
            node.y = nextY;

            d3.select<SVGGElement, GraphNode>(event.sourceEvent.currentTarget)
              .transition()
              .duration(260)
              .ease(d3.easeCubicOut)
              .attr('transform', `translate(${nextX},${nextY})`);

            linkSelection
              .transition()
              .duration(260)
              .ease(d3.easeCubicOut)
              .attr('x1', (d) => linkEndpoint(d.source)?.x ?? 0)
              .attr('y1', (d) => linkEndpoint(d.source)?.y ?? 0)
              .attr('x2', (d) => linkEndpoint(d.target)?.x ?? 0)
              .attr('y2', (d) => linkEndpoint(d.target)?.y ?? 0);
          }) as any
      )
      .on('mouseenter', (_, node) => {
        setHoveredNode(node);
        applyHoverState(node);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
        applyHoverState(null);
      })
      .on('click', (event, node) => {
        event.stopPropagation();
        setFocusedNodeId((prev) => (prev === node.id ? null : node.id));
      });

    nodeSelection
      .append('circle')
      .attr('r', (node) => nodeVisual(node).radius + (hoveredNode?.id === node.id ? 1.5 : 0))
      .attr('fill', (node) => nodeVisual(node).fill)
      .attr('stroke', (node) => nodeVisual(node).stroke)
      .attr('stroke-width', (node) => (node.type === 'keyword' ? 1.25 : 2))
      .attr('opacity', 1)
      .style('filter', (node) => (node.depth <= 2 ? 'drop-shadow(0 8px 20px rgba(15,23,42,0.08))' : 'none'));

    const mainLabelSelection = nodeSelection
      .filter((node) => node.type !== 'keyword')
      .append('text')
      .attr('text-anchor', 'start')
      .attr('dx', (node) => nodeVisual(node).radius + 10)
      .attr('dy', 4)
      .attr('fill', '#334155')
      .attr('font-size', (node) => (node.type === 'topic' ? 13 : 11))
      .attr('font-weight', (node) => (node.type === 'topic' ? 600 : 500))
      .attr('opacity', 1)
      .text((node) => (node.label.length > 30 ? `${node.label.slice(0, 28)}...` : node.label));

    keywordLabelSelection = nodeSelection
      .filter((node) => node.type === 'keyword' || node.type === 'keyword-group')
      .append('text')
      .attr('text-anchor', 'start')
      .attr('dx', (node) => nodeVisual(node).radius + 8)
      .attr('dy', 4)
      .attr('fill', '#94a3b8')
      .attr('font-size', 10)
      .attr('opacity', (node) => ((zoomScaleRef.current >= LABEL_REVEAL_ZOOM || focusedNodeId === node.parentId || node.aggregated) ? 1 : 0))
      .text((node) => (node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label));

    const circleSelection = nodeSelection.select<SVGCircleElement>('circle');

    const applyHoverState = (node: GraphNode | null) => {
      if (!node) {
        linkSelection.attr('stroke-width', 1.2).attr('opacity', 0.65);
        circleSelection
          .attr('r', (item) => nodeVisual(item).radius)
          .attr('stroke-width', (item) => (item.type === 'keyword' ? 1.25 : 2))
          .attr('opacity', 1);
        mainLabelSelection.attr('opacity', 1);
        keywordLabelSelection.attr('opacity', (item) => ((zoomScaleRef.current >= LABEL_REVEAL_ZOOM || focusedNodeId === item.parentId || item.aggregated) ? 1 : 0));
        return;
      }

      const highlightedNodeIds = new Set<string>([node.id]);
      let current: GraphNode | undefined = node;
      while (current?.parentId) {
        highlightedNodeIds.add(current.parentId);
        current = nodesById.get(current.parentId);
      }
      nodes.forEach((item) => {
        if (item.parentId === node.id) highlightedNodeIds.add(item.id);
      });

      const highlightedLinkIds = new Set<string>();
      current = node;
      while (current?.parentId) {
        highlightedLinkIds.add(`${current.parentId}->${current.id}`);
        current = nodesById.get(current.parentId);
      }

      linkSelection
        .attr('stroke-width', (item) => {
          const sourceId = typeof item.source === 'string' ? item.source : item.source.id;
          const targetId = typeof item.target === 'string' ? item.target : item.target.id;
          return highlightedLinkIds.has(`${sourceId}->${targetId}`) ? 2.6 : 1;
        })
        .attr('opacity', (item) => {
          const sourceId = typeof item.source === 'string' ? item.source : item.source.id;
          const targetId = typeof item.target === 'string' ? item.target : item.target.id;
          return highlightedLinkIds.has(`${sourceId}->${targetId}`) ? 1 : 0.14;
        });

      circleSelection
        .attr('r', (item) => nodeVisual(item).radius + (item.id === node.id ? 1.5 : 0))
        .attr('stroke-width', (item) => (item.id === node.id ? 3 : item.type === 'keyword' ? 1.25 : 2))
        .attr('opacity', (item) => (highlightedNodeIds.has(item.id) ? 1 : 0.28));

      mainLabelSelection.attr('opacity', (item) => (highlightedNodeIds.has(item.id) ? 1 : 0.34));
      keywordLabelSelection.attr('opacity', (item) => {
        const shouldShow = zoomScaleRef.current >= LABEL_REVEAL_ZOOM || focusedNodeId === item.parentId || node.id === item.parentId || item.aggregated;
        if (!shouldShow) return 0;
        return highlightedNodeIds.has(item.id) || item.parentId === node.id ? 1 : 0.18;
      });
    };

    nodeSelection
      .transition()
      .duration(320)
      .ease(d3.easeCubicOut)
      .attr('transform', (node) => `translate(${node.targetX},${node.targetY})`)
      .on('end', function (node) {
        node.currentX = node.targetX;
        node.currentY = node.targetY;
        node.x = node.targetX;
        node.y = node.targetY;
      });

    linkSelection
      .transition()
      .duration(320)
      .ease(d3.easeCubicOut)
      .attr('x1', (d) => linkEndpoint(d.source)?.targetX ?? 0)
      .attr('y1', (d) => linkEndpoint(d.source)?.targetY ?? 0)
      .attr('x2', (d) => linkEndpoint(d.target)?.targetX ?? 0)
      .attr('y2', (d) => linkEndpoint(d.target)?.targetY ?? 0);

    return undefined;
  }, [dimensions, graphData, graphMode, focusedNodeId]);

  const activeNode = hoveredNode || graphData.nodes.find((node) => node.id === focusedNodeId) || null;
  const legendItems = ['topic', 'pillar', 'subpage', 'keyword'] as const;

  const topicInsights = graphData.topicMetrics
    .filter((topic) => topic.failed > 0 || topic.draftsReady > 0)
    .slice(0, 3);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
      <svg ref={svgRef} className="h-full w-full" role="img" aria-label="Campaign command map" />

      {!graphData.hasRenderableTopics && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm">
            <Sparkles className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-xl font-light text-gray-900">No campaign structure to map</h3>
          <p className="mt-2 max-w-md text-sm text-gray-500">
            Add topics, pages, and keywords to see the campaign command map fill the screen.
          </p>
        </div>
      )}

      <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2">
        {(['structure', 'status', 'opportunity'] as GraphMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setGraphMode(mode)}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm transition-colors ${
              graphMode === mode ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {mode === 'structure' ? 'Structure' : mode === 'status' ? 'Status' : 'Opportunity'}
          </button>
        ))}
        {focusedNodeId && (
          <button
            onClick={() => setFocusedNodeId(null)}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" />
            Reset focus
          </button>
        )}
      </div>

      <div className="pointer-events-none absolute left-5 top-16 flex flex-wrap gap-2">
        {legendItems.map((type) => (
          <span
            key={type}
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-[11px] font-medium text-gray-600 shadow-sm"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BASE_NODE_STYLE[type].fill }} />
            {BASE_NODE_STYLE[type].label}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute right-5 top-5 max-w-[300px] rounded-[22px] border border-gray-200 bg-white/94 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">
          {activeNode ? BASE_NODE_STYLE[activeNode.type].label : 'Campaign Command Map'}
        </p>
        <h3 className="mt-1 text-lg font-medium tracking-tight text-gray-900">
          {activeNode?.label || 'Overview first, detail on demand'}
        </h3>
        {activeNode?.type === 'topic' && activeNode.keywordCount ? <p className="mt-2 text-sm text-gray-500">{activeNode.keywordCount} keywords mapped</p> : null}
        {activeNode?.type !== 'keyword' && activeNode?.keywordCount && activeNode.type !== 'topic' ? <p className="mt-2 text-sm text-gray-500">{activeNode.keywordCount} keywords on this page</p> : null}
        {activeNode?.status ? <p className="mt-1 text-sm text-gray-500">{PAGE_STATUS_LABEL[activeNode.status]}</p> : null}
        {activeNode?.volume ? <p className="mt-1 text-sm text-gray-500">Volume: {activeNode.volume.toLocaleString()}</p> : null}
        {activeNode?.difficulty ? <p className="mt-1 text-sm text-gray-500">Difficulty: {activeNode.difficulty}</p> : null}
        {!activeNode && (
          <>
            <p className="mt-2 text-sm leading-6 text-gray-500">
              Topics anchor the left side, pages cluster in the center, and keywords sit on the opportunity edge. Click any node to focus its branch.
            </p>
            {topicInsights.length > 0 && (
              <div className="mt-4 space-y-2">
                {topicInsights.map((topic) => (
                  <div key={topic.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 px-3 py-2">
                    <p className="text-sm font-medium text-gray-800">{topic.title.length > 28 ? `${topic.title.slice(0, 26)}...` : topic.title}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {topic.failed > 0 ? `${topic.failed} failed page${topic.failed === 1 ? '' : 's'}` : `${topic.draftsReady} draft${topic.draftsReady === 1 ? '' : 's'} ready`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full border border-gray-200 bg-white/95 px-4 py-2 text-[11px] font-medium text-gray-500 shadow-sm">
        Click to focus • Drag nodes • Scroll to zoom • Drag canvas to pan
      </div>

      <div className="pointer-events-none absolute bottom-5 right-5 rounded-[20px] border border-gray-200 bg-white/95 px-4 py-3 text-right shadow-sm">
        <p className="text-[10px] uppercase tracking-[0.16em] text-gray-400">Overview</p>
        <p className="mt-1 text-sm text-gray-700">{graphData.topicCount} topic{graphData.topicCount === 1 ? '' : 's'} in view</p>
        <p className="mt-1 text-xs text-gray-500">{graphMode === 'structure' ? 'Campaign structure' : graphMode === 'status' ? 'Operational status' : 'Keyword opportunity'}</p>
      </div>
    </div>
  );
};

export default CampaignGraph;
