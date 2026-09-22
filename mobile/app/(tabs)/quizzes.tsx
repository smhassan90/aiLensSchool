import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState, textStyles } from '@/components/ui';
import { ProgressBar, toneColor } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, radii, spacing, tabBarClearance, typography } from '@/constants/theme';
import { formatDateTime } from '@/lib/format';
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
  const average = scored.length ? Math.round(scored.reduce((sum, n) => sum + n, 0) / scored.length) : null;
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
            <Text style={textStyles.caption}>
              Published quizzes for {selectedChild?.firstName ?? 'this child'}.
            </Text>
            {average != null ? (
              <View style={styles.snapshot}>
                <View style={styles.snapshotTop}>
                  <Text style={textStyles.caption}>Average score</Text>
                  <Text
                    style={styles.viewAll}
                    onPress={() => router.push('/quiz-results')}
                  >
                    View all marks
                  </Text>
                </View>
                <View style={styles.snapshotRow}>
                  <Text style={[styles.snapshotValue, { color: toneColor(average) }]}>{average}%</Text>
                  <View style={styles.snapshotBar}>
                    <ProgressBar value={average} height={8} />
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
              subtitle="Published quizzes appear here while they are available."
            />
          )
        }
        renderItem={({ item }) => {
          const result = resultsByQuiz.get(item.id);
          return (
            <Card onPress={() => router.push(`/quiz/${item.id}`)}>
              <View style={styles.row}>
                <View style={styles.iconWrap}>
                  <Ionicons name="bulb-outline" size={18} color={colors.warning} />
                </View>
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {isQuizNew(item, { hasResult: !!result }) ? <Badge label="New" tone="success" /> : null}
              </View>
              <Text style={textStyles.caption}>
                {item.subject?.name} · {item.totalMarks ?? '—'} marks
                {item.section?.name ? ` · ${item.section.name}` : ''}
              </Text>
              {formatDateTime(item.dueAt) ? (
                <Text style={styles.dueAt}>Due by {formatDateTime(item.dueAt)}</Text>
              ) : null}
              {result ? (
                <View style={styles.scoreBlock}>
                  <ProgressBar value={Number(result.percentage)} height={6} />
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
  content: { padding: spacing.md, paddingBottom: tabBarClearance, flexGrow: 1 },
  eyebrow: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    letterSpacing: 1,
    color: colors.primary,
  },
  title: {
    fontSize: fontSizes.title,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.slate900,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  snapshotTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  viewAll: { color: colors.primary, fontSize: fontSizes.caption, fontWeight: typography.semibold },
  snapshotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  snapshotValue: { fontSize: fontSizes.title, fontWeight: typography.semibold, width: 56 },
  snapshotBar: { flex: 1 },
  scoreBlock: { gap: 8, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceYellow,
    marginTop: 1,
  },
  dueAt: { fontSize: fontSizes.caption, color: colors.warning, marginTop: 2, marginBottom: spacing.sm },
});
