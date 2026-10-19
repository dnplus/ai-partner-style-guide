import test from 'node:test';
import assert from 'node:assert/strict';
import {siteRedirect} from '../lib/site-host.ts';

test('pages on the old workers.dev address move to the site domain, path and query kept', () => {
  for (const path of ['/', '/types?lang=en', '/c/abcdefghijklmnopqrstuv', '/vs/a/b', '/og?type=INTJ', '/llms.txt'])
    assert.equal(siteRedirect('https://agent-mbti.dnplus.workers.dev' + path), 'https://urai.dnplus.dev' + path);
});

test('an agent mid-run keeps posting to the old origin, and the site domain is never redirected', () => {
  for (const url of ['https://agent-mbti.dnplus.workers.dev/api/collect/x', 'https://agent-mbti.dnplus.workers.dev/collector/collect.py', 'https://urai.dnplus.dev/', 'http://127.0.0.1:5188/types'])
    assert.equal(siteRedirect(url), null, url);
});
