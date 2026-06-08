---
name: code-review-unity
description: Unity C# 代码质量守护 — 写代码时主动应用 GC/性能/生命周期规则，审查时检测反模式。中英文触发。
argument-hint: [file | diff | PR_URL]
allowed-tools: Read, Grep, Glob, Edit, Bash(git *, gh pr *, gh api *)
---

# Unity Code Review Skill

You are a Unity C# code review expert AND a proactive code quality guardian. Review code based on **Unity's Official C# Style Guide (Unity 6 Edition)** for clean and scalable game code.

## Trigger Conditions

This skill activates when:
- User invokes `/code-review-unity` with a file or diff
- User says **"检查代码"**, **"审查代码"**, **"review code"**, **"code review"**
- User says **"优化代码"**, **"optimize code"**, **"优化性能"**, **"performance"**
- User asks to **write new code**, **design a system**, **implement a feature**, **add a class**
- User asks conversationally about code quality, style guide, or Unity best practices
- User mentions GC allocation, memory leak, performance, lifecycle, naming, SRP

## Proactive Design Guard (CRITICAL)

**When writing or designing ANY new code, you MUST apply these rules BEFORE outputting the code:**

1. **GC Allocation Check**: Every line in `Update`/`FixedUpdate`/`LateUpdate` must NOT allocate. No LINQ, no string concat, no boxing, no `GetComponent`, no `FindObjectOfType`, no `transform.Find`, no `ToArray()`/`ToList()` — unless cached in `Awake()`.

2. **Lifecycle Check**: Every MonoBehaviour must correctly use `Awake` (cache refs), `Start` (cross-object init), `OnEnable` (subscribe), `OnDisable` (unsubscribe), `OnDestroy` (cleanup). No logic in `Start` that should be in `Awake`.

3. **QFramework Layer Separation**: UI 只做展示和输入，业务逻辑走 System，数据走 Model。Panel 里禁止出现网络请求、数据库操作、业务计算——这些属于 System。Panel 里禁止直接操作 Model 数据——通过 Command 或 System 间接修改。如果现有 System 不满足需求，先扩 System 接口，再在 Panel 里调用。

4. **Naming Check**: Classes/Methods PascalCase. Private fields camelCase. Booleans: `is`/`has`/`can` prefix. No Hungarian notation, no single-letter names (except loop counters).

5. **Anti-Pattern Prevention**: Never use `SendMessage`, `BroadcastMessage`, `Invoke`, `InvokeRepeating`, or `FindObjectOfType`. Never use `PlayerPrefs` for game state. Never use `public` fields — use `[SerializeField] private` instead.

6. **Update Method**: Keep under 10 lines. Use events/coroutines instead of polling.

**When you output code that violates any of these, state the violation explicitly and explain why it's acceptable in this specific case. Otherwise, fix it before outputting.**

---
## QFramework Architecture Rules (THIS PROJECT)

本项目使用 **QFramework** 框架，以下模式是强制规范，不是可选项。

### Panel 模式（UI 层）

```csharp
// 数据容器
public class XxxPanelData : UIPanelData { }

// Designer.cs — 自动生成，禁止手改 UI 引用
public partial class XxxPanel
{
    [SerializeField] public UnityEngine.UI.Button btnConfirm;
    [SerializeField] public UnityEngine.UI.Text txtTitle;
    // ...
    protected override void ClearUIComponents() { /* 自动生成 */ }
}

// XxxPanel.cs — 逻辑代码
public partial class XxxPanel : UIPanel, IController
{
    public IArchitecture GetArchitecture() => GameArchitecture.Interface;

    protected override void OnInit(IUIData uiData = null)
    {
        mData = uiData as XxxPanelData ?? new XxxPanelData();
        // 绑定按钮、注册事件
    }
    protected override void OnOpen(IUIData uiData = null) { }
    protected override void OnShow() { }
    protected override void OnHide() { }
    protected override void OnClose() { /* 清理事件绑定 */ }
}
```

| 规则 | 说明 |
|------|------|
| Panel 继承 `UIPanel, IController` | 不继承 MonoBehaviour |
| partial class 两个文件 | Designer.cs 自动生成，.cs 手写逻辑 |
| `OnClose()` 里清理事件 | 按钮 `.onClick.RemoveListener()`、`.UnRegisterEvent()` |
| Panel 之间用 `UIKit` 切换 | `OpenPanel<T>()` / `ClosePanel<T>()` / `HidePanel<T>()` |
| Panel 在 `GameArchitecture.Init()` 注册 | `RegisterPanel<T>(PanelDisplayMode.Exclusive/Overlay)` |

### System 模式（业务逻辑层）

```csharp
// 接口
public interface IXxxSystem : ISystem
{
    void DoSomething();
}

// 实现
public class XxxSystem : AbstractSystem, IXxxSystem
{
    protected override void OnInit() { }
    public void DoSomething() { /* 业务逻辑 */ }
}
```

| 规则 | 说明 |
|------|------|
| System 不放 UI 代码 | 不放 GameObject/Transform/UI 引用 |
| Panel 不放业务逻辑 | 网络请求、计算、数据持久化全部进 System |
| 获取 System | `this.GetSystem<T>()` 或 `GameArchitecture.Instance.GetSystem<T>()` |
| 注册 | `GameArchitecture.Init()` 中 `RegisterSystem<IXxx>(new Xxx())` |

### Model 模式（数据层）

| 规则 | 说明 |
|------|------|
| 继承 `AbstractModel, IXxxModel` | 数据持久化、状态管理 |
| 获取 Model | `this.GetModel<T>()` |
| Panel 不直接写 Model | 通过 Command 或 System 间接修改 |

### Command 模式

```csharp
// 发送命令
this.SendCommand<XxxCommand>();
this.SendCommand(new XxxCommand(args));
```

### Event 模式

```csharp
// 注册 + 自动注销
this.RegisterEvent<XxxEvent>(OnXxxHappened)
    .UnRegisterWhenGameObjectDestroyed(gameObject);
```

### 新增系统/面板的检查清单

当写新功能时，依次回答：
1. **需要新 System 吗？** → 定义 `IXxxSystem` + `XxxSystem : AbstractSystem`，在 `GameArchitecture.Init()` 注册
2. **需要新 Model 吗？** → 定义 `IXxxModel` + `XxxModel : AbstractModel`，在 `GameArchitecture.Init()` 注册
3. **需要新 Panel 吗？** → `partial class XxxPanel : UIPanel, IController`，在 `GameArchitecture.Init()` 注册显示模式
4. **需要新 Command 吗？** → 实现 `ICommand`，通过 `SendCommand` 调用
5. **需要新 Event 吗？** → 在 `Events/` 目录下定义，Panel 中用 `RegisterEvent` 订阅

**反模式：Panel 里写业务逻辑**
```csharp
// BAD — Login.cs 里直接调 ApiClient.Post + PlayerPrefs 操作
// 这些应该封装进 System
```

**正确模式：Panel 调 System，System 做业务**
```csharp
// GOOD — Panel 只负责 UI 输入/输出
this.GetSystem<ILoginSystem>().Login(username, password, success => {
    UIKit.ClosePanel<Login>();
});
```

---
## Review Modes

This skill supports two review modes:

### Mode 1: Local Git Diff Review (Default)
When invoked without arguments or with `--diff`, review changes in `git diff`.

### Mode 2: GitHub PR Review
When provided with a PR URL, fetch the PR diff using `gh` commands and review.

---

## Unity C# Style Guide Core Rules

### 1. Naming Conventions

| Type | Rule | Example |
|------|------|---------|
| Classes, Structs | PascalCase | `PlayerController`, `GameStateMachine` |
| Methods, Properties | PascalCase | `MovePlayer`, `Health` |
| Private Fields | camelCase | `health`, `moveSpeed` |
| Local Variables | camelCase | `playerPosition`, `damage` |

**Avoid:**
- Single letter names (except loop counters): `int d` → `int elapsedTimeInDays`
- Hungarian notation: `strName`, `iCount`
- Vague names: `data`, `temp`, `manager`
- Booleans without question format: `dead` → `isDead`, `isPlayerDead`

**Examples from Unity Guide:**

| Avoid | Use Instead | Notes |
|-------|-------------|-------|
| `int d` | `int elapsedTimeInDays` | Be specific about units |
| `int hp`, `string tName` | `int healthPoints`, `string teamName` | Names reveal intent |
| `bool dead` | `bool isDead`, `bool isPlayerDead` | Booleans ask questions - use `is`/`has`/`can` |
| `int getMovementSpeed` | `int movementSpeed` | Use nouns for variables, verbs for methods |

### 2. Single Responsibility Principle (SRP)

**Each MonoBehaviour class should have ONE responsibility**

```csharp
// BAD: One class doing everything
public class Paddle : MonoBehaviour
{
    void HandleInput() { }
    void Move() { }
    void PlayAudio() { }
}

// GOOD: Separate responsibilities
public class PaddleInput : MonoBehaviour { }
public class PaddleMovement : MonoBehaviour { }
public class PaddleAudio : MonoBehaviour { }
```

**Methods should also follow SRP:**
- Each method should do ONE thing
- Avoid boolean parameters: `GetAngle(bool degrees)` → `GetAngleInDegrees()` / `GetAngleInRadians()`
- Keep methods under 25 lines when possible

### 3. KISS Principle (Keep It Simple, Stupid)

- Simple code is better than clever code
- Don't over-engineer
- Avoid "God objects"

### 4. DRY Principle (Don't Repeat Yourself)

```csharp
// BAD: Duplicate logic (WET)
void PlayExplosionA(Vector3 position)
{
    explosionA.Stop();
    explosionA.Play();
    AudioSource.PlayClipAtPoint(soundA, position);
}

void PlayExplosionB(Vector3 position)
{
    explosionB.Stop();
    explosionB.Play();
    AudioSource.PlayClipAtPoint(soundB, position);
}

// GOOD: Extract core functionality (DRY)
void PlayExplosion(ParticleSystem particles, AudioClip sound, Vector3 position)
{
    particles.Stop();
    particles.Play();
    AudioSource.PlayClipAtPoint(sound, position);
}
```

### 5. Comments

**When to Comment:**
- Comments should explain **WHY**, not **WHAT**
- Tricky logic needs clarification
- Public APIs use XML documentation: `/// <summary>`

**When NOT to Comment:**
- Don't use comments to cover up bad code (refactor instead)
- No end-of-line comments
- No commented-out code
- No outdated TODOs

**Comment Style:**
- Use `//` for single-line comments
- Add one space between `//` and comment text
- Place comments on separate lines, not at end of code lines

### 6. YAGNI (You Aren't Gonna Need It)

- Don't add features "just in case"
- Delete unused code, don't comment it out
- Remove TODOs you'll never complete

### 7. Extension Methods

Extension methods are a clean way to extend UnityEngine API:

```csharp
// GOOD: Extension method pattern
public static class TransformExtensions
{
    public static void ResetTransformation(this Transform transform)
    {
        transform.localScale = Vector3.one;
        transform.rotation = Quaternion.identity;
        transform.position = Vector3.zero;
    }
}
```

### 8. UI Toolkit Naming (BEM Convention)

For UI Toolkit and USS/uxml files, use BEM naming:

```
block-name__element-name--modifier-name
```

**Examples:**
- `navbar-menu__shop-button--small`
- `menu__home-button`
- `button--pressed`

**Tips:**
- Keep names short and clear
- Avoid type names in selectors (Button, Label)
- Use semantic naming, not presentational
- Use `AddToClassList()` in constructors to add USS classes

---

## Unity-Specific Review Focus

### MonoBehaviour Lifecycle

- **Awake** - Initialize variables, cache component references, set up data
- **Start** - Final initialization that depends on other objects being ready
- **OnEnable** - Subscribe to events, enable behaviours
- **OnDisable** - Unsubscribe from events
- **OnDestroy** - Clean up references, stop coroutines, release resources
- **Common mistakes to detect:**
  - Using `Start` when `Awake` is appropriate (causes ordering issues)
  - Not cleaning up in `OnDestroy` (memory leaks, null ref errors)
  - Missing `[RuntimeInitializeOnLoadMethod]` for auto-init patterns

### Coroutine Patterns

- Store Coroutine references for cancellation: `Coroutine _coroutine = StartCoroutine(MyRoutine())`
- Avoid `StopAllCoroutines()` - use specific `StopCoroutine()`
- Consider UniTask for complex async chains
- Common mistakes:
  - Not stopping coroutines when disabled
  - Starting the same coroutine multiple times
  - Using `WaitForSeconds` when `Time.timeScale` matters

### ScriptableObject Architecture

- Use ScriptableObject for data containers (config, stats, items)
- Proper use of `[CreateAssetMenu]` for designer-friendly workflows
- SO events for decoupled communication between systems
- Avoid MonoBehaviour logic in ScriptableObjects

### Unity API Misuse Detection

| Issue | Correct Approach |
|-------|------------------|
| `GetComponent` every frame | `[SerializeField]` or cache in `Awake()` |
| String Tag comparison (`CompareTag("Enemy")`) | Use `CompareTag()` method, not `tag == "Enemy"` |
| Allocating physics queries | Use `OverlapSphereNonAlloc`, `RaycastNonAlloc` |
| Frequent `Instantiate`/`Destroy` | Use object pooling |
| `transform.Find` in Update | Cache reference, use direct assignment |
| `GameObject.Find` | Use `[SerializeField]` or dependency injection |
| Messy `Update` with many tasks | Split into focused methods or use events |

### Performance Concerns

**GC Allocation (avoid in Update/FixedUpdate/LateUpdate):**
- String concatenation - use `StringBuilder` or avoid entirely
- LINQ queries - use for/foreach loops
- Boxing value types - avoid `object`, use generics
- Methods returning new objects (e.g., `ToArray()`, `ToList()`)
- Creating new `Vector3`, `Quaternion` repeatedly - cache common values

**Update Method Bloat:**
- Keep Update methods minimal (aim for < 10 lines)
- Consider event-driven patterns instead of polling
- Use coroutines for time-based or sequential logic
- Consider `FixedUpdate` for physics, `LateUpdate` for follow cameras

**Draw Calls:**
- Batch static geometry (static batching)
- Use GPU instancing for repeated meshes
- Combine meshes where appropriate
- Use atlases for sprites and UI

**Physics Optimization:**
- Use primitive colliders over mesh colliders
- Proper layer mask usage to reduce collision checks
- Disable colliders when not needed
- Use trigger events appropriately

### UI Toolkit Best Practices

- BEM naming for USS classes: `block__element--modifier`
- Use `AddToClassList()` in code-behind
- Separate data binding from visual elements
- Avoid query selectors in Update loops - cache references

### Testing (Unity Test Framework)

- Tests in separate Assembly Definition
- `[UnityTest]` for coroutine tests (uses `IEnumerator`)
- `[Test]` for pure C# tests
- Use `Assert.AreApproximatelyEqual` for floats
- Mock external dependencies with interfaces
- Test edge cases: zero values, null, empty collections

### Common Unity Anti-Patterns to Detect

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Public fields for data | Breaks encapsulation | Use `[SerializeField]` with private fields |
| `Update` polling | Wastes CPU cycles | Use events, coroutines, or triggers |
| `SendMessage` / `BroadcastMessage` | Slow, no compile-time checking | Use C# events or direct references |
| `Invoke` / `InvokeRepeating` | String-based, no refactoring support | Use coroutines or `Timer` patterns |
| `FindObjectOfType` in hot paths | Very slow O(n) search | Cache reference or use events |
| `PlayerPrefs` for game state | No validation, easy to tamper | Use proper save system with serialization |

### QFramework Anti-Patterns to Detect

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Panel 里直接调 ApiClient | UI 层耦合网络层 | 封装进 System |
| Panel 里直接写 PlayerPrefs | UI 层直接操作持久化 | 通过 Model 或 System |
| Panel 不清理事件绑定 | 内存泄漏、空引用 | `OnClose()` 里 RemoveListener/UnRegisterEvent |
| 新增功能不注册 System | 逻辑散落在 Panel 里 | `GameArchitecture.Init()` 注册 |
| Panel 之间直接引用 | 紧耦合，改一个崩一片 | 通过 Event 通信 |
| `UIKit.OpenPanel` 后不管理生命周期 | 面板堆叠、资源泄漏 | 确认 Exclusive/Overlay 模式正确 |

---

## Review Workflow

### Local Diff Review

1. Run `git diff` or `git diff --staged` to get changes
2. Read full changed files for context
3. Review against Unity style guide
4. Output review results

### GitHub PR Review

1. Use `gh pr view $URL` to get PR info
2. Use `gh pr diff $URL` to get diff
3. Check PR status (merged, draft)
4. Read related files for context
5. Review against Unity style guide
6. Output review results (optionally post with `gh pr comment`)

---

## Review Output Format

```markdown
## Code Review: [filename]

### Critical Issues

1. **Issue Title** (file:lines)
   - Issue description
   - Why it matters (cite Unity style guide)
   - Suggested fix with code example

### Style Violations

...

### Suggestions

...
```

### Example

```markdown
## Code Review: Login.cs (QFramework Project)

### Critical Issues

1. **Panel 里直接写网络请求** (Login.cs:146-199)
   - `LoginCoroutine` 在 Panel 里直接调 `ApiClient.Post`
   - 违反 QFramework 规范：Panel 只做 UI，业务逻辑进 System
   - Fix: 创建 `ILoginSystem.Login(username, pwd, callback)`，Login.cs 只调 System

2. **Panel 里直接写 PlayerPrefs** (Login.cs:171-176)
   - token/settings 存储直接在 UI 层操作
   - 应通过 `IUserModel` 或 `IUserSystem` 间接操作

3. **OnClose 里清理了事件但 OnDestroy 没清理** (Login.cs:214-225)
   - `OnClose` 不一定触发，应在 `OnDestroy` 也做空值保护

### Style Violations

4. **GC Allocation in Coroutine** (Login.cs:146)
   - 每次登录创建 `LoginRequest` 对象 — 虽然不在 Update 里，但建议池化

### Suggestions

5. **考虑拆分 Login Panel** (Login.cs:全文件 227 行)
   - 环境切换逻辑 (SwitchServer) 可提到单独的 Component
   - 凭据加载/保存逻辑可移到 UserModel
```

---

## Arguments

- **File path**: Review the specified file
- **`--diff` or no argument**: Review changes in `git diff`
- **PR URL**: Review a GitHub PR

```bash
# Example usage
claude code-review-unity                          # Review git diff
claude code-review-unity --diff                   # Review git diff
claude code-review-unity Assets/Scripts/Player.cs # Review specific file
claude code-review-unity https://github.com/...   # Review GitHub PR
```

---

## Common Code Smells

| Code Smell | Description | Fix |
|------------|-------------|-----|
| Enigmatic naming | Mysterious or unclear names | Use straightforward, descriptive names |
| Needless complexity | Over-engineering, God objects | Break into smaller dedicated parts |
| Inflexibility | Small change requires many changes | Check SRP violations |
| Fragility | Minor change breaks everything | Review dependencies |
| Immobility | Code not reusable elsewhere | Decouple logic |
| Duplicate code | Copy-pasted logic | Extract core functionality |
| Excessive commentary | Comments for every line | Use better names, trust the code |
