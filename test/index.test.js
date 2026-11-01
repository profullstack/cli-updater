import test from "node:test";
import assert from "node:assert/strict";
import { compareVersions, isNewerVersion, runUpdate } from "../src/index.js";
import { autoUpdatePaths } from "../src/auto-update.js";

test("compares stable releases numerically, including a leading v", () => {
  assert.equal(compareVersions("v1.10.0", "1.9.9"), 1);
  assert.equal(compareVersions("1.2.3", "v1.2.3"), 0);
  assert.equal(compareVersions("1.2.2", "1.2.3"), -1);
  assert.equal(isNewerVersion("2.0.0", "1.99.99"), true);
});

test("stable versions outrank prereleases", () => {
  assert.equal(compareVersions("1.2.0", "1.2.0-rc.1"), 1);
  assert.equal(compareVersions("1.2.0-rc.2", "1.2.0-rc.10"), -1);
  assert.equal(compareVersions("1.2.0-alpha", "1.2.0"), -1);
});

test("invalid versions are never considered newer", () => {
  assert.equal(compareVersions("latest", "1.0.0"), null);
  assert.equal(isNewerVersion("latest", "1.0.0"), false);
});

test("same and older versions never invoke installer, even with force for downgrade", async () => {
  let installs = 0;
  const equal = await runUpdate({
    name: "tool",
    currentVersion: "2.0.0",
    latestVersion: async () => "2.0.0",
    install: async () => { installs += 1; },
  });
  const older = await runUpdate({
    name: "tool",
    currentVersion: "2.0.0",
    latestVersion: async () => "1.9.9",
    install: async () => { installs += 1; },
    force: true,
  });
  assert.equal(equal.action, "current");
  assert.equal(older.action, "current");
  assert.equal(installs, 0);
});

test("newer versions install, while check mode does not", async () => {
  let installs = 0;
  const config = {
    name: "tool",
    currentVersion: "1.0.0",
    latestVersion: async () => "1.1.0",
    install: async () => { installs += 1; },
  };
  const check = await runUpdate({ ...config, checkOnly: true });
  assert.equal(check.action, "available");
  assert.equal(installs, 0);
  const update = await runUpdate(config);
  assert.equal(update.action, "updated");
  assert.equal(installs, 1);
});

test("a failed version check fails closed before install", async () => {
  let installs = 0;
  const result = await runUpdate({
    name: "tool",
    currentVersion: "1.0.0",
    latestVersion: async () => null,
    install: async () => { installs += 1; },
  });
  assert.equal(result.action, "error");
  assert.equal(installs, 0);
});

test("auto-update schedule paths are scoped to the app and user", () => {
  assert.deepEqual(
    autoUpdatePaths("coinpay", { home: "/tmp/home", platform: "linux" }),
    {
      service: "/tmp/home/.config/systemd/user/coinpay-auto-update.service",
      timer: "/tmp/home/.config/systemd/user/coinpay-auto-update.timer",
    },
  );
  assert.throws(() => autoUpdatePaths("../coinpay", { platform: "linux" }), /name must contain/);
});
