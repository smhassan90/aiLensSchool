import { ScrollView, StyleSheet, Text, Pressable } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizById } from '@/services/quizzes.service';
import { fetchQuizResultForStudent } from '@/services/results.service';
import { QuizQuestion } from '@/types/api';

export default function QuizDetailScreen() {
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
        <EmptyState title="Select a child" subtitle="Quizzes are shown for the selected child only." />
      </SafeAreaView>
    );
  }

  if (quizQuery.isLoading) return <LoadingState message="Loading quiz…" />;
  if (quizQuery.isError || !quizQuery.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState
          message="This quiz is not available for the selected child."
          onRetry={() => quizQuery.refetch()}
        />
      </SafeAreaView>
    );
  }

  const quiz = quizQuery.data;
  const includedQuestions = quiz.questions?.filter((q: QuizQuestion) => q.included) ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{quiz.title}</Text>
        <Text style={styles.meta}>
          {selectedChild?.firstName} · {quiz.subject?.name} · {quiz.totalMarks ?? includedQuestions.length} marks
        </Text>
        <Badge label={quiz.status} tone={quiz.status === 'PUBLISHED' ? 'success' : 'default'} />

        {quiz.description ? <Text style={styles.body}>{quiz.description}</Text> : null}

        {studentId && resultQuery.data ? (
          <Pressable style={styles.resultLink} onPress={() => router.push(`/quiz/${id}/result`)}>
            <Text style={styles.resultText}>
              View result · {Number(resultQuery.data.percentage).toFixed(0)}%
            </Text>
          </Pressable>
        ) : (
          <Pressable style={styles.resultLink} onPress={() => router.push(`/quiz/${id}/attempt`)}>
            <Text style={styles.resultText}>View attempt status</Text>
          </Pressable>
        )}

        <Text style={styles.section}>Questions preview</Text>
        {includedQuestions.length === 0 ? (
          <EmptyState title="No questions to preview" />
        ) : (
          includedQuestions.map((question: QuizQuestion, index: number) => (
            <Text key={question.id} style={styles.question}>
              {index + 1}. {question.questionText} ({question.marks} marks)
            </Text>
          ))
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
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700 },
  section: { fontSize: 18, fontWeight: '700', color: colors.slate800, marginTop: spacing.md },
  question: { color: colors.slate700, lineHeight: 22, marginTop: spacing.sm },
  resultLink: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
  },
  resultText: { color: colors.white, fontWeight: '700' },
});
