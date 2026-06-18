/** Format a price with more decimals for sub-$1 assets (e.g. XRP, ADA). */
export function formatPrice(value: number): string {
  const decimals = value >= 100 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: decimals });
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
