import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, ErrorState, LoadingState } from '@/components/ui';
import { colors, spacing, typography } from '@/constants/theme';
import { formatAmount } from '@/lib/format';
import { fetchFeeReceipt } from '@/services/parent-records.service';

export default function FeeReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['fee-receipt', id],
    queryFn: () => fetchFeeReceipt(id!),
    enabled: Boolean(id),
  });

  if (query.isLoading) return <LoadingState message="Loading receipt…" />;
  if (query.isError || !query.data) {
    return <ErrorState message="Could not load this receipt" onRetry={() => query.refetch()} />;
  }

  const receipt = query.data;
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.kicker}>Payment receipt</Text>
          <Text style={styles.title}>{receipt.receiptNumber ?? 'Receipt'}</Text>
          <Text style={styles.meta}>{receipt.school.name}</Text>
          <Text style={styles.meta}>
            {receipt.student.name} · {receipt.student.studentCode}
          </Text>
          <Text style={styles.label}>Fee</Text>
          <Text style={styles.value}>{receipt.fee.name} · {receipt.fee.periodLabel}</Text>
          <Text style={styles.label}>Paid</Text>
          <Text style={styles.amount}>{formatAmount(receipt.collected)}</Text>
          <Text style={styles.meta}>
            {new Date(receipt.paidAt).toLocaleString()} · {receipt.method ?? 'Payment'}
          </Text>
          {receipt.notes ? <Text style={styles.note}>{receipt.notes}</Text> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md },
  kicker: { color: colors.primary, fontFamily: typography.family, fontSize: 13 },
  title: { color: colors.slate900, fontFamily: typography.family, fontSize: 26, fontWeight: typography.semibold, marginTop: 4 },
  meta: { color: colors.slate500, fontFamily: typography.family, fontSize: 14, marginTop: 6 },
  label: { color: colors.slate500, fontFamily: typography.family, fontSize: 13, marginTop: spacing.lg },
  value: { color: colors.slate800, fontFamily: typography.family, fontSize: 17, marginTop: 4 },
  amount: { color: colors.primaryDark, fontFamily: typography.family, fontSize: 30, fontWeight: typography.semibold, marginTop: 4 },
  note: { color: colors.slate600, fontFamily: typography.family, fontSize: 14, marginTop: spacing.md },
});
