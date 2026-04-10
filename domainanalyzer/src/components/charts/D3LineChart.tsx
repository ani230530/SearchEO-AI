import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  date: string;
  value: number;
}

interface D3LineChartProps {
  data: DataPoint[];
  secondaryData?: DataPoint[];
  width?: number;
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  showArea?: boolean;
  animate?: boolean;
}

const D3LineChart: React.FC<D3LineChartProps> = ({
  data,
  secondaryData,
  width = 600,
  height = 300,
  primaryColor = '#8b5cf6',
  secondaryColor = '#3b82f6',
  primaryLabel = 'Primary',
  secondaryLabel = 'Secondary',
  showArea = true,
  animate = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 30, right: 80, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
  .attr('viewBox', `0 0 ${width} ${height}`)
  .attr('preserveAspectRatio', 'none')
  .style('width', '100%')
  .style('height', '100%');

    // Create gradient definitions
    const defs = svg.append('defs');

    // Primary gradient
    const primaryGradient = defs.append('linearGradient')
      .attr('id', 'primaryGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    
    primaryGradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', primaryColor)
      .attr('stop-opacity', 0.3);
    
    primaryGradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', primaryColor)
      .attr('stop-opacity', 0);

    // Secondary gradient
    if (secondaryData) {
      const secondaryGradient = defs.append('linearGradient')
        .attr('id', 'secondaryGradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');
      
      secondaryGradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', secondaryColor)
        .attr('stop-opacity', 0.2);
      
      secondaryGradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', secondaryColor)
        .attr('stop-opacity', 0);
    }

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Parse dates and create scales
    const parseDate = d3.timeParse('%Y-%m-%d');
    const formatDate = d3.timeFormat('%b %d');

    const allData = secondaryData ? [...data, ...secondaryData] : data;
    const dates = data.map(d => parseDate(d.date)!);
    const maxValue = d3.max(allData, d => d.value) || 0;

    const xScale = d3.scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, maxValue * 1.1])
      .range([innerHeight, 0]);

    // Add grid lines
    g.append('g')
      .attr('class', 'grid')
      .attr('opacity', 0.1)
      .call(d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat(() => '')
      );

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(xScale)
        .ticks(7)
        .tickFormat(d => formatDate(d as Date))
      )
      .selectAll('text')
      .attr('fill', '#6b7280')
      .style('font-size', '11px');

    g.append('g')
      .call(d3.axisLeft(yScale)
        .ticks(5)
        .tickFormat(d => d3.format('.2s')(d as number))
      )
      .selectAll('text')
      .attr('fill', '#6b7280')
      .style('font-size', '11px');

    // Create line generator
    const line = d3.line<DataPoint>()
      .x(d => xScale(parseDate(d.date)!))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Create area generator
    const area = d3.area<DataPoint>()
      .x(d => xScale(parseDate(d.date)!))
      .y0(innerHeight)
      .y1(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Draw secondary line and area first (so primary is on top)
    if (secondaryData && secondaryData.length > 0) {
      if (showArea) {
        g.append('path')
          .datum(secondaryData)
          .attr('fill', 'url(#secondaryGradient)')
          .attr('d', area);
      }

      const secondaryPath = g.append('path')
        .datum(secondaryData)
        .attr('fill', 'none')
        .attr('stroke', secondaryColor)
        .attr('stroke-width', 1.5)
        .attr('d', line);

      if (animate) {
        const totalLength = secondaryPath.node()?.getTotalLength() || 0;
        secondaryPath
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(1000)
          .ease(d3.easeQuadOut)
          .attr('stroke-dashoffset', 0);
      }
    }

    // Draw primary area
    if (showArea) {
      g.append('path')
        .datum(data)
        .attr('fill', 'url(#primaryGradient)')
        .attr('d', area);
    }

    // Draw primary line
    const primaryPath = g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', primaryColor)
      .attr('stroke-width', 1.5)
      .attr('d', line);

    if (animate) {
      const totalLength = primaryPath.node()?.getTotalLength() || 0;
      primaryPath
        .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1000)
        .ease(d3.easeQuadOut)
        .attr('stroke-dashoffset', 0);
    }

    // Add dots for primary data
    g.selectAll('.dot-primary')
      .data(data)
      .enter()
      .append('circle')
      .attr('class', 'dot-primary')
      .attr('cx', d => xScale(parseDate(d.date)!))
      .attr('cy', d => yScale(d.value))
      .attr('r', 3)
      .attr('fill', primaryColor)
      .attr('stroke', 'white')
      .attr('stroke-width', 2)
      .style('opacity', 0)
      .transition()
      .delay(animate ? 1000 : 0)
      .duration(300)
      .style('opacity', 1);

    // Add legend
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + 10}, 10)`);

    legend.append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 3)
      .attr('fill', primaryColor);

    legend.append('text')
      .attr('x', 12)
      .attr('y', 4)
      .text(primaryLabel)
      .style('font-size', '12px')
      .attr('fill', '#374151');

    if (secondaryData) {
      legend.append('circle')
        .attr('cx', 100)
        .attr('cy', 0)
        .attr('r', 3)
        .attr('fill', secondaryColor);

      legend.append('text')
        .attr('x', 112)
        .attr('y', 4)
        .text(secondaryLabel)
        .style('font-size', '12px')
        .attr('fill', '#374151');
    }

    // Add tooltip functionality
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    // Add invisible overlay for tooltip
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .on('mousemove', function(event) {
        const [mouseX] = d3.pointer(event);
        const x0 = xScale.invert(mouseX);
        const bisect = d3.bisector((d: DataPoint) => parseDate(d.date)!).left;
        const i = bisect(data, x0, 1);
        const d0 = data[i - 1];
        const d1 = data[i];
        if (!d0 || !d1) return;
        
        const d = x0.getTime() - parseDate(d0.date)!.getTime() > parseDate(d1.date)!.getTime() - x0.getTime() ? d1 : d0;
        
        tooltip
          .style('opacity', 1)
          .html(`<strong>${formatDate(parseDate(d.date)!)}</strong><br/>${primaryLabel}: ${d.value.toLocaleString()}`)
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    // Cleanup tooltip on unmount
    return () => {
      d3.selectAll('.d3-tooltip').remove();
    };
  }, [data, secondaryData, width, height, primaryColor, secondaryColor, primaryLabel, secondaryLabel, showArea, animate]);

  return (
    <svg ref={svgRef} className="overflow-visible" />
  );
};

export default D3LineChart;
