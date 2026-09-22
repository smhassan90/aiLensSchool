import { ColorValue, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSizes, radii, shadows, typography } from '@/constants/theme';

type TabIconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  color,
  size,
}: {
  name: TabIconName;
  color: ColorValue;
  size: number;
}) {
  return (
    <View style={styles.iconWrap}>
      <Ionicons name={name} color={color} size={size} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 64;
  const bottomGap = 14;
  const bottomOffset = Math.max(insets.bottom, 10) + bottomGap;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate500,
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: fontSizes.caption,
          fontFamily: typography.family,
          fontWeight: typography.medium,
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
        tabBarStyle: {
          ...styles.tabBar,
          bottom: bottomOffset,
          height: tabBarHeight,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarItemStyle: {
          ...styles.tabItem,
          height: tabBarHeight,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diary',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'book' : 'book-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen
        name="homework"
        options={{
          title: 'Homework',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'document-text' : 'document-text-outline'}
              color={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="quizzes"
        options={{
          title: 'Quizzes',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon
              name={focused ? 'help-circle' : 'help-circle-outline'}
              color={color}
              size={22}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name={focused ? 'person' : 'person-outline'} color={color} size={22} />
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: colors.tabBar,
    borderTopWidth: 1.5,
    borderTopColor: colors.primary,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    ...shadows.tabBar,
  },
  tabItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 0,
  },
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
