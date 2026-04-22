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

    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 30, right: 80, bottom: 20, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
.style('height', 'auto')

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

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

    // Grid
    // g.append('g')
    //   .attr('class', 'grid')
    //   .attr('opacity', 0.1)
    //   .call(
    //     d3.axisLeft(yScale)
    //       .tickSize(-innerWidth)
    //       .tickFormat(() => '')
    //   );

    // Axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        d3.axisBottom(xScale)
          .ticks(7)
          .tickFormat(d => formatDate(d as Date))
      )
      .selectAll('text')
      .attr('fill', '#808a9c')
      .style('font-size', '9px');

    g.append('g')
      .call(
        d3.axisLeft(yScale)
          .ticks(5)
          .tickFormat(d => d3.format('.2s')(d as number))
      )
      .selectAll('text')
      .attr('fill', '#6b7280')
      .style('font-size', '9px');

    // Line generator
    const line = d3.line<DataPoint>()
      .x(d => xScale(parseDate(d.date)!))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Secondary line (no area)
    if (secondaryData && secondaryData.length > 0) {
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

    // Primary line (no area)
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

    // Legend (unchanged)
    const legend = svg.append('g')
  .attr('transform', `translate(${margin.left}, 12)`);

const legendItems = [
  { color: primaryColor, label: primaryLabel },
  ...(secondaryData ? [{ color: secondaryColor, label: secondaryLabel }] : [])
];

const item = legend.selectAll('.legend-item')
  .data(legendItems)
  .enter()
  .append('g')
  .attr('class', 'legend-item')
  .attr('transform', (d, i) => `translate(${i * 120}, 0)`); // spacing control

item.append('circle')
  .attr('r', 4)
  .attr('cy', 0)
  .attr('fill', d => d.color);

item.append('text')
  .attr('x', 10)
  .attr('y', 4)
  .text(d => d.label)
  .style('font-size', '10px')
  .attr('fill', '#374151')
  .style('font-weight', 200);

    // Tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.8)')
      .style('color', 'white')
      .style('padding', '8px 12px')
      .style('border-radius', '6px')
      .style('font-size', '9px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    // Hover overlay
    g.append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mouseX] = d3.pointer(event);
        const x0 = xScale.invert(mouseX);

        const bisect = d3.bisector((d: DataPoint) => parseDate(d.date)!).left;
        const i = bisect(data, x0, 1);

        const d0 = data[i - 1];
        const d1 = data[i];
        if (!d0 || !d1) return;

        const d =
          x0.getTime() - parseDate(d0.date)!.getTime() >
          parseDate(d1.date)!.getTime() - x0.getTime()
            ? d1
            : d0;

        let impressionVal: number | null = null;

        if (secondaryData) {
          const match = secondaryData.find(s => s.date === d.date);
          if (match) impressionVal = match.value;
        }

        tooltip
          .style('opacity', 1)
          .html(`
            <strong>${formatDate(parseDate(d.date)!)}</strong><br/>
            ${primaryLabel}: ${d.value.toLocaleString()}
            ${impressionVal !== null ? `<br/>${secondaryLabel}: ${impressionVal.toLocaleString()}` : ''}
          `)
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

    return () => {
      d3.selectAll('.d3-tooltip').remove();
    };

  }, [data, secondaryData, width, height, primaryColor, secondaryColor, primaryLabel, secondaryLabel, showArea, animate]);

  return <svg ref={svgRef} className="overflow-visible" />;
};

export default D3LineChart;