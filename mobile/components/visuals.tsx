import { useEffect, useMemo } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors, fontSizes, radii, spacing } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SIZE = 88;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function toneColor(value: number | null | undefined) {
  if (value == null) return colors.slate300;
  if (value >= 75) return colors.mint;
  if (value >= 50) return colors.warning;
  return colors.error;
}

export function ScoreRing({
  value,
  label,
  onPress,
}: {
  value: number | null;
  label: string;
  onPress?: () => void;
}) {
  const color = toneColor(value);
  const target = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const strokeOffset = useMemo(() => new Animated.Value(RING_CIRCUMFERENCE), []);

  useEffect(() => {
    strokeOffset.setValue(RING_CIRCUMFERENCE);
    if (value == null) return;
    Animated.timing(strokeOffset, {
      toValue: RING_CIRCUMFERENCE * (1 - target),
      duration: 850,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [strokeOffset, target, value]);

  const content = (
    <>
      <View style={ringStyles.ringOuter}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={colors.slate100}
            strokeWidth={RING_STROKE}
            fill={colors.white}
          />
          {value != null ? (
            <AnimatedCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={color}
              strokeWidth={RING_STROKE}
              fill="transparent"
              strokeLinecap="round"
              strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={strokeOffset}
              rotation={-90}
              originX={RING_SIZE / 2}
              originY={RING_SIZE / 2}
            />
          ) : null}
        </Svg>
        <View style={ringStyles.valueWrap}>
          <Text style={[ringStyles.value, { color: value == null ? colors.slate400 : color }]}>
            {value == null ? '—' : Math.round(value)}
          </Text>
        </View>
      </View>
      <Text style={ringStyles.label}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [ringStyles.wrap, pressed && ringStyles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={ringStyles.wrap}>{content}</View>;
}

const ringStyles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  ringOuter: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { fontSize: fontSizes.title, fontWeight: '600' },
  label: {
    marginTop: 6,
    fontSize: fontSizes.caption,
    fontWeight: '600',
    color: colors.slate600,
    textAlign: 'center',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});

export function ProgressBar({
  value,
  max = 100,
  color,
  height = 8,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={[barStyles.track, { height, borderRadius: height }]}>
      <View
        style={[
          barStyles.fill,
          {
            width: `${Math.max(pct ? 4 : 0, pct)}%`,
            height,
            borderRadius: height,
            backgroundColor: color ?? toneColor(pct),
          },
        ]}
      />
    </View>
  );
}

const barStyles = StyleSheet.create({
  track: { width: '100%', backgroundColor: colors.slate100, overflow: 'hidden' },
  fill: { backgroundColor: colors.primary },
});

export function LabeledBar({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <View style={labeledStyles.row}>
      <View style={labeledStyles.head}>
        <Text style={labeledStyles.label} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[labeledStyles.value, { color: toneColor(value) }]}>
          {value == null ? '—' : `${Math.round(value)}%`}
        </Text>
      </View>
      <ProgressBar value={value ?? 0} />
      {hint ? <Text style={labeledStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const labeledStyles = StyleSheet.create({
  row: { marginBottom: spacing.sm },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: spacing.sm,
  },
  label: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.slate700 },
  value: { fontSize: 13, fontWeight: '600' },
  hint: { marginTop: 4, fontSize: 11, color: colors.slate500 },
});

export function AttendanceDots({
  statuses,
}: {
  statuses: Array<{ date: string; status: string }>;
}) {
  if (!statuses.length) return null;
  return (
    <View>
      <View style={dotStyles.row}>
        {statuses.map((item) => {
          const present = item.status === 'PRESENT' || item.status === 'LATE';
          return (
            <View
              key={item.date}
              style={[dotStyles.dot, { backgroundColor: present ? colors.primary : colors.error }]}
            />
          );
        })}
      </View>
      <Text style={dotStyles.caption}>Latest {statuses.length} school days</Text>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  caption: { marginTop: 8, fontSize: fontSizes.caption, color: colors.slate500 },
});

export function SplitBar({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
}) {
  const total = Math.max(1, left + right);
  return (
    <View>
      <View style={splitStyles.track}>
        <View style={[splitStyles.left, { flex: left / total }]} />
        <View style={[splitStyles.right, { flex: right / total }]} />
      </View>
      <View style={splitStyles.legend}>
        <Text style={[splitStyles.legendText, { color: colors.primary }]}>
          {leftLabel} {left}
        </Text>
        <Text style={[splitStyles.legendText, { color: colors.warning }]}>
          {rightLabel} {right}
        </Text>
      </View>
    </View>
  );
}

const splitStyles = StyleSheet.create({
  track: {
    height: 10,
    borderRadius: radii.full,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.slate100,
  },
  left: { backgroundColor: colors.primary },
  right: { backgroundColor: colors.warning },
  legend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  legendText: { fontSize: 12, fontWeight: '600' },
});
