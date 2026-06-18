import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type PriceListItem } from '@/api';
import { colors } from '@/theme/colors';
import { formatPercent, formatPrice } from '@/utils/format';
import type { AppStackScreenProps } from '@/navigation/types';

export function PricesListScreen({ navigation }: AppStackScreenProps<'Prices'>) {
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.prices.list();
      setItems(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load prices.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.container}
      data={items}
      keyExtractor={(item) => item.symbol}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => {
        const isUp = item.change_24h_percent >= 0;
        return (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('PriceDetail', { symbol: item.symbol })}
          >
            <View>
              <Text style={styles.symbol}>{item.symbol.replace('USDT', '')}</Text>
              <Text style={styles.name}>{item.name}</Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.price}>${formatPrice(item.price)}</Text>
              <Text style={[styles.change, { color: isUp ? colors.green : colors.red }]}>
                {formatPercent(item.change_24h_percent)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, flexGrow: 1 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  symbol: { color: colors.text, fontSize: 16, fontWeight: '800' },
  name: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  right: { alignItems: 'flex-end' },
  price: { color: colors.text, fontSize: 16, fontWeight: '700' },
  change: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});
