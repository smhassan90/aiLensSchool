import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchQuizById, submitQuiz } from '@/services/quizzes.service';
import { fetchQuizResultForStudent } from '@/services/results.service';
import { QuizQuestion } from '@/types/api';

function isAnswered(
  question: QuizQuestion,
  answer?: { optionId?: string; answerText?: string },
): boolean {
  if (!answer) return false;
  const isChoice = question.type === 'MCQ' || question.type === 'TRUE_FALSE';
  if (isChoice) return Boolean(answer.optionId);
  return Boolean(answer.answerText?.trim());
}

export default function QuizAttemptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId, selectedChild } = useChild();
  const studentId = selectedChildId ?? '';
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, { optionId?: string; answerText?: string }>>(
    {},
  );
  const [scoreBanner, setScoreBanner] = useState<string | null>(null);

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

  const questions = useMemo(
    () => quizQuery.data?.questions?.filter((q: QuizQuestion) => q.included) ?? [],
    [quizQuery.data?.questions],
  );

  const submit = useMutation({
    mutationFn: () =>
      submitQuiz(id!, {
        studentId,
        answers: questions.map((q) => ({
          questionId: q.id,
          optionId: answers[q.id]?.optionId,
          answerText: answers[q.id]?.answerText,
        })),
      }),
    onSuccess: (result) => {
      setScoreBanner(
        `Score: ${result.score}/${result.totalMarks} (${Number(result.percentage).toFixed(0)}%)`,
      );
      queryClient.invalidateQueries({ queryKey: ['quiz-result', id, studentId] });
      queryClient.invalidateQueries({ queryKey: ['quiz', id, studentId] });
      queryClient.invalidateQueries({ queryKey: ['quizzes', studentId] });
      queryClient.invalidateQueries({ queryKey: ['results', studentId] });
      queryClient.invalidateQueries({ queryKey: ['home', 'quizzes', studentId] });
      queryClient.invalidateQueries({ queryKey: ['home', 'results', studentId] });
    },
  });

  const requestSubmit = () => {
    const unanswered = questions.filter((q) => !isAnswered(q, answers[q.id])).length;
    if (unanswered > 0) {
      Alert.alert(
        'Some questions are blank',
        `${unanswered} question${unanswered === 1 ? '' : 's'} still unanswered. Submit anyway?`,
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Submit', style: 'destructive', onPress: () => submit.mutate() },
        ],
      );
      return;
    }
    submit.mutate();
  };

  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  if (quizQuery.isLoading || resultQuery.isLoading) {
    return <LoadingState message="Loading quiz…" />;
  }

  if (quizQuery.isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Quiz not found" />
      </SafeAreaView>
    );
  }

  const result = resultQuery.data;

  if (result || scoreBanner) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.content}>
          <Text style={styles.title}>{quizQuery.data?.title}</Text>
          <Text style={styles.subtitle}>
            Result for {selectedChild?.firstName ?? 'your child'}
          </Text>
          <Text style={styles.status}>
            {scoreBanner ??
              `Score: ${result?.score}/${result?.totalMarks} (${Number(result?.percentage).toFixed(0)}%)`}
          </Text>
          <Pressable style={styles.button} onPress={() => router.push(`/quiz/${id}/result`)}>
            <Text style={styles.buttonText}>View full result</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{quizQuery.data?.title}</Text>
        <Text style={styles.subtitle}>
          Answer for {selectedChild?.firstName ?? 'your child'}, then submit for an instant score.
        </Text>

        {questions.map((question, index) => {
          const current = answers[question.id] ?? {};
          const isChoice = question.type === 'MCQ' || question.type === 'TRUE_FALSE';
          return (
            <View key={question.id} style={styles.card}>
              <Text style={styles.question}>
                {index + 1}. {question.questionText} ({question.marks} marks)
              </Text>
              {isChoice && question.options?.length ? (
                question.options.map((option) => {
                  const selected = current.optionId === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.option, selected && styles.optionSelected]}
                      onPress={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [question.id]: { optionId: option.id, answerText: option.optionText },
                        }))
                      }
                    >
                      <Text style={styles.optionText}>{option.optionText}</Text>
                    </Pressable>
                  );
                })
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Type your answer"
                  value={current.answerText ?? ''}
                  onChangeText={(text) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [question.id]: { answerText: text },
                    }))
                  }
                />
              )}
            </View>
          );
        })}

        {submit.isError ? (
          <Text style={styles.error}>
            {(submit.error as Error)?.message || 'Could not submit quiz'}
          </Text>
        ) : null}

        <Pressable
          style={[styles.button, submit.isPending && styles.buttonDisabled]}
          disabled={submit.isPending || questions.length === 0}
          onPress={requestSubmit}
        >
          <Text style={styles.buttonText}>{submit.isPending ? 'Submitting…' : 'Submit quiz'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  subtitle: { color: colors.slate500, marginBottom: spacing.sm },
  status: { fontSize: 22, fontWeight: '700', color: colors.primary },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  question: { fontSize: 16, fontWeight: '600', color: colors.slate800, lineHeight: 22 },
  option: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 10,
    padding: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: '#EEF2FF' },
  optionText: { color: colors.slate800 },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 10,
    padding: spacing.sm,
    backgroundColor: colors.white,
  },
  button: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '700' },
  error: { color: '#B91C1C' },
});
