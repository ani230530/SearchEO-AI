import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

interface D3GaugeChartProps {
  value: number;
  maxValue?: number;
  label?: string;
  unit?: string;
  size?: number;
  colorRanges?: { min: number; max: number; color: string }[];
  animate?: boolean;
  showValue?: boolean;
}

const D3GaugeChart: React.FC<D3GaugeChartProps> = ({
  value,
  maxValue = 100,
  label = '',
  unit = '',
  size = 200,
  colorRanges = [
    { min: 0, max: 33, color: '#ef4444' },    // Red
    { min: 33, max: 66, color: '#f59e0b' },   // Yellow
    { min: 66, max: 100, color: '#22c55e' }   // Green
  ],
  animate = true,
  showValue = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('width', size)
      .attr('height', size * 0.82);

    const g = svg.append('g')
      .attr('transform', `translate(${size / 2}, ${size * 0.54})`);

    const radius = size * 0.4;
    const thickness = radius * 0.25;
    const startAngle = -Math.PI / 2 - Math.PI / 6;
    const endAngle = Math.PI / 2 + Math.PI / 6;
    const angleRange = endAngle - startAngle;

    // Create arc generator
    const arc = d3.arc<any>()
      .innerRadius(radius - thickness)
      .outerRadius(radius)
      .startAngle(startAngle)
      .cornerRadius(3);

    // Draw background arc segments based on color ranges
    colorRanges.forEach(range => {
      const segmentStartAngle = startAngle + (range.min / maxValue) * angleRange;
      const segmentEndAngle = startAngle + (range.max / maxValue) * angleRange;

      g.append('path')
        .attr('d', arc({ endAngle: segmentEndAngle, startAngle: segmentStartAngle }))
        .attr('fill', range.color)
        .attr('opacity', 0.2);
    });

    // Determine current color based on value
    const normalizedValue = (value / maxValue) * 100;
    const currentColor = colorRanges.find(
      range => normalizedValue >= range.min && normalizedValue <= range.max
    )?.color || colorRanges[colorRanges.length - 1].color;

    // Calculate value angle
    const clampedValue = Math.min(Math.max(value, 0), maxValue);
    const valueAngle = startAngle + (clampedValue / maxValue) * angleRange;

    // Draw value arc with animation
    const valueArc = g.append('path')
      .attr('fill', currentColor);

    if (animate) {
      valueArc
        .attr('d', arc({ endAngle: startAngle }))
        .transition()
        .duration(1000)
        .ease(d3.easeQuadOut)
        .attrTween('d', () => {
          const interpolate = d3.interpolate(startAngle, valueAngle);
          return (t: number) => arc({ endAngle: interpolate(t) }) || '';
        });
    } else {
      valueArc.attr('d', arc({ endAngle: valueAngle }));
    }

    // Draw needle
    const needleLength = radius * 0.7;
    const needleWidth = 4;

    const needleGroup = g.append('g');

    // Needle path
    const needlePath = needleGroup.append('path')
      .attr('d', `
        M ${-needleWidth / 2} 0
        L 0 ${-needleLength}
        L ${needleWidth / 2} 0
        A ${needleWidth / 2} ${needleWidth / 2} 0 0 1 ${-needleWidth / 2} 0
      `)
      .attr('fill', '#374151');

    // Needle center circle
    needleGroup.append('circle')
      .attr('r', 8)
      .attr('fill', '#1f2937');

    needleGroup.append('circle')
      .attr('r', 4)
      .attr('fill', '#f3f4f6');

    // Animate needle rotation
    if (animate) {
      const startRotation = (startAngle * 180) / Math.PI;
      const endRotation = (valueAngle * 180) / Math.PI;

      needleGroup
        .attr('transform', `rotate(${startRotation})`)
        .transition()
        .duration(1000)
        .ease(d3.easeQuadOut)
        .attr('transform', `rotate(${endRotation})`);
    } else {
      const rotation = (valueAngle * 180) / Math.PI;
      needleGroup.attr('transform', `rotate(${rotation})`);
    }

    // Add value text in center
if (showValue) {
  const valueText = g.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', radius * 0.15)
    .style('font-size', `${size * 0.12}px`)
    .style('font-weight', 'bold')
    .attr('fill', '#1f2937');

  if (animate) {
    valueText
      .text('0' + unit)
      .transition()
      .duration(1000)
      .tween('text', function () {
        const interpolate = d3.interpolateNumber(0, value);
        return function (t) {
          this.textContent = interpolate(t).toFixed(1) + unit;
        };
      });
  } else {
    valueText.text(value.toFixed(1) + unit);
  }
}

    // Add label
    if (label) {
      g.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', radius * 0.82)
        .text(label)
        .style('font-size', `${size * 0.044}px`)
        .attr('fill', '#6b7280');
    }

    // Add min/max labels
    g.append('text')
      .attr('x', -radius * 0.85)
      .attr('y', radius * 0.18)
      .attr('text-anchor', 'middle')
      .text('0')
      .style('font-size', `${size * 0.036}px`)
      .attr('fill', '#9ca3af');

    g.append('text')
      .attr('x', radius * 0.85)
      .attr('y', radius * 0.18)
      .attr('text-anchor', 'middle')
      .text(maxValue.toString())
      .style('font-size', `${size * 0.036}px`)
      .attr('fill', '#9ca3af');

  }, [value, maxValue, label, unit, size, colorRanges, animate]);

  return (
    <svg ref={svgRef} className="mx-auto block overflow-visible" />
  );
};

export default D3GaugeChart;
