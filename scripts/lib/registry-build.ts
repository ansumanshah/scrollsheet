import { join } from "node:path";
import { sourceItems, type RegistrySourceItem } from "../../registry/src/manifest";

const ROOT = join(import.meta.dir, "..", "..");
const AUTHOR = "Ansuman Shah <https://github.com/ansumanshah>";

/** Builds the registry-item JSON for one manifest entry, embedding its source files. */
export async function buildRegistryItem(item: RegistrySourceItem): Promise<string> {
  const files = await Promise.all(
    item.files.map(async (file) => ({
      path: `registry/${item.name}/${file.src}`,
      content: await Bun.file(join(ROOT, "registry", "src", item.name, file.src)).text(),
      type: "registry:ui",
      target: file.target,
    })),
  );
  const json = {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: item.name,
    type: "registry:ui",
    title: item.title,
    description: item.description,
    author: AUTHOR,
    dependencies: item.dependencies,
    ...(item.registryDependencies ? { registryDependencies: item.registryDependencies } : {}),
    files,
  };
  return `${JSON.stringify(json, null, 2)}\n`;
}

export function registryJsonPath(name: string): string {
  return join(ROOT, "registry", `${name}.json`);
}

export { sourceItems };
