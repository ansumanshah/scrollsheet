import jscodeshift from "jscodeshift";
import type {
  ASTPath,
  Collection,
  ImportDeclaration,
  JSXAttribute,
  JSXOpeningElement,
} from "jscodeshift";

export type FindingKind = "ignored" | "changed" | "manual" | "info";

export interface Finding {
  file: string;
  line: number;
  column: number;
  kind: FindingKind;
  /** What was found, for example `Drawer.Root onDrag`. */
  subject: string;
  message: string;
}

export interface TransformResult {
  output: string;
  changed: boolean;
  findings: Finding[];
}

const j = jscodeshift.withParser("tsx");

/** ast-types types some `name` fields as string | Identifier; at runtime they are strings here. */
function text(name: unknown): string {
  return typeof name === "string" ? name : String((name as { name?: unknown }).name ?? "");
}

const VAUL = "vaul";
const VAUL_CSS = "vaul/style.css";
const SCROLLSHEET = "scrollsheet";
const SCROLLSHEET_CSS = "scrollsheet/styles.css";

/** Props <Drawer.Root> accepts and drops, with the nearest replacement. */
const ROOT_IGNORED: Record<string, string> = {
  setBackgroundColorOnScale:
    "scrollsheet's backgroundEffect handles the page behind; style it with CSS.",
  noBodyStyles: "The modal body freeze is scrollsheet's own and is not configurable.",
  disablePreventScroll: "Scroll locking is scrollsheet's own and is not configurable.",
  preventScrollRestoration: "Not applicable: scrollsheet does not restore scroll on close.",
  repositionInputs: "Keyboard avoidance is automatic and has no switch.",
  scrollLockTimeout: "Not applicable: there is no scroll lock timer.",
  onDrag: "Use onTravel on the same Drawer.Root for live progress.",
  container:
    "The native <dialog> always renders in the top layer, so there is no portal container.",
  fixed: "scrollsheet has a single keyboard strategy.",
  autoFocus: "The native <dialog> manages focus. Put autofocus on a field to focus it on open.",
  nested: "Nesting is automatic. Drawer.NestedRoot is an alias of Drawer.Root.",
};

/** Radix Dialog.Content props vaul forwards and scrollsheet strips. */
const CONTENT_IGNORED: Record<string, string> = {
  onPointerDownOutside:
    "To block backdrop-tap dismissal, set backdropDismissible={false} on Drawer.Root.",
  onInteractOutside:
    "To block backdrop-tap dismissal, set backdropDismissible={false} on Drawer.Root.",
  onFocusOutside: "Focus is contained by the native <dialog>, so this never fires.",
  onEscapeKeyDown: "To block Esc, set escapeDismissible={false} on Drawer.Root.",
  onOpenAutoFocus:
    "The native <dialog> manages focus. Put autofocus on a field to focus it on open.",
  onCloseAutoFocus: "The native <dialog> manages focus on close.",
  forceMount: "Content mounts when the drawer opens and unmounts after it closes.",
};

const SIDE_DIRECTIONS = new Set(["left", "right"]);

/** vaul's Drawer namespace members, and what each costs in a migration. */
const NAMESPACE_MEMBERS = new Set([
  "Root",
  "NestedRoot",
  "Content",
  "Overlay",
  "Trigger",
  "Portal",
  "Handle",
  "Close",
  "Title",
  "Description",
]);

/** Named exports of `vaul` that map onto scrollsheet's `Drawer` namespace. */
const SUPPORTED_EXPORTS = new Set(["Drawer"]);

export interface TransformOptions {
  /** Path shown in findings. Defaults to the empty string. */
  file?: string;
}

/** Rewrites the vaul imports in `source` and reports what needs a human. */
export function transformVaul(source: string, options: TransformOptions = {}): TransformResult {
  const file = options.file ?? "";
  const findings: Finding[] = [];
  const root = j(source);

  /** Local names bound to vaul's `Drawer` namespace object. */
  const drawerNames = new Set<string>();
  /** Local names bound to `import * as X from 'vaul'`, whose `.Drawer` is the namespace. */
  const moduleNames = new Set<string>();
  let changed = false;

  function report(
    node: { loc?: { start: { line: number; column: number } } | null },
    kind: FindingKind,
    subject: string,
    message: string,
  ) {
    const start = node.loc?.start;
    findings.push({
      file,
      line: start?.line ?? 0,
      column: (start?.column ?? 0) + 1,
      kind,
      subject,
      message,
    });
  }

  rewriteImports(root);
  rewriteRequireAndDynamicImport(root);

  if (drawerNames.size > 0 || moduleNames.size > 0) {
    reportJsx(root);
  }

  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return {
    output: changed ? root.toSource({ quote: dominantQuote(source) }) : source,
    changed,
    findings,
  };

  function rewriteImports(collection: Collection) {
    collection.find(j.ImportDeclaration).forEach((path) => {
      const decl = path.node;
      const from = decl.source.value;
      if (from === VAUL_CSS) {
        decl.source = j.stringLiteral(SCROLLSHEET_CSS);
        changed = true;
        return;
      }
      if (from !== VAUL) return;

      const specifiers = decl.specifiers ?? [];
      const supported: typeof specifiers = [];
      const leftover: typeof specifiers = [];

      for (const specifier of specifiers) {
        if (specifier.type === "ImportNamespaceSpecifier") {
          if (specifier.local?.name) moduleNames.add(text(specifier.local.name));
          supported.push(specifier);
        } else if (specifier.type === "ImportSpecifier") {
          const imported = text(specifier.imported.name);
          if (SUPPORTED_EXPORTS.has(imported)) {
            drawerNames.add(text(specifier.local?.name ?? imported));
            supported.push(specifier);
          } else {
            leftover.push(specifier);
            const isType =
              decl.importKind === "type" ||
              (specifier as { importKind?: string }).importKind === "type";
            report(
              specifier,
              "manual",
              `import { ${imported} } from 'vaul'`,
              isType
                ? `Left on 'vaul'. scrollsheet exports DrawerRootProps, DrawerContentProps and the other Drawer*Props types.`
                : `Left on 'vaul'. scrollsheet exports only the Drawer namespace, never loose members: use Drawer.${imported} if it is a component.`,
            );
          }
        } else {
          // default import
          leftover.push(specifier);
          report(
            specifier,
            "manual",
            "default import from 'vaul'",
            "vaul has no default export that scrollsheet mirrors. Left on 'vaul'.",
          );
        }
      }

      if (supported.length === 0) return;

      changed = true;
      if (leftover.length === 0) {
        decl.source = j.stringLiteral(SCROLLSHEET);
        return;
      }
      // Split: supported specifiers move, the rest stay on vaul.
      decl.specifiers = leftover;
      const moved = j.importDeclaration(supported, j.stringLiteral(SCROLLSHEET));
      moved.importKind = decl.importKind;
      path.insertBefore(moved);
    });

    mergeDuplicateScrollsheetImports(collection);
  }

  /** `import { Drawer } from 'scrollsheet'` twice becomes one declaration. */
  function mergeDuplicateScrollsheetImports(collection: Collection) {
    const named = collection
      .find(j.ImportDeclaration)
      .filter(
        (p) =>
          p.node.source.value === SCROLLSHEET &&
          p.node.importKind !== "type" &&
          (p.node.specifiers ?? []).every((s) => s.type === "ImportSpecifier"),
      );
    if (named.length < 2) return;
    const paths = named.paths();
    const first = paths[0]!;
    const seen = new Set((first.node.specifiers ?? []).map(specifierKey));
    for (const path of paths.slice(1)) {
      for (const specifier of path.node.specifiers ?? []) {
        const key = specifierKey(specifier);
        if (!seen.has(key)) {
          seen.add(key);
          first.node.specifiers = [...(first.node.specifiers ?? []), specifier];
        }
      }
      j(path).remove();
    }
    changed = true;
  }

  function rewriteRequireAndDynamicImport(collection: Collection) {
    collection
      .find(j.CallExpression)
      .filter((path) => {
        const callee = path.node.callee;
        const arg = path.node.arguments[0];
        const isRequire = callee.type === "Identifier" && callee.name === "require";
        const isDynamic = callee.type === "Import";
        return (
          (isRequire || isDynamic) &&
          arg !== undefined &&
          (arg.type === "StringLiteral" || arg.type === "Literal") &&
          (arg.value === VAUL || arg.value === VAUL_CSS)
        );
      })
      .forEach((path) => {
        const arg = path.node.arguments[0] as { value: string };
        path.node.arguments[0] = j.stringLiteral(
          arg.value === VAUL ? SCROLLSHEET : SCROLLSHEET_CSS,
        );
        changed = true;
        if (arg.value === VAUL) {
          report(
            path.node,
            "info",
            path.node.callee.type === "Import" ? "import('vaul')" : "require('vaul')",
            "Rewritten to 'scrollsheet'. The Drawer namespace is the same shape; check the members you destructure.",
          );
        }
      });
  }

  /** Resolves a JSX tag to the vaul namespace member it names, if any. */
  function memberOf(opening: JSXOpeningElement): string | null {
    const name = opening.name;
    if (name.type !== "JSXMemberExpression") return null;
    const member = name.property.name;
    if (!NAMESPACE_MEMBERS.has(member)) return null;
    const object = name.object;
    if (object.type === "JSXIdentifier") {
      return drawerNames.has(text(object.name)) ? member : null;
    }
    // <V.Drawer.Root>: namespace import, then .Drawer.
    if (
      object.type === "JSXMemberExpression" &&
      object.object.type === "JSXIdentifier" &&
      moduleNames.has(text(object.object.name)) &&
      object.property.name === "Drawer"
    ) {
      return member;
    }
    return null;
  }

  function attrName(attr: JSXAttribute): string {
    return attr.name.type === "JSXIdentifier" ? attr.name.name : attr.name.name.name;
  }

  function literalValue(attr: JSXAttribute): string | null {
    const value = attr.value;
    if (!value) return null;
    if (value.type === "StringLiteral" || value.type === "Literal") {
      return typeof value.value === "string" ? value.value : null;
    }
    if (value.type === "JSXExpressionContainer") {
      const expression = value.expression;
      if (expression.type === "StringLiteral" || expression.type === "Literal") {
        return typeof expression.value === "string" ? expression.value : null;
      }
    }
    return null;
  }

  function reportJsx(collection: Collection) {
    collection.find(j.JSXOpeningElement).forEach((path: ASTPath<JSXOpeningElement>) => {
      const opening = path.node;
      const member = memberOf(opening);
      if (!member) return;

      const attrs = opening.attributes ?? [];
      const named = new Map<string, JSXAttribute>();
      for (const attr of attrs) {
        if (attr.type === "JSXAttribute") named.set(attrName(attr), attr);
      }
      const tag = `Drawer.${member}`;

      if (member === "Root" || member === "NestedRoot") {
        for (const [prop, advice] of Object.entries(ROOT_IGNORED)) {
          const attr = named.get(prop);
          if (attr) report(attr, "ignored", `${tag} ${prop}`, `Dropped. ${advice}`);
        }
        const direction = named.get("direction");
        if (direction) {
          const value = literalValue(direction);
          if (value === null || SIDE_DIRECTIONS.has(value)) {
            report(
              direction,
              "changed",
              `${tag} direction${value ? `="${value}"` : ""}`,
              "Side drawers take their width from snapPoints, so a CSS width on the content loses. snapPoints={['360px']} is a fixed width and [1] is full bleed.",
            );
          }
        }
        if (named.has("closeThreshold") && named.has("snapPoints")) {
          report(
            named.get("closeThreshold")!,
            "info",
            `${tag} closeThreshold`,
            "No effect with snapPoints, as in vaul. Use Sheet.Root's closeThreshold if you want it live.",
          );
        }
        const release = named.get("onRelease");
        if (release) {
          report(
            release,
            "changed",
            `${tag} onRelease`,
            "The second argument is the real outcome (true only when the sheet stays open). vaul always passes true when snapPoints is set.",
          );
        }
      }

      if (member === "Content") {
        for (const [prop, advice] of Object.entries(CONTENT_IGNORED)) {
          const attr = named.get(prop);
          if (attr) report(attr, "ignored", `${tag} ${prop}`, `Stripped. ${advice}`);
        }
      }

      if (member === "Portal") {
        const container = named.get("container");
        if (container) {
          report(
            container,
            "ignored",
            `${tag} container`,
            "Dropped. The native <dialog> always renders in the top layer.",
          );
        }
      }

      if (member === "Overlay") {
        report(
          opening,
          "changed",
          tag,
          "Renders nothing. The backdrop is automatic; restyle it with --scrollsheet-backdrop and remove this element.",
        );
      }

      if (
        (member === "Root" ||
          member === "NestedRoot" ||
          member === "Content" ||
          member === "Portal") &&
        attrs.some((attr) => attr.type === "JSXSpreadAttribute")
      ) {
        report(
          opening,
          "info",
          `${tag} {...spread}`,
          "Spread props are not checked. Anything the spread carries from the lists above is still dropped.",
        );
      }
    });
  }
}

/** New string literals follow the file's own style, judged by its imports. */
function dominantQuote(source: string): "single" | "double" {
  const single = (source.match(/(?:from|import|require\()\s*'/g) ?? []).length;
  const double = (source.match(/(?:from|import|require\()\s*"/g) ?? []).length;
  return single > double ? "single" : "double";
}

function specifierKey(
  specifier: ImportDeclaration["specifiers"] extends (infer S)[] | undefined ? S : never,
): string {
  if (specifier.type !== "ImportSpecifier") return specifier.type;
  const imported = text(specifier.imported.name);
  return `${imported}:${text(specifier.local?.name ?? imported)}`;
}

/** Rewrites `@import 'vaul/style.css'` in stylesheets. */
export function transformVaulCss(source: string): TransformResult {
  const output = source.replace(
    /(@import\s+(?:url\()?\s*["'])vaul\/style\.css(["'])/g,
    `$1${SCROLLSHEET_CSS}$2`,
  );
  return { output, changed: output !== source, findings: [] };
}
