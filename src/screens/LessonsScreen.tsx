import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type LessonSummary } from '@/api';
import { LessonListItem } from '@/components/LessonListItem';
import { colors } from '@/theme/colors';
import type { AppStackScreenProps } from '@/navigation/types';

export function LessonsScreen({ navigation }: AppStackScreenProps<'Lessons'>) {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLocked(false);
    try {
      const result = await api.lessons.list();
      setLessons(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'subscription_required') {
        setLocked(true);
      } else {
        setError(e instanceof ApiError ? e.message : 'Failed to load lessons.');
      }
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (locked) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockedIcon}>🔒</Text>
        <Text style={styles.lockedTitle}>Learning section is locked</Text>
        <Text style={styles.lockedText}>
          Upgrade to a paid plan to unlock trading lessons and tutorials.
        </Text>
      </View>
    );
  }

  if (error && lessons.length === 0) {
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
      data={lessons}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <LessonListItem lesson={item} onPress={() => navigation.navigate('LessonDetail', { id: item.id })} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No lessons available yet.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, flexGrow: 1 },
  separator: { height: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  lockedIcon: { fontSize: 40 },
  lockedTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  lockedText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
