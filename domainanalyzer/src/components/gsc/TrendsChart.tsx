import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  format,
  parseISO,
  differenceInDays,
  startOfWeek,
  startOfMonth,
} from "date-fns";

export interface TrendDataPoint {
  date: string;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}

interface TrendsChartProps {
  data: TrendDataPoint[];
  selectedMetrics?: ("clicks" | "impressions" | "ctr" | "position")[];
  chartType?: "line" | "area";
  height?: number;
}

const TrendsChart = ({
  data,
  selectedMetrics = ["clicks", "impressions", "ctr", "position"],
  chartType = "line",
  height = 300,
}: TrendsChartProps) => {

const [selectedMetricsState, setSelectedMetricsState] = useState<("clicks" | "impressions" | "ctr" | "position")[]>(selectedMetrics);

  // Format data for chart
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    const sorted = [...data].sort((a, b) =>
      a.date < b.date ? -1 : 1
  );

  const firstDate = parseISO(sorted[0].date);
  const lastDate = parseISO(sorted[sorted.length - 1].date);

  const totalDays = differenceInDays(lastDate, firstDate);
  
  let mode: "daily" | "weekly" | "monthly";

  if (totalDays <= 14) mode = "daily";
  else if (totalDays <= 90) mode = "weekly";
  else mode = "monthly";

  if (mode === "daily") {
  const grouped: Record<string, TrendDataPoint[]> = {};
  sorted.forEach((point) => {
    if (!grouped[point.date]) grouped[point.date] = [];
    grouped[point.date].push(point);
  });

  return Object.entries(grouped).map(([date, points]) => {
    const totalClicks = points.reduce((sum, p) => sum + (p.clicks || 0), 0);
    const totalImpressions = points.reduce((sum, p) => sum + (p.impressions || 0), 0);
    const avgPosition = points.reduce((sum, p) => sum + (p.position || 0), 0) / points.length;
    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    return {
      dateKey: date,
      dateFormatted: format(parseISO(date), "MMM d"),
      clicks: totalClicks,
      impressions: totalImpressions,
      position: avgPosition,
      ctrPercent: ctr * 100,
    };
  });
}

  const grouped: Record<string, TrendDataPoint[]> = {};

  sorted.forEach((point) => {
    const dateObj = parseISO(point.date);

    const keyDate =
      mode === "weekly"
        ? startOfWeek(dateObj, { weekStartsOn: 1 })
        : startOfMonth(dateObj);

    const key = format(keyDate, "yyyy-MM-dd");

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(point);
  });

  return Object.entries(grouped)
    .map(([key, points]) => {
      const totalClicks = points.reduce(
        (sum, p) => sum + (p.clicks || 0),
        0
      );

      const totalImpressions = points.reduce(
        (sum, p) => sum + (p.impressions || 0),
        0
      );

      const avgPosition =
        points.reduce((sum, p) => sum + (p.position || 0), 0) /
        points.length;

      const ctr =
        totalImpressions > 0
          ? totalClicks / totalImpressions
          : 0;

      return {
        dateKey: key,
        dateFormatted:
          mode === "weekly"
            ? ` ${format(parseISO(key), "MMM d")}`
            : format(parseISO(key), "MMM yyyy"),
        clicks: totalClicks,
        impressions: totalImpressions,
        position: avgPosition,
        ctrPercent: ctr * 100,
      };
    })
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}, [data]);

  // Custom tooltip formatter
  const formatTooltipValue = (value: number, name: string) => {
    if (name === "ctr" || name === "ctrPercent") {
      return `${value.toFixed(2)}%`;
    }
    if (name === "position") {
      return value.toFixed(1);
    }
    return value.toLocaleString();
  };

  const formatTooltipLabel = (label: string) => {
    try {
      return format(parseISO(label), "MMM d, yyyy");
    } catch {
      return label;
    }
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-gray-50 rounded-2xl border border-gray-200">
        <p className="text-sm text-gray-500">No trend data available</p>
      </div>
    );
  }

  const colors = {
    clicks: "#2d994d",
    impressions: "#000000",
    ctr: "#007aff",
    position: "#ff9500",
  };

  const ChartComponent = chartType === "area" ? AreaChart : LineChart;

  return (
    <div className="w-full bg-white rounded-2xl  p-4 h-full pt-16 relative">
      
  {/* Metrics Selection – top-right overlay */}
  <div className="absolute top-4 right-4  rounded-xl  p-3 shadow-sm z-10">
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {(['clicks', 'impressions', 'ctr', 'position'] as const).map((metric) => (
        <label key={metric} className="flex items-center gap-1 cursor-pointer">
          <input
  type="checkbox"
  checked={selectedMetricsState.includes(metric)}
  onChange={(e) => {
    if (e.target.checked) {
      setSelectedMetricsState([...selectedMetricsState, metric]);
    } else {
      setSelectedMetricsState(selectedMetricsState.filter((m) => m !== metric));
    }
  }}
/>
          <span className="text-xs font-light text-gray-700 capitalize tracking-tight">{metric}</span>
        </label>
      ))}
    </div>
  </div>
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="dateFormatted"
            stroke="#86868b"
            style={{ fontSize: "12px" }}
            tick={{ fill: "#86868b" }}
          />
          <YAxis
            stroke="#86868b"
            style={{ fontSize: "12px" }}
            tick={{ fill: "#86868b" }}
            tickFormatter={(value) => {
              if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
              return value.toString();
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #d2d2d7",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelFormatter={formatTooltipLabel}
            formatter={formatTooltipValue}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "10px" }}
            iconType="line"
          />
          {selectedMetricsState.includes("clicks") && (
            chartType === "area" ? (
              <Area
                type="monotone"
                dataKey="clicks"
                stroke={colors.clicks}
                fill={colors.clicks}
                fillOpacity={0.2}
                name="Clicks"
                strokeWidth={2}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="clicks"
                stroke={colors.clicks}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Clicks"
              />
            )
          )}
          {selectedMetricsState.includes("impressions") && (
            chartType === "area" ? (
              <Area
                type="monotone"
                dataKey="impressions"
                stroke={colors.impressions}
                fill={colors.impressions}
                fillOpacity={0.2}
                name="Impressions"
                strokeWidth={2}
              />
            ) : (
              <Line
                type="monotone"
                dataKey="impressions"
                stroke={colors.impressions}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Impressions"
              />
            )
          )}
          {selectedMetricsState.includes("ctr") && (
            chartType === "area" ? (
              <Area
                type="monotone"
                dataKey="ctrPercent"
                stroke={colors.ctr}
                fill={colors.ctr}
                fillOpacity={0.2}
                name="CTR (%)"
                strokeWidth={2}
                yAxisId="right"
              />
            ) : (
              <Line
                type="monotone"
                dataKey="ctrPercent"
                stroke={colors.ctr}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="CTR (%)"
                yAxisId="right"
              />
            )
          )}
          {selectedMetricsState.includes("position") && (
            chartType === "area" ? (
              <Area
                type="monotone"
                dataKey="position"
                stroke={colors.position}
                fill={colors.position}
                fillOpacity={0.2}
                name="Position"
                strokeWidth={2}
                yAxisId="right"
              />
            ) : (
              <Line
                type="monotone"
                dataKey="position"
                stroke={colors.position}
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Position"
                yAxisId="right"
              />
            )
          )}
          {(selectedMetricsState.includes("ctr") || selectedMetricsState.includes("position")) && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#86868b"
              style={{ fontSize: "12px" }}
              tick={{ fill: "#86868b" }}
              tickFormatter={(value) => {
                if (selectedMetrics.includes("ctr")) return `${value.toFixed(1)}%`;
                return value.toFixed(1);
              }}
            />
          )}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendsChart;

