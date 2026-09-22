import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { EmptyState, ErrorState, LoadingState, textStyles } from '@/components/ui';
import { ProgressBar, toneColor } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, radii, spacing, typography } from '@/constants/theme';
import { fetchAttendance } from '@/services/attendance.service';
import { AttendanceRecord } from '@/types/api';

function isPresent(status: string) {
  return status === 'PRESENT' || status === 'LATE';
}

function statusLabel(status: string) {
  if (status === 'PRESENT') return 'Present';
  if (status === 'LATE') return 'Late';
  if (status === 'ABSENT') return 'Absent';
  if (status === 'EXCUSED') return 'Excused';
  return status;
}

function statusColor(status: string) {
  if (isPresent(status)) return colors.primary;
  if (status === 'EXCUSED') return colors.warning;
  return colors.error;
}

export default function AttendanceScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['attendance-detail', studentId],
    queryFn: () => fetchAttendance(studentId, { limit: 60 }),
    enabled: !!studentId,
  });

  const monthData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    const records = (query.data?.items ?? [])
      .filter((row) => row.date.slice(0, 10) >= cutoffKey)
      .sort((a, b) => b.date.localeCompare(a.date));
    const present = records.filter((row) => isPresent(row.status)).length;
    const absent = records.filter((row) => row.status === 'ABSENT').length;
    const excused = records.filter((row) => row.status === 'EXCUSED').length;
    const rate = records.length ? Math.round((present / records.length) * 100) : null;

    const weeks = new Map<string, AttendanceRecord[]>();
    records.forEach((row) => {
      const date = new Date(row.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      const list = weeks.get(key) ?? [];
      list.push(row);
      weeks.set(key, list);
    });

    return {
      records,
      present,
      absent,
      excused,
      rate,
      weeks: [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [query.data]);

  if (childLoading) return <LoadingState message="Loading…" />;
  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ChildHeader />

          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Last 30 days</Text>
            {monthData.rate != null ? (
              <>
                <Text style={[styles.rate, { color: toneColor(monthData.rate) }]}>{monthData.rate}%</Text>
                <ProgressBar value={monthData.rate} height={8} />
              </>
            ) : (
              <Text style={textStyles.body}>No attendance records yet.</Text>
            )}
            <View style={styles.summaryRow}>
              <SummaryChip label="Present" value={monthData.present} color={colors.primary} />
              <SummaryChip label="Absent" value={monthData.absent} color={colors.error} />
              <SummaryChip label="Excused" value={monthData.excused} color={colors.warning} />
            </View>
          </View>

          {query.isLoading ? (
            <LoadingState message="Loading attendance…" />
          ) : query.isError ? (
            <ErrorState message="Could not load attendance" onRetry={() => query.refetch()} />
          ) : monthData.records.length === 0 ? (
            <EmptyState title="No attendance this month" />
          ) : (
            monthData.weeks.map(([weekStart, rows]) => (
              <View key={weekStart} style={styles.weekBlock}>
                <Text style={styles.weekTitle}>
                  Week of {new Date(weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </Text>
                {rows.map((row) => (
                  <View key={row.id} style={styles.dayRow}>
                    <View>
                      <Text style={styles.dayDate}>
                        {new Date(row.date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      {row.remarks ? <Text style={textStyles.caption}>{row.remarks}</Text> : null}
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: `${statusColor(row.status)}18` }]}>
                      <Text style={[styles.statusText, { color: statusColor(row.status) }]}>
                        {statusLabel(row.status)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: `${color}14` }]}>
      <Text style={[styles.chipValue, { color }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  summary: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  summaryTitle: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    color: colors.slate500,
    marginBottom: spacing.xs,
  },
  rate: {
    fontSize: 28,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    marginBottom: spacing.sm,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  chip: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  chipValue: { fontSize: fontSizes.title, fontWeight: typography.semibold },
  chipLabel: { fontSize: fontSizes.caption, color: colors.slate500, marginTop: 2 },
  weekBlock: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  weekTitle: {
    fontSize: fontSizes.body,
    fontWeight: typography.semibold,
    color: colors.slate700,
    marginBottom: spacing.sm,
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  dayDate: { fontSize: fontSizes.body, color: colors.slate800 },
  statusBadge: { borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  statusText: { fontSize: fontSizes.caption, fontWeight: typography.semibold },
});
