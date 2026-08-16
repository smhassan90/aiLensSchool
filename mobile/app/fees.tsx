import { FlatList, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
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
            <LoadingState message="Loading fees…" />
          ) : query.isError ? (
            <ErrorState message="Could not load fees" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No fee records" />
          )
        }
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.cardTitle}>{item.feeStructure?.name ?? item.periodLabel ?? 'Fee'}</Text>
            <Text style={styles.cardMeta}>
              Due {new Date(item.dueDate).toLocaleDateString()} · Balance {item.balance}
            </Text>
            <Badge
              label={item.status}
              tone={item.status === 'PAID' ? 'success' : 'warning'}
            />
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
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.sm },
});
