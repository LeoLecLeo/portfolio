import { describe, expect, it } from "vitest";

import { parseDecimalNumber } from "./parsing";

describe("strict decimal parsing", () => {
  it.each([
    ["1.5", 1.5],
    ["1,5", 1.5],
    [".5", 0.5],
    [",5", 0.5],
    ["  +12  ", 12],
    ["-42", -42],
  ])("parses the complete decimal string %s", (rawText, expected) => {
    expect(parseDecimalNumber(rawText)).toEqual({
      ok: true,
      value: expected,
    });
  });

  it.each([
    ["1.5e6", 1.5e6],
    ["1,5E-6", 1.5e-6],
    ["-2e+3", -2e3],
  ])("accepts scientific notation in %s", (rawText, expected) => {
    expect(parseDecimalNumber(rawText)).toEqual({
      ok: true,
      value: expected,
    });
  });

  it("treats one separator as decimal and never as grouping", () => {
    expect(parseDecimalNumber("1,234")).toEqual({
      ok: true,
      value: 1.234,
    });
  });

  it.each(["", "   "])("distinguishes a missing value %j", (rawText) => {
    expect(parseDecimalNumber(rawText)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it.each([
    "1abc",
    "1e",
    "1.",
    "0x10",
    "1_000",
    "1 000",
    "1\u00a0000",
    "1,234.56",
    "1.234,56",
    "1,2,3",
  ])("rejects partial or ambiguous syntax %s", (rawText) => {
    expect(parseDecimalNumber(rawText)).toEqual({
      ok: false,
      reason: "invalid-syntax",
    });
  });

  it.each(["NaN", "Infinity", "-Infinity", "1e309"])(
    "distinguishes a non-finite value %s",
    (rawText) => {
      expect(parseDecimalNumber(rawText)).toEqual({
        ok: false,
        reason: "non-finite",
      });
    }
  );

  it("rejects a non-zero decimal that underflows to zero", () => {
    expect(parseDecimalNumber("1e-324")).toEqual({
      ok: false,
      reason: "underflow",
    });
    expect(parseDecimalNumber("0e-999")).toEqual({ ok: true, value: 0 });
  });
});
