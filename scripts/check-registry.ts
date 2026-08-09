#!/usr/bin/env bun
/**
 * Registry smoke test: nothing else validates registry/*.json against the
 * shadcn registry-item schema before it ships — sync-static.ts is a pure
 * byte copy, and a broken item would only surface when a consumer runs
 * `shadcn add` and it fails. Checks structure and required fields only, not
 * the full JSON Schema (no new deps).
 */
export {}; // top-level await requires this file to be a module, not a script

import { readdir } from "node:fs/promises";
import { join } from "node:path";

interface RegistryFile {
  path: string;
  content: string;
  type: string;
  target: string;
}

interface RegistryItem {
  $schema: string;
  name: string;
  type: string;
  title: string;
  description: string;
  author: string;
  dependencies: string[];
  registryDependencies?: string[];
  files: RegistryFile[];
}

const REGISTRY_DIR = join(import.meta.dir, "..", "registry");
const REQUIRED_STRING_FIELDS = [
  "$schema",
  "name",
  "type",
  "title",
  "description",
  "author",
] as const;

const errors: string[] = [];
const names = new Set<string>();

const entries = (await readdir(REGISTRY_DIR)).filter((f) => f.endsWith(".json"));
if (entries.length === 0) {
  console.error(`scrollsheet: no registry/*.json files found in ${REGISTRY_DIR}`);
  process.exit(1);
}

const items = new Map<string, RegistryItem>();

for (const fileName of entries) {
  const path = join(REGISTRY_DIR, fileName);
  const raw = await Bun.file(path).text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    errors.push(`${fileName}: invalid JSON — ${message}`);
    continue;
  }

  const item = parsed as Partial<RegistryItem>;

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof item[field] !== "string" || item[field]!.length === 0) {
      errors.push(`${fileName}: missing or empty required field "${field}"`);
    }
  }

  if (item.name && item.name !== fileName.replace(/\.json$/, "")) {
    errors.push(`${fileName}: "name" ("${item.name}") does not match the file name`);
  }

  if (item.name) {
    if (names.has(item.name)) {
      errors.push(`${fileName}: duplicate registry item name "${item.name}"`);
    }
    names.add(item.name);
  }

  if (!Array.isArray(item.dependencies) || item.dependencies.length === 0) {
    errors.push(`${fileName}: "dependencies" must be a non-empty array`);
  } else if (!item.dependencies.includes("scrollsheet")) {
    errors.push(`${fileName}: "dependencies" must include "scrollsheet"`);
  }

  if (item.registryDependencies !== undefined && !Array.isArray(item.registryDependencies)) {
    errors.push(`${fileName}: "registryDependencies" must be an array when present`);
  }

  if (!Array.isArray(item.files) || item.files.length === 0) {
    errors.push(`${fileName}: "files" must be a non-empty array`);
  } else {
    for (const [i, file] of item.files.entries()) {
      if (typeof file.path !== "string" || file.path.length === 0) {
        errors.push(`${fileName}: files[${i}].path is missing or empty`);
      }
      if (typeof file.content !== "string" || file.content.trim().length === 0) {
        errors.push(`${fileName}: files[${i}].content is missing or empty`);
      }
      if (typeof file.type !== "string" || file.type.length === 0) {
        errors.push(`${fileName}: files[${i}].type is missing or empty`);
      }
      if (typeof file.target !== "string" || file.target.length === 0) {
        errors.push(`${fileName}: files[${i}].target is missing or empty`);
      }
    }
  }

  if (item.name) items.set(item.name, item as RegistryItem);
}

// registryDependencies must resolve to another item actually in this registry
// (cross-registry URLs aren't used here, so every reference is local).
for (const [name, item] of items) {
  for (const dep of item.registryDependencies ?? []) {
    if (!items.has(dep)) {
      errors.push(`${name}.json: registryDependencies references unknown item "${dep}"`);
    }
  }
}

if (errors.length > 0) {
  console.error(`scrollsheet: registry validation failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✔ registry/ valid: ${[...names].sort().join(", ")}`);
