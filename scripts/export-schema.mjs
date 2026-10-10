import { writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { submissionSchema } from '../lib/contract.ts';
import {collectorScopeSchema} from '../lib/collector-scope.ts';
await writeFile(new URL('../public/collector-scope-schema.json',import.meta.url),JSON.stringify(zodToJsonSchema(collectorScopeSchema,{name:'CollectorScopeV1',$refStrategy:'none'}),null,2)+'\n');
const schema = zodToJsonSchema(submissionSchema, { name: 'AgentWorkstyleSummaryV2', $refStrategy: 'none' });
await writeFile(new URL('../public/collector-schema.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n');
console.log('Wrote collector JSON schema. The server derives assessment when it builds the report.');
