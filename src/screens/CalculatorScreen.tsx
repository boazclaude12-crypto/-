import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '@/theme/colors';

const EXCHANGES = [
  { name: 'Binance', maker: 0.001, taker: 0.001, network: 0.0005 },
  { name: 'Bybit',   maker: 0.001, taker: 0.001, network: 0.0005 },
  { name: 'Custom',  maker: 0,     taker: 0,     network: 0.0005 },
];

const PAIRS = ['BTC/USD','ETH/USD','SOL/USD','BNB/USD','XRP/USD','ADA/USD','DOGE/USD','AVAX/USD'];

export function CalculatorScreen() {
  const [exchange, setExchange] = useState(EXCHANGES[0]);
  const [pair, setPair] = useState('BTC/USD');
  const [entryPrice, setEntryPrice]     = useState('');
  const [exitPrice, setExitPrice]       = useState('');
  const [quantity, setQuantity]         = useState('');
  const [leverage, setLeverage]         = useState('1');
  const [entryFee, setEntryFee]         = useState(String(EXCHANGES[0].maker));
  const [exitFee, setExitFee]           = useState(String(EXCHANGES[0].taker));
  const [networkFee, setNetworkFee]     = useState(String(EXCHANGES[0].network));

  function selectExchange(ex: typeof EXCHANGES[0]) {
    setExchange(ex);
    setEntryFee(String(ex.maker));
    setExitFee(String(ex.taker));
    setNetworkFee(String(ex.network));
  }

  const entry  = parseFloat(entryPrice)  || 0;
  const exit   = parseFloat(exitPrice)   || 0;
  const qty    = parseFloat(quantity)    || 0;
  const lev    = parseFloat(leverage)    || 1;
  const eFee   = parseFloat(entryFee)    || 0;
  const xFee   = parseFloat(exitFee)     || 0;
  const nFee   = parseFloat(networkFee)  || 0;

  const hasResult = entry > 0 && exit > 0 && qty > 0;
  const grossPL   = (exit - entry) * qty * lev;
  const totalFees = (eFee + xFee + nFee) * qty * exit;
  const netPL     = grossPL - totalFees;
  const roi       = entry > 0 && qty > 0 ? (netPL / (entry * qty)) * 100 : 0;

  function ResultCard({ label, value, colored }: { label: string; value: string; colored?: boolean }) {
    const isPos = parseFloat(value) >= 0;
    return (
      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>{label}</Text>
        <Text style={[styles.resultValue, colored && { color: isPos ? colors.green : colors.red }]}>
          {value}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>מחשבון רווח / הפסד</Text>

      {/* Exchange selector */}
      <Text style={styles.sectionLabel}>בורסה</Text>
      <View style={styles.row}>
        {EXCHANGES.map(ex => (
          <TouchableOpacity
            key={ex.name}
            style={[styles.chip, exchange.name === ex.name && styles.chipActive]}
            onPress={() => selectExchange(ex)}
          >
            <Text style={[styles.chipText, exchange.name === ex.name && styles.chipTextActive]}>
              {ex.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pair selector */}
      <Text style={styles.sectionLabel}>זוג</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pairScroll}>
        {PAIRS.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, pair === p && styles.chipActive]}
            onPress={() => setPair(p)}
          >
            <Text style={[styles.chipText, pair === p && styles.chipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Price inputs */}
      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <Text style={styles.inputLabel}>מחיר כניסה ($)</Text>
          <TextInput
            style={styles.input}
            value={entryPrice}
            onChangeText={setEntryPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputHalf}>
          <Text style={styles.inputLabel}>מחיר יציאה ($)</Text>
          <TextInput
            style={styles.input}
            value={exitPrice}
            onChangeText={setExitPrice}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.inputRow}>
        <View style={styles.inputHalf}>
          <Text style={styles.inputLabel}>כמות</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputHalf}>
          <Text style={styles.inputLabel}>מינוף (×)</Text>
          <TextInput
            style={styles.input}
            value={leverage}
            onChangeText={setLeverage}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      {/* Fees */}
      <Text style={styles.sectionLabel}>עמלות (%)</Text>
      <View style={styles.inputRow}>
        <View style={styles.inputThird}>
          <Text style={styles.inputLabel}>כניסה</Text>
          <TextInput
            style={styles.input}
            value={entryFee}
            onChangeText={setEntryFee}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputThird}>
          <Text style={styles.inputLabel}>יציאה</Text>
          <TextInput
            style={styles.input}
            value={exitFee}
            onChangeText={setExitFee}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.inputThird}>
          <Text style={styles.inputLabel}>רשת</Text>
          <TextInput
            style={styles.input}
            value={networkFee}
            onChangeText={setNetworkFee}
            keyboardType="decimal-pad"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      {/* Results */}
      {hasResult && (
        <View style={styles.results}>
          <View style={styles.resultRow}>
            <ResultCard label="רווח/הפסד ברוטו" value={`${grossPL >= 0 ? '+' : '-'}$${Math.abs(grossPL).toFixed(2)}`} colored />
            <ResultCard label="סך עמלות"         value={`$${totalFees.toFixed(2)}`} />
          </View>
          <View style={styles.resultRow}>
            <ResultCard label="רווח/הפסד נטו" value={`${netPL >= 0 ? '+' : '-'}$${Math.abs(netPL).toFixed(2)}`} colored />
            <ResultCard label="ROI"            value={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`} colored />
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: colors.bg },
  content:     { padding: 20, paddingBottom: 40 },
  title:       { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 20 },
  sectionLabel:{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  row:         { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pairScroll:  { marginBottom: 4 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface, marginRight: 8, marginBottom: 8,
  },
  chipActive:     { borderColor: colors.primary, backgroundColor: colors.primary + '22' },
  chipText:       { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.primary },
  inputRow:    { flexDirection: 'row', gap: 12, marginTop: 12 },
  inputHalf:   { flex: 1 },
  inputThird:  { flex: 1 },
  inputLabel:  { color: colors.textMuted, fontSize: 12, marginBottom: 6 },
  input: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, color: colors.text, fontSize: 15,
  },
  results:     { marginTop: 24, gap: 12 },
  resultRow:   { flexDirection: 'row', gap: 12 },
  resultCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  resultLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 6 },
  resultValue: { color: colors.text, fontSize: 17, fontWeight: '700' },
});
