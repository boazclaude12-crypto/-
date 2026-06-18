import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Analysis } from '@/api';
import { colors } from '@/theme/colors';

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export function AnalysisResultCard({ analysis }: { analysis: Analysis }) {
  const isLong = analysis.direction === 'long';
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{analysis.symbol ?? 'Chart analysis'}</Text>
        <View style={[styles.badge, { backgroundColor: isLong ? colors.green : colors.red }]}>
          <Text style={styles.badgeText}>{analysis.direction.toUpperCase()}</Text>
        </View>
      </View>

      <Row label="Entry point" value={fmt(analysis.entry_point)} />
      <Row label="Take profit" value={fmt(analysis.take_profit)} accent={colors.green} />
      <Row label="Stop loss" value={fmt(analysis.stop_loss)} accent={colors.red} />
      <Row label="Confidence" value={`${Math.round(analysis.confidence * 100)}%`} />

      <Text style={styles.explanationLabel}>Explanation</Text>
      <Text style={styles.explanation}>{analysis.explanation}</Text>
    </View>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { color: colors.textMuted, fontSize: 15 },
  rowValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  explanationLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  explanation: { color: colors.text, fontSize: 14, lineHeight: 21 },
});
