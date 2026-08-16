import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizById } from '@/services/quizzes.service';
import { fetchQuizResultForStudent } from '@/services/results.service';
import { QuizAnswer } from '@/types/api';

export default function QuizResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId, selectedChild } = useChild();
  const studentId = selectedChildId ?? '';

  const quizQuery = useQuery({
    queryKey: ['quiz', id, studentId],
    queryFn: () => fetchQuizById(id!, studentId),
    enabled: !!id && !!studentId,
  });

  const resultQuery = useQuery({
    queryKey: ['quiz-result', id, studentId],
    queryFn: () => fetchQuizResultForStudent(studentId, id!),
    enabled: !!id && !!studentId,
  });

  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  if (quizQuery.isLoading || resultQuery.isLoading) {
    return <LoadingState message="Loading result…" />;
  }

  if (resultQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Could not load result" onRetry={() => resultQuery.refetch()} />
      </SafeAreaView>
    );
  }

  if (!resultQuery.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState
          title="No result yet"
          subtitle={`${selectedChild?.firstName ?? 'Your child'} has not submitted this quiz.`}
        />
      </SafeAreaView>
    );
  }

  const result = resultQuery.data;
  const percentage = Number(result.percentage);
  const answers = result.attempt?.answers ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{quizQuery.data?.title ?? 'Quiz result'}</Text>
        <Text style={styles.student}>
          {selectedChild?.firstName} {selectedChild?.lastName}
        </Text>

        <Text style={styles.score}>{percentage.toFixed(1)}%</Text>
        <Text style={styles.detail}>
          {result.score} / {result.totalMarks} marks
        </Text>
        <Text style={styles.detail}>
          Submitted {new Date(result.submittedAt).toLocaleString()}
        </Text>
        {result.summary ? <Text style={styles.body}>{result.summary}</Text> : null}

        {answers.length > 0 ? (
          <View style={styles.answers}>
            <Text style={styles.section}>Answers</Text>
            {answers.map((answer: QuizAnswer, index: number) => (
              <View key={answer.id} style={styles.answerCard}>
                <View style={styles.answerHeader}>
                  <Text style={styles.question}>
                    {index + 1}. {answer.question?.questionText ?? 'Question'}
                  </Text>
                  <Badge
                    label={answer.isCorrect ? 'Correct' : 'Review'}
                    tone={answer.isCorrect ? 'success' : 'warning'}
                  />
                </View>
                <Text style={styles.meta}>Your child’s answer: {answer.answerText ?? '—'}</Text>
                {answer.question?.correctAnswer ? (
                  <Text style={styles.meta}>Correct answer: {answer.question.correctAnswer}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  student: { color: colors.slate500, marginTop: spacing.sm },
  score: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.xl,
  },
  detail: { fontSize: 16, color: colors.slate700, marginTop: spacing.sm },
  body: { fontSize: 15, color: colors.slate600, marginTop: spacing.md, textAlign: 'center' },
  answers: { alignSelf: 'stretch', marginTop: spacing.xl },
  section: { fontSize: 18, fontWeight: '700', color: colors.slate800, marginBottom: spacing.sm },
  answerCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginBottom: spacing.sm,
  },
  answerHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  question: { flex: 1, fontWeight: '700', color: colors.slate800 },
  meta: { color: colors.slate600, marginTop: 6, lineHeight: 20 },
});
