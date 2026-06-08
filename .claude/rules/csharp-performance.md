---
paths:
  - "Assets/Scripts/**/*.cs"
description: C# 性能规则 — 仅在触碰 C# 文件时加载
---

# Unity C# 性能规则

## GC 零分配（每帧调用路径）
- 禁用 LINQ
- 禁用 string 拼接（用 StringBuilder 或缓存）
- 禁用 boxing
- 禁用 GetComponent / FindObjectOfType / transform.Find（缓存到 Awake）
- 禁用 ToArray() / ToList()

## Update 方法
- 保持 10 行以下
- 用事件/coroutine 替代轮询

## 物理查询
- 用 NonAlloc 版本：OverlapSphereNonAlloc, RaycastNonAlloc

## 对象池
- 频繁 Instantiate/Destroy → 用对象池
