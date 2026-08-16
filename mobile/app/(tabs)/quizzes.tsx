import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizzes, isQuizNew } from '@/services/quizzes.service';
import { fetchQuizResults } from '@/services/results.service';
import { QuizResult } from '@/types/api';

export default function QuizzesTabScreen() {
  const { selectedChildId, selectedChild, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['quizzes', studentId],
    queryFn: () => fetchQuizzes(studentId, { limit: 50 }),
    enabled: !!studentId,
  });

  const resultsQuery = useQuery({
    queryKey: ['quiz-results', studentId],
    queryFn: () => fetchQuizResults(studentId, { limit: 100 }),
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

  const resultsByQuiz = new Map<string, QuizResult>(
    (resultsQuery.data?.items ?? []).map((result: QuizResult) => [result.quizId, result]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Quizzes</Text>
            <ChildHeader />
            <Text style={styles.hint}>
              Showing published quizzes for {selectedChild?.firstName ?? 'this child'} only.
            </Text>
          </>
        }
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => {
          query.refetch();
          resultsQuery.refetch();
        }}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading quizzes…" />
          ) : query.isError ? (
            <ErrorState message="Could not load quizzes" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState
              title="No published quizzes"
              subtitle="Quizzes appear here after a teacher publishes them for this class."
            />
          )
        }
        renderItem={({ item }) => {
          const result = resultsByQuiz.get(item.id);
          return (
            <Card onPress={() => router.push(`/quiz/${item.id}`)}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {isQuizNew(item) ? <Badge label="New" tone="success" /> : null}
              </View>
              <Text style={styles.cardMeta}>
                {item.subject?.name} · {item.totalMarks ?? '—'} marks
                {item.section?.name ? ` · ${item.section.name}` : ''}
              </Text>
              {result ? (
                <Badge
                  label={`Score ${Number(result.percentage).toFixed(0)}%`}
                  tone={Number(result.percentage) >= 50 ? 'success' : 'warning'}
                />
              ) : (
                <Badge label="Not submitted" />
              )}
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.slate900, marginBottom: spacing.md },
  hint: { color: colors.slate500, marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800, flex: 1 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.sm },
});
