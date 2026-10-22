import { CloudWatchClient, PutMetricDataCommand, type MetricDatum, type StandardUnit } from '@aws-sdk/client-cloudwatch';
import { config } from './config.js';

// A few custom CloudWatch metrics so we can see how the service behaves:
// how many stories start and finish, how long the AI takes per act, and how
// often a model or voice call has to fall back. Buffered and sent once a minute.

const cw = config.metricsNamespace ? new CloudWatchClient({ region: config.region }) : undefined;
let buffer: MetricDatum[] = [];

export function metric(name: string, value = 1, unit: StandardUnit = 'Count'): void {
  if (!cw) return;
  buffer.push({ MetricName: name, Value: value, Unit: unit, Timestamp: new Date() });
  if (buffer.length >= 900) void flush();
}

async function flush(): Promise<void> {
  if (!cw || !buffer.length) return;
  const batch = buffer;
  buffer = [];
  for (let i = 0; i < batch.length; i += 500) {
    try {
      await cw.send(new PutMetricDataCommand({ Namespace: config.metricsNamespace, MetricData: batch.slice(i, i + 500) }));
    } catch (e) {
      console.warn('[metrics]', (e as Error).message);
    }
  }
}

if (cw) setInterval(() => void flush(), 60000).unref();
