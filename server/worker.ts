import 'dotenv/config';
import { serviceDb } from './db.js';
import { runSync } from './sync.js';
if (!process.env.YOUTUBE_API_KEY) {
  console.error('YOUTUBE_API_KEY ausente.');
  process.exitCode = 1;
} else {
  try {
    console.log(
      await runSync(serviceDb(), {
        mode: process.argv.includes('--incremental') ? 'incremental' : 'full',
      }),
    );
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'Falha na sincronização');
    process.exitCode = 1;
  }
}
