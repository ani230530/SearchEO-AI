import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface BarDataPoint {
  label: string;
  value: number;
  id?: string | number;
}

interface D3BarChartProps {
  data: BarDataPoint[];
  width?: number;
  height?: number;
  color?: string;
  gradientColors?: [string, string];
  horizontal?: boolean;
  animate?: boolean;
  onBarClick?: (item: BarDataPoint) => void;
  maxBars?: number;
}

const D3BarChart: React.FC<D3BarChartProps> = ({
  data,
  width = 600,
  height = 300,
  color = '#8b5cf6',
  gradientColors,
  horizontal = false,
  animate = true,
  onBarClick,
  maxBars = 10
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    // Limit data to maxBars
    const limitedData = data.slice(0, maxBars);

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = horizontal 
      ? { top: 20, right: 30, bottom: 30, left: 120 }
      : { top: 20, right: 20, bottom: 60, left: 50 };
    
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    // Create gradient if specified
    if (gradientColors) {
      const defs = svg.append('defs');
      const gradient = defs.append('linearGradient')
        .attr('id', 'barGradient')
        .attr('x1', horizontal ? '0%' : '0%')
        .attr('y1', horizontal ? '0%' : '100%')
        .attr('x2', horizontal ? '100%' : '0%')
        .attr('y2', horizontal ? '0%' : '0%');
      
      gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', gradientColors[0]);
      
      gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', gradientColors[1]);
    }

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const maxValue = d3.max(limitedData, d => d.value) || 0;

    if (horizontal) {
      // Horizontal bar chart
      const yScale = d3.scaleBand()
        .domain(limitedData.map(d => d.label))
        .range([0, innerHeight])
        .padding(0.3);

      const xScale = d3.scaleLinear()
        .domain([0, maxValue * 1.1])
        .range([0, innerWidth]);

      // Add axes
      g.append('g')
        .call(d3.axisLeft(yScale))
        .selectAll('text')
        .attr('fill', '#6b7280')
        .style('font-size', '11px')
        .each(function() {
          const text = d3.select(this);
          const label = text.text();
          if (label.length > 15) {
            text.text(label.slice(0, 15) + '...');
          }
        });

      g.append('g')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale)
          .ticks(5)
          .tickFormat(d => d3.format('.2s')(d as number))
        )
        .selectAll('text')
        .attr('fill', '#6b7280')
        .style('font-size', '11px');

      // Draw bars
      const bars = g.selectAll('.bar')
        .data(limitedData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('y', d => yScale(d.label)!)
        .attr('height', yScale.bandwidth())
        .attr('x', 0)
        .attr('rx', 4)
        .attr('fill', gradientColors ? 'url(#barGradient)' : color)
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on('click', (_, d) => onBarClick?.(d))
        .on('mouseenter', function() {
          d3.select(this).style('opacity', 0.8);
        })
        .on('mouseleave', function() {
          d3.select(this).style('opacity', 1);
        });

      if (animate) {
        bars
          .attr('width', 0)
          .transition()
          .duration(800)
          .delay((_, i) => i * 50)
          .ease(d3.easeQuadOut)
          .attr('width', d => xScale(d.value));
      } else {
        bars.attr('width', d => xScale(d.value));
      }

      // Add value labels
      g.selectAll('.value-label')
        .data(limitedData)
        .enter()
        .append('text')
        .attr('class', 'value-label')
        .attr('x', d => xScale(d.value) + 5)
        .attr('y', d => yScale(d.label)! + yScale.bandwidth() / 2 + 4)
        .text(d => d.value.toLocaleString())
        .attr('fill', '#374151')
        .style('font-size', '11px')
        .style('opacity', 0)
        .transition()
        .delay(animate ? 800 : 0)
        .duration(300)
        .style('opacity', 1);

    } else {
      // Vertical bar chart
      const xScale = d3.scaleBand()
        .domain(limitedData.map(d => d.label))
        .range([0, innerWidth])
        .padding(0.3);

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
        .call(d3.axisBottom(xScale))
        .selectAll('text')
        .attr('fill', '#6b7280')
        .style('font-size', '10px')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .each(function() {
          const text = d3.select(this);
          const label = text.text();
          if (label.length > 12) {
            text.text(label.slice(0, 12) + '...');
          }
        });

      g.append('g')
        .call(d3.axisLeft(yScale)
          .ticks(5)
          .tickFormat(d => d3.format('.2s')(d as number))
        )
        .selectAll('text')
        .attr('fill', '#6b7280')
        .style('font-size', '11px');

      // Draw bars
      const bars = g.selectAll('.bar')
        .data(limitedData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => xScale(d.label)!)
        .attr('width', xScale.bandwidth())
        .attr('rx', 4)
        .attr('fill', gradientColors ? 'url(#barGradient)' : color)
        .style('cursor', onBarClick ? 'pointer' : 'default')
        .on('click', (_, d) => onBarClick?.(d))
        .on('mouseenter', function() {
          d3.select(this).style('opacity', 0.8);
        })
        .on('mouseleave', function() {
          d3.select(this).style('opacity', 1);
        });

      if (animate) {
        bars
          .attr('y', innerHeight)
          .attr('height', 0)
          .transition()
          .duration(800)
          .delay((_, i) => i * 50)
          .ease(d3.easeQuadOut)
          .attr('y', d => yScale(d.value))
          .attr('height', d => innerHeight - yScale(d.value));
      } else {
        bars
          .attr('y', d => yScale(d.value))
          .attr('height', d => innerHeight - yScale(d.value));
      }
    }

    // Add tooltip
    const tooltip = d3.select('body').append('div')
      .attr('class', 'd3-bar-tooltip')
      .style('position', 'absolute')
      .style('background', 'rgba(0,0,0,0.85)')
      .style('color', 'white')
      .style('padding', '10px 14px')
      .style('border-radius', '8px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 1000);

    g.selectAll('.bar')
      .on('mouseenter', function(event, d: any) {
        tooltip
          .style('opacity', 1)
          .html(`<strong>${d.label}</strong><br/>Value: ${d.value.toLocaleString()}`)
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip
          .style('left', (event.pageX + 15) + 'px')
          .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseleave', function() {
        tooltip.style('opacity', 0);
      });

    return () => {
      d3.selectAll('.d3-bar-tooltip').remove();
    };
  }, [data, width, height, color, gradientColors, horizontal, animate, onBarClick, maxBars]);

  return (
    <svg ref={svgRef} className="overflow-visible" />
  );
};

export default D3BarChart;
