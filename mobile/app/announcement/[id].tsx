import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { fetchAnnouncements, findAnnouncementById } from '@/services/announcements.service';

export default function AnnouncementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['announcements', id],
    queryFn: async () => {
      const list = await fetchAnnouncements({ limit: 100 });
      const item = findAnnouncementById(list.items, id!);
      if (!item) throw new Error('Not found');
      return item;
    },
    enabled: !!id,
  });

  if (query.isLoading) return <LoadingState message="Loading announcement…" />;
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Announcement not found" onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const announcement = query.data;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{announcement.title}</Text>
        <Text style={styles.meta}>
          {announcement.publishAt
            ? new Date(announcement.publishAt).toLocaleString()
            : new Date(announcement.createdAt).toLocaleString()}
        </Text>
        {announcement.description ? (
          <Text style={styles.body}>{announcement.description}</Text>
        ) : (
          <EmptyState title="No details" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  meta: { color: colors.slate500, marginTop: spacing.sm, marginBottom: spacing.lg },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700 },
});
