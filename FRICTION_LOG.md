# Friction log: Draw Your Hero

Building a Fire TV (Vega) storytelling app with Amazon Bedrock, Bedrock Guardrails and
Amazon Polly, as one developer, during the Amazon Developer Hackathon (Oct 2026).
Entries were written when each problem happened, not reconstructed at the end.

## Bottom line up front

1. **A brand-new AWS account could not call any Bedrock model for about a day**: every
   model quota was 0, and the error was a generic `ThrottlingException` ("Too many
   requests") on the very first call. Combined with an unexplained identity-verification
   rejection, account setup cost more time than building the first prototype. *Biggest single fix:
   say "your quota for this model is 0" and link to the request form.*
2. **The first Vega release build failed on Ubuntu 26.04** because the build plugin looks for
   `hermesc` in `build/bin` while the SDK installs it in `build/x86_64-Linux/bin`, and the
   error is a raw shell "not found". A one-line symlink fixed it, but only after reading the SDK
   folder tree by hand.
3. **Bedrock Guardrails blocked our own safety instructions**: a system prompt that lists what a
   children's story must avoid ("no weapons, no injury…") tripped the content filters on harmless
   requests. Selective guarding (`guardContent`) solves it, but the docs don't lead you there and
   the blocked response doesn't say which filter fired.
4. **Things that worked very well:** React Native for Vega felt like ordinary React Native; the Vega
   Virtual Device made TV testing possible without hardware; Bedrock's Converse API with tool use gave
   reliably structured stories; Polly's generative voices are a big step up for storytelling.

## Persona

- Solo developer (student, India, IST), comfortable with TypeScript, React and Node.js.
- First time with Vega OS, the Vega SDK and the Vega Virtual Device; first AWS account (free plan
  with credits), first time with Bedrock, Guardrails and Polly.
- Machine: ASUS laptop, Windows + **Ubuntu 26.04** dual boot. No physical Fire TV device.
- Goal: a phone + Fire TV experience where a child's paper drawing becomes the hero of an
  AI-narrated story, with the backend hosted on AWS for judging.

## Friction points

Severity: **Blocker** (no way forward without a workaround) · **High** · **Medium** · **Low**.

| # | Area | Title | Severity |
|---|---|---|---|
| 1 | AWS account | "Bad request" errors caused by a dual-boot clock offset | High |
| 2 | AWS account | Identity verification rejected with no reason | High |
| 3 | Bedrock | New account had every model quota at 0 | Blocker |
| 4 | Bedrock | Nova Canvas reached end of life during the hackathon | Medium |
| 5 | Vega SDK | `hermesc` not found on Ubuntu 26.04 | Blocker |
| 6 | Vega SDK docs | Ubuntu prerequisites need 26.04 package names | Low |
| 7 | Bedrock Guardrails | Guardrail blocked the developer's own safety instructions | High |
| 8 | Vega Virtual Device | Device stopped between runs; `run-app` only says "not found" | Medium |
| 9 | Vega CLI | Sample's `build:vega` uses a deprecated command and warns on every build | Low |
| 10 | Vega manifest | `build_number is 0` warning, but the manifest docs don't show the key | Low |
| 11 | Vega manifest docs | App icon: where `@image/` points and what size is expected aren't documented | Medium |
| 12 | Vega sample app | Sample manifest ships video-player/DRM entries a non-video app must strip | Low |
| 13 | Amazon Polly | Generative voices return no speech marks, so read-along needs a workaround | Medium |
| 14 | Amazon Polly docs | `<prosody>` is "partially available" for generative voices without saying which attributes | Low |
| 15 | AWS console | Console sign-in showed "Bad request" in Firefox on Ubuntu | Low |

## Entries (details)

### 1. [AWS account] Bedrock calls failed with "Bad request" because of a dual-boot clock
- **Task attempted:** First Amazon Bedrock and console calls from a Windows + Ubuntu dual-boot laptop in India (IST).
- **Steps taken:** Signed in, opened Bedrock playground, ran SDK calls.
- **Expected:** Calls succeed, or the error says the clock is wrong.
- **Actual:** Generic "Bad request" / "Something went wrong". The Windows clock was 5 h 30 min off (Ubuntu stores the hardware clock in UTC, Windows in local time).
- **Severity:** High (looked like an account problem for hours)
- **Workaround:** Synced Windows time; on Ubuntu ran `timedatectl set-local-rtc 1 --adjust-system-clock`.
- **Suggestion for Amazon:** Surface "request signature expired / clock skew" in the console instead of a generic error.

### 2. [AWS account] Identity verification rejected over address format
- **Task attempted:** Complete new-account verification (India) to use Bedrock.
- **Steps taken:** Submitted contact address; verification failed. Resubmitted with the address exactly as on Aadhaar, via DigiLocker.
- **Expected:** Clear reason for the rejection.
- **Actual:** Rejected with no detail about which field mismatched.
- **Severity:** High (blocks all Bedrock use)
- **Workaround:** Match the contact address character-for-character to the Aadhaar permanent address.
- **Suggestion for Amazon:** Say which field did not match the document.

### 3. [Amazon Bedrock] New account had every model quota at 0 (ThrottlingException)
- **Task attempted:** Call Amazon Nova Lite on demand in ap-southeast-2.
- **Steps taken:** Playground and SDK both returned ThrottlingException; Service Quotas showed 0 RPM / 0 tokens per day for all models.
- **Expected:** A small default quota on a verified account, or an error that names the zero quota.
- **Actual:** "Too many requests" on the very first request. Needed a support case to lift quotas (resolved in about a day: 10 RPM, ~564M tokens/day).
- **Severity:** Blocker (during a 4-day hackathon)
- **Workaround:** Service Quotas increase request → support case.
- **Suggestion for Amazon:** Say "your quota for this model is 0" in the error and link to the quota request.

### 4. [Amazon Bedrock] Nova Canvas reached end of life during the hackathon
- **Task attempted:** Generate watercolor page backgrounds with `amazon.nova-canvas-v1:0` in us-east-1.
- **Steps taken:** `npm run check:aws` → InvokeModel.
- **Expected:** Image, or a pointer to the replacement model.
- **Actual:** `ResourceNotFoundException: This model version has reached the end of its life.` (EOL 30 Sep 2026 per the model lifecycle page.) Hackathon resources still mention Nova Canvas.
- **Severity:** Medium
- **Workaround:** Painted all 15 story settings as layered parallax art with our own SVG pipeline (`tools/scene-art`), served by the story service.
- **Suggestion for Amazon:** Name the successor model in the EOL error, and refresh hackathon resource lists.


### 5. [Vega SDK 0.24.12112] `yarn build:vega` fails: hermesc "not found" on Ubuntu 26.04
- **Task attempted:** First release build of a React Native for Vega app on Ubuntu 26.04 (Vega CLI 1.4.7, SDK 0.24.12112).
- **Steps taken:** Installed SDK with `get_vvm.sh`, `yarn install`, `yarn build:vega`.
- **Expected:** `.vpkg` produced.
- **Actual:** JS bundle built fine, then `error An error occurred while executing Hermes command .../VegaUIReact-Hermes-0.72.x_vodka.369120.0/AL2_x86_64/DEV.STD.PTHREAD/build/bin/hermesc ... /bin/sh: 1: ...hermesc: not found`. The binary is installed at `.../build/x86_64-Linux/bin/hermesc` instead.
- **Severity:** Blocker (no .vpkg)
- **Workaround:** `ln -s "$B/x86_64-Linux/bin" "$B/bin"` where `$B` is the `.../DEV.STD.PTHREAD/build` folder.
- **Suggestion for Amazon:** Resolve the platform sub-folder in the build plugin (or install to the expected path), and say "Hermes compiler missing at <path>" instead of a shell "not found".

### 6. [Ubuntu 26.04] Vega install prerequisites need small changes
- **Task attempted:** Follow the Ubuntu prerequisites on the Install Vega SDK page.
- **Actual:** `qemu-kvm` is a virtual package on 26.04 ("no installation candidate"); `qemu-system-x86` works. Dual-boot clock offset also made `apt update` fail ("Release file ... not valid yet").
- **Severity:** Low
- **Workaround:** `sudo apt install qemu-system-x86`; set the clock with `timedatectl`.
- **Suggestion for Amazon:** List the 24.04/26.04 package names in the docs.

### 7. [Amazon Bedrock Guardrails] Guardrail blocked our own safety instructions
- **Task attempted:** Use a child-safety guardrail (content filters High, Violence Medium) on every Converse call.
- **Steps taken:** Added `guardrailConfig` to Converse requests whose system prompt says what the story must avoid ("no violence, weapons, injury…").
- **Expected:** Only unsafe child input or model output is blocked.
- **Actual:** `stopReason: guardrail_intervened` on harmless requests (reading a drawing), apparently triggered by the words in our own safety rules. Happened intermittently.
- **Severity:** High (stories fell back to the built-in template)
- **Workaround:** Selective guarding: wrap only the child's words in `guardContent` blocks so the guardrail checks those plus the model's output, not the developer instructions.
- **Suggestion for Amazon:** Mention selective guarding prominently in the Converse + Guardrails getting-started docs, and return which filter fired (with trace disabled, the response gives no reason).

### 8. [Vega Virtual Device] Device stopped between runs; `run-app` only says "not found"
- **When:** 22 Oct 2026.
- **Task attempted:** Reinstall the app after a rebuild.
- **Steps taken:** `vega run-app <vpkg> com.drawyourhero.tv.main -d VirtualDevice`.
- **Expected:** Install, or an offer to start the virtual device.
- **Actual:** `Vega operation FAILED due to an irrecoverable error: Couldn't find device 'VirtualDevice'`. A few minutes earlier `vega virtual-device start` had reported "already running"; the device window had since closed.
- **Severity:** Medium (confusing during quick iterations)
- **Workaround:** `vega virtual-device start`, wait for the home screen, run `run-app` again.
- **Suggestion for Amazon:** Have `run-app -d VirtualDevice` start the device (or ask to), and call the error recoverable with the exact command to run.

### 9. [Vega CLI] Sample's `build:vega` uses a deprecated command and warns on every build
- **When:** Every build.
- **Actual:** `warn This command is deprecated and will be removed in a future version of the Vega CLI plugin. Please replace usage with 'build-vega' instead.` The command comes from the official multi-TV sample (`react-native build-kepler`).
- **Severity:** Low
- **Suggestion for Amazon:** Update the sample's scripts to `build-vega` so new developers start on the supported command.

### 10. [Vega manifest] `build_number is 0` warning without a documented key
- **When:** Every build (SDK 0.24.12112).
- **Actual:** `WARNING: build_number is 0. Provide via --build-number CLI option or in manifest.toml [package] section.` The app-manifest page documents `id`, `title` and `icon` in `[package]` but not the build-number key or its format. The same build also prints `[processes.group] Process group is missing an explicit id` for the sample's manifest.
- **Severity:** Low
- **Suggestion for Amazon:** Document every `[package]` key (with `version` vs build number), and add the process-group `id` to the sample.

### 11. [Vega manifest docs] App icon path and size aren't documented
- **Task attempted:** Give the app its own icon.
- **Steps taken:** Read the app-manifest page: it shows `icon = "@image/foo_icon.png"` but doesn't say which folder `@image/` maps to, or the expected size/format.
- **Actual:** Found by trial: `apps/vega/assets/image/icon.png` (512×512 PNG) validated.
- **Severity:** Medium (guesswork for a basic step)
- **Suggestion for Amazon:** One sentence on the folder mapping plus the recommended icon sizes on the manifest page.

### 12. [Vega sample app] Sample manifest ships video-player entries
- **Task attempted:** Turn the multi-TV sample into a non-video app.
- **Actual:** The manifest wants DRM services, secure playback, file sharing, the Content Launcher and Vega Media Controls extras. It isn't clear which are needed for simple audio playback (we kept the media server and audio services for `@amazon-devices/react-native-w3cmedia`'s `AudioPlayer` and removed the rest; the build still validated).
- **Severity:** Low
- **Suggestion for Amazon:** Comment each manifest block in the sample with "needed for: video / DRM / audio / remote".

### 13. [Amazon Polly] Generative voices return no speech marks
- **When:** 22 Oct 2026.
- **Task attempted:** Switch the narrator to a generative voice (Ruth) while keeping word-by-word read-along highlighting on the TV.
- **Expected:** Word speech marks as with neural voices.
- **Actual:** Docs: "Support for generating speech marks is currently not available" for the generative engine.
- **Severity:** Medium (read-along is a core feature for young readers)
- **Workaround:** Synthesize the audio with the generative engine, request word marks for the same text from the neural version of the same voice, and stretch those timings to the generative audio's length (measured from the MP3 frames).
- **Suggestion for Amazon:** Speech marks for generative voices, even approximate ones.

### 14. [Amazon Polly docs] `<prosody>` "partial availability" for generative voices
- **Actual:** The supported-SSML table marks `<prosody>` as partially available for generative voices but doesn't list which attributes work (rate? volume? pitch?).
- **Severity:** Low
- **Workaround:** Send a slower `rate` for bedtime stories and fall back to plain `<speak>` if the request is rejected.
- **Suggestion for Amazon:** List the supported attributes per engine.

### 15. [AWS console] Console sign-in showed "Bad request" in Firefox on Ubuntu
- **When:** 22 Oct 2026.
- **Actual:** The sign-in page showed "Bad request … Clear your cookies" with the root/IAM chooser underneath. The system clock was correct.
- **Severity:** Low
- **Workaround:** A private window signed in normally.
- **Suggestion for Amazon:** Clear the stale sign-in state automatically, or say which cookie is the problem.

## Next steps (suggested owners)

| Owner | Action | From |
|---|---|---|
| Bedrock product | Name the zero quota in the throttling error and link to Service Quotas | 3 |
| Bedrock docs | Put selective guarding (`guardContent`) in the Converse + Guardrails quick start; return the filter that fired | 7 |
| Bedrock docs | Name successor models in end-of-life errors; refresh hackathon resource lists | 4 |
| Vega SDK engineering | Fix the `hermesc` path on x86_64 Linux; make the error say which file is missing | 5 |
| Vega CLI | Let `run-app` start the virtual device; update the sample to `build-vega` | 8, 9 |
| Vega docs | Document every `[package]` key, `@image/` mapping and icon sizes; Ubuntu 26.04 packages | 6, 10, 11 |
| Vega samples | Comment manifest blocks by purpose; add a process-group `id` | 10, 12 |
| Polly | Speech marks for generative voices; list `<prosody>` attributes per engine | 13, 14 |
| AWS account / console | Say which field failed identity verification; surface clock skew instead of "Bad request" | 1, 2, 15 |
