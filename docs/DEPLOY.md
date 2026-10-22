# Deploy the story service on AWS

One CloudFormation template (`infra/draw-your-hero.yaml`) builds everything.
It takes about 10 minutes and needs no SSH keys or access keys.

| Piece | AWS service | Why |
|---|---|---|
| HTTPS address + WebSockets | Amazon CloudFront | A stable `https://….cloudfront.net` address for the TV, the phone and the storybook; caches the scene art at the edge. |
| Story service | Amazon EC2 (t3.small, Amazon Linux 2023) + Elastic IP | One small Node.js server holds the live rooms (WebSockets between phone and TV). |
| AI | Amazon Bedrock (Nova Lite) + Bedrock Guardrails | Reads the drawing, writes the story, keeps it child-safe. |
| Voices | Amazon Polly (generative + neural) | Narrator and character voices with word timings for read-along. |
| Drawings, audio, storybooks | Amazon S3 | Private bucket, encrypted, **lifecycle rule deletes everything after 1 day**. |
| Hero memory | Amazon DynamoDB | One row per hero (name, voice, past titles; never the drawing), **TTL deletes it after 7 days**. |
| Credentials | AWS IAM role | Least-privilege role on the server; no keys on disk. |
| Logs, metrics, alarms | Amazon CloudWatch | Server logs, custom story metrics, a dashboard, auto-recover and auto-reboot alarms. |
| Shell access | AWS Systems Manager Session Manager | Open a shell from the browser to deploy updates (`sudo dyh-update`). |
| Cost guard | AWS Budgets + Amazon SNS | Email at 80% of the monthly budget and when the forecast goes over. |

## Steps

1. Push this repository to a **public** GitHub repo (the server clones it on boot).
2. AWS console → **CloudFormation** → region **Asia Pacific (Sydney) ap-southeast-2**
   (or any region with Bedrock Nova Lite and Polly generative voices) → **Create stack** →
   **With new resources** → **Upload a template file** → `infra/draw-your-hero.yaml`.
3. Stack name `draw-your-hero`. Fill in:
   - `AlertEmail`: your email (confirm the SNS email that arrives).
   - `GuardrailId`: your Bedrock Guardrail ID (optional).
   - `RepoUrl`: your repository if it is not `oscarosk/draw-your-hero`.
4. Tick **I acknowledge that AWS CloudFormation might create IAM resources** → **Submit**.
5. When the stack shows `CREATE_COMPLETE`, open **Outputs** → `PublicUrl`.
   Give the server 2–3 more minutes to pick up its address, then open `Health`:
   it should say `{"ok":true,"mode":"aws"}`.
6. Fire TV app: put `PublicUrl` in `DEFAULT_SERVER_URL`
   (`packages/shared-ui/src/story/serverConfig.ts`) and rebuild.

## Updating the server

Push to GitHub, open the `ServerShell` output link (Session Manager), and run:

```
sudo dyh-update
```

## Cost (approximate, Sydney)

EC2 t3.small ≈ $0.026/h + Elastic IP ≈ $0.005/h → about $23/month. CloudFront, S3,
DynamoDB, CloudWatch and Budgets stay in the cents at hackathon traffic. Bedrock and
Polly are pay-per-use (a full story is a few cents); `MAX_STORIES_PER_DAY` caps it.

To remove everything: CloudFormation → `draw-your-hero` → **Delete**
(empty the S3 bucket first if it still has files).
