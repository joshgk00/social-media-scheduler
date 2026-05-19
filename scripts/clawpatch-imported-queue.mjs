#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const stateDir = join(repoRoot, ".clawpatch");
const findingsDir = join(stateDir, "findings");
const featuresDir = join(stateDir, "features");

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

await main();

async function main() {
  if (!existsSync(findingsDir) || !existsSync(featuresDir)) {
    throw new Error(
      "Clawpatch state not found. Run `clawpatch init` and import issues first.",
    );
  }

  const [findings, features] = await Promise.all([
    readRecords(findingsDir),
    readRecords(featuresDir),
  ]);
  const featureById = new Map(
    features.map((feature) => [feature.featureId, feature]),
  );
  const imported = findings
    .map((finding) => ({
      finding,
      feature: featureById.get(finding.featureId) ?? null,
    }))
    .filter(({ finding, feature }) => isImportedGitHubFinding(finding, feature))
    .filter(
      ({ finding }) => args.status === "any" || finding.status === args.status,
    )
    .sort(compareQueueItems);

  if (args.command === "next") {
    const next = imported[0] ?? null;
    if (args.plain) {
      if (next) process.stdout.write(`${next.finding.findingId}\n`);
      process.exit(next ? 0 : 1);
    }
    console.log(JSON.stringify(next ? summarize(next) : null, null, 2));
    process.exit(next ? 0 : 1);
  }

  const summaries = imported.map(summarize);
  if (args.plain) {
    for (const item of summaries) {
      console.log(
        `${item.findingId}\t${item.githubIssue}\t${item.status}\t${item.title}`,
      );
    }
    return;
  }
  console.log(JSON.stringify(summaries, null, 2));
}

async function readRecords(dir) {
  const names = await readdir(dir);
  const records = [];
  for (const name of names.toSorted()) {
    if (!name.endsWith(".json")) continue;
    records.push(JSON.parse(await readFile(join(dir, name), "utf8")));
  }
  return records;
}

function isImportedGitHubFinding(finding, feature) {
  if (feature?.source === "github-issue-import") return true;
  return (
    feature?.tags?.some((tag) => tag === "github-issue") === true ||
    /^gh#\d+:/u.test(finding.title)
  );
}

function compareQueueItems(left, right) {
  return (
    backlogOrder(left.feature) - backlogOrder(right.feature) ||
    issueNumber(left) - issueNumber(right) ||
    left.finding.title.localeCompare(right.finding.title) ||
    left.finding.findingId.localeCompare(right.finding.findingId)
  );
}

function backlogOrder(feature) {
  const tag = feature?.tags?.find((candidate) =>
    candidate.startsWith("backlog-order:"),
  );
  if (!tag) return Number.MAX_SAFE_INTEGER;
  const parsed = Number(tag.slice("backlog-order:".length));
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function issueNumber(item) {
  const tag = item.feature?.tags?.find((candidate) =>
    /^gh#\d+$/u.test(candidate),
  );
  if (tag) return Number(tag.slice(3));
  const match = /^gh#(\d+):/u.exec(item.finding.title);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function summarize(item) {
  return {
    findingId: item.finding.findingId,
    featureId: item.finding.featureId,
    githubIssue: `gh#${issueNumber(item)}`,
    title: item.finding.title,
    status: item.finding.status,
    category: item.finding.category,
    severity: item.finding.severity,
    confidence: item.finding.confidence,
    backlogOrder: backlogOrder(item.feature),
    next: `clawpatch show --finding ${item.finding.findingId}`,
  };
}

function parseArgs(argv) {
  const parsed = {
    command: "list",
    help: false,
    plain: false,
    status: "open",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    else if (arg === "list" || arg === "next") parsed.command = arg;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--plain") parsed.plain = true;
    else if (arg === "--status")
      parsed.status = requireValue(argv, ++index, arg);
    else if (arg.startsWith("--status="))
      parsed.status = arg.slice("--status=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--"))
    throw new Error(`missing value for ${flag}`);
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/clawpatch-imported-queue.mjs [list|next] [flags]

Lists or selects Clawpatch findings imported from GitHub issues.

Flags:
  --status <status|any>  Default: open
  --plain               Print tabular output for list, finding id for next
`);
}
