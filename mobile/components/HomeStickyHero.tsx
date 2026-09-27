import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useChild } from '@/providers/ChildProvider';
import { assetUrl } from '@/lib/assets';
import { imagesAssets } from '@/assets/imagesAssets';
import { StudentViewingCard } from '@/components/StudentViewingBar';
import { colors, fontSizes, radii, shadows, spacing, typography } from '@/constants/theme';

type HomeStickyHeroProps = {
  schoolName?: string | null;
  schoolLogo?: string | null;
  parentFirstName?: string | null;
};

export function HomeStickyHero({ schoolName, schoolLogo, parentFirstName }: HomeStickyHeroProps) {
  const { selectedChild } = useChild();
  const logoUri = assetUrl(schoolLogo);
  const displaySchool = schoolName?.trim() || 'Your school';

  if (!selectedChild) return null;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.hero}>
      <View style={styles.schoolBand}>
        <View style={styles.brandAccent} />
        <View style={styles.schoolRow}>
          <View style={styles.schoolIdentity}>
            {logoUri ? (
              <View style={styles.schoolLogoFrame}>
                <Image
                  source={{ uri: logoUri }}
                  style={styles.schoolLogo}
                  accessibilityLabel={`${displaySchool} logo`}
                />
              </View>
            ) : (
              <View style={styles.schoolLogoFallback}>
                <imagesAssets.school size={22} color={colors.primary} />
              </View>
            )}
            <View style={styles.schoolTextWrap}>
              <Text style={styles.schoolName} numberOfLines={2}>
                {displaySchool}
              </Text>
              <Text style={styles.greeting}>Hello, {parentFirstName ?? 'Parent'}</Text>
            </View>
          </View>
          <Pressable
            style={({ pressed }) => [styles.profileButton, pressed && styles.profilePressed]}
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <imagesAssets.person size={20} color={colors.primaryDark} />
          </Pressable>
        </View>
        <Text style={styles.date}>{today}</Text>
      </View>

      <View style={styles.greenBand}>
        <StudentViewingCard />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    overflow: 'hidden',
    ...shadows.tabBar,
  },
  schoolBand: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  brandAccent: {
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.primary,
    marginBottom: spacing.sm,
    width: 48,
  },
  schoolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  schoolIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  schoolLogoFrame: {
    padding: 4,
    borderRadius: radii.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadows.card,
  },
  schoolLogo: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.white,
  },
  schoolLogoFallback: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  schoolTextWrap: { flex: 1 },
  schoolName: {
    fontSize: 20,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.slate900,
    lineHeight: 24,
  },
  greeting: {
    marginTop: 2,
    fontSize: fontSizes.body,
    color: colors.slate600,
    fontWeight: typography.medium,
  },
  date: {
    marginTop: spacing.sm,
    fontSize: fontSizes.caption,
    color: colors.slate500,
  },
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  profilePressed: { opacity: 0.85 },
  greenBand: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});
