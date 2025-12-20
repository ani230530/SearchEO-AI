import { useMemo } from "react";
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
import { format, parseISO } from "date-fns";

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
  selectedMetrics = ["clicks", "impressions"],
  chartType = "line",
  height = 300,
}: TrendsChartProps) => {
  // Format data for chart
  const chartData = useMemo(() => {
    return data
      .map((point) => ({
        ...point,
        dateFormatted: format(parseISO(point.date), "MMM d"),
        ctrPercent: point.ctr ? point.ctr * 100 : undefined,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
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
    clicks: "#1d1d1f",
    impressions: "#86868b",
    ctr: "#007aff",
    position: "#ff9500",
  };

  const ChartComponent = chartType === "area" ? AreaChart : LineChart;

  return (
    <div className="w-full bg-white rounded-2xl border border-gray-200 p-4">
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
          {selectedMetrics.includes("clicks") && (
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
          {selectedMetrics.includes("impressions") && (
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
          {selectedMetrics.includes("ctr") && (
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
          {selectedMetrics.includes("position") && (
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
          {(selectedMetrics.includes("ctr") || selectedMetrics.includes("position")) && (
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

