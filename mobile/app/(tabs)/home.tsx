import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState, SectionBlock, textStyles } from '@/components/ui';
import { AttendanceDots, LabeledBar, ScoreRing } from '@/components/visuals';
import { useAuth } from '@/providers/AuthProvider';
import { useChild } from '@/providers/ChildProvider';
import { colors, fontSizes, radii, spacing, tabBarClearance, typography } from '@/constants/theme';
import { fetchLessonsForStudent, isLessonToday } from '@/services/lessons.service';
import { fetchHomework, needsHomeworkSubmission } from '@/services/homework.service';
import { formatDateTime } from '@/lib/format';
import { fetchQuizzes, isQuizNew } from '@/services/quizzes.service';
import { pendingQuizzes } from '@/lib/quiz-visibility';
import { fetchQuizResults } from '@/services/results.service';
import { fetchAttendance } from '@/services/attendance.service';
import { fetchEvents, isUpcomingEvent } from '@/services/events.service';
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
    queryFn: () => fetchAttendance(studentId, { limit: 30 }),
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

  const snapshot = useMemo(() => {
    const attendance = attendanceQuery.data?.items ?? [];
    const present = attendance.filter((row) => row.status === 'PRESENT' || row.status === 'LATE').length;
    const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;
    const results = resultsQuery.data?.items ?? [];
    const quizAvg = results.length
      ? Math.round(results.reduce((sum, row) => sum + Number(row.percentage), 0) / results.length)
      : null;
    const homeworkItems = homeworkQuery.data?.items ?? [];
    const openHomework = homeworkItems.filter(needsHomeworkSubmission);
    const homeworkDoneRate = homeworkItems.length
      ? Math.round(((homeworkItems.length - openHomework.length) / homeworkItems.length) * 100)
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
      pendingCount: openHomework.length,
      subjects,
      recentAttendance,
    };
  }, [attendanceQuery.data, resultsQuery.data, homeworkQuery.data, quizzesQuery.data]);

  if (childLoading) return <LoadingState message="Loading children…" />;

  if (!selectedChild || !studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="No child linked" subtitle="Contact your school admin to link a student." />
      </SafeAreaView>
    );
  }

  const todayLessons = (lessonsQuery.data ?? []).filter(isLessonToday);
  const openHomework = (homeworkQuery.data?.items ?? []).filter(needsHomeworkSubmission);
  const resultByQuiz = new Map((resultsQuery.data?.items ?? []).map((row) => [row.quizId, row]));
  const accessibleQuizzes = pendingQuizzes(quizzesQuery.data?.items ?? [], resultByQuiz);
  const upcomingEvents = (eventsQuery.data?.items ?? []).filter(isUpcomingEvent).slice(0, 3);
  const latestAnnouncements = announcementsQuery.data?.items ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>YOUR FAMILY HUB</Text>
            <Text style={styles.greeting}>Hello, {user?.firstName ?? 'Parent'}!</Text>
            <Text style={styles.date}>
              {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
          </View>
          <Pressable style={styles.profileButton} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
          </Pressable>
        </View>

        <ChildHeader />

        <View style={styles.quickRow}>
          <Pressable style={[styles.quickLink, styles.quickLinkSoft]} onPress={() => router.push('/fees')}>
            <Ionicons name="wallet-outline" size={20} color={colors.primary} />
            <Text style={styles.quickLinkText}>Fees</Text>
          </Pressable>
          <Pressable style={[styles.quickLink, styles.quickLinkYellow]} onPress={() => router.push('/day-off')}>
            <Ionicons name="calendar-outline" size={20} color={colors.warning} />
            <Text style={styles.quickLinkText}>Day off</Text>
          </Pressable>
        </View>

        <View style={styles.snapshot}>
          <View style={styles.snapshotHeader}>
            <Text style={styles.snapshotTitle}>At a glance</Text>
            <Ionicons name="trending-up-outline" size={20} color={colors.mint} />
          </View>
          <View style={styles.rings}>
            <ScoreRing
              value={snapshot.attendanceRate}
              label="Attendance"
              onPress={() => router.push('/attendance')}
            />
            <ScoreRing
              value={snapshot.quizAvg}
              label="Quiz average"
              onPress={() => router.push('/quiz-results')}
            />
            <ScoreRing value={snapshot.homeworkDoneRate} label="Homework done" />
          </View>
          {snapshot.recentAttendance.length ? (
            <Pressable style={styles.dotsWrap} onPress={() => router.push('/attendance')}>
              <AttendanceDots statuses={snapshot.recentAttendance} />
            </Pressable>
          ) : null}
          {snapshot.subjects.length ? (
            <View style={styles.subjects}>
              <Text style={styles.subjectsTitle}>Quiz scores by subject</Text>
              {snapshot.subjects.map((item) => (
                <LabeledBar key={item.name} label={item.name} value={item.value} hint={item.hint} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.statsRow}>
          <StatPill
            label="To-do HW"
            value={openHomework.length}
            tint={colors.surfaceMint}
            onPress={() => router.push('/(tabs)/homework')}
          />
          <StatPill
            label="Pending quizzes"
            value={accessibleQuizzes.length}
            tint={colors.surfaceYellow}
            onPress={() => router.push('/(tabs)/quizzes')}
          />
        </View>

        <SectionBlock title="Today's lessons" accent={colors.sky}>
          {lessonsQuery.isLoading ? (
            <LoadingState message="Loading lessons…" />
          ) : lessonsQuery.isError ? (
            <ErrorState message="Could not load lessons" onRetry={() => lessonsQuery.refetch()} />
          ) : todayLessons.length === 0 ? (
            <EmptyState title="No lessons today" subtitle="Check the diary for recent activity." />
          ) : (
            todayLessons.map((lesson: LessonSummary) => (
              <Card
                key={lesson.id}
                onPress={() =>
                  router.push(
                    lesson.homeworkId ? `/homework/${lesson.homeworkId}` : `/lesson/${lesson.id}`,
                  )
                }
              >
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {lesson.topicName ?? lesson.chapterName ?? 'Lesson'}
                </Text>
                <Text style={textStyles.caption}>{lesson.subject?.name ?? 'Subject'}</Text>
              </Card>
            ))
          )}
        </SectionBlock>

        <SectionBlock
          title="Homework to do"
          accent={colors.primary}
          action={
            <Text style={styles.link} onPress={() => router.push('/(tabs)/homework')}>
              See all
            </Text>
          }
        >
          {homeworkQuery.isLoading ? (
            <LoadingState message="Loading homework…" />
          ) : homeworkQuery.isError ? (
            <ErrorState message="Could not load homework" onRetry={() => homeworkQuery.refetch()} />
          ) : openHomework.length === 0 ? (
            <EmptyState title="All caught up" subtitle="No unsubmitted homework right now." />
          ) : (
            openHomework.slice(0, 3).map((item: Homework) => (
              <Card key={item.id} onPress={() => router.push(`/homework/${item.id}`)}>
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={textStyles.caption}>
                  Due {new Date(item.dueDate).toLocaleDateString()} · {item.subject?.name}
                </Text>
              </Card>
            ))
          )}
        </SectionBlock>

        <SectionBlock
          title="Pending quizzes"
          accent={colors.warning}
          action={
            <Text style={styles.link} onPress={() => router.push('/(tabs)/quizzes')}>
              See all
            </Text>
          }
        >
          {quizzesQuery.isLoading ? (
            <LoadingState message="Loading quizzes…" />
          ) : quizzesQuery.isError ? (
            <ErrorState message="Could not load quizzes" onRetry={() => quizzesQuery.refetch()} />
          ) : accessibleQuizzes.length === 0 ? (
            <EmptyState title="No pending quizzes" />
          ) : (
            accessibleQuizzes.slice(0, 3).map((quiz: Quiz) => (
              <Card key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
                <View style={styles.row}>
                  <Text style={textStyles.cardTitle} numberOfLines={2}>
                    {quiz.title}
                  </Text>
                  {isQuizNew(quiz, { hasResult: false }) ? <Badge label="New" tone="success" /> : null}
                </View>
                <Text style={textStyles.caption}>
                  {quiz.subject?.name}
                  {formatDateTime(quiz.publishedAt) ? ` · Arrived ${formatDateTime(quiz.publishedAt)}` : ''}
                </Text>
              </Card>
            ))
          )}
        </SectionBlock>

        <SectionBlock
          title="Announcements"
          accent={colors.slate500}
          action={
            <Text style={styles.link} onPress={() => router.push('/announcements')}>
              See all
            </Text>
          }
        >
          {announcementsQuery.isLoading ? (
            <LoadingState message="Loading announcements…" />
          ) : latestAnnouncements.length === 0 ? (
            <EmptyState title="No announcements" />
          ) : (
            latestAnnouncements.slice(0, 3).map((item: Announcement) => (
              <Card key={item.id} onPress={() => router.push(`/announcement/${item.id}`)}>
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={textStyles.caption}>
                  {new Date(item.publishAt ?? item.createdAt).toLocaleDateString()}
                </Text>
              </Card>
            ))
          )}
        </SectionBlock>

        <SectionBlock title="Upcoming events" accent={colors.mint}>
          {eventsQuery.isLoading ? (
            <LoadingState message="Loading events…" />
          ) : upcomingEvents.length === 0 ? (
            <EmptyState title="No upcoming events" />
          ) : (
            upcomingEvents.map((event: EventItem) => (
              <Card key={event.id} onPress={() => router.push(`/event/${event.id}`)}>
                <Text style={textStyles.cardTitle} numberOfLines={2}>
                  {event.title}
                </Text>
                <Text style={textStyles.caption}>
                  {new Date(event.startDate).toLocaleString()} · {event.location ?? event.type}
                </Text>
              </Card>
            ))
          )}
        </SectionBlock>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatPill({
  label,
  value,
  tint,
  onPress,
}: {
  label: string;
  value: number;
  tint: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.statPill, { backgroundColor: tint }, pressed && styles.statPillPressed]}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { paddingHorizontal: spacing.md, paddingBottom: tabBarClearance },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    letterSpacing: 1,
    color: colors.primary,
  },
  greeting: {
    fontSize: fontSizes.title,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.slate900,
    marginTop: 2,
  },
  date: { color: colors.slate500, marginTop: 4, fontSize: fontSizes.body },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickLink: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quickLinkSoft: { backgroundColor: colors.accentSoft },
  quickLinkYellow: { backgroundColor: colors.surfaceYellow },
  quickLinkText: { color: colors.slate800, fontWeight: typography.medium, fontSize: fontSizes.body },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  snapshotTitle: {
    fontSize: fontSizes.title,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.slate800,
  },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  dotsWrap: { marginTop: spacing.md },
  subjects: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  subjectsTitle: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    color: colors.slate600,
    marginBottom: spacing.sm,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statPill: {
    flex: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
    alignItems: 'center',
  },
  statPillPressed: { opacity: 0.8 },
  statValue: {
    fontSize: fontSizes.title,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.primaryDark,
  },
  statLabel: {
    fontSize: fontSizes.caption,
    color: colors.slate500,
    marginTop: 2,
    textAlign: 'center',
  },
  link: { color: colors.primary, fontWeight: typography.semibold, fontSize: fontSizes.caption },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
});
