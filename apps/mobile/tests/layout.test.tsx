import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { createRef, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, Text, type View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from '../src/ui/Button';
import { ConfirmAction } from '../src/ui/ConfirmAction';
import { Screen } from '../src/ui/Screen';
import { SheetContent, SheetHost } from '../src/ui/SheetHost';

// iPhone-like window insets: status bar and home indicator.
const metrics = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, right: 0, bottom: 34, left: 0 },
};

function withInsets(children: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

afterEach(() => {
  jest.restoreAllMocks();
});

type Element = ReturnType<typeof screen.getByText>;

/** The closest scroll view containing `element`, or null when it does not scroll. */
function scrollViewAround(element: Element) {
  let current: Element | null = element.parent;
  while (current && current.type !== 'RCTScrollView') current = current.parent;
  return current;
}

describe('Screen with a footer', () => {
  it('keeps the actions outside the scrolling content and gives them the bottom inset', async () => {
    await render(
      withInsets(
        <Screen scroll footer={<Button label="Continue" onPress={jest.fn()} />}>
          <Text>Body</Text>
        </Screen>,
      ),
    );

    const footer = screen.getByRole('button', { name: 'Continue' }).parent;
    if (!footer) throw new Error('Footer rendered no container');
    expect(StyleSheet.flatten(footer.props.style).paddingBottom).toBe(58);
    expect(scrollViewAround(screen.getByRole('button', { name: 'Continue' }))).toBeNull();
    const scroll = scrollViewAround(screen.getByText('Body'));
    expect(StyleSheet.flatten(scroll?.props.contentContainerStyle)).toMatchObject({ paddingTop: 86, paddingBottom: 0 });
  });
});

describe('SheetHost', () => {
  function Sheet(props: Partial<Parameters<typeof SheetHost>[0]>) {
    return withInsets(
      <SheetHost open onDismiss={jest.fn()} {...props}>
        <SheetContent>
          <Text>Ride preview</Text>
        </SheetContent>
      </SheetHost>,
    );
  }

  it('shows its content only while open', async () => {
    const { rerender } = await render(<Sheet open={false} />);
    expect(screen.queryByText('Ride preview')).not.toBeOnTheScreen();

    await rerender(<Sheet open />);
    expect(screen.getByText('Ride preview')).toBeOnTheScreen();
  });

  it('asks to close on a background tap, Android back, and the VoiceOver escape gesture', async () => {
    const onDismiss = jest.fn();
    await render(<Sheet onDismiss={onDismiss} />);

    await userEvent.press(screen.getByTestId('sheet-backdrop'));
    await fireEvent(screen.getByText('Ride preview'), 'requestClose');
    await fireEvent(screen.getByText('Ride preview'), 'accessibilityEscape');
    expect(onDismiss).toHaveBeenCalledTimes(3);
  });

  it('ignores close requests while not dismissible', async () => {
    const onDismiss = jest.fn();
    await render(<Sheet onDismiss={onDismiss} dismissible={false} />);

    await userEvent.press(screen.getByTestId('sheet-backdrop'));
    await fireEvent(screen.getByText('Ride preview'), 'requestClose');
    await fireEvent(screen.getByText('Ride preview'), 'accessibilityEscape');
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('returns screen-reader focus to the opener once iOS reports the sheet dismissed', async () => {
    const sendEvent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const opener = createRef<View>();
    await render(
      <>
        <Button ref={opener} label="Cancel request" onPress={jest.fn()} />
        <Sheet returnFocusRef={opener} />
      </>,
    );

    // The native modal calls `onDismiss` after its closing animation.
    await fireEvent(screen.getByText('Ride preview'), 'dismiss');
    expect(sendEvent).toHaveBeenCalledWith(opener.current, 'focus');
  });

  it('returns screen-reader focus to the opener when it closes on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const sendEvent = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
    const opener = createRef<View>();
    const tree = (open: boolean) => (
      <>
        <Button ref={opener} label="Cancel request" onPress={jest.fn()} />
        <Sheet open={open} returnFocusRef={opener} />
      </>
    );
    const { rerender } = await render(tree(true));
    expect(sendEvent).not.toHaveBeenCalled();

    await rerender(tree(false));
    expect(sendEvent).toHaveBeenCalledWith(opener.current, 'focus');
  });
});

describe('ConfirmAction', () => {
  function Confirm(props: Partial<Parameters<typeof ConfirmAction>[0]>) {
    return withInsets(
      <SheetHost open onDismiss={jest.fn()}>
        <ConfirmAction
          title="Stop looking for a ride?"
          message="Your request will be removed from discovery."
          confirmLabel="Cancel my request"
          cancelLabel="Keep searching"
          tone="danger"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
          {...props}
        />
      </SheetHost>,
    );
  }

  it('leads with the question as a heading and reports the chosen action', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<Confirm onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole('header', { name: 'Stop looking for a ride?' })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole('button', { name: 'Cancel my request' }));
    await userEvent.press(screen.getByRole('button', { name: 'Keep searching' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('blocks both actions while the operation runs', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(<Confirm onConfirm={onConfirm} onCancel={onCancel} busy />);

    const confirm = screen.getByRole('button', { name: 'Cancel my request' });
    expect(confirm).toBeBusy();
    await userEvent.press(confirm);
    await userEvent.press(screen.getByRole('button', { name: 'Keep searching' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows and announces a failure while keeping both actions available', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await render(<Confirm error="We couldn't cancel your request. Try again." />);

    expect(screen.getByText("We couldn't cancel your request. Try again.")).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith("We couldn't cancel your request. Try again.");
    expect(screen.getByRole('button', { name: 'Cancel my request' })).toBeEnabled();
  });
});
