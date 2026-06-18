import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api, ApiError, type SubscriptionPlan, type SubscriptionStatus } from '@/api';
import { Button } from '@/components/Button';
import { config } from '@/config';
import { colors } from '@/theme/colors';

export function SubscriptionScreen() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [planList, sub] = await Promise.all([
        api.subscription.plans(),
        api.subscription.status().catch(() => null),
      ]);
      setPlans(planList);
      setStatus(sub);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function startFreeTrial() {
    Linking.openURL(`${config.webUrl}/subscribe`).catch(() => {});
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const currentTier = status?.active ? status.tier : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>נסה 3 ימים בחינם</Text>
        <Text style={styles.heroSubtitle}>Unlock every feature. Cancel anytime.</Text>
      </View>

      {currentTier && (
        <View style={styles.currentBanner}>
          <Text style={styles.currentBannerText}>
            You're on the {currentTier.toUpperCase()} plan
            {status?.source === 'web' ? ' (web)' : ''}.
          </Text>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.plans}>
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} current={plan.tier === currentTier} />
        ))}
      </View>

      <Button label="התחל ניסיון חינם" onPress={startFreeTrial} />
      <Text style={styles.disclaimer}>
        The free trial and billing are managed on our website. You'll be redirected to complete
        sign-up.
      </Text>
    </ScrollView>
  );
}

function PlanCard({ plan, current }: { plan: SubscriptionPlan; current: boolean }) {
  return (
    <View style={[styles.card, current && styles.cardCurrent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.planName}>{plan.name || 'Plan name'}</Text>
        {current && (
          <View style={styles.currentTag}>
            <Text style={styles.currentTagText}>CURRENT</Text>
          </View>
        )}
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>
          {plan.price > 0 ? `$${plan.price}` : 'Free'}
        </Text>
        {plan.price > 0 && <Text style={styles.period}>/{plan.period}</Text>}
      </View>

      <View style={styles.features}>
        {(plan.features.length ? plan.features : ['Feature placeholder']).map((feature, i) => (
          <View key={i} style={styles.featureRow}>
            <Text style={styles.featureCheck}>✓</Text>
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: 20, gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  hero: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  heroTitle: { color: colors.primary, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  heroSubtitle: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },

  currentBanner: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  currentBannerText: { color: colors.primary, fontWeight: '700', fontSize: 13, textAlign: 'center' },

  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },

  plans: { gap: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 12,
  },
  cardCurrent: { borderColor: colors.primary },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  currentTag: { backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  currentTagText: { color: colors.primaryText, fontSize: 11, fontWeight: '800' },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  price: { color: colors.text, fontSize: 28, fontWeight: '800' },
  period: { color: colors.textMuted, fontSize: 14 },

  features: { gap: 8 },
  featureRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  featureCheck: { color: colors.green, fontSize: 15, fontWeight: '800' },
  featureText: { color: colors.textMuted, fontSize: 14, flex: 1 },

  disclaimer: { color: colors.textMuted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
