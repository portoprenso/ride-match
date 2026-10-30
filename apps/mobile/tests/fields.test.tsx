import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { OtpField } from '../src/ui/OtpField';
import { SegmentedControl } from '../src/ui/SegmentedControl';
import { SearchField, TextField } from '../src/ui/TextField';

afterEach(() => {
  jest.restoreAllMocks();
});

function spyOnAnnouncements() {
  return jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
}

describe('TextField', () => {
  it('is one field named by its label and reports typed text', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Demo phone identity" value="" onChangeText={onChangeText} />);

    expect(screen.queryByText('Demo phone identity')).not.toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Demo phone identity'), '+996 555');
    expect(onChangeText).toHaveBeenCalledWith('+996 555');
  });

  it('reads the error with the field and announces it only when it appears or changes', async () => {
    const announce = spyOnAnnouncements();
    const field = (error?: string) => (
      <TextField label="Details" value="" onChangeText={jest.fn()} hint="Optional" error={error} />
    );
    const { rerender } = await render(field());
    expect(screen.getByLabelText('Details').props.accessibilityHint).toBe('Optional');
    expect(announce).not.toHaveBeenCalled();

    await rerender(field('Enter at most 300 characters.'));
    expect(screen.getByLabelText('Details').props.accessibilityHint).toBe('Enter at most 300 characters.');
    await rerender(field('Enter at most 300 characters.'));
    await rerender(field('Something went wrong.'));
    expect(announce.mock.calls).toEqual([['Enter at most 300 characters.'], ['Something went wrong.']]);
  });

  it('shows how much bounded text remains', async () => {
    await render(<TextField label="Details" value="Late" onChangeText={jest.fn()} maxLength={300} />);

    expect(screen.getByText('4/300')).toBeOnTheScreen();
  });
});

describe('SearchField', () => {
  it('offers Clear only while it has text', async () => {
    const onClear = jest.fn();
    const { rerender } = await render(
      <SearchField label="Destination" value="" onChangeText={jest.fn()} onClear={onClear} />,
    );
    expect(screen.queryByRole('button', { name: 'Clear Destination' })).not.toBeOnTheScreen();

    await rerender(<SearchField label="Destination" value="Asia" onChangeText={jest.fn()} onClear={onClear} />);
    await userEvent.press(screen.getByRole('button', { name: 'Clear Destination' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('OtpField', () => {
  it('is a single field whose digit cells are hidden from screen readers', async () => {
    await render(<OtpField label="Verification code" value="12" onChangeText={jest.fn()} />);

    expect(screen.getAllByLabelText('Verification code')).toHaveLength(1);
    expect(screen.queryByText('1')).not.toBeOnTheScreen();
    expect(screen.getByText('1', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps only the digits of pasted text, up to the code length', async () => {
    const onChangeText = jest.fn();
    await render(<OtpField label="Verification code" value="" onChangeText={onChangeText} />);

    await userEvent.paste(screen.getByLabelText('Verification code'), 'Code: 12 34-56 789');
    expect(onChangeText).toHaveBeenLastCalledWith('123456');
  });

  it('reads and announces an error', async () => {
    const announce = spyOnAnnouncements();
    await render(
      <OtpField label="Verification code" value="000000" onChangeText={jest.fn()} error="That code has expired." />,
    );

    expect(screen.getByLabelText('Verification code').props.accessibilityHint).toBe('That code has expired.');
    expect(announce).toHaveBeenCalledWith('That code has expired.');
  });
});

describe('SegmentedControl', () => {
  const options = [
    { value: 'now', label: 'Now' },
    { value: 'in5', label: 'In 5 min' },
    { value: 'in10', label: 'In 10 min' },
  ] as const;

  it('is a named radio group that reports the checked option and the new choice', async () => {
    const onChange = jest.fn();
    await render(<SegmentedControl label="Departure time" options={options} value="in5" onChange={onChange} />);

    expect(screen.getByLabelText('Departure time').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByRole('radio', { name: 'In 5 min' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Now' })).not.toBeChecked();
    await userEvent.press(screen.getByRole('radio', { name: 'In 10 min' }));
    expect(onChange).toHaveBeenCalledWith('in10');
  });

  it('ignores presses while disabled', async () => {
    const onChange = jest.fn();
    await render(
      <SegmentedControl label="Departure time" options={options} value={null} onChange={onChange} disabled />,
    );

    await userEvent.press(screen.getByRole('radio', { name: 'Now' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
