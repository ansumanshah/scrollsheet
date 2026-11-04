#!/usr/bin/env bun
/** Regenerates registry/<name>.json for every item authored under registry/src/. */
import { buildRegistryItem, registryJsonPath, sourceItems } from "./lib/registry-build";

for (const item of sourceItems) {
  await Bun.write(registryJsonPath(item.name), await buildRegistryItem(item));
  console.log(`wrote registry/${item.name}.json`);
}
