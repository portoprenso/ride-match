import { useQueryClient } from '@tanstack/react-query';
import { useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ConnectionState } from '../../data/AppDataSource';
import type { DemoScenario, DevControls } from '../../data/DevControls';
import { AppText } from '../../ui/AppText';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { useAnnouncement } from '../../ui/FieldMessage';
import { Icon } from '../../ui/Icon';
import { Notice } from '../../ui/Notice';
import { Screen } from '../../ui/Screen';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { colors, radii, spacing } from '../../ui/tokens';

const CONNECTION_OPTIONS: readonly { value: ConnectionState; label: string }[] = [
  { value: 'connected', label: 'Online' },
  { value: 'disconnected', label: 'Offline' },
];

const MINUTE_MS = 60_000;

/** Steps that cover scenario A's timed events (+8 s, +20 s), a ride's 15 minutes and a group's 30. */
const TIME_STEPS = [
  { ms: 30_000, label: '+30 s', spoken: 'Move time 30 seconds ahead' },
  { ms: 5 * MINUTE_MS, label: '+5 min', spoken: 'Move time 5 minutes ahead' },
  { ms: 15 * MINUTE_MS, label: '+15 min', spoken: 'Move time 15 minutes ahead' },
] as const;

/** Such as "1 h 5 min 30 s"; whole seconds. */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const parts = [
    [Math.floor(seconds / 3600), 'h'],
    [Math.floor((seconds % 3600) / 60), 'min'],
    [seconds % 60, 's'],
  ] as const;
  return parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value} ${unit}`)
    .join(' ');
}

type DemoScenariosScreenProps = {
  /** From `useDevControls()`; the route shows an unavailable page when there are none. */
  controls: DevControls;
  onBack: () => void;
};

/**
 * The demo controls (screen 50), for development and preview builds on the mock data source:
 * which scenario runs, starting it or another over, the connection, the source's clock, and a
 * failure for the next request.
 *
 * Starting a scenario over also clears the app's cached reads, so nothing from the old world
 * stays on screen; the visible ones load again from the new one. Every action is announced.
 */
export function DemoScenariosScreen({ controls, onBack }: DemoScenariosScreenProps) {
  const snapshot = useSyncExternalStore(controls.subscribe, controls.getSnapshot);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | undefined>(undefined);
  useAnnouncement(message);

  const running = controls.scenarios.find((scenario) => scenario.key === snapshot.scenario);
  const runningLabel = running?.label ?? snapshot.scenario;
  const time = snapshot.timeAheadMs === 0 ? 'real time' : `${formatDuration(snapshot.timeAheadMs)} ahead`;

  const startOver = (start: () => void, done: string) => {
    void queryClient.cancelQueries();
    start();
    void queryClient.resetQueries();
    setMessage(done);
  };

  return (
    <Screen scroll>
      <View style={styles.content}>
        <ScreenHeader title="Demo scenarios" onBack={onBack} />
        <View style={styles.intro}>
          <Badge label="Development / preview only" tone="warning" />
          <AppText variant="heading" accessibilityRole="header">
            Explore the mock MVP.
          </AppText>
          <AppText color="muted">Scenario changes reset synthetic data and active timers.</AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="subheading" accessibilityRole="header">
            Controls
          </AppText>
          <AppText color="muted">
            {runningLabel} · {time}
          </AppText>
          <Button
            label="Restart this scenario"
            variant="secondary"
            onPress={() => startOver(() => controls.reset(), `${runningLabel} started over.`)}
          />
          <SegmentedControl
            label="Connection"
            options={CONNECTION_OPTIONS}
            value={snapshot.connection}
            onChange={(connection) => {
              controls.setConnection(connection);
              setMessage(connection === 'connected' ? 'Back online.' : 'Offline: requests fail and live updates stop.');
            }}
          />
          <View style={styles.steps}>
            {TIME_STEPS.map((step) => (
              <View key={step.ms} style={styles.step}>
                <Button
                  label={step.label}
                  accessibilityLabel={step.spoken}
                  variant="secondary"
                  onPress={() => {
                    controls.advanceTime(step.ms);
                    setMessage(`Time is ${formatDuration(controls.getSnapshot().timeAheadMs)} ahead.`);
                  }}
                />
              </View>
            ))}
          </View>
          <Button
            label="Next request gets no answer"
            variant="secondary"
            onPress={() => {
              controls.failNext('no-answer');
              setMessage('Queued: the next request gets no answer.');
            }}
          />
          <Button
            label="Next request is refused"
            variant="secondary"
            onPress={() => {
              controls.failNext('refused');
              setMessage('Queued: the next request is refused.');
            }}
          />
          {message ? <Notice message={message} /> : null}
        </View>

        <View style={styles.section}>
          <AppText variant="subheading" accessibilityRole="header">
            Scenarios
          </AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel="Scenario" style={styles.list}>
            {controls.scenarios.map((scenario) => (
              <ScenarioRow
                key={scenario.key}
                scenario={scenario}
                running={scenario.key === snapshot.scenario}
                onSelect={() =>
                  startOver(() => controls.selectScenario(scenario.key), `${scenario.label} started from the beginning.`)
                }
              />
            ))}
          </View>
        </View>

        <Notice message="Not available in production builds. Mock state resets on cold reload." />
      </View>
    </Screen>
  );
}

type ScenarioRowProps = {
  scenario: DemoScenario;
  running: boolean;
  onSelect: () => void;
};

/** One scenario as a radio button; a scenario that is not built yet is listed but disabled. */
function ScenarioRow({ scenario, running, onSelect }: ScenarioRowProps) {
  const { available } = scenario;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${scenario.label}, ${scenario.description}${available ? '' : ', not built yet'}`}
      accessibilityState={{ checked: running, disabled: !available }}
      disabled={!available}
      onPress={running ? undefined : onSelect}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Icon name="sliders" color={available ? 'ink' : 'muted'} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="label" color={available ? 'ink' : 'muted'}>
          {scenario.label}
        </AppText>
        <AppText variant="small" color="muted">
          {scenario.description}
        </AppText>
      </View>
      {running ? (
        <Badge label="Running" tone="success" />
      ) : available ? null : (
        <AppText variant="small" color="muted">
          Not built yet
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  steps: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  step: {
    flex: 1,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  rowIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.soft,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
