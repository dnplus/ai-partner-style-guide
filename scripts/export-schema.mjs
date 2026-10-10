import { writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { submissionSchema } from '../lib/contract.ts';
const schema = zodToJsonSchema(submissionSchema, { name: 'AIUsageSummary', $refStrategy: 'none' });
await writeFile(new URL('../public/collector-schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
console.log('Wrote collector JSON schema. Cross-field assessment validation remains authoritative on the server.');
