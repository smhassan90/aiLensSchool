import { ScrollView, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StudentScreenShell, studentScreenContentStyle } from '@/components/StudentScreenShell';
import { Card, EmptyState, ErrorState, LoadingState, SectionBlock, textStyles } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, spacing, typography } from '@/constants/theme';
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
    return <EmptyState title="Select a child" subtitle="Choose a child to view their diary." />;
  }

  return (
    <StudentScreenShell eyebrow="Classroom notes" title="School diary">
      <ScrollView contentContainerStyle={[studentScreenContentStyle, styles.scroll]}>
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
    </StudentScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.sm },
  note: {
    fontSize: fontSizes.body,
    color: colors.slate600,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
});
