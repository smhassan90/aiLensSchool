import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchHomeworkById, isHomeworkPending } from '@/services/homework.service';

export default function HomeworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['homework', id, studentId],
    queryFn: () => fetchHomeworkById(id!, studentId),
    enabled: !!id && !!studentId,
  });

  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  if (query.isLoading) return <LoadingState message="Loading homework…" />;
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Homework not found" onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const homework = query.data;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{homework.title}</Text>
        <Text style={styles.meta}>
          {homework.subject?.name} · Due {new Date(homework.dueDate).toLocaleString()}
        </Text>
        {isHomeworkPending(homework) ? (
          <Badge label="Pending" tone="warning" />
        ) : (
          <Badge label="Past due" />
        )}
        {homework.description ? (
          <Text style={styles.body}>{homework.description}</Text>
        ) : (
          <EmptyState title="No description" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  meta: { color: colors.slate500 },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700, marginTop: spacing.md },
});
