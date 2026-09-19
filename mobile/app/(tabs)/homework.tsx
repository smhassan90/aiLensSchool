import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChildHeader } from '@/components/ChildHeader';
import { Badge, Card, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { useChild } from '@/providers/ChildProvider';
import { colors, spacing } from '@/constants/theme';
import {
  fetchHomework,
  getHomeworkListStatus,
  homeworkStatusLabel,
  homeworkStatusTone,
} from '@/services/homework.service';

export default function HomeworkTabScreen() {
  const { selectedChildId, isLoading: childLoading } = useChild();
  const studentId = selectedChildId ?? '';

  const query = useQuery({
    queryKey: ['homework', studentId],
    queryFn: () => fetchHomework(studentId, { limit: 50 }),
    enabled: !!studentId,
  });

  if (childLoading) return <LoadingState message="Loading…" />;
  if (!studentId) {
    return (
      <SafeAreaView style={styles.safe}>
        <EmptyState title="Select a child" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={styles.eyebrow}>KEEP LEARNING</Text>
            <Text style={styles.title}>Homework</Text>
            <ChildHeader />
          </>
        }
        data={query.data?.items ?? []}
        keyExtractor={(item) => item.id}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        ListEmptyComponent={
          query.isLoading ? (
            <LoadingState message="Loading homework…" />
          ) : query.isError ? (
            <ErrorState message="Could not load homework" onRetry={() => query.refetch()} />
          ) : (
            <EmptyState title="No homework assigned" />
          )
        }
        renderItem={({ item }) => {
          const status = getHomeworkListStatus(item);
          return (
            <Card onPress={() => router.push(`/homework/${item.id}`)}>
              <View style={styles.cardHeader}>
                <View style={styles.iconWrap}>
                  <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
              </View>
              <Text style={styles.cardMeta}>
                Due {new Date(item.dueDate).toLocaleDateString()} · {item.subject?.name}
                {item.result
                  ? ` · ${Number(item.result.percentage).toFixed(0)}%`
                  : ''}
              </Text>
              <Badge label={homeworkStatusLabel(status)} tone={homeworkStatusTone(status)} />
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.md, paddingBottom: 110, flexGrow: 1 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 1.2, color: colors.primary },
  title: { fontSize: 26, fontWeight: '600', color: colors.slate900, marginTop: 3, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  cardTitle: { fontSize: 16, fontWeight: '500', color: colors.slate800 },
  cardMeta: { fontSize: 13, color: colors.slate500, marginTop: 4, marginBottom: spacing.sm },
});
