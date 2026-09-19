import assert from "node:assert/strict";
import { test } from "node:test";
import { appDatabaseUrl } from "@/db/url";

const at = (port: number) => `postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:${port}/postgres?sslmode=require`;

test("the app refuses the session pooler, loudly, and accepts the transaction pooler", () => {
  assert.throws(() => appDatabaseUrl(at(5432)), /session pooler/);
  assert.equal(appDatabaseUrl(at(6543)), at(6543));
  assert.throws(() => appDatabaseUrl(undefined), /not set/);
});
