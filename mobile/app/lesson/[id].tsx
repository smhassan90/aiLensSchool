import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchLessonById } from '@/services/lessons.service';

export default function LessonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['lesson', id, studentId],
    queryFn: () => fetchLessonById(id!, studentId),
    enabled: !!id && !!studentId,
  });

  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child first" />
      </SafeAreaView>
    );
  }

  if (query.isLoading) return <LoadingState message="Loading lesson…" />;
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Lesson not available" onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const lesson = query.data;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{lesson.topicName ?? lesson.chapterName ?? 'Lesson'}</Text>
        <Text style={styles.meta}>
          {lesson.subject?.name ?? 'Subject'} · {new Date(lesson.date).toLocaleDateString()}
        </Text>
        {lesson.aiSummary ? (
          <Text style={styles.body}>{lesson.aiSummary}</Text>
        ) : (
          <EmptyState title="No summary available" subtitle="Lesson details may be limited for parent accounts." />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  meta: { color: colors.slate500, marginTop: spacing.sm, marginBottom: spacing.lg },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700 },
});
