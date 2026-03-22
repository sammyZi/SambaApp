import { MD3LightTheme, configureFonts } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

// Calm neutral color palette
const colors = {
  primary: '#5B7C99',        // Muted blue-gray
  secondary: '#7A8F9E',      // Soft gray-blue
  tertiary: '#9EADB8',       // Light gray-blue
  background: '#F5F7F9',     // Very light gray
  surface: '#FFFFFF',        // White
  surfaceVariant: '#E8ECEF', // Light gray
  error: '#C85A54',          // Muted red
  onPrimary: '#FFFFFF',      // White text on primary
  onSecondary: '#FFFFFF',    // White text on secondary
  onBackground: '#2C3E50',   // Dark gray text
  onSurface: '#2C3E50',      // Dark gray text
  onError: '#FFFFFF',        // White text on error
  outline: '#D1D9E0',        // Light border color
  shadow: '#000000',         // Black shadow
  inverseSurface: '#2C3E50', // Dark surface
  inverseOnSurface: '#FFFFFF', // White text on dark
  inversePrimary: '#A8C5E0', // Light blue
};

// Configure Nunito font family
const fontConfig = {
  displayLarge: {
    fontFamily: 'Nunito-Bold',
    fontSize: 57,
    fontWeight: '700' as const,
    letterSpacing: 0,
    lineHeight: 64,
  },
  displayMedium: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 45,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 52,
  },
  displaySmall: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 36,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 44,
  },
  headlineLarge: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 32,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 40,
  },
  headlineMedium: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 28,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 36,
  },
  headlineSmall: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 24,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 32,
  },
  titleLarge: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 22,
    fontWeight: '600' as const,
    letterSpacing: 0,
    lineHeight: 28,
  },
  titleMedium: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 16,
    fontWeight: '600' as const,
    letterSpacing: 0.15,
    lineHeight: 24,
  },
  titleSmall: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  bodyLarge: {
    fontFamily: 'Nunito-Regular',
    fontSize: 16,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
    lineHeight: 24,
  },
  bodyMedium: {
    fontFamily: 'Nunito-Regular',
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.25,
    lineHeight: 20,
  },
  bodySmall: {
    fontFamily: 'Nunito-Regular',
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0.4,
    lineHeight: 16,
  },
  labelLarge: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 14,
    fontWeight: '600' as const,
    letterSpacing: 0.1,
    lineHeight: 20,
  },
  labelMedium: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    lineHeight: 16,
  },
  labelSmall: {
    fontFamily: 'Nunito-SemiBold',
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
    lineHeight: 16,
  },
};

// Create custom theme
export const theme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
  fonts: configureFonts({ config: fontConfig }),
  roundness: 8, // Moderate rounded corners
};
