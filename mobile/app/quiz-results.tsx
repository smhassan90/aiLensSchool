import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Card, EmptyState, ErrorState, LoadingState, textStyles } from '@/components/ui';
import { ProgressBar, toneColor } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, radii, spacing, typography } from '@/constants/theme';
import { fetchQuizzes } from '@/services/quizzes.service';
import { fetchQuizResults } from '@/services/results.service';
import { QuizResult } from '@/types/api';

export default function QuizResultsScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const resultsQuery = useQuery({
    queryKey: ['quiz-results-detail', studentId],
    queryFn: () => fetchQuizResults(studentId, { limit: 100 }),
    enabled: !!studentId,
  });

  const quizzesQuery = useQuery({
    queryKey: ['quiz-results-quizzes', studentId],
    queryFn: () => fetchQuizzes(studentId, { limit: 100 }),
    enabled: !!studentId,
  });

  const rows = useMemo(() => {
    const quizById = new Map((quizzesQuery.data?.items ?? []).map((quiz) => [quiz.id, quiz]));
    return (resultsQuery.data?.items ?? [])
      .map((result: QuizResult) => {
        const quiz = quizById.get(result.quizId);
        return {
          id: result.id,
          title: quiz?.title ?? 'Quiz',
          subject: quiz?.subject?.name ?? 'Subject',
          percentage: Number(result.percentage),
          scoredAt: result.submittedAt ?? result.attempt?.submittedAt ?? null,
        };
      })
      .sort((a, b) => (b.scoredAt ?? '').localeCompare(a.scoredAt ?? ''));
  }, [resultsQuery.data, quizzesQuery.data]);

  const average = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length)
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
    <>
      <Stack.Screen options={{ title: 'Quiz results' }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <FlatList
          contentContainerStyle={styles.content}
          data={rows}
          keyExtractor={(item) => item.id}
          refreshing={resultsQuery.isRefetching}
          onRefresh={() => {
            resultsQuery.refetch();
            quizzesQuery.refetch();
          }}
          ListHeaderComponent={
            <>
              <ChildHeader />
              <View style={styles.summary}>
                <Text style={styles.summaryLabel}>Quiz average</Text>
                {average != null ? (
                  <View style={styles.summaryRow}>
                    <Text style={[styles.average, { color: toneColor(average) }]}>{average}%</Text>
                    <View style={styles.summaryBar}>
                      <ProgressBar value={average} height={10} />
                    </View>
                  </View>
                ) : (
                  <Text style={textStyles.body}>No quiz results yet.</Text>
                )}
                <Text style={textStyles.caption}>{rows.length} completed quiz{rows.length === 1 ? '' : 'zes'}</Text>
              </View>
              <Text style={styles.sectionTitle}>All quiz marks</Text>
            </>
          }
          ListEmptyComponent={
            resultsQuery.isLoading ? (
              <LoadingState message="Loading results…" />
            ) : resultsQuery.isError ? (
              <ErrorState message="Could not load quiz results" onRetry={() => resultsQuery.refetch()} />
            ) : (
              <EmptyState title="No quiz results yet" subtitle="Completed quizzes will appear here." />
            )
          }
          renderItem={({ item }) => (
            <Card>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Ionicons name="ribbon-outline" size={18} color={toneColor(item.percentage)} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={textStyles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={textStyles.caption}>{item.subject}</Text>
                </View>
                <Text style={[styles.score, { color: toneColor(item.percentage) }]}>
                  {item.percentage.toFixed(0)}%
                </Text>
              </View>
              <ProgressBar value={item.percentage} height={6} />
              {item.scoredAt ? (
                <Text style={textStyles.caption}>
                  Scored {new Date(item.scoredAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
            </Card>
          )}
        />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl, flexGrow: 1 },
  summary: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  summaryLabel: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    color: colors.slate500,
    marginBottom: spacing.xs,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  average: {
    fontSize: 28,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    width: 72,
  },
  summaryBar: { flex: 1 },
  sectionTitle: {
    fontSize: fontSizes.title,
    fontWeight: typography.semibold,
    color: colors.slate800,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  cardBody: { flex: 1 },
  score: { fontSize: fontSizes.title, fontWeight: typography.semibold },
});
