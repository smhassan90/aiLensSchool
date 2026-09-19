import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Href, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ProgressBar } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, radii, spacing, typography } from '@/constants/theme';
import { formatAmount } from '@/lib/format';
import { fetchStudentFees } from '@/services/parent-records.service';
import { StudentFee } from '@/types/api';

type FeesTab = 'due' | 'paid';

function latestPayment(fee: StudentFee) {
  return fee.payments?.[0] ?? null;
}

export default function FeesScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';
  const [tab, setTab] = useState<FeesTab>('due');

  const query = useQuery({
    queryKey: ['fees', studentId],
    queryFn: () => fetchStudentFees(studentId, { limit: 50 }),
    enabled: !!studentId,
  });

  const items = query.data?.items ?? [];
  const dueItems = useMemo(() => items.filter((item) => item.status !== 'PAID'), [items]);
  const paidItems = useMemo(() => items.filter((item) => item.status === 'PAID'), [items]);
  const visibleItems = tab === 'paid' ? paidItems : dueItems;

  const totals = items.length
    ? items.reduce(
        (acc, item) => ({
          amount: acc.amount + Number(item.amount || 0),
          paid: acc.paid + Number(item.paidAmount || 0),
        }),
        { amount: 0, paid: 0 },
      )
    : null;

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
        ListHeaderComponent={
          <>
            <ChildHeader />
            <Text style={styles.note}>
              Fees are view-only in the app. Pay at the school office unless your school says
              otherwise.
            </Text>
            {totals ? (
              <View style={styles.snapshot}>
                <Text style={styles.snapshotTitle}>Collected vs still due</Text>
                <ProgressBar value={totals.paid} max={Math.max(1, totals.amount)} height={10} />
                <Text style={styles.snapshotMeta}>
                  Paid {formatAmount(totals.paid)} of {formatAmount(totals.amount)}
                </Text>
              </View>
            ) : null}
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, tab === 'due' && styles.tabActive]}
                onPress={() => setTab('due')}
              >
                <Text style={[styles.tabText, tab === 'due' && styles.tabTextActive]}>
                  Due ({dueItems.length})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, tab === 'paid' && styles.tabActive]}
                onPress={() => setTab('paid')}
              >
                <Text style={[styles.tabText, tab === 'paid' && styles.tabTextActive]}>
                  Paid ({paidItems.length})
                </Text>
              </Pressable>
            </View>
          </>
        }
        data={visibleItems}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading fees…" />
          ) : query.isError ? (
            <ErrorState message="Could not load fees" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title={tab === 'paid' ? 'No paid fees yet' : 'No outstanding fees'} />
          )
        }
        renderItem={({ item }) => {
          const amount = Number(item.amount) || 0;
          const paid = Number(item.paidAmount) || 0;
          const payment = latestPayment(item);
          const isPaid = item.status === 'PAID';

          const openReceipt = () => {
            if (payment?.id) {
              router.push(`/fees/receipt/${payment.id}` as Href);
            }
          };

          return (
            <Card onPress={isPaid && payment ? openReceipt : undefined}>
              <Text style={styles.cardTitle}>
                {item.feeStructure?.name ?? item.periodLabel ?? 'Fee'}
              </Text>
              <Text style={styles.cardMeta}>
                Due {new Date(item.dueDate).toLocaleDateString()}
                {isPaid ? '' : ` · Balance ${formatAmount(item.balance)}`}
              </Text>
              <ProgressBar value={paid} max={Math.max(1, amount)} height={8} />
              <Badge label={item.status} tone={isPaid ? 'success' : 'warning'} />
              {isPaid && payment ? (
                <Pressable onPress={openReceipt}>
                  <Text style={styles.receiptLink}>
                    View receipt · {payment.receiptNumber ?? 'Open'}
                  </Text>
                </Pressable>
              ) : null}
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
  note: {
    fontFamily: typography.family,
    color: colors.slate600,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.primary,
  },
  tabText: {
    fontFamily: typography.family,
    fontSize: 14,
    fontWeight: typography.medium,
    color: colors.slate600,
  },
  tabTextActive: {
    color: colors.primaryDark,
    fontWeight: typography.semibold,
  },
  cardTitle: {
    fontFamily: typography.family,
    fontSize: 16,
    fontWeight: typography.semibold,
    color: colors.slate800,
  },
  cardMeta: {
    fontFamily: typography.family,
    fontSize: 13,
    color: colors.slate500,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  receiptLink: {
    color: colors.primary,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    marginTop: spacing.sm,
  },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  snapshotTitle: {
    fontFamily: typography.family,
    fontSize: 14,
    fontWeight: typography.semibold,
    color: colors.slate700,
    marginBottom: 8,
  },
  snapshotMeta: {
    fontFamily: typography.family,
    marginTop: 8,
    fontSize: 12,
    color: colors.slate500,
  },
});
