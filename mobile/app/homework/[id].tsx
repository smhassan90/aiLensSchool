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
import { ScoreRing, SplitBar } from '@/components/visuals';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import {
  fetchHomeworkById,
  getHomeworkListStatus,
  homeworkStatusLabel,
  homeworkStatusTone,
  submitHomework,
} from '@/services/homework.service';
import { HomeworkQuestion, HomeworkResult, HomeworkResultAnswer } from '@/types/api';

function isChoiceQuestion(question: HomeworkQuestion): boolean {
  return (
    question.type === 'MCQ' ||
    question.type === 'TRUE_FALSE' ||
    Boolean(question.options?.length && question.type !== 'FILL_IN_THE_BLANK')
  );
}

function isAnswered(
  question: HomeworkQuestion,
  answer?: { optionId?: string; answerText?: string },
): boolean {
  if (!answer) return false;
  if (isChoiceQuestion(question)) return Boolean(answer.optionId);
  return Boolean(answer.answerText?.trim());
}

function questionTextForAnswer(
  answer: HomeworkResultAnswer,
  questions: HomeworkQuestion[],
  index: number,
): string {
  if (answer.question?.questionText) return answer.question.questionText;
  const match = questions.find((q) => q.id === answer.questionId);
  return match?.questionText ?? `Question ${index + 1}`;
}

function HomeworkResultView({
  homeworkTitle,
  childName,
  result,
  questions,
}: {
  homeworkTitle: string;
  childName: string;
  result: HomeworkResult;
  questions: HomeworkQuestion[];
}) {
  const percentage = Number(result.percentage);
  const answers = result.answers ?? [];
  const correctCount = answers.filter((a) => a.isCorrect).length;
  const incorrectCount = answers.length - correctCount;

  return (
    <>
      <Text style={styles.resultStudent}>{childName}</Text>

      <View style={styles.scoreCard}>
        <ScoreRing value={percentage} label="Score" />
        <View style={styles.scoreFacts}>
          <Text style={styles.detail}>
            {result.score} / {result.totalMarks} marks
          </Text>
          <Text style={styles.detail}>
            {correctCount} correct out of {answers.length || result.totalMarks} question
            {answers.length === 1 ? '' : 's'}
          </Text>
          <Text style={styles.detail}>
            Submitted {new Date(result.submittedAt).toLocaleString()}
          </Text>
          {answers.length > 0 ? (
            <View style={styles.splitWrap}>
              <SplitBar
                left={correctCount}
                right={incorrectCount}
                leftLabel="Correct"
                rightLabel="Incorrect"
              />
            </View>
          ) : null}
        </View>
      </View>

      {answers.length > 0 ? (
        <View style={styles.answers}>
          <Text style={styles.sectionTitle}>Answers</Text>
          {answers.map((answer, index) => (
            <View key={`${answer.questionId}-${index}`} style={styles.answerCard}>
              <View style={styles.answerHeader}>
                <Text style={styles.answerQuestion}>
                  {index + 1}. {questionTextForAnswer(answer, questions, index)}
                </Text>
                <Badge
                  label={answer.isCorrect ? 'Correct' : 'Incorrect'}
                  tone={answer.isCorrect ? 'success' : 'warning'}
                />
              </View>
              <Text style={styles.answerMeta}>
                Your child’s answer: {answer.answerText?.trim() || '—'}
              </Text>
              {!answer.isCorrect && answer.question?.correctAnswer ? (
                <Text style={styles.answerMeta}>
                  Correct answer: {answer.question.correctAnswer}
                </Text>
              ) : null}
              <Text style={styles.answerMarks}>
                Marks: {answer.marksAwarded}
                {answer.question?.marks != null ? ` / ${answer.question.marks}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.body}>
          Homework submitted for {homeworkTitle}. Detailed per-question breakdown is not available
          for this assignment.
        </Text>
      )}
    </>
  );
}

export default function HomeworkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { selectedChildId, selectedChild } = useChild();
  const studentId = selectedChildId ?? '';
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, { optionId?: string; answerText?: string }>>(
    {},
  );
  const [localResult, setLocalResult] = useState<HomeworkResult | null>(null);

  const query = useQuery({
    queryKey: ['homework', id, studentId],
    queryFn: () => fetchHomeworkById(id!, studentId),
    enabled: !!id && !!studentId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const questions = useMemo(() => {
    const raw = query.data?.questions;
    if (Array.isArray(raw)) return raw as HomeworkQuestion[];
    return [];
  }, [query.data?.questions]);

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
      setLocalResult(result);
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
  const result = localResult ?? homework.result ?? null;
  const status = getHomeworkListStatus(homework);
  const childName = `${selectedChild?.firstName ?? 'Your child'}${selectedChild?.lastName ? ` ${selectedChild.lastName}` : ''}`;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{homework.title}</Text>
        <Text style={styles.meta}>
          {homework.subject?.name} · Due {new Date(homework.dueDate).toLocaleString()}
        </Text>
        <Badge label={homeworkStatusLabel(status)} tone={homeworkStatusTone(status)} />

        {result ? (
          <HomeworkResultView
            homeworkTitle={homework.title}
            childName={childName}
            result={result}
            questions={questions}
          />
        ) : null}

        {questions.length > 0 && !result ? (
          <>
            <Text style={styles.section}>
              Answer for {selectedChild?.firstName ?? 'your child'}. The app marks the work when you
              submit.
            </Text>
            {questions.map((question, index) => {
              const current = answers[question.id] ?? {};
              const isChoice = isChoiceQuestion(question);
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900, textAlign: 'center' },
  meta: { color: colors.slate500, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700, marginTop: spacing.sm },
  section: { fontSize: 15, color: colors.slate600, lineHeight: 22 },
  resultStudent: { color: colors.slate500, textAlign: 'center', marginTop: spacing.xs },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginTop: spacing.sm,
  },
  scoreFacts: { flex: 1 },
  splitWrap: { marginTop: spacing.sm },
  detail: { fontSize: 16, color: colors.slate700, marginTop: spacing.sm },
  answers: { marginTop: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.slate800, marginBottom: spacing.sm },
  answerCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginBottom: spacing.sm,
  },
  answerHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  answerQuestion: { flex: 1, fontWeight: '700', color: colors.slate800 },
  answerMeta: { color: colors.slate600, marginTop: 6, lineHeight: 20 },
  answerMarks: { color: colors.slate500, marginTop: 4, fontSize: 13 },
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
