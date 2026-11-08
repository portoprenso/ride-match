import type {
  CreateRideRequestInput,
  DepartureOffsetMinutes,
  OwnRideRequestDto,
  PlaceDto,
} from '@ride-match/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAnalytics } from '../../analytics/AnalyticsProvider';
import { useDataSource } from '../../data/DataSourceProvider';
import { useDemoSignIn } from '../../data/DemoSignInProvider';
import { withDataErrors, type DataError } from '../../data/errors';
import { createOperationId } from '../../data/operationId';
import { ownRequestQuery } from '../../data/queries';
import { queryKeys, type SignedInViewer } from '../../data/queryKeys';
import { ActionFooter } from '../../ui/ActionFooter';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { SheetContent, SheetHost } from '../../ui/SheetHost';
import { spacing } from '../../ui/tokens';
import { useViewer } from '../auth/AuthSessionProvider';
import { PickupPlaceFlow } from '../location/PickupPlaceSheet';
import { DEPARTURE_OPTIONS, describeCreateError, describeDeparture, type DraftOrigin } from './rideDraft';

/** `pickup` is the named pickup search inside the same sheet, back to `departure` when done. */
export type CreateStep = 'departure' | 'pickup' | 'review';

type CreateRequestSheetProps = {
  /** The open step, or `null` while closed. */
  step: CreateStep | null;
  destination: PlaceDto | null;
  departure: DepartureOffsetMinutes;
  onChangeDeparture: (minutes: DepartureOffsetMinutes) => void;
  /** The origin the request would use now, or `null` when a pickup must be chosen first. */
  origin: DraftOrigin | null;
  /** From the departure step: the screen asks for sign-in if needed, then opens the review. */
  onContinue: () => void;
  /** Back to the departure step: from the review, or from the pickup search. */
  onEdit: () => void;
  onClose: () => void;
  /** Starts choosing a pickup on the map; absent in builds without a map. */
  onChoosePickupOnMap?: () => void;
  onChoosePickupNamed: () => void;
  onPublished: (request: OwnRideRequestDto) => void;
};

/**
 * Creating a ride request (designs 06 and 09), one sheet with two steps over the map:
 *
 * - **Departure (06):** the destination, the pickup (a confirmed point, or a fresh, accurate
 *   device fix), and Now / In 5 min / In 10 min. Without a usable pickup it asks for one first.
 *   "Continue to sign in" (anonymous) or "Review my request" moves on; the draft stays with the
 *   screen meanwhile, so sign-in never loses it.
 * - **Review (09):** what will be published and what others see. "Publish my request" creates it
 *   once: the input and operation ID are fixed at the first press, a press while it runs does
 *   nothing, and a retry after an unknown outcome resends the same ID, so the source cannot
 *   publish twice. A rider who already has a live request sees it instead of a second create.
 *
 * Nothing is published before "Publish my request", and the sheet cannot be dismissed while it
 * runs. Analytics: `ride_request_create_clicked` once per operation, `ride_request_created` on
 * the source's success, with the departure and whether the pickup came from the device.
 */
export function CreateRequestSheet(props: CreateRequestSheetProps) {
  const [busy, setBusy] = useState(false);
  return (
    <SheetHost open={props.step !== null && props.destination !== null} onDismiss={props.onClose} dismissible={!busy}>
      {props.destination === null ? null : props.step === 'departure' ? (
        <DepartureStep {...props} destination={props.destination} />
      ) : props.step === 'pickup' ? (
        <PickupPlaceFlow onClose={props.onEdit} />
      ) : props.step === 'review' ? (
        <ReviewStep {...props} destination={props.destination} onBusyChange={setBusy} />
      ) : null}
    </SheetHost>
  );
}

type StepProps = CreateRequestSheetProps & { destination: PlaceDto };

function DepartureStep({
  destination,
  departure,
  onChangeDeparture,
  origin,
  onContinue,
  onClose,
  onChoosePickupOnMap,
  onChoosePickupNamed,
}: StepProps) {
  const signedIn = useViewer().kind === 'user';
  return (
    <SheetContent
      footer={
        <ActionFooter>
          {origin === null ? null : (
            <Button label={signedIn ? 'Review my request' : 'Continue to sign in'} onPress={onContinue} />
          )}
          <Button label="Keep browsing" variant="ghost" onPress={onClose} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header">
          When are you leaving?
        </AppText>
        <AppText color="muted">One person, one seat. Find people leaving around the same time.</AppText>
      </View>
      <Summary label="Destination" value={destination.label} />
      {origin === null ? (
        <View style={styles.block}>
          <Notice
            tone="warning"
            message="Choose a pickup point first. Your location isn’t precise or recent enough to use."
          />
          {onChoosePickupOnMap ? (
            <Button label="Choose pickup area" variant="secondary" onPress={onChoosePickupOnMap} />
          ) : null}
          <Button label="Choose a named place" variant="secondary" onPress={onChoosePickupNamed} />
        </View>
      ) : (
        <Summary label="Pickup area · Check the exact point before posting" value={origin.description} />
      )}
      <SegmentedControl
        label="Departure"
        options={DEPARTURE_OPTIONS}
        value={`${departure}`}
        onChange={(value) => onChangeDeparture(Number(value) as DepartureOffsetMinutes)}
      />
      <AppText variant="small" color="muted">
        Your request stays discoverable for 15 minutes. Your published pickup will not move with your phone.
      </AppText>
    </SheetContent>
  );
}

function ReviewStep({
  destination,
  departure,
  origin,
  onEdit,
  onClose,
  onPublished,
  onBusyChange,
}: StepProps & { onBusyChange: (busy: boolean) => void }) {
  const dataSource = useDataSource();
  const queryClient = useQueryClient();
  const analytics = useAnalytics();
  const viewer = useViewer();
  const demo = useDemoSignIn() !== null;
  const rider = viewer.kind === 'user' ? (viewer as SignedInViewer) : null;
  const own = useQuery({
    ...ownRequestQuery(dataSource, rider ?? { kind: 'user', userId: '' }),
    enabled: rider !== null,
  });
  // Fixed at the first press: a retry resends exactly this, under the same operation ID.
  const [sent, setSent] = useState<CreateRideRequestInput | null>(null);
  const create = useMutation<OwnRideRequestDto, DataError, CreateRideRequestInput>({
    mutationFn: (input) => withDataErrors(dataSource.rides.create(input)),
    onMutate: () => onBusyChange(true),
    onSettled: () => onBusyChange(false),
    onError: (error) => {
      // Show the live request the source refers to, read fresh.
      if (error.code === 'ACTIVE_REQUEST_EXISTS' && rider !== null) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.ownRequest(rider) });
      }
    },
    onSuccess: (request, input) => finish(request, input),
  });
  /** The source created the request: keep its canonical answer, record it once, close. */
  function finish(request: OwnRideRequestDto, input: CreateRideRequestInput) {
    if (rider !== null) {
      queryClient.setQueryData(queryKeys.ownRequest(rider), request);
      void queryClient.invalidateQueries({ queryKey: queryKeys.currentUser(rider) });
    }
    analytics.track('ride_request_created', {
      departureOffsetMinutes: input.departureOffsetMinutes,
      pickup: input.origin.source,
    });
    onPublished(request);
  }
  // After an unknown outcome (screen 30): what reading the current request found.
  const [checked, setChecked] = useState<'not-yet' | 'checking' | 'none' | 'other'>('not-yet');
  const checkCurrent = async () => {
    setChecked('checking');
    const found = (await own.refetch()).data ?? null;
    const isLiveRequest = found !== null && (found.status === 'active' || found.status === 'grouped');
    if (isLiveRequest && sent !== null && found.destination.id === sent.destinationPlaceId) {
      finish(found, sent);
      return;
    }
    setChecked(isLiveRequest ? 'other' : 'none');
  };

  const live =
    own.data !== undefined && own.data !== null && (own.data.status === 'active' || own.data.status === 'grouped');
  const failure = create.error === null ? null : describeCreateError(create.error);
  if (failure?.action === 'retry' && checked !== 'other') {
    return (
      <UnknownOutcome
        checked={checked}
        busy={create.isPending}
        onCheck={() => void checkCurrent()}
        onRetry={() => {
          if (sent === null || create.isPending) return;
          setChecked('not-yet');
          create.mutate(sent);
        }}
      />
    );
  }
  if (live || failure?.action === 'existing') {
    return <ExistingRequest request={live ? own.data! : null} onClose={onClose} />;
  }

  const publish = () => {
    if (create.isPending) return;
    if (sent !== null && failure?.action === 'retry') {
      create.mutate(sent);
      return;
    }
    if (origin === null) return;
    const input: CreateRideRequestInput = {
      operationId: createOperationId(),
      origin: origin.input,
      destinationPlaceId: destination.id,
      departureOffsetMinutes: departure,
    };
    setSent(input);
    analytics.track('ride_request_create_clicked', {
      departureOffsetMinutes: departure,
      pickup: origin.input.source,
    });
    create.mutate(input);
  };

  return (
    <SheetContent
      footer={
        <ActionFooter>
          {failure !== null ? (
            <AppText color="danger" accessibilityLiveRegion="assertive" accessibilityRole="alert">
              {failure.message}
            </AppText>
          ) : null}
          {failure?.action === 'edit' || failure?.action === 'sign-in' ? null : (
            <Button
              label={failure?.action === 'retry' ? 'Try publishing again' : 'Publish my request'}
              busy={create.isPending}
              disabled={origin === null && sent === null}
              onPress={publish}
            />
          )}
          <Button label="Edit plan" variant="ghost" disabled={create.isPending} onPress={onEdit} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <Badge label={demo ? 'Signed in · demo' : 'Signed in'} />
        <AppText variant="section" accessibilityRole="header">
          Ready to find company?
        </AppText>
        <AppText color="muted">Review your plan before it goes on the map.</AppText>
      </View>
      <Summary label="Destination" value={destination.label} />
      {origin === null ? (
        <Notice tone="warning" message="Choose a pickup point first: edit the plan to pick one." />
      ) : (
        <Summary label="Pickup · Exact point stays private" value={origin.description} />
      )}
      <Summary label="Search window: 15 minutes" value={describeDeparture(departure)} />
      <Notice message="Others see your approximate pickup area. This creates a ride intention, not a taxi booking." />
    </SheetContent>
  );
}

/**
 * The create's answer was lost (screen 30): the request may exist. Checking reads the rider's
 * current request; retrying resends the same input and operation ID, so the source returns the
 * original request rather than creating a second one.
 */
function UnknownOutcome({
  checked,
  busy,
  onCheck,
  onRetry,
}: {
  checked: 'not-yet' | 'checking' | 'none';
  busy: boolean;
  onCheck: () => void;
  onRetry: () => void;
}) {
  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Check current request" busy={checked === 'checking'} disabled={busy} onPress={onCheck} />
          <Button label="Retry this request" variant="secondary" busy={busy} onPress={onRetry} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
          We’re checking what happened.
        </AppText>
        <AppText color="muted">The response was interrupted. Your request may already have been created.</AppText>
      </View>
      {checked === 'none' ? (
        <Notice message="No live request was found, so it wasn’t created. You can retry it now." />
      ) : (
        <Notice message="Check your current request before trying again. Retrying will not create a duplicate request." />
      )}
    </SheetContent>
  );
}

/** The rider already has a live request: say so, and what it is, instead of creating another. */
function ExistingRequest({ request, onClose }: { request: OwnRideRequestDto | null; onClose: () => void }) {
  return (
    <SheetContent
      footer={
        <ActionFooter>
          <Button label="Keep browsing" onPress={onClose} />
        </ActionFooter>
      }
    >
      <View style={styles.heading}>
        <AppText variant="section" accessibilityRole="header" accessibilityLiveRegion="polite">
          You already have a live request.
        </AppText>
        <AppText color="muted">
          {request === null
            ? 'Only one request can be live at a time. Nothing new was published.'
            : `It’s heading to ${request.destination.label}, ${request.status === 'grouped' ? 'with a group' : 'still searching'}. Only one request can be live at a time, so nothing new was published.`}
        </AppText>
      </View>
    </SheetContent>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summary}>
      <AppText variant="label">{value}</AppText>
      <AppText variant="small" color="muted">
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  block: {
    gap: spacing.sm,
  },
  summary: {
    gap: spacing.xs,
  },
});
