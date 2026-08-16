import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/AuthProvider';
import { LoadingState } from '@/components/ui';
import { colors, radii, spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api';

const schema = z.object({
  username: z.string().min(3, 'Enter the username given by the school'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof schema>;

export default function LoginScreen() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: __DEV__ ? 'abc.f.stu001' : '',
      password: __DEV__ ? 'Parent123!' : '',
    },
  });

  if (isLoading) {
    return <LoadingState message="Loading…" />;
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/home" />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      await login(values.username, values.password);
      router.replace('/(tabs)/home');
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : 'Login failed. Check your credentials.';
      Alert.alert('Login failed', message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.brand}>AiSchoolLens</Text>
        <Text style={styles.subtitle}>Parent app — stay connected with your child&apos;s school day</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Username</Text>
        <Controller
          control={control}
          name="username"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              style={styles.input}
              placeholder="abc.f.stu001"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        {errors.username ? <Text style={styles.error}>{errors.username.message}</Text> : null}

        <Text style={styles.label}>Password</Text>
        <Controller
          control={control}
          name="password"
          render={({ field: { onChange, onBlur, value } }) => (
            <TextInput
              secureTextEntry
              style={styles.input}
              placeholder="••••••••"
              onBlur={onBlur}
              onChangeText={onChange}
              value={value}
            />
          )}
        />
        {errors.password ? <Text style={styles.error}>{errors.password.message}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
        </Pressable>

        <Text style={styles.hint}>Use the username and password the school gave you. You can change the password after login.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.slate50,
  },
  hero: {
    backgroundColor: colors.primary,
    paddingTop: 80,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  brand: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '800',
  },
  subtitle: {
    color: '#ccfbf1',
    marginTop: spacing.sm,
    fontSize: 16,
  },
  form: {
    flex: 1,
    padding: spacing.lg,
    marginTop: -spacing.lg,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate700,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: colors.slate50,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    marginTop: spacing.xs,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    textAlign: 'center',
    color: colors.slate400,
    fontSize: 12,
    marginTop: spacing.md,
  },
});
