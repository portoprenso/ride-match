import { render, screen, userEvent } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';

describe('Button', () => {
  it('calls onPress once per press when enabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeEnabled();
    await userEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses and reports the disabled state when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toBeDisabled();
    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Screen', () => {
  // iPhone-like window insets: status bar and home indicator.
  const metrics = {
    frame: { x: 0, y: 0, width: 402, height: 874 },
    insets: { top: 62, right: 0, bottom: 34, left: 0 },
  };

  async function renderScreenPadding(edges?: Parameters<typeof Screen>[0]['edges']) {
    await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <Screen edges={edges}>
          <Text>Body</Text>
        </Screen>
      </SafeAreaProvider>,
    );
    const container = screen.getByText('Body').parent;
    if (!container) throw new Error('Screen rendered no container');
    const { paddingTop, paddingRight, paddingBottom, paddingLeft } = StyleSheet.flatten(
      container.props.style,
    );
    return { paddingTop, paddingRight, paddingBottom, paddingLeft };
  }

  it('adds the provider insets to the padding on every edge by default', async () => {
    expect(await renderScreenPadding()).toEqual({
      paddingTop: 86,
      paddingRight: 24,
      paddingBottom: 58,
      paddingLeft: 24,
    });
  });

  it('leaves out the inset of an edge the caller omits, such as the top of an iOS sheet', async () => {
    expect(await renderScreenPadding(['right', 'bottom', 'left'])).toEqual({
      paddingTop: 24,
      paddingRight: 24,
      paddingBottom: 58,
      paddingLeft: 24,
    });
  });
});
