---
name: agent-mbti-collector
description: Scan local agent logs with the verified collect.py and submit one minimal Agent MBTI observation.
---

# Submit one Agent MBTI observation

This is a record of how the user directs a coding agent. The letters use the custom rubric `agent-workstyle-v1`. This is not an official MBTI assessment, not a psychological diagnosis, and not a claim that a model has a fixed personality. The site checks that the summary is internally consistent. It cannot check the logs that stay on this machine.

You run `public/collector/collect.py`. You do not write a scanner, and you do not walk the disk looking for logs.

## Show one confirmation

The prompt already names the destination, the session, the nickname, the expiry, the write token, and the scope. Do not ask the user to pick sources, dates, or a Tokscale mode.

Show the confirmation paragraph from the prompt. Wait for one explicit yes. That yes sets both `localAnalysisApproved` and `aggregateUploadApproved` to true. Before the yes, leave both false and do not run the script. After the yes, do not ask for a second confirmation, and do not print the type or the full summary in the terminal.

A resumed prompt is a new destination. The previous yes does not cover it. Show the new confirmation and wait again. Then submit the summary you already have. Do not scan again.

## Verify the script

Download `{origin}/collector/collect.py`. Compute its SHA-256 and compare it to the hash in the prompt.

```
shasum -a 256 collect.py
```

If the hash differs, stop. Do not edit the script. It uses the Python 3 standard library only.

## Run the scan

Use the scope line from the prompt. `TOKSCALE_MODE` is `off`, `existing`, or `install`.

```
python3 collect.py scan --from FROM --to TO --tz TZ --sources SOURCES --tokscale TOKSCALE_MODE --out digest.json
```

The window is whole local days. `from` is local midnight of the first day. `to` is now. A timestamp counts when `from <= timestamp < to`. The script lists candidate log files from each adapter root without reading them, keeps regular files whose modification time is inside that window, and skips symbolic links. It then reads a spread of those files until it has 24 candidates or the time budget runs out. The default budget is 20 seconds. Pass `--budget-seconds` to change it. Each text log is read only through the first 2 MB. SQLite logs use a bounded query. Do not add skipped files back, and do not treat modification time as a message timestamp. A Cursor transcript with no timestamps counts only when both its creation time and its modification time are inside the window.

The script writes `digest.json` with mode `0600` as soon as sampling finishes, then starts Tokscale. Tokscale keeps running after the scan exits. Read the digest. Do not paste it into the chat, and do not upload it. The terminal prints candidate counts, files read, digest size, timing, and whether Tokscale started.

Copy `observedPeriod`, `coverage`, and `metrics` into the summary unchanged. The digest token fields are empty at this point. `tokenSource` is `unavailable`, both token counts are null, and `modelUsage` is empty. Leave those fields as copied. Do not fill token totals from the logs. Submit replaces them from the Tokscale output.

`observedPeriod` is the local dates the script actually saw. It can be narrower than the granted window. Task dates have to fall inside it.

`coverage.scope` is `partial` whenever a gap remains or the budget or a read cap stops the sample early, and `insufficient` when no candidate was kept. This script always records `web_history_unavailable` and `no_artifact_inspection`, so a scan that kept a candidate stays `partial`. Do not rewrite `partial` to `adequate`.

Gaps you may see:

- `web_history_unavailable`. Browser history was not read.
- `no_artifact_inspection`. Project files were not opened.
- `no_tokscale`. Token totals were not available.
- `partial_window`. A chat log had no per-line times, and the session was not fully inside the window.
- `unattributed_runs`. A record had no usable timestamp. Cursor transcripts often have none.
- `insufficient_records`. No sampled file had two human messages and an agent turn inside the window.
- `other_sources_missing`. A requested source has no local adapter here, or its log root is missing. `antigravity` and `chatgpt` have no local adapter.

Grok, OpenCode, and Hermes count as `other`. `sampledSessions` is the number of files the script actually read. It is not the candidate count. `humanSessions`, `automatedSessions`, `subagentSessions`, and `userMessages` stay null. Leave them null.

Token totals come only from Tokscale, grouped by client and model, for the local dates of the window. Null stays null. Do not copy token totals out of local logs, and do not replace null with zero. When `tokenSource` is `unavailable`, both token counts stay null and `modelUsage` stays empty. When `modelUsageUnit` is `unknown`, `modelUsage` stays empty. A tie, or a zero count, makes `mostUsedModelFamily` or `mostUsedClient` `unknown`.

The script uses a `tokscale` binary that is already on `PATH` for `existing` and for `install`. Only `install`, and only when that binary is missing, runs `npm exec --yes @tokscale/cli@4.18.0` once. If that binary is missing, or Tokscale fails, the digest keeps `tokenSource` `unavailable`, null token counts, and gap `no_tokscale`. Do not install Tokscale yourself. Do not run its TUI, `login`, `usage`, `sync`, `submit`, or `autosubmit`. Do not pass `sudo`.

## Classify from agent turns

`candidates` holds at most 24 sessions, refs `C01` through `C24`. Each one has at least two human messages and both roles. Each turn has `n`, `role` of `user` or `agent`, `kind` of `message` or `tool`, and redacted `text` cut to about 200 characters.

Build tasks `T001` through `T024`. One independent user goal is one task. Do not split turns, retries, or subtasks of that same goal into extra tasks. Each task has only `id`, `date`, `source`, and `context`. `context` is `research`, `build`, `writing`, `planning`, `support`, or `other`. `date` is inside `observedPeriod` and is not in the future. `source` is one of `coverage.sources`.

Build observations `O001` through `O048`. Each one cites a task and records `behavior`, `ownerRequest`, and `opportunity`.

Record a behavior only when an agent turn shows that choice. A user request does not show the behavior. Name the turn `n` in your own notes, then leave the note out of the JSON. If you cannot point at an agent turn, do not add the observation. Do not infer hidden thinking.

`ownerRequest` uses a behavior code on the same axis, or `not_specified` when the user named no direction, or `unknown` when you cannot tell. `opportunity` is `both_available` when both ends were realistically open, `constrained` when the situation was forced, or `unclear` when you cannot tell. A required approval, a platform flow, a tool failure, or a blocked clarification is `constrained`.

On one task, each axis gets at most one observation per direction. A repeated observation in the same direction adds no weight. You may record the two opposite directions when both actually happened.

These pairs are the axes.

| Axis | Code | What the agent turn shows |
| --- | --- | --- |
| E | `collaborative_iteration` | Enough information was available to proceed alone, and the agent still worked the choice out with the user across visible turns. |
| I | `consolidated_delivery` | Enough information was available, and the agent finished a visible organization before delivering one combined result. |
| S | `concrete_evidence` | Facing a new problem, the agent started from an instance, the current state, a limit, or a concrete fact. |
| N | `pattern_exploration` | Facing a new problem, the agent started from a pattern, an alternative hypothesis, or a possibility across situations. |
| T | `consistent_criteria` | Two reasonable options conflicted, and a stable comparison rule made the call. |
| F | `people_context` | Two reasonable options conflicted, and the situation, values, or needs of the people affected made the call. |
| J | `early_commitment` | Options could still stay open, and the agent fixed a route and milestones before carrying them out. |
| P | `reversible_experiments` | The route was still open, and the agent kept a reversible experiment before converging. |

A required approval is not `collaborative_iteration`. A short transcript is not `consolidated_delivery`. Tool use is not `concrete_evidence`. A wrong answer is not `pattern_exploration`. Checking a fact is not `consistent_criteria`. Politeness is not `people_context`. Following a required process is not `early_commitment`. An unreliable retry is not `reversible_experiments`.

S and N describe how a new problem was opened. A test, a check, precision, or debugging does not by itself count as `concrete_evidence`.

## Let the server score

For each axis, qualifying observations merge by task. One side counts as one task for that side. Both sides count as one mixed task. Mixed tasks sit in the eligible total and on neither side. An observation scores only when `opportunity` is `both_available`, the task source is known, and `ownerRequest` does not name the other behavior on that axis.

A side is decided only when the winner has at least 3 eligible tasks, the winner times 3 is at least the eligible total times 2, and the two sides differ by at least 2. `coverage.scope` of `insufficient` leaves every axis unknown. A 2 to 1 split, a 3 to 2 split, a tie, or too many mixed tasks stays unknown. These cuts are a conservative heuristic. They are not an accuracy, a reliability coefficient, or a trait strength. Do not tell the user a personality percentage.

Omit `assessment`. The server derives `type`, `pattern`, and `status`. Four decided letters become one of `INTJ`, `INTP`, `ENTJ`, `ENTP`, `INFJ`, `INFP`, `ENFJ`, `ENFP`, `ISTJ`, `ISFJ`, `ESTJ`, `ESFJ`, `ISTP`, `ISFP`, `ESTP`, `ESFP`, with status `complete`. Any unknown letter yields `type` null, status `incomplete`, and a pattern such as `IN?J`. Do not convert an older type, a usage level, or a title. Card art does not enter the score.

Letter names follow the Myers & Briggs Foundation pages [The MBTI preferences](https://www.myersbriggs.org/my-mbti-personality-type/the-mbti-preferences/) and [The 16 MBTI types](https://www.myersbriggs.org/my-mbti-personality-type/the-16-mbti-personality-types/). The axis rules, the cuts, and the descriptions belong to `agent-workstyle-v1`. They do not use an official instrument.

## Usage level evidence

`usageEvidence` is optional and separate from the letters, the tokens, the client, and the model. Send `version` `usage-level-v1` and at most 64 observations. Each observation has `task`, `signal`, and when needed an abstract `artifact` from `A01` to `A12` or `workflow` from `W01` to `W08`. Do not send real names, contents, or paths. Omit `usageEvidence` when you saw none of these facts. The server computes the level. Do not send a level number, and do not fill a high level because evidence is missing.

Record only a fact you can see in the granted records. No inspection record is not `unchecked_adoption`. Do not open artifacts the grant did not already include.

- `unchecked_adoption`. A result needed a check, and it was adopted without that check.
- `retry_after_error`. An error was recognized, and a retry followed.
- `useful_result_verified`. The result of a task was confirmed usable.
- `context_scoped`, `acceptance_defined`, and `targeted_correction_verified`. The same task bounded the context, stated what done means, and verified a specific correction.
- `artifact_inspected`, `artifact_tested`, and `artifact_reused`. The same artifact id was inspected, tested, and reused on a different task, with inspect date, then test date, then reuse date.
- `workflow_operated`, `roles_defined`, `acceptance_defined`, `exceptions_handled`, `maintenance_verified`, and `feedback_integrated`. These belong on a workflow id. `artifact_*` requires `artifact`. The workflow signals other than `acceptance_defined` require `workflow`.

The server can reach level 2 from `useful_result_verified` on two independent tasks. Level 3 needs `context_scoped`, `acceptance_defined`, and `targeted_correction_verified` on one task. Level 4 needs the artifact order above. Level 5 needs two workflows that share no tasks. Each of those workflows needs at least three `workflow_operated` tasks spanning at least 14 days, all five companion signals, and `maintenance_verified` after the first operated date. Anything short of a level stays empty.

## Build the summary

Read `{origin}/collector-schema.json`. Keep only fields it allows. `version` is `2.0`. `kind` is `observed` for this grant. `fixture` is only for an example that is not a real submission. `nickname` matches the session nickname exactly.

The summary contains no transcript text, code, file paths, task titles, links, secrets, email addresses, or free-text notes. The site collects email. You do not send it. The body must be at most 24 KiB.

Validate the JSON against the schema before you submit. A future `observedPeriod.to` is rejected. Task ids and observation ids are unique. Every observation points at a task. `ownerRequest`, when it is a behavior code, is on the same axis as `behavior`.

## Submit with the write token

The write token is 64 hex characters from the prompt. Pass it as the only line on stdin. Keep it out of argv, shell history, the summary, the idempotency file, logs, and the chat.

```
python3 collect.py submit --origin ORIGIN --session SESSION --summary summary.json --digest digest.json
```

Submit waits up to 20 seconds for the Tokscale output beside that digest. Pass `--wait-seconds` to change the wait. It writes `inputTokens`, `outputTokens`, `tokenSource`, `modelUsage`, `modelUsageUnit`, `mostUsedModelFamily`, and `mostUsedClient` from that output only. It also adds Tokscale clients from the scan to `coverage.sources`. Numbers already in the summary are ignored. If Tokscale is still running at the deadline, submit stops that process, leaves both token counts null, sets `tokenSource` to `unavailable`, and adds gap `no_tokscale`. The script prints `tokscale_wait_seconds` and `tokens_filled` before the HTTP line.

The script writes `summary.json.idempotency` with mode `0600` before the POST and reuses that key on a retry. Leave the file. Do not mint a new key to replace a stored result. The POST goes to `{origin}/api/collect/{session}` with `Content-Type: application/json`, `Authorization: Bearer`, and `Idempotency-Key`. Redirects are disabled. The script retries only a dropped connection or HTTP 503, twice, after 1 second and then 2 seconds.

Read the printed HTTP outcome.

- `http 201`. The summary was stored.
- `http 200`. The same key and the same body were already stored.
- `http 409`. A different result is already stored. Stop. Do not change the key.
- `http 404` or `http 410`. The session is expired, or the rules require a new observation. Stop.
- `http 422`. The summary or the nickname was rejected. Fix the summary and submit again. The server has not stored the key yet.
- `http 413` or `http 400`. The body or the key was refused. Shrink the body to 24 KiB and keep the key valid. Do not add fields.
- `http 302`, or any other redirect status. Stop. Do not follow the `Location`.
- `http 503` or `network_error` after the retries. Tell the user the submit did not land. Keep the summary and the key.

A general 401 or 403 is not a reason to change credentials or widen access. There is no site-wide token. This write token can post status and can submit one summary for this session. It cannot read or list results.

## Report progress

Post a phase only when it actually changes.

```
python3 collect.py status --origin ORIGIN --session SESSION --sequence N --phase PHASE
```

`N` is an integer from 1 to 1000 and increases. `PHASE` is `analyzing`, `validating`, `submitting`, or `paused`. For those phases the script sends `approvalKind` null. Use `awaiting_host_approval` only when the host tool says it is waiting, and pass `--approval-kind` as `local_read`, `network`, or `command`. A generic 403 or a dropped connection is not that wait.

Retry a progress post with the same sequence and the same phase. Do not bump the sequence to refresh the clock. `duplicate: true` means the original event was stored. An older sequence, or the same sequence with a different body, returns 409. You cannot declare `complete`. Only a stored summary does that. Progress does not extend the 30 minute expiry.

The site shows the last phase it received. After 90 seconds without a new phase it says progress has paused, which can mean the work continues or has stopped. If a network approval blocks the status call, say that once in the terminal. Do not invent a percentage or a heartbeat.

## After expiry

Stop when the script prints `http 404` or `http 410`, or when the local clock is past the expiry in the prompt. Do not stretch the old link, and do not switch destination on your own.

You may keep the summary, mode `0600`, in the granted local scope. You may also keep it in the current conversation memory. Do not store the write token or the raw logs in that checkpoint. Keep the idempotency file beside the summary for a retry of the same session.

Ask the user to choose "reuse this analysis, new link" on the site. The next prompt names a new destination and needs its own yes. Submit the same summary there. If you no longer have the summary, the new confirmation has to name the sources and the period again, and the scan stays inside that grant.

## Optional local preview

Run this only when the user separately asks to inspect the summary.

```
node scripts/review-collector.ts --approved-input summary.json preview.json
```

The tool reads that JSON only. It uses no network and does not scan sessions. It recomputes the type into a new mode `0600` file and leaves `aggregateUploadApproved` false. The terminal does not print the type. This is not a second approval, and it grants nothing.
