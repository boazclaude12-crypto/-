import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import type { PricePoint } from '@/api';
import { colors } from '@/theme/colors';

interface Props {
  points: PricePoint[];
  height?: number;
  /** Falls back to comparing first/last price when omitted. */
  positive?: boolean;
}

/** Minimal SVG line chart — no external charting dependency required. */
export function PriceChart({ points, height = 220, positive }: Props) {
  const [width, setWidth] = React.useState(0);

  if (points.length < 2 || width === 0) {
    return <View style={[styles.wrap, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} />;
  }

  const prices = points.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const padding = 12;
  const innerHeight = height - padding * 2;

  const isUp = positive ?? prices[prices.length - 1] >= prices[0];
  const lineColor = isUp ? colors.green : colors.red;

  const coords = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = padding + innerHeight - ((p.price - min) / range) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const polylinePoints = coords.join(' ');
  const fillPath = `M${coords[0]} L${coords.join(' L')} L${width},${height} L0,${height} Z`;
  const midY = padding + innerHeight / 2;

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Svg width={width} height={height}>
        <Line x1={0} y1={midY} x2={width} y2={midY} stroke={colors.border} strokeWidth={1} strokeDasharray="4 4" />
        <Path d={fillPath} fill={lineColor} fillOpacity={0.08} />
        <Polyline points={polylinePoints} fill="none" stroke={lineColor} strokeWidth={2} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
});
