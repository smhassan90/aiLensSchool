#!/usr/bin/env node
/**
 * One-shot ZKTeco sync via JWT device APIs (on-prem / VPN only).
 * Usage:
 *   node scripts/fetch-device-data.js <device-ip> --token <jwt> --api-url http://localhost:3001/api/v1
 */
const args = process.argv.slice(2);
const ip = args[0];
if (!ip) {
  console.error("Usage: node fetch-device-data.js <device-ip> --token <jwt> [--api-url URL] [--device-id ID] [--skip-users]");
  process.exit(1);
}

function flag(name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const token = flag("--token", process.env.DEVICE_TOKEN);
const apiUrl = (flag("--api-url", process.env.API_URL) || "http://localhost:3001/api/v1").replace(/\/$/, "");
const skipUsers = args.includes("--skip-users");
const startDate = flag("--start-date", undefined);
const endDate = flag("--end-date", undefined);
let deviceId = flag("--device-id", undefined);

if (!token) {
  console.error("Missing --token or DEVICE_TOKEN");
  process.exit(1);
}

async function api(path, options = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || res.statusText);
  }
  return json.data ?? json;
}

async function main() {
  if (!deviceId) {
    const devices = await api("/device");
    const match = devices.find((d) => d.ipAddress === ip);
    if (match) deviceId = match.id;
    else {
      const created = await api("/device", {
        method: "POST",
        body: JSON.stringify({ name: `ZK ${ip}`, ipAddress: ip, port: 4370 }),
      });
      deviceId = created.id;
      console.log("Created device", deviceId);
    }
  }

  console.log("Testing device connection…");
  await api(`/device/${deviceId}/test`, { method: "POST" });

  if (!skipUsers) {
    console.log("Syncing users…");
    await api(`/device/${deviceId}/sync-users`, { method: "POST" });
  }

  const q = new URLSearchParams();
  if (startDate) q.set("startDate", startDate);
  if (endDate) q.set("endDate", endDate);
  const qs = q.toString() ? `?${q}` : "";
  console.log("Syncing attendance…");
  const result = await api(`/device/${deviceId}/sync-attendance${qs}`, { method: "POST" });
  console.log("Done", result);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
