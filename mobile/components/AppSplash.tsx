import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { colors, fontSizes, radii, spacing, typography } from '@/constants/theme';
import { assetUrl } from '@/lib/assets';

export type SplashTask = 'startup' | 'sign-in' | 'password';

const TASK_PHRASES: Record<SplashTask, string[]> = {
  startup: [
    'Opening Hawk Nexa',
    'Loading your school dashboard',
    'Fetching announcements and updates',
    'Syncing homework and attendance',
    'Almost ready',
  ],
  'sign-in': ['Opening sign in', 'Getting things ready', 'Almost there'],
  password: ['Checking your account', 'Password update required', 'Almost there'],
};

const platformLogo = require('../assets/icon.png');

type AppSplashProps = {
  task?: SplashTask;
  phrases?: string[];
  schoolName?: string | null;
  schoolLogo?: string | null;
};

export function AppSplash({ task = 'startup', phrases, schoolName, schoolLogo }: AppSplashProps) {
  const lines = useMemo(
    () => (phrases?.length ? phrases : TASK_PHRASES[task]),
    [phrases, task],
  );
  const [index, setIndex] = useState(0);
  const schoolLogoUri = assetUrl(schoolLogo);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(18)).current;
  const phraseOpacity = useRef(new Animated.Value(0)).current;
  const phraseY = useRef(new Animated.Value(8)).current;
  const barProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    ExpoSplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const barLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(barProgress, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(barProgress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    barLoop.start();

    return () => {
      barLoop.stop();
    };
  }, [barProgress, fadeIn, slideUp]);

  useEffect(() => {
    phraseOpacity.setValue(0);
    phraseY.setValue(8);

    Animated.parallel([
      Animated.timing(phraseOpacity, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(phraseY, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, phraseOpacity, phraseY]);

  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(() => {
      setIndex((current) => (current + 1) % lines.length);
    }, 2400);
    return () => clearInterval(id);
  }, [lines.length]);

  const barWidth = barProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['18%', '88%'],
  });

  return (
    <View style={styles.root} accessibilityRole="progressbar" accessibilityLabel={lines[index]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeIn,
            transform: [{ translateY: slideUp }],
          },
        ]}
      >
        <View style={styles.logoRow}>
          {schoolLogoUri ? (
            <Image
              source={{ uri: schoolLogoUri }}
              style={styles.schoolLogo}
              resizeMode="cover"
              accessibilityLabel={`${schoolName ?? 'School'} logo`}
            />
          ) : (
            <Image
              source={platformLogo}
              style={styles.platformLogo}
              resizeMode="contain"
              accessibilityLabel="Hawk Nexa logo"
            />
          )}
        </View>

        <Text style={styles.brand}>
          <Text style={styles.brandHawk}>Hawk</Text>
          <Text style={styles.brandNexa}>Nexa</Text>
        </Text>

        {schoolName ? (
          <Text style={styles.schoolName} numberOfLines={2}>
            {schoolName}
          </Text>
        ) : null}

        <Animated.Text
          style={[
            styles.phrase,
            {
              opacity: phraseOpacity,
              transform: [{ translateY: phraseY }],
            },
          ]}
        >
          {lines[index]}
        </Animated.Text>

        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, { width: barWidth }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  logoRow: {
    marginBottom: spacing.md,
  },
  platformLogo: {
    width: 88,
    height: 88,
  },
  schoolLogo: {
    width: 88,
    height: 88,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    backgroundColor: colors.slate50,
  },
  brand: {
    fontSize: 22,
    fontFamily: typography.family,
    fontWeight: typography.semibold,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  brandHawk: {
    color: colors.primary,
  },
  brandNexa: {
    color: colors.accent,
  },
  schoolName: {
    marginTop: spacing.xs,
    fontSize: fontSizes.body,
    fontFamily: typography.family,
    fontWeight: typography.medium,
    color: colors.slate700,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
  phrase: {
    marginTop: spacing.md,
    minHeight: 40,
    fontSize: fontSizes.body,
    fontFamily: typography.family,
    color: colors.slate500,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.sm,
  },
  barTrack: {
    marginTop: spacing.lg,
    width: 160,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.slate200,
    overflow: 'hidden',
  },
  barFill: {
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
});
