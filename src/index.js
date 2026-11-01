const VERSION_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(input) {
  const match = String(input ?? "").trim().match(VERSION_RE);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

/** Compare two stable or prerelease semver versions. Returns null for invalid input. */
export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;

  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }

  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;

  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < length; i += 1) {
    const av = a.prerelease[i];
    const bv = b.prerelease[i];
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    if (av === bv) continue;

    const an = /^\d+$/.test(av);
    const bn = /^\d+$/.test(bv);
    if (an && bn) return Number(av) > Number(bv) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return av > bv ? 1 : -1;
  }
  return 0;
}

export function isNewerVersion(candidate, installed) {
  return compareVersions(candidate, installed) === 1;
}

/** Fetch a plain version string, a package.json version, or a GitHub release tag. */
export async function fetchLatestVersion(url, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: "application/json, text/plain;q=0.9" },
    });
    if (!response.ok) return null;
    const body = await response.text();
    let candidate = body.trim();
    try {
      const json = JSON.parse(body);
      candidate = json?.version ?? json?.tag_name ?? json?.tag ?? "";
    } catch {
      // A plain version endpoint is valid too.
    }
    return parseVersion(candidate) ? String(candidate).trim().replace(/^v/, "") : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Check latest first, and invoke install only when it is strictly newer or --force was requested. */
export async function runUpdate({
  name,
  currentVersion,
  latestVersion,
  install,
  force = false,
  checkOnly = false,
}) {
  if (typeof latestVersion !== "function") throw new TypeError("latestVersion must be a function");
  if (typeof install !== "function") throw new TypeError("install must be a function");

  const latest = await latestVersion();
  if (!latest || !parseVersion(latest)) {
    return { action: "error", code: 1, name, current: currentVersion, latest: null, reason: "latest version check failed; installer was not run" };
  }

  const order = compareVersions(latest, currentVersion);
  if (order === null) {
    return { action: "error", code: 1, name, current: currentVersion, latest, reason: "installed version is not valid semver; installer was not run" };
  }
  if (order < 0) {
    return { action: "current", code: 0, name, current: currentVersion, latest, reason: "installed version is newer; refusing to downgrade" };
  }
  if (order === 0 && !force) {
    return { action: "current", code: 0, name, current: currentVersion, latest, reason: "already current; installer was not run" };
  }
  if (checkOnly) {
    return { action: "available", code: 0, name, current: currentVersion, latest, reason: `${currentVersion} → ${latest}` };
  }

  await install({ name, currentVersion, latestVersion: latest, force });
  return { action: "updated", code: 0, name, current: currentVersion, latest, reason: `${currentVersion} → ${latest}` };
}

/** Add a consistent `update`/`upgrade` and `remove`/`uninstall` interface to Commander. */
export function registerUpdaterCommands(program, options) {
  const {
    name,
    currentVersion,
    latestVersion,
    install,
    remove,
    output = (line) => process.stdout.write(`${line}\n`),
    error = (line) => process.stderr.write(`${line}\n`),
  } = options ?? {};
  if (!name || !currentVersion || !latestVersion || !install || !remove) {
    throw new TypeError("name, currentVersion, latestVersion, install, and remove are required");
  }
  if (!program?.command) throw new TypeError("a Commander program is required");

  program
    .command("update")
    .alias("upgrade")
    .description(`check ${name} for a newer version and install it`)
    .option("--check", "report update availability without installing")
    .option("--force", "reinstall the current release")
    .option("--quiet", "suppress the up-to-date message (for scheduled checks)")
    .action(async (flags) => {
      try {
        const result = await runUpdate({
          name,
          currentVersion: typeof currentVersion === "function" ? await currentVersion() : currentVersion,
          latestVersion,
          install,
          force: Boolean(flags.force),
          checkOnly: Boolean(flags.check),
        });
        if (result.action === "error") error(`${name} update: ${result.reason}`);
        else if (!(flags.quiet && result.action === "current")) output(`${name} update: ${result.reason}`);
        if (result.action === "error") process.exitCode = result.code;
      } catch (cause) {
        error(`${name} update failed: ${cause?.message ?? cause}`);
        process.exitCode = 1;
      }
    });

  program
    .command("remove")
    .alias("uninstall")
    .description(`remove ${name} from this machine`)
    .action(async () => {
      try {
        await remove();
      } catch (cause) {
        error(`${name} remove failed: ${cause?.message ?? cause}`);
        process.exitCode = 1;
      }
    });
}
