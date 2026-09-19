import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing, typography } from '@/constants/theme';
import {
  createDayOffRequest,
  deleteDayOffRequest,
  fetchDayOffRequests,
} from '@/services/parent-records.service';
import { useState } from 'react';

function isoToday(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export default function DayOffScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';
  const client = useQueryClient();
  const [startDate, setStartDate] = useState(isoToday(1));
  const [endDate, setEndDate] = useState(isoToday(1));
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['day-off', studentId],
    queryFn: () => fetchDayOffRequests(studentId),
    enabled: Boolean(studentId),
  });
  const create = useMutation({
    mutationFn: () => createDayOffRequest({ studentId, startDate, endDate, reason }),
    onSuccess: () => {
      setReason('');
      client.invalidateQueries({ queryKey: ['day-off', studentId] });
      Alert.alert('Request sent', 'The school will review your day-off request.');
    },
    onError: (error) => Alert.alert('Could not send request', error instanceof Error ? error.message : 'Try again.'),
  });
  const remove = useMutation({
    mutationFn: deleteDayOffRequest,
    onSuccess: () => client.invalidateQueries({ queryKey: ['day-off', studentId] }),
  });

  if (childLoading) return <LoadingState message="Loading…" />;
  if (!studentId) return <EmptyState title="Select a child" />;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ChildHeader />
        <Text style={styles.title}>Request a day off</Text>
        <Text style={styles.hint}>Send a request before the day begins. Approved requests help the teacher understand an absence.</Text>
        <Card>
          <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="2026-10-05" />
          <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="2026-10-05" />
          <Text style={styles.label}>Reason</Text>
          <TextInput
            style={[styles.input, styles.reason]}
            value={reason}
            onChangeText={setReason}
            placeholder="Tell the school why your child will be away"
            multiline
          />
          <Pressable
            style={[styles.primaryButton, (!reason.trim() || create.isPending) && styles.disabled]}
            disabled={!reason.trim() || create.isPending}
            onPress={() => create.mutate()}
          >
            <Text style={styles.primaryText}>{create.isPending ? 'Sending…' : 'Send request'}</Text>
          </Pressable>
        </Card>
        <Text style={styles.sectionTitle}>Your requests</Text>
        {query.isLoading ? <LoadingState message="Loading requests…" /> : null}
        {query.isError ? <ErrorState message="Could not load requests" onRetry={() => query.refetch()} /> : null}
        {!query.isLoading && !query.isError && !query.data?.length ? <EmptyState title="No requests yet" /> : null}
        {query.data?.map((request) => {
          const today = new Date().toISOString().slice(0, 10);
          const canDelete = request.startDate.slice(0, 10) > today;
          return (
            <Card key={request.id}>
              <View style={styles.row}>
                <Text style={styles.date}>{request.startDate.slice(0, 10)} → {request.endDate.slice(0, 10)}</Text>
                <Badge label={request.status} tone={request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'warning' : 'default'} />
              </View>
              <Text style={styles.reasonText}>{request.reason}</Text>
              {request.reviewNote ? <Text style={styles.review}>{request.reviewNote}</Text> : null}
              {canDelete && request.status === 'PENDING' ? (
                <Pressable onPress={() => remove.mutate(request.id)}>
                  <Text style={styles.delete}>Delete request</Text>
                </Pressable>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md },
  title: { color: colors.slate900, fontFamily: typography.family, fontSize: 26, fontWeight: typography.semibold, marginTop: spacing.md },
  hint: { color: colors.slate600, fontFamily: typography.family, fontSize: 14, lineHeight: 21, marginVertical: spacing.sm },
  label: { color: colors.slate600, fontFamily: typography.family, fontSize: 13, marginTop: spacing.sm },
  input: { borderColor: colors.slate200, borderRadius: 10, borderWidth: 1, color: colors.slate800, fontFamily: typography.family, marginTop: 4, padding: spacing.sm },
  reason: { minHeight: 84, textAlignVertical: 'top' },
  primaryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 10, marginTop: spacing.md, padding: spacing.md },
  disabled: { opacity: 0.5 },
  primaryText: { color: colors.white, fontFamily: typography.family, fontWeight: typography.semibold },
  sectionTitle: { color: colors.slate800, fontFamily: typography.family, fontSize: 19, fontWeight: typography.semibold, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  date: { color: colors.slate800, flex: 1, fontFamily: typography.family, fontWeight: typography.semibold },
  reasonText: { color: colors.slate600, fontFamily: typography.family, fontSize: 14, marginTop: spacing.sm },
  review: { color: colors.primaryDark, fontFamily: typography.family, fontSize: 13, marginTop: spacing.sm },
  delete: { color: colors.error, fontFamily: typography.family, fontWeight: typography.semibold, marginTop: spacing.md },
});
