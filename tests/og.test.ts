import test from "node:test";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import coverage from "../lib/og-fonts.json" with {type: "json"};
import {ogFontText, ogFontFile} from "../lib/og-text.ts";

test("the committed preview fonts cover every fixed preview string; rerun npm run og:fonts after changing them", () => {
  assert.deepEqual(coverage, ogFontText());
  for (const family of Object.keys(coverage)) assert.ok(existsSync("public" + ogFontFile(family)), family);
});
