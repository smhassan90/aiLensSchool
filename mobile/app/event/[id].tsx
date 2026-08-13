import { ScrollView, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { fetchEvents, findEventById } from '@/services/events.service';

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const list = await fetchEvents({ limit: 100 });
      const item = findEventById(list.items, id!);
      if (!item) throw new Error('Not found');
      return item;
    },
    enabled: !!id,
  });

  if (query.isLoading) return <LoadingState message="Loading event…" />;
  if (query.isError || !query.data) {
    return (
      <SafeAreaView style={styles.safe}>
        <ErrorState message="Event not found" onRetry={() => query.refetch()} />
      </SafeAreaView>
    );
  }

  const event = query.data;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.meta}>{event.type}</Text>
        <Text style={styles.detail}>
          {new Date(event.startDate).toLocaleString()} – {new Date(event.endDate).toLocaleString()}
        </Text>
        {event.location ? <Text style={styles.detail}>📍 {event.location}</Text> : null}
        {event.description ? (
          <Text style={styles.body}>{event.description}</Text>
        ) : (
          <EmptyState title="No description" />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg },
  title: { fontSize: 24, fontWeight: '800', color: colors.slate900 },
  meta: { color: colors.primary, fontWeight: '600', marginTop: spacing.sm },
  detail: { color: colors.slate600, marginTop: spacing.sm },
  body: { fontSize: 16, lineHeight: 24, color: colors.slate700, marginTop: spacing.lg },
});
