import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, shadows, typography } from '@/constants/theme';

type TabIconName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  focused,
  color,
  size,
}: {
  name: TabIconName;
  focused: boolean;
  color: ColorValue;
  size: number;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
      <Ionicons name={name} color={color} size={size} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate500,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: typography.family,
          fontWeight: typography.medium,
          marginTop: 2,
        },
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'home' : 'home-outline'}
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="diary"
        options={{
          title: 'Diary',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'book' : 'book-outline'}
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="homework"
        options={{
          title: 'Homework',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'document-text' : 'document-text-outline'}
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="quizzes"
        options={{
          title: 'Quizzes',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'help-circle' : 'help-circle-outline'}
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'person' : 'person-outline'}
              focused={focused}
              color={color}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const spacingInset = 14;

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: spacingInset,
    right: spacingInset,
    bottom: Platform.OS === 'ios' ? 22 : 14,
    height: 68,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: colors.tabBar,
    borderTopWidth: 0,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.tabBarBorder,
    ...shadows.tabBar,
  },
  tabItem: {
    paddingTop: 2,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {
    backgroundColor: colors.accentSoft,
  },
});
