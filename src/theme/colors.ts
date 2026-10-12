/**
 * GymAIApp Theme System - Bordeaux & Violet Palette
 * Premium fitness aesthetics with sophisticated deep bordeaux and vivid violet accents.
 */

export const colors = {
  // Primary brand: Bordeaux / Wine
  primary: '#720938',            // Deep elegant bordeaux
  primaryDark: '#4A0420',        // Dark bordeaux
  primaryLight: '#9F1239',       // Crimson wine
  primarySubtle: '#FDF2F4',      // Soft bordeaux tint
  primaryBorder: '#FBCFE8',      // Soft bordeaux border

  // Secondary accent: Violet / Purple
  secondary: '#7C3AED',          // Vibrant violet
  secondaryDark: '#5B21B6',      // Deep royal violet
  secondaryLight: '#8B5CF6',     // Bright violet
  secondarySubtle: '#F5F3FF',    // Light violet tint
  secondaryBorder: '#DDD6FE',    // Violet border tint

  // Neutral Backgrounds
  background: '#F8FAFC',         // Clean soft canvas
  card: '#FFFFFF',               // Pure white surface
  cardMuted: '#F1F5F9',          // Slightly raised surface

  // Typography
  textPrimary: '#0F172A',        // Slate 900
  textSecondary: '#475569',      // Slate 600
  textMuted: '#94A3B8',          // Slate 400
  textWhite: '#FFFFFF',

  // Status & Accents
  success: '#10B981',            // Emerald green
  successSubtle: '#ECFDF5',
  warning: '#F59E0B',            // Amber
  warningSubtle: '#FFFBEB',
  danger: '#E11D48',             // Rose red
  dangerSubtle: '#FFF1F2',
  border: '#E2E8F0',             // Crisp border line
  borderLight: '#F1F5F9',
};

export const headerTheme = {
  headerStyle: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    elevation: 0,
    shadowColor: '#4A0420',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  headerTintColor: colors.primary,
  headerTitleStyle: {
    fontWeight: '700' as const,
    fontSize: 18,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerShadowVisible: false,
};
