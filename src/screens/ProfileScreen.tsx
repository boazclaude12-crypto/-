import React, { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type SubscriptionStatus } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { colors } from '@/theme/colors';
import type { AppStackScreenProps } from '@/navigation/types';

export function ProfileScreen({ navigation }: AppStackScreenProps<'Profile'>) {
  const { user, signOut } = useAuth();
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.subscription.status().then(setSub).catch(() => {});
    }, [])
  );

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const tierColor = sub?.tier === 'premium' ? '#9B59B6' : sub?.tier === 'pro' ? colors.primary : colors.textMuted;
  const tierLabel = sub?.tier?.toUpperCase() ?? 'FREE';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar + email */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.email?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={[styles.tierBadge, { backgroundColor: tierColor + '22', borderColor: tierColor }]}>
          <Text style={[styles.tierText, { color: tierColor }]}>{tierLabel}</Text>
        </View>
      </View>

      {/* Subscription card */}
      {sub && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Subscription</Text>
          <Row label="Plan"         value={tierLabel} />
          <Row label="Analyses today" value={`${sub.used_today} / ${sub.daily_limit}`} />
          <Row label="Resets"       value={new Date(sub.resets_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} />
          {sub.expires_at && (
            <Row label="Expires" value={new Date(sub.expires_at).toLocaleDateString()} />
          )}
          {!sub.active || sub.tier === 'free' ? (
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => navigation.navigate('Subscription')}
            >
              <Text style={styles.upgradeBtnText}>Upgrade Plan</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Quick links */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Tools</Text>
        <MenuItem label="P&L Calculator" onPress={() => navigation.navigate('Calculator')} />
        <MenuItem label="Price Alerts"   onPress={() => navigation.navigate('Alerts')} />
        <MenuItem label="Learn"          onPress={() => navigation.navigate('Lessons')} />
      </View>

      {/* Account */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <TouchableOpacity style={styles.signOutBtn} onPress={confirmSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.value}>{value}</Text>
    </View>
  );
}

function MenuItem({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress}>
      <Text style={rowStyles.label}>{label}</Text>
      <Text style={rowStyles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.text, fontSize: 14, fontWeight: '600' },
  arrow: { color: colors.textMuted, fontSize: 20 },
});

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.bg },
  content:       { padding: 20, paddingBottom: 40 },
  avatarSection: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.primary + '33', alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { color: colors.primary, fontSize: 28, fontWeight: '700' },
  email:       { color: colors.text, fontSize: 15 },
  tierBadge:   { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  tierText:    { fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1,
    borderColor: colors.border, padding: 16, marginBottom: 16,
  },
  cardTitle:   { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  upgradeBtn: {
    marginTop: 12, backgroundColor: colors.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  upgradeBtnText: { color: colors.primaryText, fontWeight: '700', fontSize: 15 },
  signOutBtn: {
    paddingVertical: 12, alignItems: 'center', borderRadius: 10,
    borderWidth: 1, borderColor: colors.red, marginTop: 4,
  },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: 15 },
});
