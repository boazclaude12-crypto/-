import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { api, type PriceListItem } from '@/api';
import { Chip } from '@/components/Chip';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/Button';
import { colors } from '@/theme/colors';

const STOCKS: { label: string; symbol: string }[] = [
  { label: 'AAPL', symbol: 'NASDAQ:AAPL' },
  { label: 'TSLA', symbol: 'NASDAQ:TSLA' },
  { label: 'NVDA', symbol: 'NASDAQ:NVDA' },
  { label: 'MSFT', symbol: 'NASDAQ:MSFT' },
];

const DEFAULT_SYMBOL = 'BINANCE:BTCUSDT';

export function LiveChartScreen() {
  const [cryptoSymbols, setCryptoSymbols] = useState<PriceListItem[]>([]);
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [customInput, setCustomInput] = useState('');
  const [webviewLoading, setWebviewLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      api.prices
        .list()
        .then(setCryptoSymbols)
        .catch(() => {});
    }, [])
  );

  function selectSymbol(next: string) {
    setWebviewLoading(true);
    setSymbol(next);
  }

  function onGoCustom() {
    const cleaned = customInput.trim().toUpperCase();
    if (!cleaned) return;
    // Allow a bare ticker (e.g. "GME") or an "EXCHANGE:TICKER" pair.
    const next = cleaned.includes(':') ? cleaned : `NASDAQ:${cleaned}`;
    selectSymbol(next);
  }

  const html = useMemo(() => buildChartHtml(symbol), [symbol]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.picker}
        contentContainerStyle={styles.pickerContent}
        horizontal={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.chipRow}>
          {cryptoSymbols.map((item) => {
            const tvSymbol = `BINANCE:${item.symbol}`;
            return (
              <Chip
                key={item.symbol}
                label={item.symbol.replace('USDT', '')}
                active={symbol === tvSymbol}
                onPress={() => selectSymbol(tvSymbol)}
              />
            );
          })}
        </View>

        <View style={styles.chipRow}>
          {STOCKS.map((s) => (
            <Chip
              key={s.symbol}
              label={s.label}
              active={symbol === s.symbol}
              onPress={() => selectSymbol(s.symbol)}
            />
          ))}
        </View>

        <View style={styles.customRow}>
          <TextField
            label="Search any symbol"
            value={customInput}
            onChangeText={setCustomInput}
            placeholder="e.g. AMD or NYSE:GME"
            autoCapitalize="characters"
            onSubmitEditing={onGoCustom}
            style={styles.customInput}
          />
          <Button label="Go" onPress={onGoCustom} style={styles.goBtn} />
        </View>
      </ScrollView>

      <View style={styles.chartBox}>
        {webviewLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        <WebView
          key={symbol}
          originWhitelist={['*']}
          source={{ html }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={() => setWebviewLoading(false)}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function buildChartHtml(symbol: string): string {
  const safeSymbol = JSON.stringify(symbol);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: ${colors.bg}; }
    .tradingview-widget-container { height: 100%; width: 100%; }
  </style>
</head>
<body>
  <div class="tradingview-widget-container">
    <div id="tv_chart"></div>
  </div>
  <script src="https://s3.tradingview.com/tv.js"></script>
  <script>
    new TradingView.widget({
      autosize: true,
      symbol: ${safeSymbol},
      interval: "60",
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      toolbar_bg: "${colors.surface}",
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      container_id: "tv_chart"
    });
  </script>
</body>
</html>`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  picker: { maxHeight: 220, backgroundColor: colors.bg },
  pickerContent: { padding: 20, gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  customRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  customInput: { flex: 1 },
  goBtn: { width: 64 },
  chartBox: { flex: 1, margin: 20, marginTop: 4, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.surface },
  webview: { flex: 1, backgroundColor: colors.bg },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    zIndex: 1,
  },
});
