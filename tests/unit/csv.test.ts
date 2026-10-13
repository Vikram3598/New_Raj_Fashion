import { describe, expect, it } from "vitest";
import { csvCell, csvDocument, parseCsv } from "@/lib/csv";

describe("CSV import/export helpers", () => {
  it("parses quoted delimiters, escaped quotes, and embedded newlines", () => {
    expect(parseCsv('sku,name\r\nA1,"Saree, silk"\r\nA2,"Line one\nLine ""two"""')).toEqual([
      ["sku", "name"],
      ["A1", "Saree, silk"],
      ["A2", 'Line one\nLine "two"'],
    ]);
  });

  it("quotes cells and prevents spreadsheet formula execution", () => {
    expect(csvCell('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvDocument(["sku", "name"], [["A1", "Cotton shirt"]])).toBe('"sku","name"\r\n"A1","Cotton shirt"');
  });
});
