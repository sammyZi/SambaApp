import { MD3LightTheme, configureFonts } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

// Professional light color palette
const colors = {
  primary: '#3B6B9C',          // Refined blue
  secondary: '#5A8AB5',        // Medium blue
  tertiary: '#7FA8C9',         // Soft blue
  background: '#F7F8FA',       // Clean off-white
  surface: '#FFFFFF',          // Pure white
  surfaceVariant: '#EEF1F5',   // Subtle gray
  error: '#C0392B',            // Clean red
  errorContainer: '#FDECEA',   // Light red bg
  onPrimary: '#FFFFFF',
  onSecondary: '#FFFFFF',
  onBackground: '#1E2A36',     // Dark text
  onSurface: '#1E2A36',        // Dark text
  onSurfaceVariant: '#6B7A8A', // Muted secondary text
  onError: '#FFFFFF',
  outline: '#D5DBE1',          // Subtle border
  outlineVariant: '#E3E8ED',   // Lighter border
  shadow: '#000000',
  inverseSurface: '#1E2A36',
  inverseOnSurface: '#F7F8FA',
  inversePrimary: '#A3C4E0',
};

// Configure Poppins font family — smaller, cleaner sizes
const fontConfig = {
  displayLarge: {
    fontFamily: 'Poppins-Bold',
    fontSize: 40,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    lineHeight: 48,
  },
  displayMedium: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.25,
    lineHeight: 40,
  },
  displaySmall: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 26,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 34,
  },
  headlineLarge: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 24,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 32,
  },
  headlineMedium: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 28,
  },
  headlineSmall: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 26,
  },
  titleLarge: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 17,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 24,
  },
  titleMedium: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  titleSmall: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  bodyLarge: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.25,
    lineHeight: 20,
  },
  bodyMedium: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    fontWeight: '400' as const,
    letterSpacing: 0.2,
    lineHeight: 18,
  },
  bodySmall: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    fontWeight: '400' as const,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  labelLarge: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    fontWeight: '500' as const,
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  labelMedium: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
    lineHeight: 16,
  },
  labelSmall: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    fontWeight: '500' as const,
    letterSpacing: 0.3,
    lineHeight: 14,
  },
};

// Create custom light theme
export const theme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
  fonts: configureFonts({ config: fontConfig }),
  roundness: 10,
};
