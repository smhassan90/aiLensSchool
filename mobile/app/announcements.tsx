import { FlatList, StyleSheet, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { fetchAnnouncements } from '@/services/announcements.service';

export default function AnnouncementsListScreen() {
  const query = useQuery({
    queryKey: ['announcements'],
    queryFn: () => fetchAnnouncements({ limit: 50 }),
  });

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.content}
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading announcements…" />
          ) : query.isError ? (
            <ErrorState message="Could not load announcements" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No announcements" />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/announcement/${item.id}`)}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMeta}>
              {new Date(item.publishAt ?? item.createdAt).toLocaleString()}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, flexGrow: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4 },
});
