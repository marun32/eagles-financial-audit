import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policyRoot = resolve(siteRoot, "../../policies");
const files = [
  ["eagles_expense_policy_v1.md", "expense"],
  ["eagles_settlement_policy_v1.md", "settlement"],
  ["lccl_2026_fee_schedule.md", "league"],
  ["wmcl_2026_fee_schedule.md", "league"],
];
const sections = [];
for (const [file, policyType] of files) {
  const source = readFileSync(resolve(policyRoot, file), "utf8");
  const headings = [...source.matchAll(/^## ([A-Z][A-Z0-9-]+): (.+)$/gm)];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    sections.push({ section_id: heading[1], title: heading[2], body: source.slice(start, end).trim(), policy_type: policyType, version: 1 });
  }
}
writeFileSync(resolve(siteRoot, "lib/policy-seed.json"), `${JSON.stringify(sections, null, 2)}\n`);
console.log(`Generated ${sections.length} policy sections`);
