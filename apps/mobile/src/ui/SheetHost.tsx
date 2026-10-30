import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from './tokens';

/** Ink at 40% opacity: dims the screen behind a sheet. */
const SCRIM = 'rgba(18, 60, 56, 0.4)';

type SheetHostProps = {
  /** Whether the sheet is shown. */
  open: boolean;
  /**
   * Called when the user asks to close the sheet: a tap on the dimmed background, Android
   * back, or the VoiceOver escape gesture on iOS. The host never closes itself; the flow
   * sets `open` to false, so its state always matches what is on screen.
   */
  onDismiss: () => void;
  /**
   * Set to false while closing would hide an outcome, for example while a confirmed
   * operation is running. Dismiss requests are then ignored. Defaults to true.
   */
  dismissible?: boolean;
  /**
   * The control that opened the sheet. Screen-reader focus returns to it after the sheet
   * closes, instead of jumping to the top of the screen.
   */
  returnFocusRef?: RefObject<View | null>;
  /** The sheet's content, usually a `SheetContent` or `ConfirmAction`. */
  children: ReactNode;
};

function focus(target: RefObject<View | null> | undefined) {
  if (target?.current) AccessibilityInfo.sendAccessibilityEvent(target.current, 'focus');
}

/**
 * Bottom sheet over a dimmed screen, for previews, choices and confirmations.
 *
 * A flow (one screen or route) renders a single host and switches its content, so only one
 * sheet is ever open and moving from one sheet to the next never presents a second modal.
 * Close the sheet before navigating to another route: on iOS a route presented while the
 * sheet is open would appear behind it.
 *
 * It uses React Native's `Modal`, so the sheet is its own window: screen readers stay
 * inside it, and Android back reaches `onDismiss`. The sheet is as tall as its content, up
 * to the top inset plus 24 points, and stays above the keyboard. It fades in and out, which
 * also suits reduced-motion settings. There is no drag handle: it closes through its own
 * actions, the background, Android back or the escape gesture.
 */
export function SheetHost({ open, onDismiss, dismissible = true, returnFocusRef, children }: SheetHostProps) {
  const insets = useSafeAreaInsets();
  const requestDismiss = () => {
    if (dismissible) onDismiss();
  };

  // iOS reports the end of the closing animation through `Modal`'s `onDismiss`; Android has
  // no such callback, so focus is restored as soon as the host closes.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && Platform.OS !== 'ios') focus(returnFocusRef);
    wasOpen.current = open;
  }, [open, returnFocusRef]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={requestDismiss}
      onDismiss={() => focus(returnFocusRef)}
    >
      <View style={styles.fill}>
        <Pressable
          testID="sheet-backdrop"
          onPress={requestDismiss}
          accessible={false}
          importantForAccessibility="no"
          style={styles.backdrop}
        />
        <KeyboardAvoidingView behavior="padding" style={[styles.fill, styles.frame, { paddingTop: insets.top + spacing.xl }]}>
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={requestDismiss}
            style={[styles.sheet, { paddingLeft: insets.left, paddingRight: insets.right }]}
          >
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

type SheetContentProps = {
  children: ReactNode;
  /** Final actions, usually an `ActionFooter`, pinned below the scrolling content. */
  footer?: ReactNode;
};

/**
 * Inside of a `SheetHost`: content that scrolls once the sheet reaches its maximum height,
 * and optional actions that stay visible below it. The bottom inset goes to whichever of
 * the two is last.
 */
export function SheetContent({ children, footer }: SheetContentProps) {
  const insets = useSafeAreaInsets();
  const bottom = spacing.xl + insets.bottom;

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: footer ? 0 : bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer && <View style={[styles.footer, { paddingBottom: bottom }]}>{footer}</View>}
    </>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: SCRIM,
  },
  frame: {
    justifyContent: 'flex-end',
    pointerEvents: 'box-none',
  },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    gap: spacing.lg,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.xl,
  },
  footer: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
});
