# RecurringExpenseLambda — External AWS Repo

This Lambda lives in the external `bananasplit-tgbot` AWS repo, NOT this monorepo. EventBridge Scheduler invokes it for each recurring-expense fire; it forwards an HMAC-signed POST to the Vercel webhook.

## Handler

```ts
import crypto from "node:crypto";

const URL = process.env.RECURRING_EXPENSE_WEBHOOK_URL!;
const SECRET = process.env.RECURRING_EXPENSE_WEBHOOK_SECRET!;

interface SchedulerEvent {
  templateId: string;
  occurrenceDate: string; // AWS substitutes <aws.scheduler.scheduled-time>
}

export const handler = async (event: SchedulerEvent) => {
  const { templateId, occurrenceDate } = event;
  if (!templateId || !occurrenceDate) throw new Error("missing fields");

  // HMAC over `${templateId}|${occurrenceDate}` — including the occurrence
  // date in the signed payload prevents a captured signature from being
  // replayed against a different occurrenceDate for the same template.
  const signature = crypto
    .createHmac("sha256", SECRET)
    .update(`${templateId}|${occurrenceDate}`)
    .digest("hex");

  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Recurring-Signature": signature,
    },
    body: JSON.stringify({ templateId, occurrenceDate }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webhook ${res.status}: ${body}`);
  }

  return { ok: true, status: res.status };
};
```

## Env vars (set in the Lambda's configuration)

- `RECURRING_EXPENSE_WEBHOOK_URL` — fully-qualified URL of the Vercel endpoint, e.g. `https://<lambda-app>.vercel.app/api/internal/recurring-expense-tick`
- `RECURRING_EXPENSE_WEBHOOK_SECRET` — must MATCH the value set in Vercel env. 32+ byte hex (e.g. `openssl rand -hex 32`).

## IAM

This Lambda needs no AWS-side permissions beyond the default execution role (CloudWatch Logs). It only makes outbound HTTPS calls.

## EventBridge Scheduler integration

The schedule's `Target.Arn` is this Lambda's ARN. The schedule's `Target.Input` is a JSON string `{ templateId, occurrenceDate: "<aws.scheduler.scheduled-time>" }` — AWS substitutes the placeholder at fire time. The Scheduler-side IAM role (`AWS_EVENTBRIDGE_SCHEDULER_ROLE_ARN`) needs `lambda:InvokeFunction` on this Lambda's ARN added to its policy.

## Output of the deployment

After deploying this Lambda, set the following env var in the **monorepo's** Vercel project (`apps/lambda`):

```
AWS_RECURRING_EXPENSE_LAMBDA_ARN=arn:aws:lambda:ap-southeast-1:<account>:function:RecurringExpenseLambda
```
