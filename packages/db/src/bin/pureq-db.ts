#!/usr/bin/env node
import { printValidationReport, validateTablePolicy } from "../cli/index.js";
import { Table } from "../schema/dsl.js";
import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "validate") {
    const pattern = args[1] || "**/*.schema.{ts,js}";
    console.log(`pureq-db validate: Scanning for ${pattern}...`);
    
    const files = await glob(pattern, { ignore: 'node_modules/**' });
    const allResults = [];

    for (const file of files) {
      const fullPath = path.resolve(process.cwd(), file);
      try {
        // Simple heuristic to find Table exports. 
        // In a real CLI, we might use TS compiler API or require specific export names.
        const module = await import(`file://${fullPath}`);
        for (const val of Object.values(module)) {
          if (val instanceof Table) {
            const results = validateTablePolicy(val);
            allResults.push(...results);
          }
        }
      } catch (e) {
        console.warn(`⚠️  Failed to import ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    printValidationReport(allResults);
    if (allResults.some(r => r.severity === "error")) {
      process.exit(1);
    }
  } else if (command === "seed") {
    console.log("pureq-db seed: Executing seeding logic...");
    const seedFile = args[1] || "seed.ts";
    const fullPath = path.resolve(process.cwd(), seedFile);
    if (!fs.existsSync(fullPath)) {
        console.error(`Error: Seed file ${seedFile} not found.`);
        process.exit(1);
    }
    try {
        await import(`file://${fullPath}`);
        console.log("✅ Seeding completed.");
    } catch (e) {
        console.error(`❌ Seeding failed: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
    }
  } else {
    console.log("Usage: pureq-db <command> [options]");
    console.log("Commands:");
    console.log("  validate [pattern]   Scan schemas for policy coverage (default: **/*.schema.ts)");
    console.log("  seed [file]           Run database seeding script (default: seed.ts)");
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
