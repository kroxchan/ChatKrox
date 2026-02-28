#!/usr/bin/env bun

/**
 * anti-lazy: 多源搜索脚本
 * 
 * 用法：
 *   bun skills/local/anti-lazy/scripts/multi_search.ts --task "<问题>" --mode strict
 * 
 * 输出：
 *   Phase A: 搜索计划
 *   Phase B: 搜索结果 + 证据块
 */

type Mode = "strict" | "fast";

type Args = {
  task?: string;
  mode: Mode;
  minSources: number;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "strict", minSources: 5 };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "run" || token === "search") continue;
    if (token === "--task") args.task = argv[++i];
    else if (token?.startsWith("--task=")) args.task = token.split("=").slice(1).join("=");
    else if (token === "--mode") args.mode = (argv[++i] as Mode) || "strict";
    else if (token?.startsWith("--mode=")) args.mode = token.split("=")[1] as Mode;
    else if (token === "--min-sources") args.minSources = Number(argv[++i]);
    else if (token?.startsWith("--min-sources=")) args.minSources = Number(token.split("=")[1]);
  }
  return args;
}

function printHelp(): void {
  console.log(`anti-lazy: 多源搜索脚本

用法:
  bun skills/local/anti-lazy/scripts/multi_search.ts search --task "<问题>" [--mode strict|fast] [--min-sources 5]

说明:
- Phase A: 输出搜索计划（将调用哪些工具/关键词）
- Phase B: 输出搜索结果 + 证据块
- strict 模式：要求 >=5 个独立信息源
- fast 模式：>=3 个信息源即可
`);
}

function generateKeywords(task: string): string[] {
  // 根据问题类型生成多个搜索关键词
  const baseKeywords: string[] = [];
  
  // 如果是法律相关
  if (task.includes("法律") || task.includes("条款") || task.includes("法")) {
    baseKeywords.push(
      task + " 法律条款",
      task + " 法规原文",
      task + " 司法解释",
      task + " 案例分析",
      task + " 律师解读"
    );
  }
  // 如果是地点/周边
  else if (task.includes("周边") || task.includes("附近") || task.includes("地点")) {
    baseKeywords.push(
      task,
      task.replace("周边", "") + " 地图",
      task.replace("附近", "") + " POI"
    );
  }
  // 通用情况
  else {
    baseKeywords.push(
      task,
      task + " 是什么",
      task + " 详解",
      task + " 最新",
      task + " 官方"
    );
  }
  
  return baseKeywords.slice(0, 5);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const args = parseArgs(argv);
  if (!args.task) {
    console.error("❌ 缺少 --task 参数");
    printHelp();
    process.exit(2);
  }

  // Phase A: 输出搜索计划
  const keywords = generateKeywords(args.task);
  console.log(`📋 Phase A（搜索计划）`);
  console.log(`任务：${args.task}`);
  console.log(`模式：${args.mode} (最少 ${args.minSources} 个信息源)`);
  console.log(`\n将执行的搜索：`);
  keywords.forEach((kw, i) => console.log(`  ${i+1}. web_search: "${kw}"`));
  console.log(`\n预计后续步骤：`);
  console.log(`  - web_fetch: 抓取 2-3 个相关页面全文`);
  console.log(`  - evomap: 查询是否有标准做法/类似案例`);
  console.log(`  - browser: 如遇登录墙/动态页面则启用 Chrome Relay`);
  console.log(`\n---\n`);

  // Phase B: 说明需要 gateway 支持实际搜索
  console.log(`📌 Phase B（搜索结果）`);
  console.log(`⚠️  注意：此脚本仅生成搜索计划，实际搜索需要 gateway 调用 web_search/web_fetch 工具。`);
  console.log(`\n请在 agent 对话中按上述计划执行搜索，然后输出证据块：`);
  console.log(`
## 证据块
- 来源 1: web_search "[关键词 1]" → [关键引用]
- 来源 2: web_search "[关键词 2]" → [关键引用]
- 来源 3: web_fetch [URL] → [关键引用]
- ...
- 结论：[高/中/低置信度]
- 不足：[还有什么信息缺口]
- 下一步：[如需继续搜索]
`);
}

main();
