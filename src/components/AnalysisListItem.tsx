import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Analysis } from '@/api';
import { colors } from '@/theme/colors';
import { relativeTime } from '@/utils/time';

export function AnalysisListItem({
  analysis,
  onPress,
}: {
  analysis: Analysis;
  onPress: () => void;
}) {
  const isLong = analysis.direction === 'long';
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={onPress}>
      <Image source={{ uri: analysis.image_url }} style={styles.thumb} resizeMode="cover" />
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{analysis.symbol ?? 'Chart analysis'}</Text>
          <View style={[styles.badge, { backgroundColor: isLong ? colors.green : colors.red }]}>
            <Text style={styles.badgeText}>{analysis.direction.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={styles.meta}>
          Entry {fmt(analysis.entry_point)} · {Math.round(analysis.confidence * 100)}% confidence
        </Text>
        <Text style={styles.time}>{relativeTime(analysis.created_at)}</Text>
      </View>
    </TouchableOpacity>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  info: { flex: 1, gap: 4, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  meta: { color: colors.textMuted, fontSize: 13 },
  time: { color: colors.textMuted, fontSize: 12 },
});
