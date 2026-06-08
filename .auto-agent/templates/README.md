# 代码模板目录

> 部署到目标项目后，根据项目技术栈创建对应模板。
> 模板命名规则：`<类型>-template.<扩展名>`

## 模板说明

每个模板应包含：
1. **起手式骨架** — 文件的基本结构（命名空间、导入、类声明）
2. **必填占位符** — `{Name}` 等需要替换的标记
3. **常见模式** — 项目中同类文件的惯用写法
4. **注册指引** — 新模块在架构入口的注册方式

## 示例（按项目类型）

### CLI 工具项目（Bash/PowerShell）
```
templates/
├── script-template.sh     # Bash 脚本模板
├── module-template.ps1    # PowerShell 模块模板
└── config-template.json   # 配置文件模板
```

### Web 应用项目（TypeScript/React）
```
templates/
├── component-template.tsx  # React 组件模板
├── service-template.ts     # API Service 模板
└── test-template.ts        # 单元测试模板
```

### Unity 游戏项目（C# / QFramework）
```
templates/
├── system-template.txt     # System 模板
├── model-template.txt      # Model 模板
├── command-template.txt    # Command 模板
├── utility-template.txt    # Utility 模板
├── controller-template.txt # Controller 模板
└── query-template.txt      # Query 模板
```

## 创建新模板

1. 找一个项目中写得好、被审查过的"典范文件"
2. 去掉具体业务逻辑，保留结构和注释
3. 用 `{PlaceholderName}` 标记需要替换的部分
4. 放到此目录，加到本 README 的列表中
