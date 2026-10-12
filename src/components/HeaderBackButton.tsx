import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';

interface HeaderBackButtonProps {
  onPress?: () => void;
  tintColor?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
}

export const HeaderBackButton: React.FC<HeaderBackButtonProps> = ({
  onPress,
  tintColor = colors.primary,
  iconName = 'chevron-back',
}) => {
  const navigation = useNavigation();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Torna indietro"
    >
      <View style={styles.iconCircle}>
        <Ionicons name={iconName} size={20} color={tintColor} style={styles.icon} />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    marginLeft: PlatformSelectMargin(),
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDF2F4', // Soft bordeaux pill
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCE7F0',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: {
    marginLeft: -1, // Optically center the chevron-back arrow
  },
});

function PlatformSelectMargin() {
  return 0;
}

export default HeaderBackButton;
