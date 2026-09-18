import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, shadows, spacing } from '@/constants/theme';

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.error}>{message}</Text>
      {onRetry ? (
        <Text style={styles.retry} onPress={onRetry}>
          Tap to retry
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  message: {
    color: colors.slate500,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.slate700,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.slate500,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
    fontSize: 15,
  },
  retry: {
    color: colors.primaryDark,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
});

export function Card({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyles.card, pressed && cardStyles.pressed]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyles.card}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 0,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.99 }],
  },
});

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.title}>{title}</Text>
      {action}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.slate800,
  },
});

export function Badge({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'warning' }) {
  const palette = {
    default: { bg: colors.slate100, text: colors.slate700 },
    success: { bg: '#dcfce7', text: colors.success },
    warning: { bg: '#fef3c7', text: colors.warning },
  }[tone];

  return (
    <View style={[badgeStyles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[badgeStyles.text, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
