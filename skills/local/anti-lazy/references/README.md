# anti-lazy 参考

## 最小闭环（MVP）

- 识别“需要查证/需要工具”的问题
- Phase A：输出计划 + 需要确认的参数（例如 AMap radius）
- 调用工具
- Phase B：输出最终答案 + 证据块（工具命令+关键字段）

## AMap 模板

- geocode：把地点名变坐标
- poi-around：围绕坐标搜关键词（例如“川菜”）

证据块最少包含：
- AMap 命令行
- geocode 返回 location
- poi-around 返回前 N 条（name, distance, address）
