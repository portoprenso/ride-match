import type { AppDataSource } from '../data/AppDataSource';
import type { SessionController } from '../features/auth/createSessionController';

/**
 * The data source with every signed-in operation run through the session's
 * `runAuthenticated`: a `SESSION_EXPIRED` answer renews the access token once and runs the same
 * call again with the same arguments. Access tokens live 15 minutes, as long as a request's
 * search window, so without this a rider's own reads stop working midway (RIDE-001-C found it).
 *
 * Running twice is safe for each wrapped operation: reads repeat; mutations carry the same
 * operation or client-message ID in their unchanged input, so the source returns the original
 * result; unblocking and device removal succeed whether or not they already happened. Sign-in,
 * refresh and logout are left as they are (the session controller calls them itself), and so are
 * the public reads and event subscriptions, whose resubscription the sync coordinator owns.
 *
 * @param session Read at each call: the composition builds the session after the data source.
 */
export function withSessionRenewal(dataSource: AppDataSource, session: () => SessionController | null): AppDataSource {
  const renew =
    <Args extends unknown[], Result>(operation: (...args: Args) => Promise<Result>) =>
    (...args: Args): Promise<Result> => {
      const controller = session();
      return controller === null ? operation(...args) : controller.runAuthenticated(() => operation(...args));
    };
  const { auth, rides, groups, chat, safety, devices } = dataSource;
  return {
    ...dataSource,
    auth: { ...auth, getCurrentUser: renew(auth.getCurrentUser) },
    rides: {
      ...rides,
      getOwnRequest: renew(rides.getOwnRequest),
      create: renew(rides.create),
      cancel: renew(rides.cancel),
      getMatches: renew(rides.getMatches),
    },
    groups: {
      ...groups,
      join: renew(groups.join),
      getGroup: renew(groups.getGroup),
      leave: renew(groups.leave),
      updateStatus: renew(groups.updateStatus),
    },
    chat: { getHistory: renew(chat.getHistory), send: renew(chat.send) },
    safety: {
      report: renew(safety.report),
      block: renew(safety.block),
      unblock: renew(safety.unblock),
      listBlocks: renew(safety.listBlocks),
    },
    devices: { register: renew(devices.register), remove: renew(devices.remove) },
  };
}
