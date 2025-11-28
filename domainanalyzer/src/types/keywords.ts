export interface KeywordTableItem {
  id: string;
  keyword: string;
  intent: string;
  volume: number;
  kd: number;
  competition: string;
  cpc: number;
  organic: number;
  paid: number;
  trend: string;
  position: number;
  url: string;
  updated: string;
  isCustom?: boolean;
  selected?: boolean;
}


