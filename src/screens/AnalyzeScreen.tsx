import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type Analysis, type SubscriptionStatus } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { AnalysisResultCard } from '@/components/AnalysisResultCard';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { colors } from '@/theme/colors';
import type { AppStackScreenProps } from '@/navigation/types';

interface PickedImage {
  uri: string;
  name?: string;
  type?: string;
}

export function AnalyzeScreen({ navigation }: AppStackScreenProps<'Analyze'>) {
  const { user, signOut } = useAuth();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api.subscription
      .status()
      .then(setSub)
      .catch(() => {});
  }, []);

  useFocusEffect(loadStatus);

  async function pickImage(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Please allow access to continue.');
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });

    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? 'chart.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    });
    setAnalysis(null);
    setError(null);
  }

  async function runAnalysis() {
    if (!image) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.analysis.analyze(image);
      setAnalysis(result);
      loadStatus();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'limit_reached') {
        const when = e.resetsAt ? new Date(e.resetsAt).toLocaleString() : 'tomorrow';
        setError(`Daily limit reached. Resets ${when}.`);
      } else {
        setError(e instanceof ApiError ? e.message : 'Analysis failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  const remaining = sub ? Math.max(0, sub.daily_limit - sub.used_today) : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={styles.hello}>Hi, {user?.email ?? 'trader'}</Text>
          <Text style={styles.sub}>Upload a chart to get an analysis</Text>
        </View>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.navRow}>
        <Chip label="Prices" active={false} onPress={() => navigation.navigate('Prices')} />
        <Chip label="History" active={false} onPress={() => navigation.navigate('History')} />
        <Chip label="Alerts" active={false} onPress={() => navigation.navigate('Alerts')} />
      </View>

      {sub && (
        <View style={styles.usage}>
          <Text style={styles.usageText}>
            {sub.tier.toUpperCase()} · {remaining}/{sub.daily_limit} analyses left today
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.dropzone}
        activeOpacity={0.8}
        onPress={() => pickImage(false)}
      >
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.preview} resizeMode="cover" />
        ) : (
          <View style={styles.dropzoneInner}>
            <Text style={styles.dropzoneIcon}>📈</Text>
            <Text style={styles.dropzoneText}>Tap to choose a chart screenshot</Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.pickRow}>
        <Button
          label="Photo library"
          variant="secondary"
          onPress={() => pickImage(false)}
          style={styles.flexBtn}
        />
        <Button
          label="Camera"
          variant="secondary"
          onPress={() => pickImage(true)}
          style={styles.flexBtn}
        />
      </View>

      <Button
        label="Analyze chart"
        onPress={runAnalysis}
        loading={loading}
        disabled={!image}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      {loading && !analysis && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Analyzing your chart…</Text>
        </View>
      )}

      {analysis && <AnalysisResultCard analysis={analysis} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hello: { color: colors.text, fontSize: 20, fontWeight: '800' },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  signOut: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  navRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  usage: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  usageText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  dropzone: {
    height: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dropzoneInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  dropzoneIcon: { fontSize: 40 },
  dropzoneText: { color: colors.textMuted, fontSize: 15 },
  preview: { width: '100%', height: '100%' },
  pickRow: { flexDirection: 'row', gap: 12 },
  flexBtn: { flex: 1 },
  error: { color: colors.danger, fontSize: 14 },
  loadingBox: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  loadingText: { color: colors.textMuted },
});
