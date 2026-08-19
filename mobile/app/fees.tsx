import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ProgressBar } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchStudentFees } from '@/services/parent-records.service';

export default function FeesScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['fees', studentId],
    queryFn: () => fetchStudentFees(studentId, { limit: 50 }),
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

  const items = query.data?.items ?? [];
  const totals = items.length
    ? items.reduce(
        (acc, item) => ({
          amount: acc.amount + Number(item.amount || 0),
          paid: acc.paid + Number(item.paidAmount || 0),
        }),
        { amount: 0, paid: 0 },
      )
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <ChildHeader />
            {totals ? (
              <View style={styles.snapshot}>
                <Text style={styles.snapshotTitle}>Collected vs still due</Text>
                <ProgressBar value={totals.paid} max={Math.max(1, totals.amount)} height={10} />
                <Text style={styles.snapshotMeta}>
                  Paid {totals.paid} of {totals.amount}
                </Text>
              </View>
            ) : null}
          </>
        }
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading fees…" />
          ) : query.isError ? (
            <ErrorState message="Could not load fees" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No fee records" />
          )
        }
        renderItem={({ item }) => {
          const amount = Number(item.amount) || 0;
          const paid = Number(item.paidAmount) || 0;
          return (
          <Card>
            <Text style={styles.cardTitle}>{item.feeStructure?.name ?? item.periodLabel ?? 'Fee'}</Text>
            <Text style={styles.cardMeta}>
              Due {new Date(item.dueDate).toLocaleDateString()} · Balance {item.balance}
            </Text>
            <ProgressBar value={paid} max={Math.max(1, amount)} height={8} />
            <Badge
              label={item.status}
              tone={item.status === 'PAID' ? 'success' : 'warning'}
            />
          </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, flexGrow: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.sm },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  snapshotTitle: { fontSize: 14, fontWeight: '700', color: colors.slate700, marginBottom: 8 },
  snapshotMeta: { marginTop: 8, fontSize: 12, color: colors.slate500 },
});
