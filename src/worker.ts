import 'dotenv/config';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities/suppliers';

async function run(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? 'localhost:7233';
  const connection = await NativeConnection.connect({ address });
  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? 'default',
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? 'hotel-offer-task-queue',
    workflowsPath: require.resolve('./workflows/hotelWorkflow'),
    activities,
  });
  console.info('Temporal worker started');
  await worker.run();
}

run().catch((error: unknown) => {
  console.error('Temporal worker failed', error);
  process.exit(1);
});
