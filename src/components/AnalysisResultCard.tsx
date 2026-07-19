import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Analysis } from '@/api';
import { colors } from '@/theme/colors';

export function AnalysisResultCard({ analysis }: { analysis: Analysis }) {
  const lines = analysis.explanation.split('\n');

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{analysis.symbol ?? 'Chart Analysis'}</Text>
        {analysis.type ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{analysis.type.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.divider} />

      {lines.map((line, i) => {
        if (!line.trim()) return <View key={i} style={styles.spacer} />;
        if (line.startsWith('# ')) return <Text key={i} style={styles.h1}>{line.slice(2)}</Text>;
        if (line.startsWith('## ')) return <Text key={i} style={styles.h2}>{line.slice(3)}</Text>;
        if (line.startsWith('### ')) return <Text key={i} style={styles.h3}>{line.slice(4)}</Text>;
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return (
            <View key={i} style={styles.bullet}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{line.slice(2)}</Text>
            </View>
          );
        }
        // Bold inline (**text**)
        return <Text key={i} style={styles.body}>{line}</Text>;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 6,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.primary + '22' },
  badgeText: { color: colors.primary, fontWeight: '800', fontSize: 12 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  h1: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 8 },
  h2: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 6 },
  h3: { color: colors.primary, fontSize: 15, fontWeight: '700', marginTop: 4 },
  body: { color: colors.text, fontSize: 14, lineHeight: 22 },
  bullet: { flexDirection: 'row', gap: 6, paddingLeft: 4 },
  bulletDot: { color: colors.primary, fontSize: 14, lineHeight: 22 },
  bulletText: { color: colors.text, fontSize: 14, lineHeight: 22, flex: 1 },
  spacer: { height: 6 },
});
