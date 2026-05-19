#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const stateDir = join(repoRoot, ".clawpatch");
const findingsDir = join(stateDir, "findings");
const featuresDir = join(stateDir, "features");
const runsDir = join(stateDir, "runs");
const backlogPath = join(repoRoot, "BACKLOG.md");

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

await main();

async function main() {
  assertClawpatchInitialized();

  const backlogItems = await readBacklogItems();
  const selectedItems = selectBacklogItems(backlogItems);

  if (selectedItems.length === 0) {
    console.error("No matching pending GitHub issues found in BACKLOG.md.");
    process.exit(1);
  }

  const runId = makeRunId();
  const now = new Date().toISOString();
  const importedFindingIds = [];
  const skipped = [];

  for (const [index, backlogItem] of selectedItems.entries()) {
    const issue = fetchIssue(backlogItem.number);
    if (issue.state !== "OPEN" && !args.includeClosed) {
      skipped.push({
        issue: backlogItem.number,
        reason: `issue state is ${issue.state}`,
      });
      continue;
    }

    const ownedFiles = extractFileRefs(issue.body, backlogItem.line).filter(
      (ref) => isExistingOrCreatablePath(ref.path),
    );
    const uniqueOwnedFiles = uniqueRefs(ownedFiles).slice(
      0,
      args.maxOwnedFiles,
    );
    const contextFiles = uniqueRefs([
      ...extractFileRefs(issue.body, backlogItem.line, { docsOnly: true }),
      ...refIfExists("BACKLOG.md", `backlog queue item for gh#${issue.number}`),
      ...extractAdrRefs(issue.body),
    ])
      .filter((ref) => existsSync(join(repoRoot, ref.path)))
      .filter(
        (ref) => !uniqueOwnedFiles.some((owned) => owned.path === ref.path),
      )
      .slice(0, args.maxContextFiles);

    if (uniqueOwnedFiles.length === 0 && !args.allowNoFiles) {
      skipped.push({
        issue: issue.number,
        reason: "no existing owned files found in issue body",
      });
      continue;
    }

    const category = issueCategory(issue, backlogItem);
    const severity = issueSeverity(issue, backlogItem, category);
    const confidence = issueConfidence(issue, uniqueOwnedFiles);
    const featureId = stableId("feat", [`gh#${issue.number}`, issue.title]);
    const signature = stableId("sig", [
      `gh#${issue.number}`,
      issue.url,
      issue.title,
    ]);
    const findingId = stableId("fnd", [signature]);
    const existingFinding = await readJsonIfExists(
      join(findingsDir, `${findingId}.json`),
    );
    const createdAt = existingFinding?.createdAt ?? now;
    const createdByRunId = existingFinding?.createdByRunId ?? runId;

    const feature = {
      schemaVersion: 1,
      featureId,
      title: `gh#${issue.number}: ${issue.title}`,
      summary: summarizeIssue(issue, backlogItem),
      kind: featureKind(uniqueOwnedFiles, issue, backlogItem),
      source: "github-issue-import",
      confidence,
      entrypoints: uniqueOwnedFiles.slice(0, 3).map((ref) => ({
        path: ref.path,
        symbol: null,
        route: null,
        command: null,
      })),
      ownedFiles: uniqueOwnedFiles.map((ref) => ({
        path: ref.path,
        reason: ref.reason ?? `mentioned by GitHub issue gh#${issue.number}`,
      })),
      contextFiles: contextFiles.map((ref) => ({
        path: ref.path,
        reason: ref.reason ?? `context for GitHub issue gh#${issue.number}`,
      })),
      tests: testRefs(uniqueOwnedFiles, contextFiles),
      tags: uniqueStrings([
        "github-issue",
        `gh#${issue.number}`,
        `github-url:${issue.url}`,
        `backlog-order:${String(index + 1).padStart(4, "0")}`,
        `backlog-section:${slug(backlogItem.section)}`,
        ...issue.labels.map((label) => `label:${slug(label.name)}`),
      ]),
      trustBoundaries: trustBoundaries(uniqueOwnedFiles, issue),
      status: existingFinding?.status === "fixed" ? "fixed" : "needs-fix",
      lock: null,
      findingIds: [findingId],
      patchAttemptIds: [],
      analysisHistory: [
        {
          runId,
          kind: "github-issue-import",
          summary: `Imported GitHub issue gh#${issue.number}`,
          provider: "gh",
          model: null,
          createdAt: now,
        },
      ],
      createdAt,
      updatedAt: now,
    };

    const finding = {
      schemaVersion: 1,
      findingId,
      featureId,
      title: `gh#${issue.number}: ${issue.title}`,
      category,
      severity,
      confidence,
      triage: findingTriage(category, confidence),
      evidence: evidenceRefs(uniqueOwnedFiles),
      reasoning: issueReasoning(issue, backlogItem),
      reproduction: issueReproduction(issue),
      recommendation: issueRecommendation(issue),
      whyTestsDoNotAlreadyCoverThis: issueTestAnalysis(issue),
      suggestedRegressionTest: issueSuggestedTest(issue),
      minimumFixScope: uniqueOwnedFiles.map((ref) => ref.path).join(", "),
      status: existingFinding?.status ?? "open",
      history: existingFinding?.history ?? [],
      signature,
      linkedPatchAttemptIds: existingFinding?.linkedPatchAttemptIds ?? [],
      createdByRunId,
      createdAt,
      updatedAt: now,
    };

    if (!args.dryRun) {
      await writeJson(join(featuresDir, `${featureId}.json`), feature);
      await writeJson(join(findingsDir, `${findingId}.json`), finding);
    }
    importedFindingIds.push(findingId);
    console.log(
      `${args.dryRun ? "would import" : "imported"} gh#${issue.number}: ${findingId}`,
    );
  }

  if (!args.dryRun) {
    await writeJson(join(runsDir, `${runId}.json`), {
      schemaVersion: 1,
      runId,
      command: "github-issue-import",
      args: process.argv.slice(2),
      rootPath: repoRoot,
      headSha: gitHeadSha(),
      startedAt: now,
      finishedAt: new Date().toISOString(),
      status: "completed",
      claimedFeatureIds: [],
      findingIds: importedFindingIds,
      patchAttemptIds: [],
      errors: skipped.map((item) => ({
        message: `gh#${item.issue}: ${item.reason}`,
        code: null,
      })),
    });
  }

  for (const item of skipped) {
    console.error(`skipped gh#${item.issue}: ${item.reason}`);
  }

  console.log(
    `${args.dryRun ? "planned" : "finished"}: ${importedFindingIds.length} imported, ${skipped.length} skipped`,
  );
}

function assertClawpatchInitialized() {
  if (
    !existsSync(join(stateDir, "project.json")) ||
    !existsSync(join(stateDir, "config.json"))
  ) {
    throw new Error(
      "Clawpatch is not initialized. Run `clawpatch init` first.",
    );
  }
}

async function readBacklogItems() {
  const backlog = await readFile(backlogPath, "utf8");
  const items = [];
  let section = "unknown";
  for (const [lineIndex, line] of backlog.split("\n").entries()) {
    const heading = /^(#{2,4})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      section = heading[2].replace(/\s+/g, " ").trim();
      continue;
    }
    const match =
      /^-\s+\[(?<status>[ xX~-])\]\s+(?:\*\*gh#(?<directNumber>\d+)\*\*|\*\*[^*]+\*\*\s+\(gh#(?<linkedNumber>\d+)\))\s+[—-]\s+(?<title>.+?)\s*$/.exec(
        line,
      );
    if (!match?.groups) continue;
    const issueNumber = match.groups.directNumber ?? match.groups.linkedNumber;
    items.push({
      status: match.groups.status,
      number: Number(issueNumber),
      title: match.groups.title.replace(/\s+\*\(.+?\)\*$/, "").trim(),
      section,
      line: line.trim(),
      lineNumber: lineIndex + 1,
    });
  }
  return items;
}

function selectBacklogItems(items) {
  const wantedIssues = new Set(args.issues);
  const selected = items.filter((item) => {
    if (wantedIssues.size > 0) return wantedIssues.has(item.number);
    if (args.all) return item.status !== "x" && item.status !== "X";
    if (args.includeInProgress)
      return item.status === " " || item.status === "~";
    return item.status === " ";
  });
  return selected.slice(0, args.limit);
}

function fetchIssue(number) {
  const result = spawnSync(
    "gh",
    [
      "issue",
      "view",
      String(number),
      "--json",
      "number,title,body,labels,url,state",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `failed to fetch gh#${number}: ${result.stderr.trim() || result.stdout.trim()}`,
    );
  }
  return JSON.parse(result.stdout);
}

function extractFileRefs(...inputs) {
  const options = typeof inputs.at(-1) === "object" ? inputs.pop() : {};
  const text = inputs.filter(Boolean).join("\n");
  const refs = [];
  const candidates = new Set();

  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    candidates.add(match[1]);
  }
  for (const match of text.matchAll(
    /\]\((?:\.\.\/blob\/main\/|\.\/)?([^)#]+)(?:#[^)]+)?\)/g,
  )) {
    candidates.add(match[1]);
  }
  for (const match of text.matchAll(
    /(?:^|[\s(-])((?:packages|nginx|docs|scripts)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+(?::\d+(?:-\d+)?)?)/gm,
  )) {
    candidates.add(match[1]);
  }
  for (const match of text.matchAll(
    /(?:^|[\s(-])((?:docker-compose(?:\.[A-Za-z0-9_-]+)?\.ya?ml|Dockerfile|package\.json|pnpm-workspace\.yaml)(?::\d+(?:-\d+)?)?)/gm,
  )) {
    candidates.add(match[1]);
  }

  for (const rawCandidate of candidates) {
    const parsed = parsePathCandidate(rawCandidate);
    if (!parsed) continue;
    if (options.docsOnly && !parsed.path.startsWith("docs/")) continue;
    if (!options.docsOnly && parsed.path.startsWith("docs/")) continue;
    refs.push({
      path: parsed.path,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
      reason: parsed.startLine
        ? `mentioned by issue at ${parsed.path}:${parsed.startLine}`
        : "mentioned by issue body",
    });
  }
  return refs;
}

function parsePathCandidate(rawCandidate) {
  let candidate = rawCandidate
    .replace(/^[-*]\s+/, "")
    .replace(/^\\`|\\`$/g, "")
    .replace(/^\.?\//, "")
    .trim();
  candidate = packageAliasToRepoPath(candidate);
  candidate = candidate.replace(
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\//,
    "",
  );
  candidate = candidate.replace(/^BACKLOG\.md\s*→\s*/i, "");
  const match = /^(?<path>[^:\s]+)(?::(?<start>\d+)(?:-(?<end>\d+))?)?$/.exec(
    candidate,
  );
  if (!match?.groups) return null;
  const path = normalize(match.groups.path).replace(/\\/g, "/");
  if (path.startsWith("..") || path.startsWith("/")) return null;
  if (!isRepoPath(path)) return null;
  return {
    path,
    startLine: match.groups.start ? Number(match.groups.start) : null,
    endLine: match.groups.end ? Number(match.groups.end) : null,
  };
}

function packageAliasToRepoPath(candidate) {
  const match =
    /^@sms\/(?<pkg>api|worker|shared|web|db)(?:\/(?<rest>.+))?$/.exec(
      candidate,
    );
  if (!match?.groups) return candidate;
  const rest = match.groups.rest ?? "";
  if (rest.length === 0) return `packages/${match.groups.pkg}/src/index.ts`;
  if (rest.startsWith("src/")) return `packages/${match.groups.pkg}/${rest}`;
  return `packages/${match.groups.pkg}/src/${rest}`;
}

function isExistingOrCreatablePath(path) {
  if (existsSync(join(repoRoot, path))) return true;
  let candidate = dirname(join(repoRoot, path));
  while (candidate.startsWith(repoRoot) && candidate !== repoRoot) {
    if (existsSync(candidate)) return true;
    candidate = dirname(candidate);
  }
  return false;
}

function isRepoPath(path) {
  return (
    path.startsWith("packages/") ||
    path.startsWith("nginx/") ||
    path.startsWith("docs/") ||
    path.startsWith("scripts/") ||
    ["Dockerfile", "package.json", "pnpm-workspace.yaml"].includes(path) ||
    /^docker-compose(?:\.[A-Za-z0-9_-]+)?\.ya?ml$/.test(path)
  );
}

function extractAdrRefs(body) {
  return extractFileRefs(body, { docsOnly: true }).filter((ref) =>
    ref.path.startsWith("docs/adr/"),
  );
}

function refIfExists(path, reason) {
  return existsSync(join(repoRoot, path))
    ? [{ path, startLine: null, endLine: null, reason }]
    : [];
}

function issueCategory(issue, backlogItem) {
  const labels = issue.labels.map((label) => slug(label.name));
  const haystack = `${issue.title} ${backlogItem.section}`.toLowerCase();
  if (labels.includes("bug") || /\bbug|fix\b/.test(haystack)) return "bug";
  if (/\bsecurity|idor|csrf|auth|cookie|rate.limit/.test(haystack))
    return "security";
  if (/\bperf|performance|cache|n\+1|unbounded|concurrent/.test(haystack))
    return "performance";
  if (/\btest|coverage|regression/.test(haystack)) return "test-gap";
  if (/\bdocs|changelog|copy\b/.test(haystack)) return "docs-gap";
  if (/\bconfig|docker|nginx|build|release|deps?\b/.test(haystack))
    return "build-release";
  if (/\bcontract|schema|payload|type safety|typescript/.test(haystack))
    return "api-contract";
  if (/\bdata loss|delete|cleanup|storage before db/.test(haystack))
    return "data-loss";
  return "maintainability";
}

function issueSeverity(issue, backlogItem, category) {
  const haystack =
    `${issue.title} ${issue.body} ${backlogItem.section}`.toLowerCase();
  if (/\bp0\b|production blocker|critical/.test(haystack)) return "critical";
  if (category === "security" || category === "data-loss") return "high";
  if (/\bp1\b|500|fail|broken|csrf|cookie|notification/.test(haystack))
    return "medium";
  if (
    category === "test-gap" ||
    category === "docs-gap" ||
    category === "maintainability"
  )
    return "low";
  return "medium";
}

function issueConfidence(issue, ownedFiles) {
  if (
    ownedFiles.length > 0 &&
    /acceptance|fix|scope|files|problem/i.test(issue.body)
  )
    return "high";
  if (ownedFiles.length > 0) return "medium";
  return "low";
}

function findingTriage(category, confidence) {
  if (category === "test-gap") return "test-gap";
  if (category === "docs-gap") return "docs-gap";
  if (category === "api-contract") return "contract-mismatch";
  if (
    confidence === "high" &&
    ["bug", "security", "data-loss", "concurrency"].includes(category)
  ) {
    return "confirmed-bug";
  }
  return "risk";
}

function featureKind(ownedFiles, issue, backlogItem) {
  const paths = ownedFiles.map((ref) => ref.path).join(" ");
  const haystack = `${issue.title} ${backlogItem.section}`.toLowerCase();
  if (/nginx|docker|compose|config|release/.test(paths + haystack))
    return "infra";
  if (/__tests__|\.test\./.test(paths) || /\btest/.test(haystack))
    return "test-suite";
  if (/routes?\//.test(paths)) return "route";
  if (/worker|queue|job|bullmq/.test(paths + haystack)) return "job";
  if (/pages|components|hooks/.test(paths)) return "ui-flow";
  if (/service/.test(paths)) return "service";
  return "library";
}

function testRefs(ownedFiles, contextFiles) {
  return uniqueRefs([...ownedFiles, ...contextFiles])
    .filter((ref) => /(?:__tests__|\.test\.|\.spec\.)/.test(ref.path))
    .map((ref) => ({ path: ref.path, command: null }));
}

function trustBoundaries(ownedFiles, issue) {
  const text =
    `${issue.title} ${issue.body} ${ownedFiles.map((ref) => ref.path).join(" ")}`.toLowerCase();
  const boundaries = [];
  if (/auth|cookie|csrf|session|login|permission/.test(text))
    boundaries.push("auth");
  if (/nginx|proxy|http|api|route|network/.test(text))
    boundaries.push("network");
  if (/storage|media|file|upload|filesystem|sharp|s3/.test(text))
    boundaries.push("filesystem");
  if (/token|credential|encryption|oauth|secret/.test(text))
    boundaries.push("secrets");
  if (/db|database|postgres|sql|drizzle/.test(text))
    boundaries.push("database");
  if (/queue|worker|concurrent|parallel|race/.test(text))
    boundaries.push("concurrency");
  if (/twitter|linkedin|facebook|external/.test(text))
    boundaries.push("external-api");
  return uniqueStrings(boundaries);
}

function evidenceRefs(ownedFiles) {
  return ownedFiles.slice(0, 8).map((ref) => ({
    path: ref.path,
    startLine: ref.startLine,
    endLine: ref.endLine,
    symbol: null,
    quote: null,
  }));
}

function summarizeIssue(issue, backlogItem) {
  return `Imported from GitHub issue gh#${issue.number} in BACKLOG.md section "${backlogItem.section}".`;
}

function issueReasoning(issue, backlogItem) {
  return [
    `Imported from ${issue.url}.`,
    `Backlog section: ${backlogItem.section}.`,
    "",
    issue.body.trim() || backlogItem.line,
  ].join("\n");
}

function issueRecommendation(issue) {
  const section = extractSection(issue.body, [
    "Fix sketch",
    "Fix",
    "Proposed change",
    "Scope",
    "Suggested next steps",
  ]);
  return (
    section ||
    `Implement the fix described by GitHub issue gh#${issue.number} and satisfy its acceptance criteria.`
  );
}

function issueReproduction(issue) {
  return (
    extractSection(issue.body, ["Reproduction", "Problem", "Context"]) || null
  );
}

function issueTestAnalysis(issue) {
  return (
    extractSection(issue.body, [
      "Why this hasn't been noticed",
      "Why this has not been noticed",
      "Why tests do not already cover this",
    ]) ||
    "Imported from GitHub issue. Preserve or add focused regression coverage when the issue acceptance criteria calls for it."
  );
}

function issueSuggestedTest(issue) {
  const acceptance = extractSection(issue.body, ["Acceptance"]);
  if (acceptance && /\btest|assert|coverage|passes\b/i.test(acceptance))
    return acceptance;
  const testSection = extractSection(issue.body, [
    "Test",
    "Tests",
    "Verification",
  ]);
  return testSection || null;
}

function extractSection(body, headings) {
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^#{2,4}\s+(.+?)\s*$/.exec(lines[index]);
    if (!heading || !headings.includes(heading[1].trim())) continue;
    const collected = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^#{2,4}\s+/.test(lines[cursor])) break;
      collected.push(lines[cursor]);
    }
    const text = collected.join("\n").trim();
    if (text.length > 0) return text;
  }
  return null;
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function uniqueRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    if (seen.has(ref.path)) return false;
    seen.add(ref.path);
    return true;
  });
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stableId(prefix, parts) {
  const hash = createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 10);
  const readable = slug(parts.find((part) => part.length > 0) ?? prefix).slice(
    0,
    32,
  );
  return `${prefix}_${readable}_${hash}`;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 64);
}

function makeRunId() {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\..+$/u, "");
  return `${stamp}-${randomBytes(3).toString("hex")}`;
}

function gitHeadSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseArgs(argv) {
  const parsed = {
    all: false,
    allowNoFiles: false,
    dryRun: false,
    help: false,
    includeClosed: false,
    includeInProgress: false,
    issues: [],
    limit: Number.POSITIVE_INFINITY,
    maxContextFiles: 12,
    maxOwnedFiles: 12,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    else if (arg === "--all") parsed.all = true;
    else if (arg === "--allow-no-files") parsed.allowNoFiles = true;
    else if (arg === "--dry-run") parsed.dryRun = true;
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--include-closed") parsed.includeClosed = true;
    else if (arg === "--include-in-progress") parsed.includeInProgress = true;
    else if (arg === "--issue")
      parsed.issues.push(Number(requireValue(argv, ++index, arg)));
    else if (arg.startsWith("--issue="))
      parsed.issues.push(Number(arg.slice("--issue=".length)));
    else if (arg === "--limit")
      parsed.limit = Number(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--limit="))
      parsed.limit = Number(arg.slice("--limit=".length));
    else if (arg === "--max-context-files")
      parsed.maxContextFiles = Number(requireValue(argv, ++index, arg));
    else if (arg === "--max-owned-files")
      parsed.maxOwnedFiles = Number(requireValue(argv, ++index, arg));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!Number.isFinite(parsed.limit) || parsed.limit <= 0)
    parsed.limit = Number.POSITIVE_INFINITY;
  parsed.issues = parsed.issues.filter(
    (issueNumber) => Number.isInteger(issueNumber) && issueNumber > 0,
  );
  return parsed;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--"))
    throw new Error(`missing value for ${flag}`);
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/import-github-issues-to-clawpatch.mjs [flags]

Imports pending gh#NN entries from BACKLOG.md into .clawpatch feature/finding JSON.

Flags:
  --limit <n>              Import at most n backlog items
  --issue <n>              Import one issue; may be repeated
  --all                    Include all non-done backlog issues
  --include-in-progress    Include [~] backlog rows
  --include-closed         Import closed GitHub issues too
  --allow-no-files         Import issues even when no owned files are found
  --dry-run                Print what would be imported without writing state
  --max-owned-files <n>    Default: 12
  --max-context-files <n>  Default: 12
`);
}
