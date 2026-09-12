/**
 * The login code, on screen, while there is no way to send it.
 *
 * It appears only when the API returned one, which it does in development and
 * during the testing phase (`AUTH_TESTING_OTP`, backend/app/api/v1/auth.py).
 * The client decides nothing: no code in the response, no box.
 *
 * Amber rather than moss deliberately. Every other surface in this product is
 * oat and olive; this is the one thing on screen that should not look like it
 * belongs, because it is temporary and it is a hole -- anyone who types a
 * number is shown that account's code. It should read as scaffolding.
 *
 * One component for both the sign-in page and Settings, so the wording cannot
 * drift into two different explanations of the same thing.
 */
export function TestingCode({ code }: { code: string }) {
  return (
    <div
      role="status"
      className="rounded-[12px] border border-[#e0c68f] bg-[#f3e2c4] px-4 py-3 text-[#8a5a14]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em]">
        Testing phase OTP
      </p>
      <p
        data-numeric
        className="mt-1 select-all font-display text-[28px] font-bold leading-none tracking-[0.18em]"
      >
        {code}
      </p>
      <p className="mt-2 text-[12px] leading-snug">
        Text messages are not switched on yet, so the code is shown here instead of being sent.
      </p>
    </div>
  );
}
