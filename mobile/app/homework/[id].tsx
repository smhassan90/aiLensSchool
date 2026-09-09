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
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import {
  fetchHomeworkById,
  getHomeworkListStatus,
  homeworkStatusLabel,
  homeworkStatusTone,
  submitHomework,
} from '@/services/homework.service';
import { HomeworkQuestion } from '@/types/api';

function isAnswered(
  question: HomeworkQuestion,
  answer?: { optionId?: string; answerText?: string },
): boolean {
  if (!answer) return false;
  const isChoice = question.type === 'MCQ' || question.type === 'TRUE_FALSE';
  if (isChoice) return Boolean(answer.optionId);
  return Boolean(answer.answerText?.trim());
}

export default function HomeworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId, selectedChild } = useChild();
  const studentId = selectedChildId ?? '';
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, { optionId?: string; answerText?: string }>>(
    {},
  );
  const [localResult, setLocalResult] = useState<{
    score: number;
    totalMarks: number;
    percentage: number;
  } | null>(null);

  const query = useQuery({
    queryKey: ['homework', id, studentId],
    queryFn: () => fetchHomeworkById(id!, studentId),
    enabled: !!id && !!studentId,
  });

  const questions = useMemo(
    () => (query.data?.questions as HomeworkQuestion[] | undefined) ?? [],
    [query.data?.questions],
  );

  const submit = useMutation({
    mutationFn: () =>
      submitHomework(id!, {
        studentId,
        answers: questions.map((q) => ({
          questionId: q.id,
          optionId: answers[q.id]?.optionId,
          answerText: answers[q.id]?.answerText,
        })),
      }),
    onSuccess: (result) => {
      setLocalResult({
        score: Number(result.score),
        totalMarks: Number(result.totalMarks),
        percentage: Number(result.percentage),
      });
      queryClient.invalidateQueries({ queryKey: ['homework', id, studentId] });
      queryClient.invalidateQueries({ queryKey: ['homework', studentId] });
      queryClient.invalidateQueries({ queryKey: ['home', 'homework', studentId] });
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

  if (query.isLoading) return <LoadingState message="Loading homework…" />;
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Homework not found" onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const homework = query.data;
  const result = localResult ?? homework.result;
  const status = getHomeworkListStatus(homework);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{homework.title}</Text>
        <Text style={styles.meta}>
          {homework.subject?.name} · Due {new Date(homework.dueDate).toLocaleString()}
        </Text>
        <Badge label={homeworkStatusLabel(status)} tone={homeworkStatusTone(status)} />

        {result ? (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreTitle}>
              Score for {selectedChild?.firstName ?? 'your child'}
            </Text>
            <Text style={styles.score}>
              {result.score}/{result.totalMarks} ({Number(result.percentage).toFixed(0)}%)
            </Text>
          </View>
        ) : null}

        {questions.length > 0 && !result ? (
          <>
            <Text style={styles.section}>
              Answer for {selectedChild?.firstName ?? 'your child'}. The app marks the work when you
              submit.
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
                              [question.id]: {
                                optionId: option.id,
                                answerText: option.optionText,
                              },
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
                {(submit.error as Error)?.message || 'Could not submit homework'}
              </Text>
            ) : null}

            <Pressable
              style={[styles.button, submit.isPending && styles.buttonDisabled]}
              disabled={submit.isPending}
              onPress={requestSubmit}
            >
              <Text style={styles.buttonText}>
                {submit.isPending ? 'Submitting…' : 'Submit homework'}
              </Text>
            </Pressable>
          </>
        ) : null}

        {!questions.length && !result ? (
          homework.description ? (
            <Text style={styles.body}>{homework.description}</Text>
          ) : (
            <EmptyState title="No description" />
          )
        ) : null}

        {result && homework.description ? (
          <Text style={styles.body}>{homework.description}</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  meta: { color: colors.slate500 },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700, marginTop: spacing.sm },
  section: { fontSize: 15, color: colors.slate600, lineHeight: 22 },
  scoreCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  scoreTitle: { color: colors.slate500, marginBottom: 4 },
  score: { fontSize: 22, fontWeight: '800', color: colors.primary },
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
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: '700' },
  error: { color: '#B91C1C' },
});
