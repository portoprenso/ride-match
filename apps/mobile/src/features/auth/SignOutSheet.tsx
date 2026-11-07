import { useState, type RefObject } from 'react';
import type { View } from 'react-native';

import { ConfirmAction } from '../../ui/ConfirmAction';
import { Notice } from '../../ui/Notice';
import { SheetHost } from '../../ui/SheetHost';
import { useSessionController } from './AuthSessionProvider';
import { signOutOutcome, type SignOutOutcome } from './signOutOutcome';
import { useMounted } from './useMounted';

type SignOutSheetProps = {
  open: boolean;
  /** "Keep me signed in", the background, Android back or the escape gesture; ignored while signing out. */
  onCancel: () => void;
  /**
   * Signing out finished; the rider is signed out on this device whatever `outcome` says. The
   * caller closes the sheet and shows the outcome.
   */
  onSignedOut: (outcome: SignOutOutcome) => void;
  /** The control that opened the sheet, for screen-reader focus after cancelling. */
  returnFocusRef?: RefObject<View | null>;
  /** Says "this demo" on a synthetic source. */
  demo: boolean;
};

/**
 * The sign-out confirmation (design 48), in a sheet.
 *
 * Confirming calls the session controller's `signOut`: it asks the source to end the session,
 * then clears the credentials, and identity change makes the sync coordinator drop the rider's
 * private reads and subscriptions. It never leaves a group or cancels a request; the sheet says
 * so, because those are separate actions. While it runs the sheet cannot be dismissed, so the
 * outcome is never hidden. An unexpected failure is shown in the sheet and can be retried.
 */
export function SignOutSheet({ open, onCancel, onSignedOut, returnFocusRef, demo }: SignOutSheetProps) {
  const session = useSessionController();
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function confirm() {
    setError(undefined);
    setBusy(true);
    try {
      const result = await session.signOut();
      if (mounted.current) onSignedOut(signOutOutcome(result));
    } catch {
      if (mounted.current) setError('Signing out didn’t finish. Try again.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <SheetHost
      open={open}
      onDismiss={() => {
        setError(undefined);
        onCancel();
      }}
      dismissible={!busy}
      returnFocusRef={returnFocusRef}
    >
      <ConfirmAction
        title={demo ? 'Sign out of this demo?' : 'Sign out?'}
        message="Local private data and session credentials will be cleared. Anonymous browsing remains available."
        confirmLabel="Sign out"
        cancelLabel="Keep me signed in"
        tone="danger"
        busy={busy}
        error={error}
        onConfirm={() => void confirm()}
        onCancel={() => {
          setError(undefined);
          onCancel();
        }}
      >
        <Notice message="Signing out is not the same as leaving a group or cancelling a request. If needed, take those actions first." />
      </ConfirmAction>
    </SheetHost>
  );
}
