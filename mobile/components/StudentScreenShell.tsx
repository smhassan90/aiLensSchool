import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StudentViewingBar } from '@/components/StudentViewingBar';
import { colors, fontSizes, spacing, tabBarClearance, typography } from '@/constants/theme';

type ScreenTitleHeaderProps = {
  eyebrow?: string;
  title: string;
  header?: ReactNode;
};

export function ScreenTitleHeader({ eyebrow, title, header }: ScreenTitleHeaderProps) {
  return (
    <View style={styles.titleBlock}>
      <View style={styles.brandAccent} />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {header}
    </View>
  );
}

type StudentScreenShellProps = ScreenTitleHeaderProps & {
  children: ReactNode;
};

export function StudentScreenShell({ eyebrow, title, header, children }: StudentScreenShellProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StudentViewingBar />
      <View style={styles.body}>
        <ScreenTitleHeader eyebrow={eyebrow} title={title} header={header} />
        <View style={styles.content}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

export const studentScreenContentStyle = {
  paddingHorizontal: spacing.md,
  paddingBottom: tabBarClearance,
  flexGrow: 1 as const,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  body: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  content: {
    flex: 1,
  },
  titleBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate100,
  },
  brandAccent: {
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginBottom: spacing.sm,
    width: 48,
  },
  eyebrow: {
    fontSize: fontSizes.caption,
    fontWeight: typography.medium,
    letterSpacing: 1,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: fontSizes.title,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    color: colors.slate900,
    marginTop: 2,
  },
});
