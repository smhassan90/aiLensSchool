import { ScrollView, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Card, EmptyState, ErrorState, LoadingState, SectionBlock, textStyles } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, spacing, tabBarClearance, typography } from '@/constants/theme';
import { fetchRecentLessons } from '@/services/lessons.service';
import { fetchHomeDiaries } from '@/services/parent-records.service';
import { HomeDiary, LessonSummary } from '@/types/api';

function lessonRoute(lesson: LessonSummary) {
  return lesson.homeworkId ? `/homework/${lesson.homeworkId}` : `/lesson/${lesson.id}`;
}

export default function DiaryScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const lessonsQuery = useQuery({
    queryKey: ['diary', 'lessons', studentId],
    queryFn: () => fetchRecentLessons(studentId, 10),
    enabled: !!studentId,
  });

  const diariesQuery = useQuery({
    queryKey: ['diary', 'home-diaries', studentId],
    queryFn: () => fetchHomeDiaries(studentId, { limit: 10 }),
    enabled: !!studentId,
  });

  if (childLoading) return <LoadingState message="Loading…" />;
  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" subtitle="Choose a child to view their diary." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CLASSROOM NOTES</Text>
        <Text style={styles.title}>School diary</Text>
        <ChildHeader />

        <SectionBlock title="Recent lessons" accent={colors.sky}>
          {lessonsQuery.isLoading ? (
            <LoadingState message="Loading lessons…" />
          ) : lessonsQuery.isError ? (
            <ErrorState message="Could not load lessons" onRetry={() => lessonsQuery.refetch()} />
          ) : (lessonsQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="No confirmed lessons" />
          ) : (
            lessonsQuery.data?.map((lesson: LessonSummary) => (
              <Card key={lesson.id} onPress={() => router.push(lessonRoute(lesson))}>
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {lesson.topicName ?? lesson.chapterName ?? 'Lesson'}
                </Text>
                <Text style={textStyles.caption}>
                  {new Date(lesson.date).toLocaleDateString()} · {lesson.subject?.name}
                </Text>
              </Card>
            ))
          )}
        </SectionBlock>

        <SectionBlock title="Teacher diary notes" accent={colors.primary}>
          {diariesQuery.isLoading ? (
            <LoadingState message="Loading diary notes…" />
          ) : (diariesQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState title="No diary notes" />
          ) : (
            diariesQuery.data?.items.map((item: HomeDiary) => (
              <Card key={item.id}>
                <Text style={textStyles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={textStyles.caption}>{new Date(item.date).toLocaleDateString()}</Text>
                {item.lessonSummary ? <Text style={styles.note}>{item.lessonSummary}</Text> : null}
                {item.homeworkNotes ? <Text style={styles.note}>HW: {item.homeworkNotes}</Text> : null}
                {item.teacherRemarks ? <Text style={styles.note}>{item.teacherRemarks}</Text> : null}
              </Card>
            ))
          )}
        </SectionBlock>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: tabBarClearance },
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
    marginBottom: spacing.md,
  },
  note: {
    fontSize: fontSizes.body,
    color: colors.slate600,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
