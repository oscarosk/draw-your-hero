# Draw Your Hero

**A child's paper drawing becomes the hero of a story they make up out loud with their Fire TV.**

Draw a hero on paper. Scan the QR code on the TV with a phone and snap a photo: the drawing is cut out of the paper right on the phone and appears on the TV as the star of a narrated, illustrated picture-book story. At turning points the TV asks the child what happens next. They answer in their own words on the phone (or pick with the remote), and the story is written around their answer.

Built for the **Fire TV track** of *Build, Ship, Shape: Amazon Developer Hackathon 2026*, on **Vega OS** with React Native, plus the **AWS Builder** mini challenge.

> Status: work in progress during the hackathon. This README will grow a demo video, architecture diagram and judge's guide before submission.

## Try it in two minutes (no AWS account, no Fire TV)

```bash
cd server
npm install
npm start
```

Open http://localhost:8787 in a desktop browser. That is the TV app (web build): arrow keys and Enter act as the remote.

- **Remote only:** press Enter on **Try it with our hero**, then pick ideas and answers with the arrow keys.
- **With a phone:** the phone must reach your computer over HTTPS (needed for camera and microphone). Run `cloudflared tunnel --url http://localhost:8787`, set `PUBLIC_URL` in `server/.env` to the `https://…trycloudflare.com` address, restart, and open that address on the computer. Scan the QR code with your phone.

Without AWS the server runs in **demo mode**: the built-in story template still uses the child's own idea and answers.

## Live AI mode (Amazon Bedrock + Amazon Polly)

1. `cp server/.env.example server/.env`, then set `MODE=aws` and your `AWS_REGION`.
2. Provide AWS credentials (environment variables or an AWS profile).
3. Run `npm run check:aws` in `server/` to verify Bedrock and Polly access. Keep `IMAGE_MODE=none`: the scenes are painted layers served by the story service (Nova Canvas reached end of life on 30 Sep 2026).

| AWS service | What it does here |
| --- | --- |
| Amazon Bedrock, Amazon Nova Lite | Reads the child's drawing (vision) and writes each part of the story as structured JSON, weaving in the child's answers |
| Amazon Bedrock Guardrails (optional) | Child-safe filter on every model input and output |
| Amazon Polly (neural) | Narrates the greeting, every page and every question; word-level speech marks drive the read-along highlighting |

## Run on Fire TV (Vega Virtual Device)

Requires the Vega SDK on macOS or Ubuntu.

1. Put the story service's HTTPS address in `packages/shared-ui/src/story/serverConfig.ts` (`DEFAULT_SERVER_URL`).
2. From the repo root: `yarn install`, then `yarn build:vega`.
3. `vega virtual-device start`, then run the `.vpkg` from `apps/vega/build/` with `vega run-app <path-to-vpkg> com.drawyourhero.tv.main`.

## Host it on AWS (one template)

`infra/draw-your-hero.yaml` deploys the whole service with CloudFormation: CloudFront
(HTTPS + WebSockets) in front of a small EC2 server, S3 for media (deleted after a day),
DynamoDB for hero memory (TTL), Bedrock + Polly through an IAM role, CloudWatch logs,
metrics, dashboard and self-healing alarms, and an AWS Budget. See [docs/DEPLOY.md](docs/DEPLOY.md).

## How it is built

```
phone (web page)  ──photo cut-out, voice──▶  story service (Node.js)  ──pages, audio──▶  Fire TV app (React Native for Vega)
                                                  │
                                       Bedrock (Nova Lite) · Guardrails · Polly
```

- `server/`: story service. Pairs one TV with phones (WebSocket rooms + QR code), runs the AI pipeline, streams pages to the TV as soon as each is painted and narrated, deletes all media after 24 hours.
- `server/public/phone/`: the phone page. Paper cut-out runs on the phone (adaptive paper detection, outline gap-closing, sticker border); voice via the browser's speech recognition with a typing fallback.
- `tools/scene-art/`: paints the 15 story settings (meadow, forest, ocean, space, castle…) as four parallax layers each plus the sparkle, firefly, bubble and light-ray sprites, rendered to `server/assets`. Run `node tools/scene-art/render.mjs` to regenerate.
- `packages/shared-ui/src/story/`: the TV experience, shared by the Vega app (`apps/vega`) and the Expo app for Fire OS and web (`apps/expo-multi-tv`). Remote-first focus with `react-tv-space-navigation`; narration via the W3C media `AudioPlayer` on Vega.

## Privacy and safety

- Drawings, paintings and narration are deleted after 24 hours. No accounts, no names, no faces.
- Story text is checked by a word filter, strict storyteller rules and (optionally) Bedrock Guardrails.

## Credits and license

MIT licensed. The TV app is built on Amazon's [react-native-multi-tv-app-sample](https://github.com/AmazonAppDev/react-native-multi-tv-app-sample) (MIT-0).
