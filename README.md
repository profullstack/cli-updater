# @profullstack/cli-updater

Shared update lifecycle helpers for Profullstack CLIs. It standardizes
`update`/`upgrade` and `remove`/`uninstall`, checks the published version before
running an installer, refuses downgrades, and can install per-user scheduled
checks on Linux, macOS, and Windows.

## Version checked update

```js
import { fetchLatestVersion, registerUpdaterCommands } from "@profullstack/cli-updater";

registerUpdaterCommands(program, {
  name: "example",
  currentVersion: "1.2.3",
  latestVersion: () => fetchLatestVersion("https://example.com/cli/version.json"),
  install: async () => runInstaller(),
  remove: async () => removeExample(),
});
```

The helper runs the installer only when the published semver is strictly newer.
An unavailable or invalid version feed fails closed. `--force` can reinstall an
equal version for repair, but never downgrades. `--check` reports without
installing. `upgrade` aliases `update`; `uninstall` aliases `remove`.

## Scheduled checks

```js
import { installAutoUpdate, removeAutoUpdate } from "@profullstack/cli-updater/auto-update";

await installAutoUpdate({ name: "example", command: "/home/user/.local/bin/example" });
// During removal:
await removeAutoUpdate("example");
```

The default schedule is hourly. Each scheduled run invokes the CLI's normal
version-checked `update` command with `--quiet`; it never reinstalls an equal
or older version. Linux uses a per-user systemd timer with cron fallback,
macOS uses a LaunchAgent, and Windows uses Task Scheduler.

Native CLIs can preserve a native updater while following the same semver and
command contract. This avoids making Rust or shell-based tools depend on Node
at runtime.
