export const KLINE_PERIODS: Record<string, { value: string; label: string; days: number }> = {
  '1d': { value: '1d', label: '日K', days: 1 },
  '1w': { value: '1w', label: '周K', days: 7 },
  '1M': { value: '1M', label: '月K', days: 30 },
  '3M': { value: '3M', label: '3月', days: 90 },
  '6M': { value: '6M', label: '6月', days: 180 },
  '1y': { value: '1y', label: '1年', days: 365 },
  '5y': { value: '5y', label: '5年', days: 1825 },
}
