import { useState } from 'react';

import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { toDataError } from '../../data/errors';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { TextField } from '../../ui/TextField';
import { AuthScreenLayout } from './AuthScreenLayout';
import { describeIntent } from './pendingIntent';
import { usePendingIntent } from './PendingIntentProvider';
import { useSignInFlow } from './SignInFlow';
import { normalizePhoneNumber, phoneInputProblem, requestCodeProblem, type SignInProblem } from './signInMessages';
import { useMounted } from './useMounted';

/**
 * The phone step of sign-in (designs 07): asks the data source for a one-time code and moves on
 * to the code step.
 *
 * On a synthetic source the field starts with a demo number, says which numbers work, and says
 * that no SMS is sent and no real number is needed; it never offers the device's own number for
 * autofill. The number is checked here first, then by the source, whose refusals (format, a
 * number it does not accept, a resend too soon, rate limits, no connection) show as the app's own
 * copy. Nothing is kept beyond this flow's memory.
 *
 * @param onCodeRequested - Opens the code step once a challenge exists.
 */
export function PhoneScreen({ onCodeRequested }: { onCodeRequested: () => void }) {
  const auth = useDataSource().auth;
  const demo = useDemoSignIn();
  const flow = useSignInFlow();
  const pending = usePendingIntent();
  const mounted = useMounted();
  const [text, setText] = useState(() => flow.phoneNumber ?? demo?.phoneNumber ?? '');
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [busy, setBusy] = useState(false);
  useAnnouncement(problem?.notice);

  const intentLine = describeIntent(pending.status === 'none' ? null : pending.intent);

  async function requestCode() {
    const inputProblem = phoneInputProblem(text);
    const phoneNumber = normalizePhoneNumber(text);
    if (inputProblem !== null || phoneNumber === null) {
      setProblem({ field: inputProblem ?? undefined });
      return;
    }
    setProblem(null);
    setBusy(true);
    try {
      const challenge = await auth.requestOtp({ phoneNumber });
      if (!mounted.current) return;
      flow.setChallenge(phoneNumber, challenge);
      onCodeRequested();
    } catch (error) {
      if (mounted.current) setProblem(requestCodeProblem(toDataError(error), demo));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Sign in to continue"
      badge={demo ? { label: 'Simulated sign-in' } : undefined}
      heading="Save your spot."
      footer={
        <ActionFooter>
          <Button
            label={demo ? 'Continue with demo identity' : 'Continue'}
            busy={busy}
            onPress={() => void requestCode()}
          />
          <Button label="Close and keep browsing" variant="ghost" onPress={flow.leave} />
        </ActionFooter>
      }
    >
      <AppText color="muted">Sign in to create a request or join a group. Browsing stays open to everyone.</AppText>
      <TextField
        label={demo ? 'Demo phone identity' : 'Phone number'}
        value={text}
        onChangeText={(next) => {
          setText(next);
          if (problem?.field) setProblem(null);
        }}
        hint={demo ? `${demo.numbersHint} No SMS is sent.` : 'In international format, starting with +.'}
        error={problem?.field}
        keyboardType="phone-pad"
        // A demo must never collect the device's real number through autofill.
        autoComplete={demo ? 'off' : 'tel'}
        textContentType={demo ? 'none' : 'telephoneNumber'}
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={() => void requestCode()}
        disabled={busy}
      />
      {demo && (
        <Notice message="Use a synthetic test identity only. This demo sends no SMS and needs no real phone number." />
      )}
      {intentLine && <AppText color="muted">{intentLine}</AppText>}
      {problem?.notice && <Notice tone="danger" message={problem.notice} />}
    </AuthScreenLayout>
  );
}
