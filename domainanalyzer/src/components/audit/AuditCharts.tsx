import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

interface AuditData {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  pwa: number;
}

interface AuditChartsProps {
  data: AuditData;
}

const getScoreColor = (score: number) => {
  if (score >= 0.9) return '#16A34A'; // green
  if (score >= 0.5) return '#F59E0B'; // yellow
  return '#DC2626'; // red
};

const getScoreColorLight = (score: number) => {
  if (score >= 0.9) return '#4ADE80';
  if (score >= 0.5) return '#FBBF24';
  return '#F87171';
};

// Radar Chart Component
export const AuditRadarChart: React.FC<AuditChartsProps> = ({ data }) => {
  const chartData = [
    { metric: 'Performance', score: Math.round(data.performance * 100), fullMark: 100 },
    { metric: 'SEO', score: Math.round(data.seo * 100), fullMark: 100 },
    { metric: 'Accessibility', score: Math.round(data.accessibility * 100), fullMark: 100 },
    { metric: 'Best Practices', score: Math.round(data.bestPractices * 100), fullMark: 100 },
    { metric: 'PWA', score: Math.round(data.pwa * 100), fullMark: 100 },
  ];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
        <PolarGrid stroke="#e5e7eb" strokeWidth={0.5} />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fill: '#86868b', fontSize: 12, fontWeight: 300 }}
          style={{ letterSpacing: '0.011em' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fill: '#86868b', fontSize: 11 }}
          tickCount={6}
        />
        <Radar
          name="Score"
          dataKey="score"
          stroke="#1d1d1f"
          fill="#1d1d1f"
          fillOpacity={0.1}
          strokeWidth={1.5}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '0.5px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
            backdropFilter: 'blur(20px)',
          }}
          formatter={(value: number) => [`${value}%`, 'Score']}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};

// Bar Chart Component
export const AuditBarChart: React.FC<AuditChartsProps> = ({ data }) => {
  const chartData = [
    { name: 'Performance', score: Math.round(data.performance * 100) },
    { name: 'SEO', score: Math.round(data.seo * 100) },
    { name: 'Accessibility', score: Math.round(data.accessibility * 100) },
    { name: 'Best Practices', score: Math.round(data.bestPractices * 100) },
    { name: 'PWA', score: Math.round(data.pwa * 100) },
  ].map((item) => ({
    ...item,
    color: getScoreColor(item.score / 100),
    colorLight: getScoreColorLight(item.score / 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: '#86868b', fontSize: 11 }}
          stroke="#d2d2d7"
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#1d1d1f', fontSize: 12, fontWeight: 300 }}
          stroke="#d2d2d7"
          width={70}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '0.5px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
            backdropFilter: 'blur(20px)',
          }}
          formatter={(value: number) => [`${value}%`, 'Score']}
        />
        <Bar
          dataKey="score"
          radius={[0, 8, 8, 0]}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// Gauge Chart Component (Circular Progress)
export const AuditGaugeChart: React.FC<{ label: string; score: number; size?: number }> = ({
  label,
  score,
  size = 120,
}) => {
  const percent = Math.round(score * 100);
  const color = getScoreColor(score);
  const colorLight = getScoreColorLight(score);
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="8"
            fill="transparent"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.6s ease-in-out',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div
              className="text-2xl font-light"
              style={{ color: '#1d1d1f', letterSpacing: '-0.003em' }}
            >
              {percent}
            </div>
            <div className="text-xs text-gray-500" style={{ letterSpacing: '0.011em' }}>
              %
            </div>
          </div>
        </div>
      </div>
      <div
        className="mt-4 text-sm font-light text-center"
        style={{ color: '#86868b', letterSpacing: '0.011em' }}
      >
        {label}
      </div>
    </div>
  );
};

// Score Distribution Pie Chart
export const AuditScoreDistribution: React.FC<AuditChartsProps> = ({ data }) => {
  const categories = [
    { name: 'Excellent (90-100)', value: 0, color: '#16A34A' },
    { name: 'Good (50-89)', value: 0, color: '#F59E0B' },
    { name: 'Needs Work (<50)', value: 0, color: '#DC2626' },
  ];

  const scores = [
    data.performance,
    data.seo,
    data.accessibility,
    data.bestPractices,
    data.pwa,
  ];

  scores.forEach((score) => {
    const percent = score * 100;
    if (percent >= 90) categories[0].value++;
    else if (percent >= 50) categories[1].value++;
    else categories[2].value++;
  });

  const chartData = categories.filter((cat) => cat.value > 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value }) => `${name}: ${value}`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '0.5px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
            backdropFilter: 'blur(20px)',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

// Line Chart Component (Future-ready for trends)
export const AuditLineChart: React.FC<{ data?: Array<{ date: string; score: number }> }> = ({
  data = [],
}) => {
  // Placeholder data if no history
  const chartData =
    data.length > 0
      ? data
      : [
          { date: 'Now', score: 85 },
          { date: 'Future', score: 90 },
        ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeWidth={0.5} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#86868b', fontSize: 11 }}
          stroke="#d2d2d7"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#86868b', fontSize: 11 }}
          stroke="#d2d2d7"
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '0.5px solid rgba(0, 0, 0, 0.1)',
            borderRadius: '8px',
            fontSize: '12px',
            padding: '8px 12px',
            backdropFilter: 'blur(20px)',
          }}
          formatter={(value: number) => [`${value}%`, 'Score']}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#1d1d1f"
          strokeWidth={2}
          dot={{ fill: '#1d1d1f', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// Overall Score Gauge (Large, Prominent)
export const OverallScoreGauge: React.FC<{ score: number }> = ({ score }) => {
  const percent = Math.round(score * 100);
  const color = getScoreColor(score);
  const size = 200;
  const radius = size / 2 - 15;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth="12"
            fill="transparent"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.8s ease-in-out',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div
              className="text-6xl font-light"
              style={{ color: '#1d1d1f', letterSpacing: '-0.003em', lineHeight: 1.05 }}
            >
              {percent}
            </div>
            <div
              className="text-lg mt-1"
              style={{ color: '#86868b', letterSpacing: '0.011em', fontWeight: 300 }}
            >
              Overall Score
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

