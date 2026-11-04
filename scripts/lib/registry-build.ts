import { readdir } from "node:fs/promises";
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

interface ItemFile {
  path: string;
  type: string;
  target?: string;
  content?: string;
}

interface ItemJson {
  name: string;
  files: ItemFile[];
  [key: string]: unknown;
}

/**
 * The registry index shadcn's directory expects at the registry root: every
 * item with its files listed but no `content`, which stays in <name>.json.
 */
export async function buildRegistryIndex(): Promise<string> {
  const dir = join(ROOT, "registry");
  const names = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const items = await Promise.all(
    names.map(async (fileName) => {
      const item = (await Bun.file(join(dir, fileName)).json()) as ItemJson;
      const { $schema: _schema, ...rest } = item;
      return {
        ...rest,
        files: item.files.map(({ content: _content, ...file }) => file),
      };
    }),
  );
  const index = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "scrollsheet",
    homepage: "https://scrollsheet.dev",
    items,
  };
  return `${JSON.stringify(index, null, 2)}\n`;
}
