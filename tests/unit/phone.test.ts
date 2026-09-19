/**
 * Phone normalization and hashing. Two spellings of one phone must hash the same, or a picked ghost silently
 * never binds. Numbers are fictional (US 555-01xx, the UK drama range).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { JwtVerifiedCredentialFormatEnum, JwtVerifiedCredentialToJSON } from "@dynamic-labs/sdk-api-core";
import { phoneOf } from "@/lib/auth/jwt";
import { hashPhone, normalizeE164, regionFromHeaders, tryHashPhone } from "@/lib/auth/phone";

const hex = (b: Buffer) => b.toString("hex");
// The credential is built by Dynamic's own serializer, not by hand. The first version of this helper spelled
// the keys the way the code under test read them (snake_case), so the tests agreed with the code and both
// were wrong: Dynamic sends phoneNumber and phoneCountryCode in camelCase.
const login = (code: string, national: string) =>
  phoneOf({
    sub: "u",
    verified_credentials: [JwtVerifiedCredentialToJSON({ id: "c", format: JwtVerifiedCredentialFormatEnum.PhoneNumber, phoneNumber: national, phoneCountryCode: code, isoCountryCode: "US", signInEnabled: true })],
  } as never);
const US = ["(212) 555-0142", "212-555-0142", "212.555.0142", "2125550142", "1 212 555 0142", "+1 212 555 0142", "+12125550142"];

test("seven US spellings of one number give one hash", () => {
  assert.equal(new Set(US.map((s) => hex(hashPhone(s, "US")))).size, 1);
});

test("a national-format contact normalizes with its country code", () => {
  assert.equal(normalizeE164("(212) 555-0142", "US"), "+12125550142");
});

test("a US login normalizes to E.164", () => {
  assert.equal(login("1", "2125550142"), "+12125550142");
});

test("the login hash equals the saved-contact hash", () => {
  const l = login("1", "2125550142");
  assert.ok(l);
  assert.equal(hex(hashPhone(l)), hex(hashPhone("(212) 555-0142", "US")));
});

test("the hash is keyed by the salt", () => {
  const before = hex(hashPhone("+12125550142"));
  const salt = process.env.PHONE_HASH_SALT;
  process.env.PHONE_HASH_SALT = `${salt}x`;
  try {
    assert.notEqual(hex(hashPhone("+12125550142")), before);
  } finally {
    process.env.PHONE_HASH_SALT = salt;
  }
});

test("two different numbers hash differently", () => {
  assert.notEqual(hex(hashPhone("+12125550142")), hex(hashPhone("+12125550143")));
});

test("UK national and international spellings agree in region GB", () => {
  assert.equal(new Set(["020 7946 0018", "+44 20 7946 0018", "+442079460018"].map((s) => hex(hashPhone(s, "GB")))).size, 1);
});

test("a UK login matches them", () => {
  assert.equal(hex(hashPhone(login("44", "2079460018") ?? "")), hex(hashPhone("020 7946 0018", "GB")));
});

test("a +7 number whose national part starts with 7 keeps its country code", () => {
  assert.equal(login("7", "7012345678"), "+77012345678");
});

test("the same national digits read differently in different regions", () => {
  assert.equal(normalizeE164("2125550142", "US"), "+12125550142");
  assert.equal(tryHashPhone("2125550142", "GB"), null);
});

test("garbage does not hash", () => {
  assert.equal(tryHashPhone("call me maybe"), null);
  assert.equal(tryHashPhone("123"), null);
  assert.equal(tryHashPhone(""), null);
});

test("a national number with no region does not hash as something", () => {
  assert.equal(tryHashPhone("(212) 555-0142"), null);
});

test("a login with no phone credential yields nothing", () => {
  assert.equal(phoneOf({ sub: "u", verified_credentials: [JwtVerifiedCredentialToJSON({ id: "c", format: JwtVerifiedCredentialFormatEnum.Email, email: "x@example.com", signInEnabled: true })] } as never), undefined);
});

test("the default region comes from the platform header, US when absent", () => {
  assert.equal(regionFromHeaders(new Headers({ "x-vercel-ip-country": "gb" })), "GB");
  assert.equal(regionFromHeaders(new Headers()), "US");
  assert.equal(regionFromHeaders(new Headers({ "x-vercel-ip-country": "nonsense" })), "US");
});
