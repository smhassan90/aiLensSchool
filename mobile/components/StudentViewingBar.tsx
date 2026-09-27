import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useChild } from '@/providers/ChildProvider';
import { imagesAssets } from '@/assets/imagesAssets';
import { StudentAvatar } from '@/components/StudentAvatar';
import { colors, fontSizes, radii, shadows, spacing, typography } from '@/constants/theme';

type StudentViewingBarProps = {
  roundedBottom?: boolean;
  /** When true, only the white card is rendered (e.g. inside dashboard hero green band). */
  cardOnly?: boolean;
};

export function StudentViewingCard() {
  const { selectedChild, children } = useChild();

  if (!selectedChild) return null;

  const enrollment = selectedChild.enrollments?.[0];
  const childMeta = enrollment
    ? `${enrollment.grade.name} · ${enrollment.section.name}`
    : selectedChild.studentCode;

  return (
    <Pressable
      style={({ pressed }) => [styles.childCard, pressed && styles.childCardPressed]}
      onPress={() => router.push('/child-selector')}
      accessibilityRole="button"
      accessibilityLabel="Switch student"
    >
      <StudentAvatar student={selectedChild} size={48} />
      <View style={styles.childInfo}>
        <Text style={styles.childLabel}>Viewing student</Text>
        <Text style={styles.childName}>
          {selectedChild.firstName} {selectedChild.lastName}
        </Text>
        <Text style={styles.childMeta}>{childMeta}</Text>
      </View>
      {children.length > 1 ? (
        <View style={styles.switchPill}>
          <Text style={styles.switchText}>Switch</Text>
          <imagesAssets.chevronDown size={14} color={colors.primaryDark} />
        </View>
      ) : (
        <imagesAssets.chevronForward size={18} color={colors.slate400} />
      )}
    </Pressable>
  );
}

export function StudentViewingBar({ roundedBottom = true, cardOnly = false }: StudentViewingBarProps) {
  if (cardOnly) {
    return <StudentViewingCard />;
  }

  return (
    <View style={[styles.greenBand, roundedBottom && styles.roundedBottom]}>
      <StudentViewingCard />
    </View>
  );
}

const styles = StyleSheet.create({
  greenBand: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    ...shadows.tabBar,
  },
  roundedBottom: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    ...shadows.card,
  },
  childCardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  childInfo: { flex: 1 },
  childLabel: {
    fontSize: 10,
    fontWeight: typography.medium,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  childName: {
    marginTop: 1,
    fontSize: fontSizes.title,
    fontWeight: typography.semibold,
    color: colors.slate900,
  },
  childMeta: {
    marginTop: 2,
    fontSize: fontSizes.caption,
    color: colors.slate600,
  },
  switchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  switchText: {
    fontSize: fontSizes.caption,
    fontWeight: typography.semibold,
    color: colors.primaryDark,
  },
});
