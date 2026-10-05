import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import Header from '../header';
import SidebarNav from '../SidebarNav.web';

type AdminPageHeaderProps = {
  title: string;
  hideBackButton?: boolean;
  onBackPress?: () => void;
};

export default function AdminPageHeader({ title, hideBackButton, onBackPress }: AdminPageHeaderProps) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = Platform.OS !== 'web' || width < 1024;
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <Header
        title={title}
        overline="Admin portal"
        hideBackButton={hideBackButton ?? true}
        onBackPress={onBackPress}
        leftComponent={mobile ? (
          <TouchableOpacity
            testID="admin-menu-button"
            accessibilityRole="button"
            accessibilityLabel="Open admin navigation"
            accessibilityState={{ expanded: mobile && menuOpen }}
            onPress={() => setMenuOpen(true)}
            style={styles.menuButton}
          >
            <Ionicons name="menu-outline" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : undefined}
      />
      <Modal visible={mobile && menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <View style={styles.overlay}>
          <Pressable accessibilityLabel="Dismiss admin navigation" style={StyleSheet.absoluteFill} onPress={closeMenu} />
          <View
            testID="admin-mobile-navigation"
            style={[styles.panel, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
          >
            <SidebarNav mobile onNavigate={closeMenu} onClose={closeMenu} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' },
  panel: { width: '88%', maxWidth: 340, height: '100%' },
});
