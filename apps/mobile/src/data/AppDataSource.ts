import type {
  AuthSessionDto,
  BlockListPageDto,
  BlockListQueryInput,
  BlockUserInput,
  BlockUserResultDto,
  CancelRideRequestInput,
  ChatHistoryQueryInput,
  ChatMessageDto,
  ChatMessagePageDto,
  CreateOtpChallengeInput,
  CreateRideRequestInput,
  CurrentUserDto,
  GroupEventDto,
  GroupPreviewDto,
  Id,
  InstallationId,
  JoinGroupInput,
  JoinGroupResultDto,
  LeaveGroupInput,
  LeaveGroupResultDto,
  LogoutInput,
  NearbyQueryInput,
  NearbySnapshotDto,
  OtpChallengeDto,
  OwnRideRequestDto,
  PlaceSearchResultsDto,
  PublicEventDto,
  PushDeviceReceiptDto,
  RefreshSessionInput,
  RegisterPushDeviceInput,
  ReportReceiptDto,
  ReportUserInput,
  RideGroupDto,
  RideMatchSetDto,
  RideRequestDto,
  SearchPlacesInput,
  SendChatMessageInput,
  SessionCredentialsDto,
  SubscriptionAckDto,
  SubscriptionRequest,
  UpdateGroupStatusInput,
  UserEventDto,
  VerifyOtpInput,
} from '@ride-match/contracts';

/**
 * Options of a read. Aborting `signal` makes the read reject, and its result is never
 * delivered, so an obsolete search or viewport read cannot overwrite a newer one.
 *
 * Mutations take no signal: aborting cannot undo a change the source may already have made.
 * A mutation with an unknown outcome is retried with the same operation ID instead.
 */
export type ReadOptions = {
  signal?: AbortSignal;
};

/**
 * Returns the access token authenticated operations send, or `null` while signed out. An
 * implementation calls it when each operation starts, as an HTTP client sets the header of each
 * request. The auth session controller (AUTH-001-B) provides it; tokens never pass through
 * feature code.
 */
export type AccessTokenSource = () => string | null;

/** Sign-in, session renewal and the signed-in user (`docs/api/authentication.md`). */
export type AuthOperations = {
  /** Sends or resends a one-time code (`POST /auth/otp/challenges`). The mock sends no SMS. */
  requestOtp(input: CreateOtpChallengeInput): Promise<OtpChallengeDto>;
  /** Exchanges the code for a session (`POST /auth/otp/verify`). */
  verifyOtp(input: VerifyOtpInput): Promise<AuthSessionDto>;
  /** Rotates the session credentials with the refresh token (`POST /auth/refresh`). */
  refreshSession(input: RefreshSessionInput): Promise<SessionCredentialsDto>;
  /** Revokes the refresh token; repeating it succeeds (`POST /auth/logout`). */
  logout(input: LogoutInput): Promise<void>;
  /** Reads the signed-in user and their current request and group (`GET /me`). */
  getCurrentUser(options?: ReadOptions): Promise<CurrentUserDto>;
};

/** Curated place search (`docs/api/rides.md`). */
export type PlaceOperations = {
  /** Searches curated places in a coarse area (`GET /places/search`). */
  search(input: SearchPlacesInput, options?: ReadOptions): Promise<PlaceSearchResultsDto>;
};

/** Nearby discovery, ride requests and matches (`docs/api/rides.md`). */
export type RideOperations = {
  /** Reads public rides and groups in a coarse viewport (`GET /rides/nearby`). */
  getNearby(input: NearbyQueryInput, options?: ReadOptions): Promise<NearbySnapshotDto>;
  /** Reads one active request's public projection (`GET /rides/{rideId}`). */
  getRide(rideId: Id, options?: ReadOptions): Promise<RideRequestDto>;
  /** Reads the caller's current or latest request, or `null` (`GET /me/ride-request`). */
  getOwnRequest(options?: ReadOptions): Promise<OwnRideRequestDto | null>;
  /** Creates the caller's request (`POST /rides`). */
  create(input: CreateRideRequestInput): Promise<OwnRideRequestDto>;
  /** Cancels the caller's active request (`POST /rides/{rideId}/cancel`). */
  cancel(rideId: Id, input: CancelRideRequestInput): Promise<OwnRideRequestDto>;
  /** Reads the matches of the caller's request (`GET /rides/{rideId}/matches`). */
  getMatches(rideId: Id, options?: ReadOptions): Promise<RideMatchSetDto>;
};

/** Group previews, membership and lifecycle (`docs/api/groups.md`). */
export type GroupOperations = {
  /** Joins a ride or group with the caller's active request (`POST /groups/join`). */
  join(input: JoinGroupInput): Promise<JoinGroupResultDto>;
  /** Reads a live group's public preview (`GET /groups/{groupId}/preview`). */
  getPreview(groupId: Id, options?: ReadOptions): Promise<GroupPreviewDto>;
  /** Reads the member-only group (`GET /groups/{groupId}`). */
  getGroup(groupId: Id, options?: ReadOptions): Promise<RideGroupDto>;
  /** Leaves the group, cancelling the caller's request (`DELETE /groups/{groupId}/members/me`). */
  leave(groupId: Id, input: LeaveGroupInput): Promise<LeaveGroupResultDto>;
  /** Changes the group's status as its coordinator (`PATCH /groups/{groupId}/status`). */
  updateStatus(groupId: Id, input: UpdateGroupStatusInput): Promise<RideGroupDto>;
};

/** Temporary group chat (`docs/api/groups.md`). */
export type ChatOperations = {
  /** Reads a page of history: latest, older or catch-up (`GET /groups/{groupId}/messages`). */
  getHistory(groupId: Id, input: ChatHistoryQueryInput, options?: ReadOptions): Promise<ChatMessagePageDto>;
  /** Sends a message; a retry with the same client message ID returns it (`POST /groups/{groupId}/messages`). */
  send(groupId: Id, input: SendChatMessageInput): Promise<ChatMessageDto>;
};

/** Reports and blocks (`docs/api/groups.md`). */
export type SafetyOperations = {
  /** Reports a rider (`POST /reports`). */
  report(input: ReportUserInput): Promise<ReportReceiptDto>;
  /** Blocks a rider, leaving a shared live group (`PUT /me/blocks/{userId}`). */
  block(userId: Id, input: BlockUserInput): Promise<BlockUserResultDto>;
  /** Unblocks a rider; succeeds whether or not the block exists (`DELETE /me/blocks/{userId}`). */
  unblock(userId: Id): Promise<void>;
  /** Reads a page of the caller's block list, newest first (`GET /me/blocks`). */
  listBlocks(input: BlockListQueryInput, options?: ReadOptions): Promise<BlockListPageDto>;
};

/** Push-device registration (`docs/api/realtime.md`). The mock stores inert receipts. */
export type DeviceOperations = {
  /** Registers or updates this installation's push device (`PUT /me/push-devices/{installationId}`). */
  register(installationId: InstallationId, input: RegisterPushDeviceInput): Promise<PushDeviceReceiptDto>;
  /** Removes the registration; succeeds whether or not it exists (`DELETE /me/push-devices/{installationId}`). */
  remove(installationId: InstallationId): Promise<void>;
};

/** The events each subscription kind receives. */
type EventsBySubscriptionKind = {
  nearby: PublicEventDto;
  user: UserEventDto;
  group: GroupEventDto;
};

/** The event type a subscription request receives. */
export type EventForRequest<Request extends SubscriptionRequest> = EventsBySubscriptionKind[Request['kind']];

/** An accepted subscription: the scope the source accepted, and how to end it. */
export type EventSubscription = {
  ack: SubscriptionAckDto;
  /** Ends the subscription; no event is delivered afterwards. Succeeds if it already ended. */
  unsubscribe(): Promise<void>;
};

/** Whether the realtime connection is up. While `disconnected`, the app shows data as stale. */
export type ConnectionState = 'connected' | 'disconnected';

/** Realtime events and the connection that carries them (`docs/api/realtime.md`). */
export type EventOperations = {
  /**
   * Subscribes to one logical scope and delivers each event to `onEvent`, typed by the
   * request's kind. The promise rejects with the subscription error (for example
   * `MEMBERSHIP_REQUIRED`). A subscription lasts one connection: when the connection drops it
   * ends, and the app subscribes again after reconnecting, then rereads its snapshots.
   */
  subscribe<Request extends SubscriptionRequest>(
    request: Request,
    onEvent: (event: EventForRequest<Request>) => void,
  ): Promise<EventSubscription>;
  /**
   * Reports the connection state to `listener` at once and on every change, until the
   * returned function is called.
   */
  watchConnection(listener: (state: ConnectionState) => void): () => void;
};

/**
 * The one boundary between feature code and application data: typed asynchronous operations
 * and event subscriptions, grouped in eight namespaces. The in-memory simulator implements it
 * now; HTTP and Socket.IO may implement it after the mobile MVP, without changing features.
 *
 * - Inputs and results are the shared contract types, and implementations return values that
 *   satisfy the contract schemas. Path parameters such as a group ID are separate arguments.
 * - Operations reject on failure. DATA-001-B turns rejections into the mobile error model.
 * - Authenticated operations act as the session whose access token the implementation reads
 *   from its {@link AccessTokenSource}, which the auth session controller supplies (AUTH-001-B).
 *   Feature code never passes access tokens; only `auth.refreshSession` and `auth.logout` take
 *   the refresh token, as their contracts say.
 *
 * Composition selects the implementation once (`createDataSource`); features reach it through
 * `useDataSource()` and never import an implementation, fixtures or simulator internals.
 */
export type AppDataSource = {
  auth: AuthOperations;
  places: PlaceOperations;
  rides: RideOperations;
  groups: GroupOperations;
  chat: ChatOperations;
  safety: SafetyOperations;
  devices: DeviceOperations;
  events: EventOperations;
};
