import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizById } from '@/services/quizzes.service';
import { fetchQuizResultForStudent } from '@/services/results.service';

export default function QuizResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId, selectedChild } = useChild();
  const studentId = selectedChildId ?? '';

  const quizQuery = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => fetchQuizById(id!),
    enabled: !!id,
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

  if (resultQuery.isError || !resultQuery.data) {
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
});
