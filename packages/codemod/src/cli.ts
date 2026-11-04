import { runVaul } from "./run";
import type { Finding } from "./vaul";

const USAGE = `scrollsheet-codemod vaul [paths...] [--dry-run] [--json]

Rewrites vaul imports to scrollsheet and prints a file:line report of every
prop scrollsheet ignores or handles differently.

  paths      files or directories to scan (default: .)
  --dry-run  report only, write nothing
  --json     print the report as JSON
  --help     show this message
`;

function format(finding: Finding): string {
  return `${finding.file}:${finding.line}:${finding.column}  ${finding.kind.padEnd(7)}  ${finding.subject}\n    ${finding.message}`;
}

function main(argv: string[]): number {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(USAGE);
    return args.length === 0 ? 1 : 0;
  }
  const [command, ...rest] = args;
  if (command !== "vaul") {
    console.error(`Unknown migration "${command}". Available: vaul\n\n${USAGE}`);
    return 1;
  }

  const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
  const unknown = [...flags].filter((flag) => !["--dry-run", "--json"].includes(flag));
  if (unknown.length > 0) {
    console.error(`Unknown option ${unknown.join(", ")}\n\n${USAGE}`);
    return 1;
  }
  const paths = rest.filter((arg) => !arg.startsWith("--"));
  const dryRun = flags.has("--dry-run");

  let result;
  try {
    result = runVaul(paths.length > 0 ? paths : ["."], { dryRun });
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  if (flags.has("--json")) {
    console.log(JSON.stringify({ dryRun, ...result }, null, 2));
    return result.errors.length > 0 ? 1 : 0;
  }

  if (result.findings.length > 0) {
    console.log(result.findings.map(format).join("\n"));
    console.log("");
  }
  for (const error of result.errors) console.error(`error  ${error.file}: ${error.message}`);
  const verb = dryRun ? "would change" : "changed";
  console.log(
    `${verb} ${result.changedFiles.length} file${result.changedFiles.length === 1 ? "" : "s"}, ` +
      `${result.findings.length} item${result.findings.length === 1 ? "" : "s"} to review ` +
      `(${result.scanned} file${result.scanned === 1 ? "" : "s"} mentioning vaul).`,
  );
  if (result.errors.length > 0) {
    console.error(`${result.errors.length} file${result.errors.length === 1 ? "" : "s"} could not be processed.`);
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv);
