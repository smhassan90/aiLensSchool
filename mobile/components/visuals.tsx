import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing } from '@/constants/theme';

export function toneColor(value: number | null | undefined) {
  if (value == null) return colors.slate300;
  if (value >= 75) return colors.primary;
  if (value >= 50) return colors.warning;
  return colors.error;
}

export function ScoreRing({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const color = toneColor(value);
  return (
    <View style={ringStyles.wrap}>
      <View style={[ringStyles.ring, { borderColor: color }]}>
        <Text style={[ringStyles.value, { color }]}>{value == null ? '—' : Math.round(value)}</Text>
      </View>
      <Text style={ringStyles.label}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  wrap: { alignItems: 'center', flex: 1 },
  ring: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    flexDirection: 'row',
  },
  value: { fontSize: 22, fontWeight: '800' },
  label: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate600,
    textAlign: 'center',
  },
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
  value: { fontSize: 13, fontWeight: '800' },
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
      <View style={dotStyles.legend}>
        <Text style={dotStyles.legendText}>Latest {statuses.length} school days · teal present · red absent</Text>
      </View>
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legend: { marginTop: 8 },
  legendText: { fontSize: 11, color: colors.slate500 },
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
