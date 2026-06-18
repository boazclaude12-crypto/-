import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { api, ApiError, type PriceHistory, type PriceRange } from '@/api';
import { PriceChart } from '@/components/PriceChart';
import { colors } from '@/theme/colors';
import { formatPrice } from '@/utils/format';
import type { AppStackScreenProps } from '@/navigation/types';

const RANGES: PriceRange[] = ['1h', '24h', '7d', '30d'];

export function PriceDetailScreen({ route }: AppStackScreenProps<'PriceDetail'>) {
  const { symbol } = route.params;
  const [range, setRange] = useState<PriceRange>('24h');
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.prices
      .history(symbol, range)
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : 'Failed to load price history.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [symbol, range]);

  const points = history?.points ?? [];
  const first = points[0]?.price;
  const last = points[points.length - 1]?.price;
  const changePercent = first && last ? ((last - first) / first) * 100 : null;
  const isUp = (changePercent ?? 0) >= 0;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.symbol}>{symbol.replace('USDT', '')}</Text>
        {last != null && (
          <View style={styles.priceRow}>
            <Text style={styles.price}>${formatPrice(last)}</Text>
            {changePercent != null && (
              <Text style={[styles.change, { color: isUp ? colors.green : colors.red }]}>
                {isUp ? '+' : ''}
                {changePercent.toFixed(2)}%
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.chartBox}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : (
          <PriceChart points={points} positive={isUp} />
        )}
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.rangeBtn, r === range && styles.rangeBtnActive]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.rangeText, r === range && styles.rangeTextActive]}>
              {r.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 20 },
  header: { gap: 6 },
  symbol: { color: colors.text, fontSize: 24, fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  price: { color: colors.text, fontSize: 28, fontWeight: '800' },
  change: { fontSize: 15, fontWeight: '700' },
  chartBox: {
    minHeight: 220,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', padding: 16 },
  rangeRow: { flexDirection: 'row', gap: 10 },
  rangeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  rangeTextActive: { color: colors.primaryText },
});
