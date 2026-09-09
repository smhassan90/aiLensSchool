import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from '@/lib/api';
import { colors, spacing } from '@/constants/theme';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Push notifications</Text>
          <Text style={styles.value}>
            Not enabled yet. You will still see school alerts in the Alerts tab.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>App</Text>
          <Text style={styles.value}>HawkNexa Parent</Text>
        </View>

        {__DEV__ ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>API URL (dev)</Text>
              <Text style={styles.value}>{API_BASE_URL}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Deep link scheme (dev)</Text>
              <Text style={styles.value}>smsparent://</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate50 },
  content: { padding: spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: colors.slate900, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.slate500, textTransform: 'uppercase' },
  value: { fontSize: 15, color: colors.slate800, marginTop: spacing.xs, lineHeight: 22 },
});
