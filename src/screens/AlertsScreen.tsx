import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type AlertDirection, type PriceAlert, type PriceListItem, type PriceRange } from '@/api';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { registerForPushNotificationsAsync } from '@/notifications/push';
import { colors } from '@/theme/colors';

const TIMEFRAMES: PriceRange[] = ['1h', '24h', '7d', '30d'];

export function AlertsScreen() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [symbols, setSymbols] = useState<PriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [symbol, setSymbol] = useState<string | null>(null);
  const [direction, setDirection] = useState<AlertDirection>('up');
  const [timeframe, setTimeframe] = useState<PriceRange>('24h');
  const [threshold, setThreshold] = useState('5');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pushStatus, setPushStatus] = useState<'idle' | 'enabling' | 'enabled' | 'denied'>('idle');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [alertList, priceList] = await Promise.all([api.alerts.list(), api.prices.list()]);
      setAlerts(alertList);
      setSymbols(priceList);
      setSymbol((current) => current ?? priceList[0]?.symbol ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load alerts.');
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

  async function onEnableNotifications() {
    setPushStatus('enabling');
    const registration = await registerForPushNotificationsAsync();
    if (!registration) {
      setPushStatus('denied');
      return;
    }
    try {
      await api.alerts.registerPushToken(registration);
      setPushStatus('enabled');
    } catch {
      setPushStatus('denied');
    }
  }

  async function onCreateAlert() {
    setFormError(null);
    const thresholdPercent = Number(threshold);
    if (!symbol) {
      setFormError('Choose a symbol.');
      return;
    }
    if (!Number.isFinite(thresholdPercent) || thresholdPercent <= 0) {
      setFormError('Enter a valid percentage greater than 0.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await api.alerts.create({ symbol, direction, threshold_percent: thresholdPercent, timeframe });
      setAlerts((prev) => [created, ...prev]);
      setShowForm(false);
      setThreshold('5');
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Failed to create alert.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onDelete(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    try {
      await api.alerts.remove(id);
    } catch {
      load();
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.container}
      data={alerts}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListHeaderComponent={
        <View style={styles.headerSection}>
          <PushBanner status={pushStatus} onEnable={onEnableNotifications} />

          {error && <Text style={styles.error}>{error}</Text>}

          {!showForm ? (
            <Button label="+ New alert" variant="secondary" onPress={() => setShowForm(true)} />
          ) : (
            <View style={styles.form}>
              <Text style={styles.formLabel}>Symbol</Text>
              <View style={styles.chipRow}>
                {symbols.map((s) => (
                  <Chip
                    key={s.symbol}
                    label={s.symbol.replace('USDT', '')}
                    active={symbol === s.symbol}
                    onPress={() => setSymbol(s.symbol)}
                  />
                ))}
              </View>

              <Text style={styles.formLabel}>Direction</Text>
              <View style={styles.chipRow}>
                <Chip label="Up" active={direction === 'up'} onPress={() => setDirection('up')} />
                <Chip label="Down" active={direction === 'down'} onPress={() => setDirection('down')} />
              </View>

              <Text style={styles.formLabel}>Timeframe</Text>
              <View style={styles.chipRow}>
                {TIMEFRAMES.map((tf) => (
                  <Chip key={tf} label={tf.toUpperCase()} active={timeframe === tf} onPress={() => setTimeframe(tf)} />
                ))}
              </View>

              <TextField
                label="Threshold (%)"
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="numeric"
                placeholder="5"
              />

              {formError && <Text style={styles.error}>{formError}</Text>}

              <View style={styles.formActions}>
                <Button label="Cancel" variant="secondary" onPress={() => setShowForm(false)} style={styles.flexBtn} />
                <Button label="Create" onPress={onCreateAlert} loading={submitting} style={styles.flexBtn} />
              </View>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => <AlertRow alert={item} onDelete={() => onDelete(item.id)} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No alerts yet. Create one to get notified.</Text>
        </View>
      }
    />
  );
}

function PushBanner({
  status,
  onEnable,
}: {
  status: 'idle' | 'enabling' | 'enabled' | 'denied';
  onEnable: () => void;
}) {
  if (status === 'enabled') {
    return (
      <View style={styles.banner}>
        <Text style={styles.bannerTextEnabled}>Push notifications enabled</Text>
      </View>
    );
  }
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        {status === 'denied'
          ? 'Notifications permission denied. Enable it in system settings to receive alerts.'
          : 'Enable push notifications to get alerted the moment a price target hits.'}
      </Text>
      <Button
        label="Enable notifications"
        variant="secondary"
        onPress={onEnable}
        loading={status === 'enabling'}
        style={styles.bannerBtn}
      />
    </View>
  );
}

function AlertRow({ alert, onDelete }: { alert: PriceAlert; onDelete: () => void }) {
  const isUp = alert.direction === 'up';
  return (
    <View style={styles.row}>
      <View style={[styles.dirBadge, { backgroundColor: isUp ? colors.green : colors.red }]}>
        <Text style={styles.dirBadgeText}>{isUp ? '▲' : '▼'}</Text>
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{alert.symbol.replace('USDT', '')}</Text>
        <Text style={styles.rowMeta}>
          {isUp ? 'Up' : 'Down'} {alert.threshold_percent}% over {alert.timeframe.toUpperCase()}
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, flexGrow: 1, gap: 12 },
  headerSection: { gap: 14, marginBottom: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, fontSize: 14 },
  emptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingTop: 12 },
  separator: { height: 12 },

  banner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  bannerText: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  bannerTextEnabled: { color: colors.green, fontSize: 13, fontWeight: '700' },
  bannerBtn: { height: 44 },

  form: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  formLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  flexBtn: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  dirBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dirBadgeText: { color: '#fff', fontWeight: '800' },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: 13, marginTop: 2 },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 6 },
  deleteText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
});
