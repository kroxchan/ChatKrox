# Codex 协作示例

## 示例 1：文件列表

**任务**：列出当前目录的前 10 个文件

```json
{
  "agentId": "coder",
  "task": "列出当前工作目录的前 10 个文件或文件夹名称，每行一个，不需要其他说明。",
  "timeoutSeconds": 60
}
```

**预期输出**：
```
1. AGENTS.md
2. MEMORY.md
3. README.md
4. docs/
5. examples/
6. scripts/
7. skills/
8. tmp/
9. tools/
10. USER.md
```

---

## 示例 2：读取文件

**任务**：读取第一个文件的内容

```json
{
  "agentId": "coder",
  "task": "列出当前目录的前 5 个文件，然后读取第一个文件的内容（如果是文本文件），输出文件名和前 3 行内容。",
  "timeoutSeconds": 120
}
```

**预期输出**：
```
文件：AGENTS.md
前 3 行：
# AGENTS.md - Your Workspace

This folder is home. Treat it that way.
```

---

## 示例 3：代码检查

**任务**：检查 Python 脚本语法

```json
{
  "agentId": "coder",
  "task": "检查 scripts/ 目录下所有 .py 文件的语法，报告有错误的文件和错误信息。",
  "timeoutSeconds": 180
}
```

**预期输出**：
```
检查结果：
- scripts/test.py: ✅ 语法正确
- scripts/fix.py: ✅ 语法正确
- scripts/old.py: ❌ 第 15 行：SyntaxError: invalid syntax
```

---

## 示例 4：批量重命名

**任务**：批量重命名文件

```json
{
  "agentId": "coder",
  "task": "将 tmp/ 目录下所有 .txt 文件重命名为 .bak 扩展名，输出重命名列表。",
  "timeoutSeconds": 120
}
```

**预期输出**：
```
重命名完成：
- tmp/log.txt → tmp/log.bak
- tmp/test.txt → tmp/test.bak
- tmp/data.txt → tmp/data.bak
```

---

## 示例 5：生成报告

**任务**：生成项目结构报告

```json
{
  "agentId": "coder",
  "task": "分析当前目录结构，生成 Markdown 格式的项目结构报告，包含目录树和文件统计。",
  "timeoutSeconds": 300
}
```

**预期输出**：
```markdown
# 项目结构报告

## 目录树
```
workspace/
├── docs/
├── examples/
├── scripts/
├── skills/
└── tmp/
```

## 文件统计
- 总文件数：42
- Python 文件：15
- Markdown 文件：20
- 其他：7
```

---

## 示例 6：代码修复

**任务**：修复语法错误

```json
{
  "agentId": "coder",
  "task": "检查 scripts/fix_path.py 的语法错误，修复并输出修复后的完整代码。",
  "timeoutSeconds": 180
}
```

---

## 示例 7：Git 操作

**任务**：提交并推送更改

```json
{
  "agentId": "coder",
  "task": "将 docs/ 目录下的所有新文件添加到 git，提交并推送到 origin/public-skills 分支。",
  "timeoutSeconds": 120
}
```

---

## 示例 8：多步骤任务

**任务**：分析 + 修复 + 测试

```json
{
  "agentId": "coder",
  "label": "fix-and-test",
  "task": "第一步：分析 scripts/ 目录下所有 Python 脚本的潜在问题"
}
```

```json
{
  "agentId": "coder",
  "label": "fix-and-test",
  "task": "第二步：修复发现的问题"
}
```

```json
{
  "agentId": "coder",
  "label": "fix-and-test",
  "task": "第三步：运行测试验证修复"
}
```

---

## 最佳实践

### 1. 任务描述要具体

❌ 不好：
```json
{"task": "修复代码"}
```

✅ 好：
```json
{"task": "检查 scripts/ 目录下所有 .py 文件的语法错误，修复并输出修复后的代码"}
```

### 2. 设置合理超时

| 任务复杂度 | 超时设置 |
|------------|----------|
| 简单查询 | 30-60 秒 |
| 文件操作 | 60-120 秒 |
| 代码分析 | 120-180 秒 |
| 批量处理 | 180-300 秒 |

### 3. 使用标签复用会话

相关任务使用相同 `label`：
```json
{"label": "refactor-auth", "task": "..."}
{"label": "refactor-auth", "task": "..."}
```

### 4. 限制输出格式

明确要求输出格式：
```json
{"task": "输出文件列表，每行一个，不需要其他说明"}
```

---

## 错误处理

### 超时处理

如果任务超时，子代理会自动终止。可以：
1. 增加 `timeoutSeconds`
2. 拆分任务为更小的子任务

### 失败重试

```json
{
  "agentId": "coder",
  "task": "重试上次的文件操作任务",
  "timeoutSeconds": 120
}
```

### 查看详细错误

```powershell
sessions_history --sessionKey <key> --limit 20 --includeTools true
```
