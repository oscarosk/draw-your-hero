# Friction log

Each entry: task attempted · steps taken · expected vs actual · severity · workaround · suggestion.
Entries are written when the problem happens, not from memory at the end.

## Template

### [Tool] Short title
- **Task attempted:**
- **Steps taken:**
- **Expected:**
- **Actual:**
- **Severity:** Blocker / High / Medium / Low
- **Workaround:**
- **Suggestion for Amazon:**

## Entries

### [AWS account] Bedrock calls failed with "Bad request" because of a dual-boot clock
- **Task attempted:** First Amazon Bedrock and console calls from a Windows + Ubuntu dual-boot laptop in India (IST).
- **Steps taken:** Signed in, opened Bedrock playground, ran SDK calls.
- **Expected:** Calls succeed, or the error says the clock is wrong.
- **Actual:** Generic "Bad request" / "Something went wrong". The Windows clock was 5 h 30 min off (Ubuntu stores the hardware clock in UTC, Windows in local time).
- **Severity:** High (looked like an account problem for hours)
- **Workaround:** Synced Windows time; on Ubuntu ran `timedatectl set-local-rtc 1 --adjust-system-clock`.
- **Suggestion for Amazon:** Surface "request signature expired / clock skew" in the console instead of a generic error.

### [AWS account] Identity verification rejected over address format
- **Task attempted:** Complete new-account verification (India) to use Bedrock.
- **Steps taken:** Submitted contact address; verification failed. Resubmitted with the address exactly as on Aadhaar, via DigiLocker.
- **Expected:** Clear reason for the rejection.
- **Actual:** Rejected with no detail about which field mismatched.
- **Severity:** High (blocks all Bedrock use)
- **Workaround:** Match the contact address character-for-character to the Aadhaar permanent address.
- **Suggestion for Amazon:** Say which field did not match the document.

### [Amazon Bedrock] New account had every model quota at 0 (ThrottlingException)
- **Task attempted:** Call Amazon Nova Lite on demand in ap-southeast-2.
- **Steps taken:** Playground and SDK both returned ThrottlingException; Service Quotas showed 0 RPM / 0 tokens per day for all models.
- **Expected:** A small default quota on a verified account, or an error that names the zero quota.
- **Actual:** "Too many requests" on the very first request. Needed a support case to lift quotas (resolved in about a day: 10 RPM, ~564M tokens/day).
- **Severity:** Blocker (during a 4-day hackathon)
- **Workaround:** Service Quotas increase request → support case.
- **Suggestion for Amazon:** Say "your quota for this model is 0" in the error and link to the quota request.

### [Amazon Bedrock] Nova Canvas reached end of life during the hackathon
- **Task attempted:** Generate watercolor page backgrounds with `amazon.nova-canvas-v1:0` in us-east-1.
- **Steps taken:** `npm run check:aws` → InvokeModel.
- **Expected:** Image, or a pointer to the replacement model.
- **Actual:** `ResourceNotFoundException: This model version has reached the end of its life.` (EOL 30 Sep 2026 per the model lifecycle page.) Hackathon resources still mention Nova Canvas.
- **Severity:** Medium
- **Workaround:** Painted all 15 story settings as layered parallax art with our own SVG pipeline (`tools/scene-art`), served by the story service.
- **Suggestion for Amazon:** Name the successor model in the EOL error, and refresh hackathon resource lists.


### [Vega SDK 0.24.12112] `yarn build:vega` fails: hermesc "not found" on Ubuntu 26.04
- **Task attempted:** First release build of a React Native for Vega app on Ubuntu 26.04 (Vega CLI 1.4.7, SDK 0.24.12112).
- **Steps taken:** Installed SDK with `get_vvm.sh`, `yarn install`, `yarn build:vega`.
- **Expected:** `.vpkg` produced.
- **Actual:** JS bundle built fine, then `error An error occurred while executing Hermes command .../VegaUIReact-Hermes-0.72.x_vodka.369120.0/AL2_x86_64/DEV.STD.PTHREAD/build/bin/hermesc ... /bin/sh: 1: ...hermesc: not found`. The binary is installed at `.../build/x86_64-Linux/bin/hermesc` instead.
- **Severity:** Blocker (no .vpkg)
- **Workaround:** `ln -s "$B/x86_64-Linux/bin" "$B/bin"` where `$B` is the `.../DEV.STD.PTHREAD/build` folder.
- **Suggestion for Amazon:** Resolve the platform sub-folder in the build plugin (or install to the expected path), and say "Hermes compiler missing at <path>" instead of a shell "not found".

### [Ubuntu 26.04] Vega install prerequisites need small changes
- **Task attempted:** Follow the Ubuntu prerequisites on the Install Vega SDK page.
- **Actual:** `qemu-kvm` is a virtual package on 26.04 ("no installation candidate"); `qemu-system-x86` works. Dual-boot clock offset also made `apt update` fail ("Release file ... not valid yet").
- **Severity:** Low
- **Workaround:** `sudo apt install qemu-system-x86`; set the clock with `timedatectl`.
- **Suggestion for Amazon:** List the 24.04/26.04 package names in the docs.

### [Amazon Bedrock Guardrails] Guardrail blocked our own safety instructions
- **Task attempted:** Use a child-safety guardrail (content filters High, Violence Medium) on every Converse call.
- **Steps taken:** Added `guardrailConfig` to Converse requests whose system prompt says what the story must avoid ("no violence, weapons, injury…").
- **Expected:** Only unsafe child input or model output is blocked.
- **Actual:** `stopReason: guardrail_intervened` on harmless requests (reading a drawing), apparently triggered by the words in our own safety rules. Happened intermittently.
- **Severity:** High (stories fell back to the built-in template)
- **Workaround:** Selective guarding: wrap only the child's words in `guardContent` blocks so the guardrail checks those plus the model's output, not the developer instructions.
- **Suggestion for Amazon:** Mention selective guarding prominently in the Converse + Guardrails getting-started docs, and return which filter fired (with trace disabled, the response gives no reason).
