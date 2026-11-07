import { AUTH_POLICY } from '@ride-match/contracts';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { toDataError } from '../../data/errors';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Notice } from '../../ui/Notice';
import { OtpField } from '../../ui/OtpField';
import { spacing } from '../../ui/tokens';
import { useSessionController } from './AuthSessionProvider';
import { AuthScreenLayout } from './AuthScreenLayout';
import { describeIntent } from './pendingIntent';
import { usePendingIntent } from './PendingIntentProvider';
import { useSignInFlow } from './SignInFlow';
import { requestCodeProblem, verifyCodeProblem, type SignInProblem } from './signInMessages';
import { useMounted } from './useMounted';

/**
 * A wait the source asked for, counted down on the device once a second. Returns the whole
 * seconds left (0 when none) and the function that starts a wait of `seconds`.
 */
function useCooldown(): [number, (seconds: number) => void] {
  const [clock, setClock] = useState<{ until: number; now: number } | null>(null);
  useEffect(() => {
    if (clock === null || clock.now >= clock.until) return undefined;
    const timer = setTimeout(() => setClock((current) => current && { ...current, now: Date.now() }), 1000);
    return () => clearTimeout(timer);
  }, [clock]);
  const start = useCallback((seconds: number) => {
    const now = Date.now();
    setClock({ until: now + seconds * 1000, now });
  }, []);
  return [clock === null ? 0 : Math.max(0, Math.ceil((clock.until - clock.now) / 1000)), start];
}

/**
 * The code step of sign-in (designs 08 and 47). It verifies the code through the session
 * controller, which signs the rider in; the sign-in flow then closes itself.
 *
 * - A wrong code shows under the field and can be corrected.
 * - An expired, used or replaced challenge, or too many wrong codes, switches to the fresh-code
 *   state (47): the field is disabled and the main action asks for a new challenge.
 * - "Get a new demo challenge" requests a new code for the same number, which replaces the
 *   current one. The source decides when that is allowed: a refusal with `retryAfterSeconds`
 *   disables it for that long, counted on the device. The challenge's own timestamps are not
 *   counted against the device clock, because the source's clock can differ (the demo controls
 *   move it), as for session expiry.
 * - Opened without a challenge (a direct link), it only offers the phone step.
 *
 * On a synthetic source it shows the demo code and says that no text message is sent.
 *
 * @param onChangeNumber - Returns to the phone step.
 */
export function OtpScreen({ onChangeNumber }: { onChangeNumber: () => void }) {
  const auth = useDataSource().auth;
  const session = useSessionController();
  const demo = useDemoSignIn();
  const flow = useSignInFlow();
  const pending = usePendingIntent();
  const mounted = useMounted();
  const [code, setCode] = useState('');
  const [freshCode, setFreshCode] = useState(false);
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState<string | undefined>(undefined);
  const [cooldown, startCooldown] = useCooldown();
  useAnnouncement(problem?.notice);
  useAnnouncement(requested);

  const intentLine = describeIntent(pending.status === 'none' ? null : pending.intent);
  const challenge = flow.challenge;
  const phoneNumber = flow.phoneNumber;
  const close = <Button label="Close and keep browsing" variant="ghost" onPress={flow.leave} />;

  if (challenge === null || phoneNumber === null) {
    return (
      <AuthScreenLayout
        title={demo ? 'Demo verification' : 'Verification'}
        heading="Start with your phone number."
        footer={
          <ActionFooter>
            <Button label="Enter phone number" onPress={onChangeNumber} />
            {close}
          </ActionFooter>
        }
      >
        <AppText color="muted">A code is requested from the phone step first.</AppText>
      </AuthScreenLayout>
    );
  }

  async function verify() {
    if (challenge === null || code.length !== AUTH_POLICY.codeLength) return;
    setProblem(null);
    setRequested(undefined);
    setVerifying(true);
    try {
      // Success signs the rider in; `SignInFlow` then closes the flow.
      await session.signIn({ challengeId: challenge.id, code });
    } catch (error) {
      if (!mounted.current) return;
      const next = verifyCodeProblem(toDataError(error));
      if (next.freshCode) {
        setFreshCode(true);
        setCode('');
      } else {
        setProblem(next);
      }
    } finally {
      if (mounted.current) setVerifying(false);
    }
  }

  async function requestNewCode() {
    if (phoneNumber === null) return;
    setProblem(null);
    setRequested(undefined);
    setRequesting(true);
    try {
      const next = await auth.requestOtp({ phoneNumber });
      if (!mounted.current) return;
      flow.setChallenge(phoneNumber, next);
      setFreshCode(false);
      setCode('');
      setRequested(demo ? 'A new demo challenge is ready.' : 'A new code was sent.');
    } catch (error) {
      if (!mounted.current) return;
      const next = requestCodeProblem(toDataError(error), demo);
      setProblem({ notice: next.notice ?? next.field });
      if (next.retryAfterSeconds !== undefined) startCooldown(next.retryAfterSeconds);
    } finally {
      if (mounted.current) setRequesting(false);
    }
  }

  const resendLabel = `${demo ? 'Get a new demo challenge' : 'Send a new code'}${cooldown > 0 ? ` (${cooldown} s)` : ''}`;
  const resend = (
    <Button
      label={resendLabel}
      variant={freshCode ? 'primary' : 'secondary'}
      busy={requesting}
      disabled={cooldown > 0 || verifying}
      onPress={() => void requestNewCode()}
    />
  );
  const codeLabel = demo ? 'Demo code' : 'Verification code';

  return (
    <AuthScreenLayout
      title={demo ? 'Demo verification' : 'Verification'}
      badge={
        freshCode
          ? { label: 'Code invalid or expired', tone: 'danger' }
          : demo
            ? { label: 'Simulated sign-in' }
            : undefined
      }
      heading={freshCode ? 'Let’s get a fresh code.' : demo ? 'Enter the demo code.' : 'Enter the code.'}
      footer={
        <ActionFooter>
          {freshCode ? (
            resend
          ) : (
            <Button
              label={demo ? 'Verify demo code' : 'Verify code'}
              busy={verifying}
              disabled={code.length !== AUTH_POLICY.codeLength || requesting}
              onPress={() => void verify()}
            />
          )}
          {close}
        </ActionFooter>
      }
    >
      {freshCode ? (
        <AppText color="muted">
          The code wasn’t accepted, and this challenge can’t be used again. Request a new one.
        </AppText>
      ) : (
        <AppText color="muted">
          {demo ? `Use the demo code ${demo.code}.` : 'Enter the code we sent to your phone.'}
        </AppText>
      )}
      <OtpField
        label={codeLabel}
        value={code}
        onChangeText={(next) => {
          setCode(next);
          if (problem?.field) setProblem(null);
        }}
        length={AUTH_POLICY.codeLength}
        error={problem?.field}
        disabled={freshCode || verifying}
        autoFocus
      />
      {demo && <Notice message="No text message is sent. This is a synthetic test identity." />}
      {intentLine && <AppText color="muted">{intentLine}</AppText>}
      {problem?.notice && <Notice tone="danger" message={problem.notice} />}
      {requested && <Notice message={requested} />}
      <View style={styles.secondary}>
        {!freshCode && resend}
        <Button label="Change number" variant="ghost" onPress={onChangeNumber} />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  secondary: {
    gap: spacing.sm,
  },
});
