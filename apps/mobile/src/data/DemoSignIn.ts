/**
 * How to sign in to a synthetic data source, which the sign-in screens show so nobody types a
 * real phone number (`docs/api/authentication.md`, OTP semantics). The mock data source supplies
 * it in every build, because every mock identity is synthetic; a real data source supplies none.
 */
export type DemoSignIn = Readonly<{
  /** A number the source accepts, offered as the starting value of the phone field. */
  phoneNumber: string;
  /** Which numbers the source accepts, shown under the phone field. */
  numbersHint: string;
  /** The code every challenge accepts. No SMS is sent, so the code screen shows it. */
  code: string;
}>;
