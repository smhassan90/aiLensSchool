import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { AttendanceDots, LabeledBar, ScoreRing } from '@/components/visuals';
import { useAuth } from '@/providers/AuthProvider';
import { useChild } from '@/providers/ChildProvider';
import { colors, radii, spacing } from '@/constants/theme';
import { fetchLessonsForStudent, isLessonToday } from '@/services/lessons.service';
import { fetchHomework, isHomeworkPending } from '@/services/homework.service';
import { fetchQuizzes, isQuizNew } from '@/services/quizzes.service';
import { fetchQuizResults } from '@/services/results.service';
import { fetchAttendance } from '@/services/attendance.service';
import { fetchEvents, isUpcomingEvent } from '@/services/events.service';
import { fetchNotifications } from '@/services/notifications.service';
import { fetchAnnouncements } from '@/services/announcements.service';
import { Announcement, EventItem, Homework, LessonSummary, Quiz } from '@/types/api';

export default function HomeScreen() {
  const { user } = useAuth();
  const { selectedChild, selectedChildId, isLoading: childLoading } = useChild();

  const studentId = selectedChildId ?? '';

  const lessonsQuery = useQuery({
    queryKey: ['home', 'lessons', studentId],
    queryFn: () => fetchLessonsForStudent(studentId),
    enabled: !!studentId,
  });

  const homeworkQuery = useQuery({
    queryKey: ['home', 'homework', studentId],
    queryFn: () => fetchHomework(studentId, { limit: 10 }),
    enabled: !!studentId,
  });

  const quizzesQuery = useQuery({
    queryKey: ['home', 'quizzes', studentId],
    queryFn: () => fetchQuizzes(studentId, { limit: 10 }),
    enabled: !!studentId,
  });

  const resultsQuery = useQuery({
    queryKey: ['home', 'results', studentId],
    queryFn: () => fetchQuizResults(studentId, { limit: 50 }),
    enabled: !!studentId,
  });

  const attendanceQuery = useQuery({
    queryKey: ['home', 'attendance', studentId],
    queryFn: () => fetchAttendance(studentId, { limit: 20 }),
    enabled: !!studentId,
  });

  const eventsQuery = useQuery({
    queryKey: ['home', 'events'],
    queryFn: () => fetchEvents({ limit: 5 }),
  });

  const announcementsQuery = useQuery({
    queryKey: ['home', 'announcements'],
    queryFn: () => fetchAnnouncements({ limit: 5 }),
  });

  const notificationsQuery = useQuery({
    queryKey: ['home', 'notifications'],
    queryFn: () => fetchNotifications({ limit: 5, unreadOnly: true }),
  });

  const snapshot = useMemo(() => {
    const attendance = attendanceQuery.data?.items ?? [];
    const present = attendance.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length;
    const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;
    const results = resultsQuery.data?.items ?? [];
    const quizAvg = results.length
      ? Math.round(results.reduce((sum, row) => sum + Number(row.percentage), 0) / results.length)
      : null;
    const homeworkItems = homeworkQuery.data?.items ?? [];
    const pendingHomework = homeworkItems.filter(isHomeworkPending);
    const homeworkDoneRate = homeworkItems.length
      ? Math.round(((homeworkItems.length - pendingHomework.length) / homeworkItems.length) * 100)
      : null;
    const quizzes = quizzesQuery.data?.items ?? [];
    const resultByQuiz = new Map(results.map((row) => [row.quizId, row]));
    const subjectBuckets = new Map<string, number[]>();
    quizzes.forEach((quiz) => {
      const result = resultByQuiz.get(quiz.id);
      const name = quiz.subject?.name;
      if (!result || !name) return;
      const list = subjectBuckets.get(name) ?? [];
      list.push(Number(result.percentage));
      subjectBuckets.set(name, list);
    });
    const subjects = [...subjectBuckets.entries()]
      .map(([name, scores]) => ({
        name,
        value: Math.round(scores.reduce((sum, n) => sum + n, 0) / scores.length),
        hint: `${scores.length} quiz${scores.length === 1 ? '' : 'zes'}`,
      }))
      .sort((a, b) => a.value - b.value);
    const recentAttendance = [...attendance]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((row) => ({ date: `${row.id}-${row.date}`, status: row.status }));
    return {
      attendanceRate,
      quizAvg,
      homeworkDoneRate,
      pendingCount: pendingHomework.length,
      subjects,
      recentAttendance,
    };
  }, [attendanceQuery.data, resultsQuery.data, homeworkQuery.data, quizzesQuery.data]);

  if (childLoading) {
    return <LoadingState message="Loading children…" />;
  }

  if (!selectedChild || !studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="No child linked" subtitle="Contact your school admin to link a student." />
      </SafeAreaView>
    );
  }

  const todayLessons = (lessonsQuery.data ?? []).filter(isLessonToday);
  const pendingHomework = (homeworkQuery.data?.items ?? []).filter(isHomeworkPending);
  const newQuizzes = (quizzesQuery.data?.items ?? []).filter(isQuizNew);
  const upcomingEvents = (eventsQuery.data?.items ?? []).filter(isUpcomingEvent).slice(0, 3);
  const unreadCount = notificationsQuery.data?.total ?? 0;
  const latestAnnouncements = announcementsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.firstName ?? 'Parent'}</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <Pressable onPress={() => router.push('/profile')}>
            <Text style={styles.profileLink}>Profile</Text>
          </Pressable>
        </View>

        <ChildHeader />

        <View style={styles.snapshot}>
          <Text style={styles.snapshotTitle}>At a glance</Text>
          <View style={styles.rings}>
            <ScoreRing value={snapshot.attendanceRate} label="Attendance" />
            <ScoreRing value={snapshot.quizAvg} label="Quiz average" />
            <ScoreRing value={snapshot.homeworkDoneRate} label="Homework done" />
          </View>
          {snapshot.recentAttendance.length ? (
            <View style={styles.dotsWrap}>
              <AttendanceDots statuses={snapshot.recentAttendance} />
            </View>
          ) : null}
          {snapshot.subjects.length ? (
            <View style={styles.subjects}>
              <Text style={styles.subjectsTitle}>Quiz scores by subject</Text>
              {snapshot.subjects.map((item) => (
                <LabeledBar key={item.name} label={item.name} value={item.value} hint={item.hint} />
              ))}
            </View>
          ) : (
            <Text style={styles.snapshotHint}>Quiz subject bars appear after the first result.</Text>
          )}
        </View>

        <View style={styles.statsRow}>
          <StatPill label="Pending HW" value={pendingHomework.length} />
          <StatPill label="New quizzes" value={newQuizzes.length} />
          <StatPill label="Unread" value={unreadCount} />
        </View>

        <SectionTitle title="Today's lessons" />
        {lessonsQuery.isLoading ? (
          <LoadingState message="Loading lessons…" />
        ) : lessonsQuery.isError ? (
          <ErrorState message="Could not load lessons" onRetry={() => lessonsQuery.refetch()} />
        ) : todayLessons.length === 0 ? (
          <EmptyState title="No lessons today" subtitle="Check the diary for recent activity." />
        ) : (
          todayLessons.map((lesson: LessonSummary) => (
            <Card key={lesson.id} onPress={() => router.push(`/lesson/${lesson.id}`)}>
              <Text style={styles.cardTitle}>{lesson.topicName ?? lesson.chapterName ?? 'Lesson'}</Text>
              <Text style={styles.cardMeta}>{lesson.subject?.name ?? 'Subject'}</Text>
            </Card>
          ))
        )}

        <SectionTitle
          title="Pending homework"
          action={
            <Text style={styles.link} onPress={() => router.push('/(tabs)/homework')}>
              See all
            </Text>
          }
        />
        {homeworkQuery.isLoading ? (
          <LoadingState message="Loading homework…" />
        ) : pendingHomework.length === 0 ? (
          <EmptyState title="All caught up" subtitle="No pending homework right now." />
        ) : (
          pendingHomework.slice(0, 3).map((item: Homework) => (
            <Card key={item.id} onPress={() => router.push(`/homework/${item.id}`)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                Due {new Date(item.dueDate).toLocaleDateString()} · {item.subject?.name}
              </Text>
            </Card>
          ))
        )}

        <SectionTitle
          title="New quizzes"
          action={
            <Text style={styles.link} onPress={() => router.push('/(tabs)/quizzes')}>
              See all
            </Text>
          }
        />
        {quizzesQuery.isLoading ? (
          <LoadingState message="Loading quizzes…" />
        ) : newQuizzes.length === 0 ? (
          <EmptyState title="No new quizzes" />
        ) : (
          newQuizzes.slice(0, 3).map((quiz: Quiz) => (
            <Card key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{quiz.title}</Text>
                <Badge label="New" tone="success" />
              </View>
              <Text style={styles.cardMeta}>{quiz.subject?.name}</Text>
            </Card>
          ))
        )}

        <SectionTitle
          title="Announcements"
          action={
            <Text style={styles.link} onPress={() => router.push('/announcements')}>
              See all
            </Text>
          }
        />
        {announcementsQuery.isLoading ? (
          <LoadingState message="Loading announcements…" />
        ) : latestAnnouncements.length === 0 ? (
          <EmptyState title="No announcements" />
        ) : (
          latestAnnouncements.slice(0, 3).map((item: Announcement) => (
            <Card key={item.id} onPress={() => router.push(`/announcement/${item.id}`)}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>
                {new Date(item.publishAt ?? item.createdAt).toLocaleDateString()}
              </Text>
            </Card>
          ))
        )}

        <SectionTitle title="Upcoming events" />
        {eventsQuery.isLoading ? (
          <LoadingState message="Loading events…" />
        ) : upcomingEvents.length === 0 ? (
          <EmptyState title="No upcoming events" />
        ) : (
          upcomingEvents.map((event: EventItem) => (
            <Card key={event.id} onPress={() => router.push(`/event/${event.id}`)}>
              <Text style={styles.cardTitle}>{event.title}</Text>
              <Text style={styles.cardMeta}>
                {new Date(event.startDate).toLocaleString()} · {event.location ?? event.type}
              </Text>
            </Card>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  date: { color: colors.slate500, marginTop: 4 },
  profileLink: { color: colors.primary, fontWeight: '600' },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    marginBottom: spacing.md,
  },
  snapshotTitle: { fontSize: 16, fontWeight: '800', color: colors.slate800, marginBottom: spacing.md },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  dotsWrap: { marginTop: spacing.md },
  subjects: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.slate100 },
  subjectsTitle: { fontSize: 13, fontWeight: '700', color: colors.slate600, marginBottom: spacing.sm },
  snapshotHint: { marginTop: spacing.md, fontSize: 12, color: colors.slate500 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statPill: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.primary },
  statLabel: { fontSize: 11, color: colors.slate500, marginTop: 2, textAlign: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
