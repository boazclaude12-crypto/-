import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type Analysis } from '@/api';
import { AnalysisResultCard } from '@/components/AnalysisResultCard';
import { colors } from '@/theme/colors';
import { relativeTime } from '@/utils/time';
import type { AppStackScreenProps } from '@/navigation/types';

export function AnalysisDetailScreen({ route }: AppStackScreenProps<'AnalysisDetail'>) {
  const { id } = route.params;
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.analysis
      .get(id)
      .then((result) => {
        if (active) setAnalysis(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : 'Failed to load analysis.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !analysis) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Analysis not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Image source={{ uri: analysis.image_url }} style={styles.image} resizeMode="cover" />
      <Text style={styles.time}>{relativeTime(analysis.created_at)}</Text>
      <AnalysisResultCard analysis={analysis} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 14 },
  image: { width: '100%', height: 220, borderRadius: 16, backgroundColor: colors.surface },
  time: { color: colors.textMuted, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});
