import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchReportCards } from '@/services/parent-records.service';
import { ReportCard } from '@/types/api';

export default function ReportCardsScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['report-cards', studentId],
    queryFn: () => fetchReportCards(studentId, { limit: 20 }),
    enabled: !!studentId,
  });

  if (childLoading) return <LoadingState message="Loading…" />;
  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={<ChildHeader />}
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading report cards…" />
          ) : query.isError ? (
            <ErrorState message="Could not load report cards" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No report cards yet" />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.cardTitle}>{item.termLabel}</Text>
            <Text style={styles.cardMeta}>
              {item.academicYear?.name} · {item.grade?.name} {item.section?.name}
            </Text>
            <Text style={styles.score}>
              {item.overallPercentage != null ? `${Number(item.overallPercentage).toFixed(1)}%` : '—'}
            </Text>
            {item.lines?.map((line: NonNullable<ReportCard['lines']>[number]) => (
              <View key={`${item.id}-${line.subject?.name}`} style={styles.line}>
                <Text style={styles.lineSubject}>{line.subject?.name}</Text>
                <Text style={styles.lineGrade}>{line.gradeLetter ?? '—'}</Text>
              </View>
            ))}
            {item.remarks ? <Text style={styles.remarks}>{item.remarks}</Text> : null}
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, flexGrow: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4 },
  score: { fontSize: 28, fontWeight: '800', color: colors.primary, marginVertical: spacing.sm },
  line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  lineSubject: { color: colors.slate700 },
  lineGrade: { fontWeight: '700', color: colors.slate800 },
  remarks: { color: colors.slate500, marginTop: spacing.sm },
});
