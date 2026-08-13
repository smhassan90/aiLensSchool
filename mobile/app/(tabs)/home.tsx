import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState, SectionTitle } from '@/components/ui';
import { useAuth } from '@/providers/AuthProvider';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import { fetchLessonsForStudent, isLessonToday } from '@/services/lessons.service';
import { fetchHomework, isHomeworkPending } from '@/services/homework.service';
import { fetchQuizzes, isQuizNew } from '@/services/quizzes.service';
import { fetchEvents, isUpcomingEvent } from '@/services/events.service';
import { fetchNotifications } from '@/services/notifications.service';

export default function HomeScreen() {
  const { user } = useAuth();
  const { selectedChild, selectedChildId, isLoading: childLoading } = useChild();

  const studentId = selectedChildId ?? '';
  const sectionId = selectedChild?.enrollments?.[0]?.section.id;

  const lessonsQuery = useQuery({
    queryKey: ['home', 'lessons', studentId, sectionId],
    queryFn: () => fetchLessonsForStudent(studentId, sectionId),
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

  const eventsQuery = useQuery({
    queryKey: ['home', 'events'],
    queryFn: () => fetchEvents({ limit: 5 }),
  });

  const notificationsQuery = useQuery({
    queryKey: ['home', 'notifications'],
    queryFn: () => fetchNotifications({ limit: 5, unreadOnly: true }),
  });

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Hello, {user?.firstName ?? 'Parent'}</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          </View>
          <Pressable onPress={() => router.push('/profile')}>
            <Text style={styles.profileLink}>Profile</Text>
          </Pressable>
        </View>

        <ChildHeader />

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
          todayLessons.map((lesson) => (
            <Card key={lesson.id} onPress={() => router.push(`/lesson/${lesson.id}`)}>
              <Text style={styles.cardTitle}>{lesson.topicName ?? lesson.chapterName ?? 'Lesson'}</Text>
              <Text style={styles.cardMeta}>{lesson.subject?.name ?? 'Subject'}</Text>
            </Card>
          ))
        )}

        <SectionTitle
          title="Pending homework"
          action={<Text style={styles.link} onPress={() => router.push('/(tabs)/homework')}>See all</Text>}
        />
        {homeworkQuery.isLoading ? (
          <LoadingState message="Loading homework…" />
        ) : pendingHomework.length === 0 ? (
          <EmptyState title="All caught up" subtitle="No pending homework right now." />
        ) : (
          pendingHomework.slice(0, 3).map((item) => (
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
          action={<Text style={styles.link} onPress={() => router.push('/(tabs)/quizzes')}>See all</Text>}
        />
        {quizzesQuery.isLoading ? (
          <LoadingState message="Loading quizzes…" />
        ) : newQuizzes.length === 0 ? (
          <EmptyState title="No new quizzes" />
        ) : (
          newQuizzes.slice(0, 3).map((quiz) => (
            <Card key={quiz.id} onPress={() => router.push(`/quiz/${quiz.id}`)}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>{quiz.title}</Text>
                <Badge label="New" tone="success" />
              </View>
              <Text style={styles.cardMeta}>{quiz.subject?.name}</Text>
            </Card>
          ))
        )}

        <SectionTitle title="Upcoming events" />
        {eventsQuery.isLoading ? (
          <LoadingState message="Loading events…" />
        ) : upcomingEvents.length === 0 ? (
          <EmptyState title="No upcoming events" />
        ) : (
          upcomingEvents.map((event) => (
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
