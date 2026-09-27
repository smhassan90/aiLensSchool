import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useEffect, useMemo, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router, usePathname } from 'expo-router';
import { imagesAssets, ImageAssetProps } from '@/assets/imagesAssets';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeStickyHero } from '@/components/HomeStickyHero';
import { Badge, Card, ErrorState, LoadingState, SectionBlock, textStyles } from '@/components/ui';
import { AttendanceDots, LabeledBar, ScoreRing } from '@/components/visuals';
import { useAuth } from '@/providers/AuthProvider';
import { useChild } from '@/providers/ChildProvider';
import { useAnnouncementRead } from '@/hooks/useAnnouncementRead';
import { colors, fontSizes, radii, shadows, spacing, tabBarClearance, typography } from '@/constants/theme';
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
  const { isUnread, refresh: refreshAnnouncementRead } = useAnnouncementRead();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.includes('home')) return;
    refreshAnnouncementRead().catch(() => undefined);
  }, [pathname, refreshAnnouncementRead]);
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
      subjects,
      recentAttendance,
    };
  }, [attendanceQuery.data, resultsQuery.data, homeworkQuery.data, quizzesQuery.data]);

  if (childLoading) return <LoadingState message="Loading children…" />;

  if (!selectedChild || !studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.fallbackTitle}>No child linked</Text>
        <Text style={styles.fallbackSubtitle}>Contact your school admin to link a student.</Text>
      </SafeAreaView>
    );
  }

  const todayLessons = (lessonsQuery.data ?? []).filter(isLessonToday);
  const openHomework = (homeworkQuery.data?.items ?? []).filter(needsHomeworkSubmission);
  const resultByQuiz = new Map((resultsQuery.data?.items ?? []).map((row) => [row.quizId, row]));
  const accessibleQuizzes = pendingQuizzes(quizzesQuery.data?.items ?? [], resultByQuiz);
  const upcomingEvents = (eventsQuery.data?.items ?? []).filter(isUpcomingEvent).slice(0, 3);
  const unreadAnnouncements = (announcementsQuery.data?.items ?? []).filter((item) => isUnread(item.id));

  const showLessons =
    lessonsQuery.isLoading || lessonsQuery.isError || todayLessons.length > 0;
  const showHomework =
    homeworkQuery.isLoading || homeworkQuery.isError || openHomework.length > 0;
  const showQuizzes =
    quizzesQuery.isLoading || quizzesQuery.isError || accessibleQuizzes.length > 0;
  const showAnnouncements =
    announcementsQuery.isLoading || unreadAnnouncements.length > 0;
  const showEvents = eventsQuery.isLoading || upcomingEvents.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HomeStickyHero
        schoolName={user?.school?.name}
        schoolLogo={user?.school?.logo}
        parentFirstName={user?.firstName}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quickRow}>
          <QuickActionCard
            title="Fees"
            subtitle="Balances & receipts"
            icon={imagesAssets.wallet}
            tint={colors.primary}
            onPress={() => router.push('/fees')}
          />
          <QuickActionCard
            title="Day off"
            subtitle="Request absence"
            icon={imagesAssets.calendar}
            tint={colors.warning}
            onPress={() => router.push('/day-off')}
          />
        </View>

        {(openHomework.length > 0 || accessibleQuizzes.length > 0) && (
          <View style={styles.priorityRow}>
            {openHomework.length > 0 ? (
              <PriorityCard
                count={openHomework.length}
                title="Homework due"
                icon={imagesAssets.document}
                accent={colors.primary}
                onPress={() => router.push('/(tabs)/homework')}
              />
            ) : null}
            {accessibleQuizzes.length > 0 ? (
              <PriorityCard
                count={accessibleQuizzes.length}
                title="Quizzes waiting"
                icon={imagesAssets.helpCircle}
                accent={colors.warning}
                onPress={() => router.push('/(tabs)/quizzes')}
              />
            ) : null}
          </View>
        )}

        <View style={styles.snapshot}>
          <View style={styles.snapshotHeader}>
            <Text style={styles.snapshotTitle}>At a glance</Text>
            <imagesAssets.analytics size={20} color={colors.primary} />
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

        {showLessons ? (
          <SectionBlock title="Today's lessons" accent={colors.sky}>
            {lessonsQuery.isLoading ? (
              <LoadingState message="Loading lessons…" />
            ) : lessonsQuery.isError ? (
              <ErrorState message="Could not load lessons" onRetry={() => lessonsQuery.refetch()} />
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
                  <View style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: colors.surfaceBlue }]}>
                      <imagesAssets.book size={18} color={colors.sky} />
                    </View>
                    <View style={styles.listBody}>
                      <Text style={textStyles.cardTitle} numberOfLines={2}>
                        {lesson.topicName ?? lesson.chapterName ?? 'Lesson'}
                      </Text>
                      <Text style={textStyles.caption}>{lesson.subject?.name ?? 'Subject'}</Text>
                    </View>
                    <imagesAssets.chevronForward size={18} color={colors.slate300} />
                  </View>
                </Card>
              ))
            )}
          </SectionBlock>
        ) : null}

        {showHomework ? (
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
            ) : (
              openHomework.slice(0, 3).map((item: Homework) => (
                <Card key={item.id} onPress={() => router.push(`/homework/${item.id}`)}>
                  <View style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: colors.surfaceMint }]}>
                      <imagesAssets.pencil size={18} color={colors.primary} />
                    </View>
                    <View style={styles.listBody}>
                      <Text style={textStyles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={textStyles.caption}>
                        Due {new Date(item.dueDate).toLocaleDateString()} · {item.subject?.name}
                      </Text>
                    </View>
                    <imagesAssets.chevronForward size={18} color={colors.slate300} />
                  </View>
                </Card>
              ))
            )}
          </SectionBlock>
        ) : null}

        {showQuizzes ? (
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
            ) : (
              accessibleQuizzes.slice(0, 3).map((quiz: Quiz) => (
                <Card key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
                  <View style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: colors.surfaceYellow }]}>
                      <imagesAssets.helpCircle size={18} color={colors.warning} />
                    </View>
                    <View style={styles.listBody}>
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
                    </View>
                    <imagesAssets.chevronForward size={18} color={colors.slate300} />
                  </View>
                </Card>
              ))
            )}
          </SectionBlock>
        ) : null}

        {showAnnouncements ? (
          <SectionBlock
            title="New announcements"
            accent={colors.slate500}
            action={
              <Text style={styles.link} onPress={() => router.push('/announcements')}>
                See all
              </Text>
            }
          >
            {announcementsQuery.isLoading ? (
              <LoadingState message="Loading announcements…" />
            ) : (
              unreadAnnouncements.slice(0, 3).map((item: Announcement) => (
                <Card key={item.id} onPress={() => router.push(`/announcement/${item.id}`)}>
                  <View style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: colors.slate100 }]}>
                      <imagesAssets.megaphone size={18} color={colors.slate600} />
                    </View>
                    <View style={styles.listBody}>
                      <Text style={textStyles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Text style={textStyles.caption}>
                        {new Date(item.publishAt ?? item.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <View style={styles.unreadDot} />
                  </View>
                </Card>
              ))
            )}
          </SectionBlock>
        ) : null}

        {showEvents ? (
          <SectionBlock title="Upcoming events" accent={colors.mint}>
            {eventsQuery.isLoading ? (
              <LoadingState message="Loading events…" />
            ) : (
              upcomingEvents.map((event: EventItem) => (
                <Card key={event.id} onPress={() => router.push(`/event/${event.id}`)}>
                  <View style={styles.listRow}>
                    <View style={[styles.listIcon, { backgroundColor: colors.surfaceMint }]}>
                      <imagesAssets.calendar size={18} color={colors.mint} />
                    </View>
                    <View style={styles.listBody}>
                      <Text style={textStyles.cardTitle} numberOfLines={2}>
                        {event.title}
                      </Text>
                      <Text style={textStyles.caption}>
                        {new Date(event.startDate).toLocaleString()} · {event.location ?? event.type}
                      </Text>
                    </View>
                    <imagesAssets.chevronForward size={18} color={colors.slate300} />
                  </View>
                </Card>
              ))
            )}
          </SectionBlock>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickActionCard({
  title,
  subtitle,
  icon,
  tint,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: (props: ImageAssetProps) => ReactElement;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickCard, pressed && styles.quickCardPressed]}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${tint}18` }]}>
        {icon({ size: 22, color: tint })}
      </View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickSubtitle} numberOfLines={1}>{subtitle}</Text>
      <View style={styles.quickChevron}>
        <imagesAssets.chevronForward size={16} color={colors.slate300} />
      </View>
    </Pressable>
  );
}

function PriorityCard({
  count,
  title,
  icon,
  accent,
  onPress,
}: {
  count: number;
  title: string;
  icon: (props: ImageAssetProps) => ReactElement;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.priorityCard, pressed && styles.priorityCardPressed]}
    >
      <View style={[styles.priorityIcon, { backgroundColor: `${accent}15` }]}>
        {icon({ size: 20, color: accent })}
      </View>
      <View style={styles.priorityText}>
        <Text style={[styles.priorityCount, { color: accent }]}>{count}</Text>
        <Text style={styles.priorityTitle}>{title}</Text>
      </View>
      <imagesAssets.arrowForward size={16} color={accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { flex: 1, backgroundColor: colors.slate50 },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: tabBarClearance,
  },
  fallbackTitle: {
    fontSize: fontSizes.title,
    fontWeight: typography.semibold,
    color: colors.slate800,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  fallbackSubtitle: {
    fontSize: fontSizes.body,
    color: colors.slate500,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.sm,
    minHeight: 108,
    borderWidth: 1,
    borderColor: colors.slate100,
    ...shadows.card,
  },
  quickCardPressed: { opacity: 0.92, transform: [{ scale: 0.99 }] },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: {
    marginTop: spacing.sm,
    fontSize: fontSizes.body,
    fontWeight: typography.semibold,
    color: colors.slate800,
  },
  quickSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.slate500,
    marginTop: 2,
    paddingRight: spacing.md,
  },
  quickChevron: { position: 'absolute', right: spacing.sm, top: spacing.sm },
  priorityRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  priorityCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate100,
    ...shadows.card,
  },
  priorityCardPressed: { opacity: 0.9 },
  priorityIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priorityText: { flex: 1 },
  priorityCount: {
    fontSize: fontSizes.title,
    fontWeight: typography.semibold,
  },
  priorityTitle: {
    fontSize: fontSizes.caption,
    color: colors.slate600,
    fontWeight: typography.medium,
  },
  snapshot: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.slate100,
    ...shadows.card,
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
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBody: { flex: 1 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  link: { color: colors.primary, fontWeight: typography.semibold, fontSize: fontSizes.caption },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
});
