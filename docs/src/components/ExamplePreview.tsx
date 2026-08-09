import { examples } from "../../../examples/index";

interface Props {
  name: string;
}

/**
 * Astro's client:* hydration directives need a single, statically-known
 * import to attach the hydration script to. A component reference resolved
 * dynamically per loop iteration (`entry.component`) trips
 * NoMatchingImport. This is that one static import: it looks the component
 * up from the manifest at render time instead, so index.astro can still
 * drive the whole grid off `examples` in a single .map().
 */
export default function ExamplePreview({ name }: Props) {
  const entry = examples.find((e) => e.name === name);
  if (!entry) return null;
  const Example = entry.component;
  return <Example />;
}
