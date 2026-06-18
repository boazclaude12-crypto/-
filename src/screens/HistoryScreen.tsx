import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type Analysis } from '@/api';
import { AnalysisListItem } from '@/components/AnalysisListItem';
import { colors } from '@/theme/colors';
import type { AppStackScreenProps } from '@/navigation/types';

const PAGE_SIZE = 10;

export function HistoryScreen({ navigation }: AppStackScreenProps<'History'>) {
  const [items, setItems] = useState<Analysis[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.analysis.history(1, PAGE_SIZE);
      setItems(result.items);
      setPage(result.page);
      setHasMore(result.has_more);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFirstPage();
    }, [loadFirstPage])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  }

  async function loadMore() {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await api.analysis.history(next, PAGE_SIZE);
      setItems((prev) => [...prev, ...result.items]);
      setPage(result.page);
      setHasMore(result.has_more);
    } catch {
      // Silently keep current list; user can pull to refresh to retry.
    } finally {
      setLoadingMore(false);
    }
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
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <AnalysisListItem
          analysis={item}
          onPress={() => navigation.navigate('AnalysisDetail', { id: item.id })}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No analyses yet. Upload a chart to get started.</Text>
        </View>
      }
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, flexGrow: 1 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  footer: { paddingVertical: 20 },
});
