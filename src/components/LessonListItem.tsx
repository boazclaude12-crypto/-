import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { LessonSummary } from '@/api';
import { colors } from '@/theme/colors';

export function LessonListItem({
  lesson,
  onPress,
}: {
  lesson: LessonSummary;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={onPress}>
      <Image source={{ uri: lesson.image_url }} style={styles.thumb} resizeMode="cover" />
      <View style={styles.info}>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.summary}>{lesson.summary}</Text>
        {lesson.duration_minutes != null && (
          <Text style={styles.meta}>{lesson.duration_minutes} min</Text>
        )}
      </View>
    </TouchableOpacity>
  );
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
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: colors.surfaceAlt },
  info: { flex: 1, gap: 4, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  summary: { color: colors.textMuted, fontSize: 13 },
  meta: { color: colors.primary, fontSize: 12, fontWeight: '600' },
});
