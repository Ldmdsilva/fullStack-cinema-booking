# Encore — User Acceptance Testing (UAT) Plan

**Companion document to** `docs/encore-cinema-PID-SRS.md` §D4.6 (Usability testing). This plan operationalises that section's protocol — participants, tasks, ethics, and measures — into a runnable session script, and adds the findings-and-resultant-modifications record the rubric's top band asks for. It is written to be run as-is; where no session has yet taken place, that is stated explicitly rather than implied.

**Status: template, ready for use.** The findings table in §6 contains placeholder rows only — no UAT session had been conducted at the time this document was written. Facilitators should run the sessions in §3, then replace §6 with the real results and re-test any flow that changed.

---

## 1. Purpose and scope

Confirm that a first-time user can complete the core booking journey — including the real Stripe payment and time-limited seat-hold flow (ADR-012), the hashed single-use tokens behind email verification and password reset (ADR-011), and server-side payment confirmation (ADR-014) introduced by the cinema-domain SRS amendments — without external help, and surface points of confusion severe enough to warrant a design change before submission. This is a small, qualitative, task-based study, not a statistically powered usability study; it targets the SRS's stated minimum of 3 participants (target 5).

## 2. Participants

| Aspect | Plan |
|---|---|
| Target | 5 participants; minimum 3 (the SRS's stated point of diminishing returns for this scale of study) |
| Recruitment | Peers or coursemates unfamiliar with Encore's implementation; a mix of at least one participant unfamiliar with cinema ticket booking sites generally, to avoid testing only "expert" assumptions |
| Compensation | None required; participation is voluntary |
| Equipment | Participant's own laptop/desktop with a modern browser, or a facilitator-provided machine; the Encore client running against a seeded, Stripe-test-mode backend (never production data or a live card) |
| Duration | ~20–25 minutes per session: 2 min intro/consent, ~15 min tasks, ~5 min debrief/rating |

## 3. Protocol

**Format:** one participant at a time, task-based, **think-aloud** (the participant narrates what they're looking at, expecting, and trying, continuously, while the facilitator observes and takes notes without helping unless the participant is fully stuck for >60 seconds — noted as a task failure if so).

**Facilitator script (read or paraphrase to the participant before starting):**

> "Thanks for helping test Encore, a cinema ticket booking site. I'm going to ask you to complete a few tasks as if you were a real customer. There are no wrong answers — if something is confusing, that's useful information, not a mistake on your part. Please talk through what you're thinking as you go: what you expect to happen, what you're looking for, anything that surprises you. I won't be able to help unless you're completely stuck, so try to work through anything ambiguous the way you would on a real site. This should take about 20 minutes. You can stop at any time for any reason."

**Before starting**, obtain informed consent (§4). **After the last task**, run the short debrief and rating (§5).

**Test data:** each participant registers their own account during Task 1 rather than reusing a seeded account, so registration itself is genuinely tested. The environment runs against Stripe **test mode only** — Stripe's universal test card `4242 4242 4242 4242` (any future expiry, any CVC, any postcode) is provided to the participant on an index card for Task 3; no real payment method is ever requested or accepted.

### The five tasks

Chosen to exercise the full real account-and-booking pipeline now in place — registration and email verification, film/showtime discovery, a genuine hold → pay → confirm cycle, locating a completed booking, and account recovery via password reset — per SRS §D4.6. This is the account lifecycle and payment path introduced by the cinema-domain SRS amendments (v3.0–v3.2: ADR-009/ADR-014 payments, ADR-010 notifications, ADR-011 verification/reset tokens, ADR-012 seat holds), not only the parts of the flow that predate them.

| # | Task (as read to the participant) | What it exercises (SRS §C4 FR refs) | Success criterion |
|---|---|---|---|
| 1 | "Register a new account for yourself, then check your inbox and verify it using the link we send you." | FR-1 registration, FR-2 verification email dispatch, FR-3 link marks the account verified, FR-6 booking blocked until verified | Account created, participant locates the verification email unaided, clicks the link, and lands back in the app as a verified user |
| 2 | "Find a film you'd like to see that's showing tomorrow, narrowing the list down using the filters until you're looking at just that one showtime." | FR-19 browse films, FR-20 film detail and showtimes, FR-21 filter by cinema/date/time | Participant reaches a showtime dated tomorrow using at least one filter, unprompted |
| 3 | "Pick two seats next to each other and complete the booking, including payment — here's a test card to use: 4242 4242 4242 4242, any future expiry, any CVC." | FR-26 seat map, FR-27 time-limited hold, FR-34 server-computed PaymentIntent, FR-35 Stripe Elements card entry, FR-36/FR-37 server-verified, idempotent confirmation | Participant selects two adjacent seats, reaches checkout, enters the supplied test card into the Payment Element, and reaches a confirmation screen without being told what to do |
| 4 | "Without me telling you where to look, find the booking reference for what you just booked." | FR-42 confirmed booking shown with reference, FR-43 view own bookings | Participant locates the reference (on the confirmation page or in "My Bookings") within a reasonable number of navigation attempts |
| 5 | "Imagine you've forgotten your password. Use the site to reset it and log back in with the new one." | FR-13 request reset, FR-14 single-use 60-minute reset link, FR-15 set new password (all sessions invalidated), FR-17 expired/used token rejected | Participant requests a reset, locates the reset email unaided, sets a new password, and logs in with it |

**Focus questions** (for the facilitator to weave into the post-task rating and end-of-session debrief, per SRS §D4.6's "Specific focus" prompt):

- **Task 1 — Registration and verification:** Was verification-required messaging clear before allowing booking (did the participant understand *why* they couldn't book yet)? Was the verification email easy to find, and was its call-to-action obvious? Did the participant understand what "verified" unlocked?
- **Task 2 — Film and showtime discovery:** Was it clear how to find showtimes for a specific date (tomorrow)? Were the date and film filters easy to discover and combine? Did the participant understand why a film with no showtime tomorrow dropped out of the list?
- **Task 3 — Seat selection and payment:** Did the seat map make adjacency obvious? Was it clear the payment was simulated / test-mode, not a real charge? Was the hold countdown reassuring or stressful — did the participant even notice it? Was it clear the booking had succeeded once the confirmation screen appeared?
- **Task 4 — Locating the booking reference:** Was the confirmation reference easy to locate afterward? Did the participant know where to look for past bookings without prompting? Was the reference clearly distinguishable from the film title or seat numbers on the same screen?
- **Task 5 — Password reset:** Was the "forgotten password" entry point easy to find from the login screen? Was the password-reset email delivery time acceptable? Was it clear that resetting the password would sign them out of any other active session?

## 4. Ethics and consent

Usability testing follows University ethical guidelines for low-risk studies involving informed adult participants: informed consent, the right to withdraw at any time without giving a reason, and anonymised, minimal-retention results. No real payment details, real financial data, or personally sensitive information is collected — participants use a facilitator-supplied test card and are encouraged to register with a fictional or throwaway name and email if preferred.

**Consent statement, read or handed to the participant before the session begins:**

> **Encore usability study — informed consent**
>
> You are being invited to take part in a short usability study of Encore, a cinema ticket booking website built as part of a university coursework project. Taking part is entirely voluntary.
>
> If you agree to take part, you will be asked to complete a small number of realistic tasks on the website (such as registering an account, finding a film showing, and booking a ticket) while thinking aloud about what you are doing. The session will take about 20 minutes. A researcher will take written notes on where you succeed, where you hesitate, and any comments you make; no video or audio recording is made, and no payment card details of any kind (real or fictional) are recorded — a test card number is provided for you to use, and it processes no real transaction.
>
> Your name will not be attached to any notes or the final report; you will be referred to only as "Participant 1," "Participant 2," and so on. Findings will be reported only in aggregate or anonymised form as part of the coursework submission.
>
> You may stop the session at any time, for any reason, without needing to explain why, and any notes taken about your session will be discarded if you withdraw. Taking part or not taking part will have no effect on you in any way.
>
> If you are happy to proceed on this basis, please say so verbally or sign below.
>
> Participant signature / verbal confirmation: ______________________  Date: __________

## 5. Measures

Recorded per participant, per task:

- **Task completion:** completed unaided / completed with a hint / not completed within a reasonable time.
- **Time on task:** approximate, from the facilitator reading the task aloud to the participant indicating they believe they're done.
- **Errors:** any action that does not move the participant toward the goal (e.g. clicking a non-interactive element, navigating to the wrong page, re-entering a form field).
- **Observed points of confusion:** noted verbatim where possible (what the participant said or asked), not just categorised.
- **Post-task rating:** a 1–5 rating ("How easy or difficult was that?", 1 = very difficult, 5 = very easy") immediately after each task, before moving to the next — this captures subjective friction that completion alone misses.

At the end of the session, ask one open question: *"Was there anything at any point where the site did something you didn't expect?"* — this is where seat-hold expiry, the payment-confirmation round trip (server-side PaymentIntent retrieval, ADR-014), and verification/reset email delivery delay are most likely to surface, since each is a genuinely asynchronous behaviour a first-time user has no reason to anticipate.

## 6. Findings and resultant modifications

**No sessions had been run at the time this document was written.** The table below is a template with the correct columns for recording real results — copy it once per completed round of testing (a "round" being all planned participants for that pass) and fill it in from session notes. Do not report this table as containing real findings until real sessions have populated it.

| # | Round | Task | Participant(s) affected | Observation (severity: Critical / Major / Minor / Cosmetic) | Resultant modification | Re-tested? |
|---|---|---|---|---|---|---|
| 1 | *(e.g. Round 1)* | *(e.g. Task 3 — payment)* | *(e.g. P2, P4)* | *(placeholder — e.g. "Participant did not realise the seat-hold countdown meant their seats would be released; assumed the timer was just decorative.")* | *(placeholder — e.g. "Added an explicit warning label and colour change to the countdown at <2 minutes remaining.")* | *(Yes/No — and with which participant(s))* |
| 2 | | | | | | |
| 3 | | | | | | |

**Severity scale (for consistency across rounds):**

- **Critical** — the participant could not complete the task at all, even with the full timeout allowed.
- **Major** — the participant completed the task, but only after a wrong turn that cost significant time or a moment of visible frustration/hesitation.
- **Minor** — a comment or brief hesitation with no material effect on completion.
- **Cosmetic** — a stylistic observation with no functional effect.

**Process:** after each round, triage findings by severity, decide which warrant a change given remaining time, make the change, and — for anything rated Critical or Major — re-run just that task with a fresh participant (or the same one, if appropriate) to confirm the fix actually resolves the confusion rather than introducing a new one. Recording *what changed as a result* of testing, not merely that testing happened, is the explicit rubric expectation this section satisfies (SRS §D4.6).

## 7. Known limitations of this plan

- A sample of 3–5 is exploratory, not statistically representative; findings indicate plausible usability issues, not proven prevalence.
- All sessions run against Stripe test mode; a participant's comments about payment "trustworthiness" reflect the UI, not real transaction risk.
- Payment confirmation is a synchronous server-side PaymentIntent retrieval (ADR-014), not a webhook, so a facilitator-hosted session needs no `stripe listen` process; the residual asynchronous case — the 2-minute reconciliation job that completes a booking if a participant's tab closes before the confirm call returns — still depends on local network and Stripe API latency and may not perfectly represent production timing.
- Task 1 and Task 5 depend on the participant having timely access to the verification/reset mailbox used by the seeded environment (e.g. a facilitator-visible dev inbox or capture mailbox); delivery latency in that mechanism, not the product itself, could inflate time-on-task for those two steps.
