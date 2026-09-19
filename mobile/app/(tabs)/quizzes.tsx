import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { ProgressBar, toneColor } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { filterAccessibleQuizzes } from '@/lib/quiz-visibility';
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
  const scored = (resultsQuery.data?.items ?? []).map((row) => Number(row.percentage));
  const average = scored.length
    ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length)
    : null;
  const visibleQuizzes = filterAccessibleQuizzes(query.data?.items ?? [], resultsByQuiz);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.eyebrow}>TEST YOUR KNOWLEDGE</Text>
            <Text style={styles.title}>Quizzes</Text>
            <ChildHeader />
            <Text style={styles.hint}>
              Showing published quizzes for {selectedChild?.firstName ?? 'this child'} only.
            </Text>
            {average != null ? (
              <View style={styles.snapshot}>
                <Text style={styles.snapshotLabel}>Average score</Text>
                <View style={styles.snapshotRow}>
                  <Text style={[styles.snapshotValue, { color: toneColor(average) }]}>{average}%</Text>
                  <View style={styles.snapshotBar}>
                    <ProgressBar value={average} height={10} />
                  </View>
                </View>
              </View>
            ) : null}
          </>
        }
        data={visibleQuizzes}
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
              title="No available quizzes"
              subtitle="Published quizzes appear here while they are available for this child."
            />
          )
        }
        renderItem={({ item }) => {
          const result = resultsByQuiz.get(item.id);
          return (
            <Card onPress={() => router.push(`/quiz/${item.id}`)}>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="bulb-outline" size={20} color={colors.warning} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {isQuizNew(item, { hasResult: !!result }) ? (
                  <Badge label="New" tone="success" />
                ) : null}
              </View>
              <Text style={styles.cardMeta}>
                {item.subject?.name} · {item.totalMarks ?? '—'} marks
                {item.section?.name ? ` · ${item.section.name}` : ''}
              </Text>
              {result ? (
                <View style={styles.scoreBlock}>
                  <ProgressBar value={Number(result.percentage)} height={8} />
                  <Badge
                    label={`${Number(result.percentage).toFixed(0)}%`}
                    tone={Number(result.percentage) >= 50 ? 'success' : 'warning'}
                  />
                </View>
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
  content: { padding: spacing.md, paddingBottom: 110, flexGrow: 1 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 1.2, color: colors.primary },
  title: { fontSize: 26, fontWeight: '600', color: colors.slate900, marginTop: 3, marginBottom: spacing.md },
  hint: { color: colors.slate500, marginBottom: spacing.md },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginBottom: spacing.md,
  },
  snapshotLabel: { fontSize: 12, fontWeight: '500', color: colors.slate500, marginBottom: 8 },
  snapshotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  snapshotValue: { fontSize: 28, fontWeight: '600', width: 72 },
  snapshotBar: { flex: 1 },
  scoreBlock: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceYellow,
  },
  cardTitle: { fontSize: 16, fontWeight: '500', color: colors.slate800, flex: 1 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.sm },
});
