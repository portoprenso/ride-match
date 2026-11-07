import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { AuthScreenLayout } from './AuthScreenLayout';
import { describeIntent } from './pendingIntent';
import { usePendingIntent } from './PendingIntentProvider';
import { useSignInFlow } from './SignInFlow';

/**
 * Shown when the session could not be renewed (design 31). By then the session controller has
 * cleared the credentials and the sync coordinator has removed the rider's private reads and
 * subscriptions; drafts on the screens beneath stay. "Sign in again" continues to the phone step,
 * keeping any pending intent; "Browse anonymously" closes the flow and drops it.
 *
 * @param onSignIn - Opens the phone step.
 */
export function SessionEndedScreen({ onSignIn }: { onSignIn: () => void }) {
  const flow = useSignInFlow();
  const pending = usePendingIntent();
  const intentLine = describeIntent(pending.status === 'none' ? null : pending.intent);

  return (
    <AuthScreenLayout
      title="Sign-in needed"
      heading="Your session ended."
      footer={
        <ActionFooter>
          <Button label="Sign in again" onPress={onSignIn} />
          <Button label="Browse anonymously" variant="ghost" onPress={flow.leave} />
        </ActionFooter>
      }
    >
      <AppText color="muted">Sign in again to continue. Anything you were writing or planning stays on its screen.</AppText>
      {intentLine && <AppText color="muted">{intentLine}</AppText>}
      <Notice message="Private group and chat details are hidden until you sign in. After sign-in, everything is checked again before you confirm." />
    </AuthScreenLayout>
  );
}
