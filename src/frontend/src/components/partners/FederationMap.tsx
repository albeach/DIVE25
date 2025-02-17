import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { partnerApi } from '@services/api';
import * as d3 from 'd3';
import { Spinner } from '@components/common/Spinner';

interface FederationNode {
  id: string;
  name: string;
  country: string;
  type: 'NATO' | 'PARTNER';
  clearanceLevel: string;
  status: 'ACTIVE' | 'PENDING' | 'INACTIVE';
}

interface FederationLink {
  source: string;
  target: string;
  strength: number;
  type: 'DIRECT' | 'INDIRECT';
}

interface FederationData {
  nodes: FederationNode[];
  links: FederationLink[];
}

export function FederationMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['federation-map'],
    queryFn: () => partnerApi.getFederationMap()
  });

  useEffect(() => {
    if (!data || !svgRef.current) return;

    const width = 800;
    const height = 600;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current)
      .attr('viewBox', [0, 0, width, height])
      .attr('width', '100%')
      .attr('height', '100%');

    // Create force simulation
    const simulation = d3.forceSimulation(data.nodes)
      .force('link', d3.forceLink(data.links)
        .id((d: any) => d.id)
        .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2));

    // Create links
    const link = svg.append('g')
      .selectAll('line')
      .data(data.links)
      .join('line')
      .attr('stroke', (d) => d.type === 'DIRECT' ? '#004990' : '#93C5FD')
      .attr('stroke-width', (d) => d.strength * 2)
      .attr('stroke-opacity', (d) => d.type === 'DIRECT' ? 0.8 : 0.4);

    // Create nodes
    const node = svg.append('g')
      .selectAll('g')
      .data(data.nodes)
      .join('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    // Add circles for nodes
    node.append('circle')
      .attr('r', (d) => d.type === 'NATO' ? 15 : 10)
      .attr('fill', (d) => {
        if (d.type === 'NATO') return '#004990';
        switch (d.status) {
          case 'ACTIVE': return '#10B981';
          case 'PENDING': return '#F59E0B';
          case 'INACTIVE': return '#EF4444';
          default: return '#6B7280';
        }
      });

    // Add labels
    node.append('text')
      .text((d) => d.name)
      .attr('x', 14)
      .attr('y', 4)
      .attr('font-size', '12px')
      .attr('fill', '#1F2937');

    // Update positions on simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Federation Network
          </h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <span className="h-3 w-3 rounded-full bg-nato-blue mr-2" />
              <span className="text-sm text-gray-500">NATO</span>
            </div>
            <div className="flex items-center">
              <span className="h-3 w-3 rounded-full bg-green-500 mr-2" />
              <span className="text-sm text-gray-500">Active Partner</span>
            </div>
            <div className="flex items-center">
              <span className="h-3 w-3 rounded-full bg-yellow-500 mr-2" />
              <span className="text-sm text-gray-500">Pending</span>
            </div>
          </div>
        </div>
        <div className="border rounded-lg">
          <svg ref={svgRef} className="w-full h-[600px]" />
        </div>
      </div>
    </div>
  );
} 