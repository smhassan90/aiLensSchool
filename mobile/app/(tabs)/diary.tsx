import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchAttendance, groupAttendanceByDate } from '@/services/attendance.service';
import { fetchHomework } from '@/services/homework.service';
import { fetchRecentLessons } from '@/services/lessons.service';
import { fetchHomeDiaries } from '@/services/parent-records.service';
import { Homework, HomeDiary, LessonSummary } from '@/types/api';

export default function DiaryScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const attendanceQuery = useQuery({
    queryKey: ['diary', 'attendance', studentId],
    queryFn: () => fetchAttendance(studentId, { limit: 30 }),
    enabled: !!studentId,
  });

  const homeworkQuery = useQuery({
    queryKey: ['diary', 'homework', studentId],
    queryFn: () => fetchHomework(studentId, { limit: 20 }),
    enabled: !!studentId,
  });

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

  const grouped = groupAttendanceByDate(attendanceQuery.data?.items ?? []);
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>School diary</Text>
        <ChildHeader />

        <SectionTitle title="Attendance" />
        {attendanceQuery.isLoading ? (
          <LoadingState message="Loading attendance…" />
        ) : attendanceQuery.isError ? (
          <ErrorState message="Could not load attendance" onRetry={() => attendanceQuery.refetch()} />
        ) : dates.length === 0 ? (
          <EmptyState title="No attendance records" />
        ) : (
          dates.slice(0, 10).map((date) => (
            <Card key={date}>
              <Text style={styles.dateHeading}>
                {new Date(date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}
              </Text>
              {grouped[date].map((record) => (
                <View key={record.id} style={styles.row}>
                  <Badge
                    label={record.status}
                    tone={record.status === 'PRESENT' ? 'success' : 'warning'}
                  />
                  {record.remarks ? <Text style={styles.remarks}>{record.remarks}</Text> : null}
                </View>
              ))}
            </Card>
          ))
        )}

        <SectionTitle title="Recent lessons" />
        {lessonsQuery.isLoading ? (
          <LoadingState message="Loading lessons…" />
        ) : (lessonsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState title="No confirmed lessons" />
        ) : (
          lessonsQuery.data?.map((lesson: LessonSummary) => (
            <Card key={lesson.id} onPress={() => router.push(`/lesson/${lesson.id}`)}>
              <Text style={styles.cardTitle}>{lesson.topicName ?? lesson.chapterName ?? 'Lesson'}</Text>
              <Text style={styles.cardMeta}>
                {new Date(lesson.date).toLocaleDateString()} · {lesson.subject?.name}
              </Text>
            </Card>
          ))
        )}

        <SectionTitle title="Teacher diary notes" />
        {diariesQuery.isLoading ? (
          <LoadingState message="Loading diary notes…" />
        ) : (diariesQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No diary notes" />
        ) : (
          diariesQuery.data?.items.map((item: HomeDiary) => (
            <Card key={item.id}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{new Date(item.date).toLocaleDateString()}</Text>
              {item.lessonSummary ? <Text style={styles.remarks}>{item.lessonSummary}</Text> : null}
              {item.homeworkNotes ? <Text style={styles.remarks}>HW: {item.homeworkNotes}</Text> : null}
              {item.teacherRemarks ? <Text style={styles.remarks}>{item.teacherRemarks}</Text> : null}
            </Card>
          ))
        )}

        <SectionTitle title="Recent homework" />
        {homeworkQuery.isLoading ? (
          <LoadingState message="Loading homework…" />
        ) : (homeworkQuery.data?.items.length ?? 0) === 0 ? (
          <EmptyState title="No homework entries" />
        ) : (
          homeworkQuery.data?.items.map((item: Homework) => (
            <Card key={item.id} onPress={() => router.push(`/homework/${item.id}`)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                Due {new Date(item.dueDate).toLocaleDateString()} · {item.subject?.name}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.slate900, marginBottom: spacing.md },
  dateHeading: { fontWeight: '700', color: colors.slate800, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  remarks: { color: colors.slate500, flex: 1, marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4 },
});
