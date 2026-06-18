import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, ApiError, type Lesson } from '@/api';
import { colors } from '@/theme/colors';
import type { AppStackScreenProps } from '@/navigation/types';

export function LessonDetailScreen({ route }: AppStackScreenProps<'LessonDetail'>) {
  const { id } = route.params;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.lessons
      .get(id)
      .then((result) => {
        if (active) setLesson(result);
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof ApiError && e.code === 'subscription_required'
              ? 'An active subscription is required to view this lesson.'
              : e instanceof ApiError
                ? e.message
                : 'Failed to load lesson.'
          );
        }
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

  if (error || !lesson) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Lesson not found.'}</Text>
      </View>
    );
  }

  const paragraphs = lesson.body.split('\n').filter((line) => line.trim().length > 0);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Image source={{ uri: lesson.image_url }} style={styles.image} resizeMode="cover" />
      <Text style={styles.title}>{lesson.title}</Text>
      {lesson.duration_minutes != null && (
        <Text style={styles.duration}>{lesson.duration_minutes} min read</Text>
      )}
      {lesson.video_url && <Text style={styles.videoNote}>🎬 Includes a video walkthrough</Text>}
      <View style={styles.body}>
        {paragraphs.map((line, i) =>
          line.startsWith('#') ? (
            <Text key={i} style={styles.heading}>
              {line.replace(/^#+\s*/, '')}
            </Text>
          ) : (
            <Text key={i} style={styles.paragraph}>
              {line}
            </Text>
          )
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 10 },
  image: { width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 6 },
  duration: { color: colors.textMuted, fontSize: 13 },
  videoNote: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  body: { gap: 12, marginTop: 8 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 6 },
  paragraph: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});
