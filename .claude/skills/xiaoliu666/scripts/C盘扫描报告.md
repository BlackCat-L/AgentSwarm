# C 盘空间扫描报告

> 扫描时间：2026-06-13  
> C 盘总容量：200 GB | 已用：180.6 GB（90.3%） | 剩余：19.5 GB

---

## 一、概览

| 分类 | 可释放空间 |
|------|-----------|
| 🟢 可安全搬迁（16 项） | **~43 GB** |
| 🟡 可直接删除 | **~3.3 GB** |
| 🔴 不可搬迁 | **~40 GB** |

---

## 二、🟢 可安全搬迁（robocopy → D 盘 + mklink 软链接）

### AI / IDE 工具

| 目录 | 路径 | 大小 |
|------|------|------|
| LarkShell（飞书） | `C:\Users\Admin\AppData\Roaming\LarkShell` | **6.16 GB** |
| Marscode（AI IDE） | `C:\Users\Admin\.marscode` | **5.87 GB** |
| VS Code 插件 | `C:\Users\Admin\.vscode` | **3.02 GB** |
| Code（VS Code 数据） | `C:\Users\Admin\AppData\Roaming\Code` | **2.31 GB** |
| AnthropicClaude | `C:\Users\Admin\AppData\Local\AnthropicClaude` | 627 MB |
| Doubao（豆包） | `C:\Users\Admin\AppData\Local\Doubao` | 530 MB |
| Codex | `C:\Users\Admin\.codex` | 69 MB |

### 包管理器缓存

| 目录 | 路径 | 大小 |
|------|------|------|
| NuGet 包缓存 | `C:\Users\Admin\.nuget` | **2.40 GB** |
| npm 缓存 | `C:\Users\Admin\AppData\Local\npm-cache` | **2.00 GB** |
| uv（Python 包） | `C:\Users\Admin\AppData\Local\uv` | **1.81 GB** |
| pip 缓存 | `C:\Users\Admin\AppData\Local\pip` | 376 MB |
| npm 全局 | `C:\Users\Admin\AppData\Roaming\npm` | **1.29 GB** |
| Gradle 缓存 | `C:\Users\Admin\.gradle` | 887 MB |
| .NET SDK | `C:\Users\Admin\.dotnet` | 268 MB |
| .cache（各类缓存） | `C:\Users\Admin\.cache` | **1.65 GB** |

### 应用数据

| 目录 | 路径 | 大小 |
|------|------|------|
| 微信/QQ 数据 | `C:\Users\Admin\AppData\Roaming\Tencent` | **4.96 GB** |
| WPS Office（Local） | `C:\Users\Admin\AppData\Local\Kingsoft` | **2.66 GB** |
| 百度网盘 | `C:\Users\Admin\AppData\Roaming\BaiduNetdisk` | **2.42 GB** |
| WPS Office（Roaming） | `C:\Users\Admin\AppData\Roaming\kingsoft` | **2.23 GB** |
| Unity 引擎 | `C:\Users\Admin\AppData\Local\Unity` | **4.14 GB** |
| Playwright 浏览器 | `C:\Users\Admin\AppData\Local\ms-playwright` | **1.24 GB** |
| QQ 数据 | `C:\Users\Admin\AppData\Roaming\QQ` | **1.17 GB** |
| Postman | `C:\Users\Admin\AppData\Local\Postman` | 903 MB |
| Quark（夸克） | `C:\Users\Admin\AppData\Local\Quark` | 827 MB |
| 剪映专业版 | `C:\Users\Admin\AppData\Local\JianyingPro` | 741 MB |
| QQ邮箱 | `C:\Users\Admin\AppData\Roaming\QQEX` | 625 MB |
| PikPak | `C:\Users\Admin\AppData\Roaming\PikPak` | 594 MB |
| Steam | `C:\Users\Admin\AppData\Local\Steam` | 424 MB |
| gladekit | `C:\Users\Admin\AppData\Local\gladekit` | 402 MB |
| WorkBuddy | `C:\Users\Admin\.workbuddy` | 208 MB |

---

## 三、🟡 可直接删除（不需要搬，删了就删了）

| 目录 | 路径 | 大小 |
|------|------|------|
| 系统临时文件 | `C:\Users\Admin\AppData\Local\Temp` | **3.31 GB** |

---

## 四、🔴 不可搬迁（系统锁定 / 架构限制）

| 目录 | 路径 | 大小 | 原因 |
|------|------|------|------|
| WSL 虚拟机 | `C:\Users\Admin\AppData\Local\wsl` | 28.14 GB | 虚拟磁盘 .vhdx，不支持 junction |
| Microsoft 系统 | `C:\Users\Admin\AppData\Local\Microsoft` | 11.93 GB | 注册表 + Edge WebCache，系统锁定 |
| CrashDumps | `C:\Users\Admin\AppData\Local\CrashDumps` | 112 MB | 崩溃转储文件 |

---

## 五、搬迁原理

```
robocopy "C:\源路径" "D:\UserData\目标路径" /E /COPY:DAT /DCOPY:T /R:1 /W:1
↓ 复制完成后
Rename-Item "C:\源路径" "源目录.bak"    ← 备份原目录
mklink /J "C:\源路径" "D:\目标路径"     ← 创建软链接，程序无感知
↓ 验证程序正常运行后
rmdir /s /q "C:\源目录.bak"             ← 删除备份，释放空间
```

- 对程序透明：`C:\xxx` 仍然能访问，实际数据在 D 盘
- 不需要改环境变量
- 出问题可以回滚：删除 junction，恢复 .bak 目录即可

---

## 六、Top 10 大户排行

| 排名 | 目录 | 大小 | 可搬？ |
|------|------|------|--------|
| 1 | wsl | 28.14 GB | ❌ |
| 2 | Microsoft | 11.93 GB | ❌ |
| 3 | **LarkShell** | **6.16 GB** | ✅ |
| 4 | **.marscode** | **5.87 GB** | ✅ |
| 5 | **Tencent** | **4.96 GB** | ✅ |
| 6 | **Unity** | **4.14 GB** | ✅ |
| 7 | Temp | **3.31 GB** | 🟡 直接删 |
| 8 | **.vscode** | **3.02 GB** | ✅ |
| 9 | **Kingsoft（Local）** | **2.66 GB** | ✅ |
| 10 | **百度网盘** | **2.42 GB** | ✅ |

---

## 七、预期效果

| 操作 | 释放空间 | C 盘使用率 |
|------|---------|-----------|
| 删 Temp | 3.3 GB | 90.3% → 88.7% |
| + 搬 Top 10 可搬项 | 36.7 GB | 88.7% → 70.4% |
| + 搬其余可搬项 | 6.3 GB | 70.4% → 67.2% |
| **合计** | **~46 GB** | **90.3% → 67.2%** |
