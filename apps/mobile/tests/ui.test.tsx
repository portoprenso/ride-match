import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from '../src/ui/Button';

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
