import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizById } from '@/services/quizzes.service';
import { fetchQuizResultForStudent } from '@/services/results.service';

export default function QuizAttemptScreen() {
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
    return <LoadingState message="Checking attempt status…" />;
  }

  if (quizQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Quiz not found" />
      </SafeAreaView>
    );
  }

  const result = resultQuery.data;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.title}>{quizQuery.data?.title}</Text>
        <Text style={styles.subtitle}>
          Attempt status for {selectedChild?.firstName ?? 'your child'}
        </Text>

        {result ? (
          <>
            <Text style={styles.status}>Submitted</Text>
            <Text style={styles.detail}>
              Score: {result.score}/{result.totalMarks} ({Number(result.percentage).toFixed(1)}%)
            </Text>
            <Text style={styles.detail}>
              Submitted {new Date(result.submittedAt).toLocaleString()}
            </Text>
            <Text style={styles.link} onPress={() => router.push(`/quiz/${id}/result`)}>
              View full result →
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.status}>Not submitted yet</Text>
            <Text style={styles.detail}>
              Quizzes are completed by students in the student app. This screen shows whether your
              child has submitted this quiz.
            </Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  subtitle: { color: colors.slate500, marginBottom: spacing.md },
  status: { fontSize: 20, fontWeight: '700', color: colors.primary },
  detail: { fontSize: 16, color: colors.slate700, lineHeight: 22 },
  link: { color: colors.primary, fontWeight: '700', marginTop: spacing.md },
});
