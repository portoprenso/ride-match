import { act, cleanup, render, screen } from '@testing-library/react-native';
import { Dimensions, Platform, StyleSheet } from 'react-native';

import { AppText } from '../src/ui/AppText';
import { MANROPE, typography } from '../src/ui/tokens';

const originalWindow = Dimensions.get('window');
const originalScreen = Dimensions.get('screen');

function setFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindow, fontScale } });
}

afterEach(async () => {
  await cleanup();
  Dimensions.set({ window: originalWindow, screen: originalScreen });
  jest.restoreAllMocks();
});

describe('AppText accessibility typography', () => {
  it.each([1.5, 2])('lets Android measure the full font at %s font scale', async (fontScale) => {
    jest.replaceProperty(Platform, 'OS', 'android');
    setFontScale(fontScale);
    await render(<AppText variant="section">Going together</AppText>);

    const text = screen.getByText('Going together');
    expect(StyleSheet.flatten(text.props.style)).toMatchObject({
      fontFamily: MANROPE.bold,
      fontSize: 24,
    });
    expect(StyleSheet.flatten(text.props.style).lineHeight).toBeUndefined();
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(text.props.maxFontSizeMultiplier).toBeUndefined();
  });

  it('responds to Android font changes and restores design leading at normal size', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    setFontScale(1);
    await render(<AppText variant="section">Going together</AppText>);
    expect(screen.getByText('Going together')).toHaveStyle(typography.section);

    await act(async () => { setFontScale(2); });
    expect(StyleSheet.flatten(screen.getByText('Going together').props.style).lineHeight).toBeUndefined();

    await act(async () => { setFontScale(1); });
    expect(screen.getByText('Going together')).toHaveStyle(typography.section);
  });

  it('keeps iOS design leading at enlarged text', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    setFontScale(2);
    await render(<AppText variant="section">Going together</AppText>);
    expect(screen.getByText('Going together')).toHaveStyle(typography.section);
  });

  it.each([{ allowFontScaling: false }, { maxFontSizeMultiplier: 1 }])(
    'keeps design leading when the caller explicitly disables enlargement: %j',
    async (props) => {
      jest.replaceProperty(Platform, 'OS', 'android');
      setFontScale(2);
      await render(<AppText variant="section" {...props}>Going together</AppText>);
      expect(screen.getByText('Going together')).toHaveStyle(typography.section);
    },
  );

  it('preserves caller layout styles and accessibility props with native leading', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    setFontScale(2);
    await render(
      <AppText variant="heading" accessibilityRole="header" style={{ textAlign: 'center' }}>
        Going together
      </AppText>,
    );
    const text = screen.getByRole('header', { name: 'Going together' });
    expect(text).toHaveStyle({ textAlign: 'center', fontFamily: MANROPE.extraBold });
    expect(StyleSheet.flatten(text.props.style).lineHeight).toBeUndefined();
  });
});
