#!/usr/bin/env bun

import { spawnSync } from "child_process";

type Mode = "strict" | "fast";

type Args = {
  task?: string;
  mode: Mode;
  radius: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "strict", radius: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "run") continue;
    if (token === "--task") args.task = argv[++i];
    else if (token?.startsWith("--task=")) args.task = token.split("=").slice(1).join("=");
    else if (token === "--mode") args.mode = (argv[++i] as Mode) || "strict";
    else if (token?.startsWith("--mode=")) args.mode = token.split("=")[1] as Mode;
    else if (token === "--radius") args.radius = Number(argv[++i]);
    else if (token?.startsWith("--radius=")) args.radius = Number(token.split("=")[1]);
  }
  return args;
}

function printHelp(): void {
  console.log(`anti-lazy (MVP)\n\nUsage:\n  bun skills/local/anti-lazy/scripts/anti_lazy.ts run --task "<question>" [--mode strict|fast] [--radius 3000]\n\nNotes:\n- Two-Phase: prints plan first, then results with evidence.\n- Evidence Gate: strict mode requires >=5 items in result (as a proxy for 5 sources in location queries).\n`);
}

function runCmd(cwd: string, command: string, args: string[]): { ok: boolean; stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(command, args, { cwd, encoding: "utf-8" });
  return {
    ok: res.status === 0,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    status: res.status,
  };
}

function extractFirstLocation(geocodeOutput: string): string | null {
  const m = geocodeOutput.match(/\b\d{2,3}\.\d+\s*,\s*\d{2}\.\d+\b/);
  return m ? m[0].replace(/\s+/g, "") : null;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const args = parseArgs(argv);
  if (!args.task) {
    console.error("缺少 --task");
    process.exit(2);
  }

  // Phase A
  console.log(`Phase A（计划）\n任务：${args.task}\n工具路由：地点类 → AMap（geocode → poi-around）\n参数：radius=${args.radius}m\n预计耗时：30-90秒\n`);

  // Naive location query parsing for demo
  const place = args.task.includes("周边") ? args.task.split("周边")[0] : args.task;
  const keyword = args.task.includes("川菜") ? "川菜" : "餐饮";

  const amapCwd = process.cwd().includes("skills\\local\\amap")
    ? process.cwd()
    : "C:\\Users\\Krox\\.openclaw\\workspace\\skills\\local\\amap";

  // Phase B: geocode
  const geo = runCmd(amapCwd, "bun", ["scripts/amap.ts", "geocode", "--address", place]);
  const location = extractFirstLocation(geo.stdout) || extractFirstLocation(geo.stderr);

  if (!geo.ok || !location) {
    console.log("Phase B（结果）\n结论：AMap geocode 失败，无法继续周边检索。\n\n证据块：");
    console.log(`- cmd: bun scripts/amap.ts geocode --address "${place}"`);
    console.log(`- exit: ${geo.status}`);
    if (geo.stderr.trim()) console.log(`- stderr: ${geo.stderr.trim().slice(0, 400)}`);
    if (geo.stdout.trim()) console.log(`- stdout: ${geo.stdout.trim().slice(0, 400)}`);
    process.exit(1);
  }

  const around = runCmd(amapCwd, "bun", [
    "scripts/amap.ts",
    "poi-around",
    "--location",
    location,
    "--radius",
    String(args.radius),
    "--keywords",
    keyword,
  ]);

  const combined = `${around.stdout}\n${around.stderr}`;
  const lines = combined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const results = lines.slice(0, 10);

  if (args.mode === "strict" && results.length < 5) {
    console.log("Phase B（结果）\n结论：结果数量不足（<5），未达到严格模式的证据门槛，拒绝输出最终推荐。\n");
  } else {
    console.log("Phase B（结果）\n周边候选（前10行原始输出摘要）：");
    for (const r of results) console.log(r);
    console.log("");
  }

  console.log("证据块：");
  console.log(`- geocode cmd: bun scripts/amap.ts geocode --address "${place}"`);
  console.log(`- geocode location: ${location}`);
  console.log(`- around cmd: bun scripts/amap.ts poi-around --location ${location} --radius ${args.radius} --keywords ${keyword}`);
  console.log(`- around exit: ${around.status}`);
}

main();
