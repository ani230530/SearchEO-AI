/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Sparkles, FileText, Hash } from 'lucide-react';

const COLOR_PALETTE = {
  campaign: '#ff8080',
  topic: ['#8B5CF6', '#A855F7', '#C084FC', '#D8B4FE'],
  pillar: ['#3B82F6', '#60A5FA', '#93C5FD'],
  subpage: ['#F59E0B', '#FBBF24', '#FCD34D'],
  keyword: ['#10B981', '#34D399', '#6EE7B7']
} as const;

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

interface TreeNode {
  name: string;
  id: number;
  type: 'campaign' | 'topic' | 'pillar' | 'subpage' | 'keyword';
  children?: TreeNode[];
  value?: number;
  data?: any;
}

const CampaignGraph: React.FC<CampaignGraphProps> = ({ campaignStructure, selectedTopics }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  const [collapsedTopics, setCollapsedTopics] = useState<Set<number>>(new Set());
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 960, height: 640 });
const [clickedNode, setClickedNode] = useState<TreeNode | null>(null);
  const colors = COLOR_PALETTE;

  const legendItems = [
    { label: 'Topics', color: colors.topic[0] },
    { label: 'Pillar Pages', color: colors.pillar[0] },
    { label: 'Sub Pages', color: colors.subpage[0] },
    { label: 'Keywords', color: colors.keyword[0] }
  ];

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const { width, height } = container.getBoundingClientRect();
      if (width && height) {
        setDimensions({
          width: Math.round(width),
          height: Math.round(height)
        });
      }
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;
    if (dimensions.width === 0 || dimensions.height === 0) return;

    setHoveredNode(null);

    // Clear previous render
    d3.select(svgRef.current).selectAll('*').remove();

    const width = dimensions.width || containerRef.current.clientWidth || 800;
    const height = dimensions.height || containerRef.current.clientHeight || width;
    const size = Math.min(width, height);
    const radius = size / 2 - 60;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('background', 'transparent');

    const defs = svg.append('defs');
    const gradient = defs.append('radialGradient')
      .attr('id', 'campaignGraphGradient')
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#ffffff');
    gradient.append('stop').attr('offset', '70%').attr('stop-color', '#f4f4f6');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#eceef2');

    const zoomGroup = svg.append('g');
    const g = zoomGroup.append("g");
g.attr("transform", `translate(${width / 2},${height / 2})`);


    // Zoom/pan behaviour
    const zoomBehaviour = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.6, 2.5])
      .on('zoom', (event) => {
        zoomGroup.attr('transform', event.transform);
      });

    svg.call(zoomBehaviour as any);

    g.append('circle')
      .attr('r', radius)
      .attr('fill', 'url(#campaignGraphGradient)')
      .attr('stroke', '#f3f4f6')
      .attr('stroke-width', 2);

    // Convert campaign structure to tree format
    const root = convertToTree(campaignStructure, selectedTopics, collapsedTopics);
    const hasData = (root.children?.length ?? 0) > 0;

    if (!hasData) {
      return;
    }

    // Create radial tree layout
    const tree = d3.tree<TreeNode>()
      .size([2 * Math.PI, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth!);

    const rootNode = d3.hierarchy(root);
    tree(rootNode);

    // Create curved links
    const link = g.append('g')
      .selectAll('path')
      .data(rootNode.links())
      .enter()
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', (d: any) => {
        const nodeType = d.target.data.type;
        if (nodeType === 'topic') return colors.topic[0] + '40';
        if (nodeType === 'pillar') return colors.pillar[0] + '40';
        if (nodeType === 'subpage') return colors.subpage[0] + '40';
        if (nodeType === 'keyword') return colors.keyword[0] + '40';
        return '#E5E7EB40';
      })
      .attr('stroke-width', 2)
      .attr('d', d3.linkRadial<any, any>()
        .angle((d: any) => d.x)
        .radius((d: any) => d.y)
      )
      .style('opacity', 0)
      .transition()
      .duration(800)
      .style('opacity', 1);


    // Create nodes
    const node = g.append('g')
      .selectAll('g')
      .data(rootNode.descendants())
      .enter()
      .append('g')
      .attr('transform', (d: any) => `rotate(${(d.x * 180 / Math.PI) - 90}) translate(${d.y},0)`)
      .style('opacity', 0);

    node.transition()
      .duration(600)
      .delay((d: any, i: number) => i * 50)
      .style('opacity', 1);
node.on('mouseenter', function(event, d: any) {
  setHoveredNode(d.data);


  d3.select(this)
    .transition()
    .duration(200)
    .attr('r', (d: any) => {
      if (d.data.type === 'campaign') return 24;
      if (d.data.type === 'topic') return 20;
      if (d.data.type === 'pillar') return 15;
      if (d.data.type === 'subpage') return 12;
      if (d.data.type === 'keyword') return 10;
      return 10;
    })
    .style('filter', 'drop-shadow(0 6px 16px rgba(0,0,0,0.15))');
})

node.on("mousemove", function (event) {
  const bounds = containerRef.current!.getBoundingClientRect();
});


node.on('mouseleave', function(event, d: any) {
 setHoveredNode(null);


  d3.select(this)
    .transition()
    .duration(200)
    .attr('r', (d: any) => {
      if (d.data.type === 'campaign') return 20;
      if (d.data.type === 'topic') return 16;
      if (d.data.type === 'pillar') return 12;
      if (d.data.type === 'subpage') return 10;
      if (d.data.type === 'keyword') return 8;
      return 8;
    })
    .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))');
});

    // Add circles for nodes
    node.append('circle')
      .attr('r', (d: any) => {
        if (d.data.type === 'campaign') return 20;
        if (d.data.type === 'topic') return 16;
        if (d.data.type === 'pillar') return 12;
        if (d.data.type === 'subpage') return 10;
        return 8;
      })
      .attr('fill', (d: any) => {
        const type = d.data.type;
        if (type === 'campaign') return colors.campaign;
        if (type === 'topic') {
          const index = d.data.id % colors.topic.length;
          return colors.topic[index];
        }
        if (type === 'pillar') {
          const index = d.data.id % colors.pillar.length;
          return colors.pillar[index];
        }
        if (type === 'subpage') {
          const index = d.data.id % colors.subpage.length;
          return colors.subpage[index];
        }
        if (type === 'keyword') {
          const index = d.data.id % colors.keyword.length;
          return colors.keyword[index];
        }
        return '#9CA3AF';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))')
      .style('cursor', (d: any) => d.data.type === 'topic' ? 'pointer' : 'default')
     .on('click', function(event, d: any) {
    event.stopPropagation();

    // Save clicked node in state
    setClickedNode(d);

    // Collapse/expand for topics
    if (d.data.type === 'topic') {
        setCollapsedTopics(prev => {
            const next = new Set(prev);
            if (next.has(d.data.id)) next.delete(d.data.id);
            else next.add(d.data.id);
            return next;
        });
    }

    // Reset previous highlights first
    g.selectAll('path')
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.4)
        .attr('stroke', '#d1d5db'); // light gray for unselected paths

    let current = d;
    while (current.parent) {
        g.selectAll('path')
            .filter((linkD: any) => linkD.target === current)
            .attr('stroke-width', 4)
            .attr('stroke-opacity', 1)
            .attr('stroke', () => {
                const type = current.data.type;
                if (type === 'topic') return colors.topic[current.data.id % colors.topic.length];
                if (type === 'pillar') return colors.pillar[current.data.id % colors.pillar.length];
                if (type === 'subpage') return colors.subpage[current.data.id % colors.subpage.length];
                if (type === 'keyword') return colors.keyword[current.data.id % colors.keyword.length];
                return colors.campaign;
            });
        current = current.parent;
    }
}).on('mouseenter', function(event, d: any) {
  // Only for info card, skip keywords if you want
  if (d.data.type !== 'keyword') {
    setHoveredNode(d.data);
  }

  d3.select(this)
    .transition()
    .duration(200)
    .attr('r', (d: any) => {
      if (d.data.type === 'campaign') return 24;
      if (d.data.type === 'topic') return 20;
      if (d.data.type === 'pillar') return 15;
      if (d.data.type === 'subpage') return 12;
      if (d.data.type === 'keyword') return 10;
      return 10;
    })
    .style('filter', 'drop-shadow(0 6px 16px rgba(0,0,0,0.15))');
})
.on('mousemove', function(event) {
  const bounds = containerRef.current!.getBoundingClientRect();
})
.on('mouseleave', function(event, d: any) {
  // Only clear info card if not keyword
  if (d.data.type !== 'keyword') {
    setHoveredNode(null);
  }

  d3.select(this)
    .transition()
    .duration(200)
    .attr('r', (d: any) => {
      if (d.data.type === 'campaign') return 20;
      if (d.data.type === 'topic') return 16;
      if (d.data.type === 'pillar') return 12;
      if (d.data.type === 'subpage') return 10;
      if (d.data.type === 'keyword') return 8;
      return 8;
    })
    .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))');
});


    // Add labels
    const labels = node.append("text")
  .attr("dy", 22)
  .attr("text-anchor", "middle")
  .attr("font-size", (d: any) => d.data.type === "campaign" ? "14px" : d.data.type === "topic" ? "12px" : "10px")
  .attr("transform", (d: any) => (d.x > Math.PI ? "rotate(280)" : "rotate(270)"))
  .text((d: any) => {
    const name = d.data.name;
    if (d.data.type === "keyword") return name.substring(0, 2).toUpperCase();
    if (name.length > 15 && d.data.type !== "campaign") return name.substring(0, 12) + "...";
    return name;
  });




    // Add animated particles for selected topics
    if (selectedTopics.size > 0) {
      node.filter((d: any) => d.data.type === 'topic' && selectedTopics.has(d.data.id))
        .append('circle')
        .attr('r', (d: any) => 20)
        .attr('fill', 'none')
        .attr('stroke', (d: any) => {
          const index = d.data.id % colors.topic.length;
          return colors.topic[index];
        })
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5,5')
        .style('opacity', 0.6)
        .transition()
        .duration(2000)
        .ease(d3.easeLinear)
        .attrTween('stroke-dashoffset', () => {
          const interpolate = d3.interpolateNumber(0, 20);
          return (t: number) => `${interpolate(t)}`;
        })
        .style('opacity', 0.3);
    }

  }, [campaignStructure, selectedTopics, collapsedTopics, colors, dimensions]);

  const convertToTree = (structure: CampaignStructure, selected: Set<number>, collapsed: Set<number>): TreeNode => {
    const root: TreeNode = {
      name: 'Campaign',
      id: 0,
      type: 'campaign',
      children: []
    };

    structure.topics.forEach((topic) => {
      if (selected.size === 0 || selected.has(topic.id)) {
        const topicNode: TreeNode = {
          name: topic.title,
          id: topic.id,
          type: 'topic',
          children: []
        };

        // Add pillar page if exists
        if (topic.pillarPage && !collapsed.has(topic.id)) {
          const pillarNode: TreeNode = {
            name: topic.pillarPage.title,
            id: topic.pillarPage.id,
            type: 'pillar',
            children: topic.pillarPage.keywords.map(k => ({
              name: k.term,
              id: k.id,
              type: 'keyword' as const,
              value: k.volume,
              data: { volume: k.volume, difficulty: k.difficulty }
            }))
          };
          topicNode.children!.push(pillarNode);
        }

        // Add sub pages
        if (!collapsed.has(topic.id)) {
          topic.subPages.forEach((subPage) => {
            const subPageNode: TreeNode = {
              name: subPage.title,
              id: subPage.id,
              type: 'subpage',
              children: subPage.keywords.map(k => ({
                name: k.term,
                id: k.id,
                type: 'keyword' as const,
                value: k.volume,
                data: { volume: k.volume, difficulty: k.difficulty }
              }))
            };
            topicNode.children!.push(subPageNode);
          });
        }

        root.children!.push(topicNode);
      }
    });

    return root;
  };

  const activeNode = hoveredNode ?? {
    name: 'Campaign Graph',
    type: 'campaign',
    data: null
  };

  const nodeMeta = {
    campaign: {
      label: 'Campaign Overview',
      description: 'Hover nodes to explore relationships across topics, pillar pages, and keywords.'
    },
    topic: {
      label: 'Topic',
      description: 'Primary themes anchoring your campaign. Use them to plan pillar pages and sub-pages.'
    },
    pillar: {
      label: 'Pillar Page',
      description: 'Comprehensive content pieces supporting a topic and targeting strategic keywords.'
    },
    subpage: {
      label: 'Sub Page',
      description: 'Supporting articles branching from pillar content to capture related search intent.'
    },
    keyword: {
      label: 'Keyword',
      description: 'Individual queries tied to each page. Volume indicates opportunity size.'
    }
  } as const;

  const meta = nodeMeta[activeNode.type];

  const hasRenderableTopics = campaignStructure.topics.some(topic =>
    selectedTopics.size === 0 || selectedTopics.has(topic.id)
  );

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[480px] flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 via-white to-gray-50 rounded-3xl border border-gray-100 shadow-inner">
      <svg ref={svgRef} className="w-full h-full max-h-[800px]" role="img" aria-label="Campaign structure graph"></svg>

      {!hasRenderableTopics && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <div className="w-16 h-16 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center mb-4">
            <Sparkles className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-light text-gray-800 mb-2">No topics selected</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Select or create topics to visualize their structure. Collapse controls and selections help keep large graphs readable.
          </p>
        </div>
      )
      }

      {/* Legend */}
      <div className="pointer-events-none absolute top-6 left-6 flex flex-wrap gap-2">
        {legendItems.map(item => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-gray-200 text-xs font-medium text-gray-700 shadow-sm backdrop-blur"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      {/* Info card */}
      <div className="pointer-events-none absolute top-6 right-6 max-w-xs w-full bg-white/90 backdrop-blur border border-gray-200 rounded-xl shadow-lg p-4">
        <div className="text-[10px] uppercase tracking-[0.25em] text-gray-500 mb-1">{meta.label}</div>
        <div className="text-lg font-light text-gray-900 mb-1 leading-tight">{activeNode.name}</div>
        {activeNode.data?.volume && (
          <div className="text-xs text-gray-600 mb-1">
            Volume · {activeNode.data.volume.toLocaleString()}
          </div>
        )}
        {activeNode.data?.difficulty && (
          <div className="text-xs text-gray-600 mb-2">
            Difficulty · {activeNode.data.difficulty}
          </div>
        )}
        <p className="text-xs text-gray-600 leading-relaxed">
          {meta.description}
        </p>
      </div>

      {/* Hint */}
      <div className="pointer-events-none absolute bottom-6 right-6 bg-black text-white/90 text-xs tracking-wide px-4 py-2 rounded-full shadow-lg">
        Scroll / pinch to zoom · drag to pan · click topic nodes to collapse / expand
      </div>
    </div>
  );
};

export default CampaignGraph;

