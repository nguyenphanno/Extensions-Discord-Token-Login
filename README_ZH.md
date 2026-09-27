<div align="center">

<img src="./images/banner.png" alt="Discord Token Login" width="100%" />

# Discord Token Login

**Discord 多账号管理器与令牌切换器**  
*基于 Chromium（Manifest V3）的浏览器扩展。全部在本地运行 —— 无统计分析、无遥测、无第三方端点。*

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-5865F2?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro)
[![AES-256-GCM](https://img.shields.io/badge/AES--256--GCM-5865F2?style=flat-square&logo=lock&logoColor=white)](#-安全模型)
[![Zero Telemetry](https://img.shields.io/badge/Zero-Telemetry-57F287?style=flat-square&logo=shield&logoColor=white)](#-安全模型)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript&logoColor=white)](tsconfig.json)
[![Build](https://img.shields.io/badge/Build-Passing-57F287?style=flat-square&logo=githubactions&logoColor=white)](#-开发与质量门禁)
[![Tests](https://img.shields.io/badge/Tests-134%2F134-57F287?style=flat-square&logo=jest&logoColor=white)](#-开发与质量门禁)
[![License: MIT](https://img.shields.io/badge/License-MIT-ED4245?style=flat-square)](LICENSE)

</div>

<p align="center">
  <a href="#-功能特性">功能</a> •
  <a href="#-界面预览">预览</a> •
  <a href="#-安装">安装</a> •
  <a href="#-安全模型">安全</a> •
  <a href="#-令牌捕获原理">原理</a> •
  <a href="#-开发与质量门禁">开发</a> •
  <a href="#-star-历史">Star 历史</a>
</p>

---

## 🌐 多语言

<p align="center">
  <a href="./README.md"><img src="https://img.shields.io/badge/README-English-5865F2?style=flat-square&logo=googlechrome&logoColor=white" alt="English" /></a>
  <a href="./README_VI.md"><img src="https://img.shields.io/badge/README-Ti%E1%BA%BFng_Vi%E1%BB%87t-5865F2?style=flat-square" alt="Tiếng Việt" /></a>
  <a href="./README_ZH.md"><img src="https://img.shields.io/badge/README-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-5865F2?style=flat-square" alt="简体中文" /></a>
  <a href="./README_KO.md"><img src="https://img.shields.io/badge/README-%ED%95%9C%EA%B5%AD%EC%96%B4-5865F2?style=flat-square" alt="한국어" /></a>
  <a href="./README_JA.md"><img src="https://img.shields.io/badge/README-%E6%97%A5%E6%9C%AC%E8%AA%9E-5865F2?style=flat-square" alt="日本語" /></a>
</p>

---
## 📸 界面预览

<div align="center">

### 主弹窗 —— 快速登录、账号切换、会话状态

<img src="./images/popup.png" alt="Discord Token Login 弹窗" width="820" />

<br />

### 账号管理 —— 多档案、令牌健康状态、私密备注

<img src="./images/accounts.png" alt="Discord Token Login 账号管理" width="820" />

<br />

### 设置 —— 加密模式、口令保险库、捕获行为

<img src="./images/settings.png" alt="Discord Token Login 设置" width="820" />

</div>

---

## ✨ 功能特性

| 模块 | 说明 |
| --- | --- |
| **快速登录** | 粘贴令牌即可登录。令牌在写入任何位置之前都会先被校验。 |
| **令牌捕获** | 直接从已登录的 Discord 标签页读取令牌，无需手动复制任何内容。 |
| **账号管理** | 保存多个账号、自由切换、添加本地备注，并查看哪些令牌仍然有效。 |
| **加密存储** | 每个令牌在写入 `chrome.storage.local` 之前都会用 **AES-256-GCM** 封装。可选的密码保护使用 **PBKDF2-HMAC-SHA256** 派生密钥，迭代 310 000 次。 |
| **右键菜单** | 右键点击工具栏图标即可快速登录、捕获令牌、打开设置 —— 无需先打开弹窗。 |
| **工具栏徽章** | 不打开任何界面即可看到已保存的账号数量。 |
| **干净界面** | 基于 Discord 2023 配色的深色界面，Tabler 实心图标集在构建时打包，设计系统基于比例刻度而非零散数值。 |

---

## 📥 安装

### 从源码构建

```bash
git clone https://github.com/nguyenphanno/Extensions-Discord-Token-Login.git
cd Extensions-Discord-Token-Login
npm install          # 只需一次
npm run build        # 生成 dist/
```

### 加载到浏览器

在 Chrome、Edge、Brave、Opera 或 Arc 中：

1. 打开 `chrome://extensions`（或 `edge://extensions`、`brave://extensions`）
2. 开启 **开发者模式**（右上角开关）
3. 点击 **加载已解压的扩展程序**
4. 选择 `dist/` 文件夹

> **npm 可能会输出 `install-scripts` 警告。** npm 11 默认阻止依赖的生命周期脚本。
> esbuild 不需要它 —— 它的平台二进制文件通过可选依赖 `@esbuild/win32-x64` 提供 ——
> 因此构建依然正常。可以忽略该警告。

### 环境要求

| | |
| --- | --- |
| **浏览器** | Chrome / Edge / Brave / Opera / Arc 116+（Manifest V3） |
| **Node.js** | 20 或更高版本（用于构建与验证套件 —— 扩展本身不需要运行时） |
| **权限** | `storage`、`scripting`、`contextMenus`，以及 `https://discord.com/*` 的 host 访问权 —— 全部在 `src/manifest.json` 中声明 |

---

## 🔒 安全模型

坦白说明，因为夸大自身保障的工具，比坦承自身局限的工具更糟糕。

**能够保证的**

- 令牌以 AES-256-GCM 密文形式存储。每一次写入都会抽取一个 96 位随机 IV ——
  `(密钥, nonce)` 对绝不会被重复使用。
- 在**密码**模式下，密钥由你的密码派生，且*绝不*写入磁盘。它只存在于
  `chrome.storage.session` —— 基于内存、内容脚本无法访问，并在浏览器关闭时被清除。
- 密码错误与记录被篡改会产生完全相同的错误，因此攻击者无法区分"密码错误"和
  "数据损坏"。
- 切换保护模式会重新加密全部记录；若写入失败，则回滚到先前的密文，而不会留下
  一个只迁移了一半的保险库。

**无法保证的**

- 在**设备密钥**模式（默认）下，密钥就放在 `chrome.storage.local` 里，与密文相邻。
  这能防御被复制的配置文件、同步备份，以及随手打开开发者工具的人。但它**无法**
  防御已经在你机器上运行的代码。
- 扩展能够读取 Discord 令牌，这正是它的用途。请把它当作任何其他能接触凭据的
  工具来对待：从你信任的源码安装它。
- Discord 的服务条款同样约束令牌的使用，包括你自己的令牌。

**会留下痕迹吗？** 日志器会在任何形似令牌的内容到达 service worker 控制台之前
将其脱敏，因此开启详细日志不会成为把凭据泄漏到 `chrome://extensions` 的途径。

### 数据流向

```
令牌输入  ──►  结构校验  ──►  AES-256-GCM 封装  ──►  chrome.storage.local
                                              ▲
                                              │
                        设备密钥  ─────────────┤
                        PBKDF2(密码) ───────────┘   （密码模式下：
                                                    密钥仅存在于
                                                    chrome.storage.session）
```

### 威胁模型摘要

| 场景 | 设备密钥模式 | 密码模式 |
| --- | --- | --- |
| 浏览器配置文件被窃取 | ⚠️ 密钥与密文一起被带走 | ✅ 磁盘上只有密文 |
| 配置被同步 / 备份 | ⚠️ 两份都可读 | ✅ 只有密文 |
| 有人打开开发者工具 | ⚠️ 可见 | ✅ 可见，但没有密码则毫无用处 |
| 已在你的身份下运行的恶意软件 | ❌ 无法防御 | ❌ 无法防御 |
| 关闭浏览器 | 密钥仍然存在 | ✅ 密钥从内存中清除 |

---

## 🧠 令牌捕获原理

Discord 标签页的会话归页面所有，因此捕获通过
`chrome.scripting.executeScript` 并设置 `world: 'MAIN'` 完成 —— 直接在页面自身的
JavaScript 上下文中执行。内容脚本运行在隔离环境中，既看不到页面存储，也看不到
客户端的模块。

Discord **并不**把令牌保存在固定的存储键下。运行中的客户端把它保存在内存里，
只在页面卸载时镜像到 `localStorage`，所以在一个完全活跃的会话上执行
`localStorage.getItem('token')` 返回的是空值。因此捕获会按顺序尝试四个层级，
并报告究竟是哪一层给出了答案：

1. **有文档记载的键** —— 在较旧的构建上直接有效，在刚加载完成的页面上也有效。
2. **合成的 `beforeunload`** —— 正是客户端自身刷新数据时所依赖的信号，于是运行中
   的客户端会把它持有的内容发布出来。这里不写入任何东西；扩展只是"按响客户端的
   门铃"。
3. **客户端自己的 `getToken()`** —— 通过打包器的模块缓存访问，方法是推入一个
   no-op chunk 把回调交给缓存。这对已经打开数小时的标签页才有效。只有*同时也能
   写入*令牌的模块才算作认证存储；该 chunk 条目会被弹出，因此页面会保持被找到时
   的原样。
4. **对存储值做有界扫描**，查找形似令牌的字符串，从而兼容把令牌迁移到新键的构建。
   无论键名叫什么，只要该值*确实*是会话令牌就被接受；而嵌在更大数据块中的值，
   只有当键名本身说明了它存放什么时才会被取出。

```
 ┌──────────────────────────────────────────────────────────┐
 │              从 Discord 标签页提取令牌                    │
 └──────────────────────────────────────────────────────────┘
          │
          │  1. 有文档记载的存储键
          │  2. 合成 beforeunload  → 刷新内存
          │  3. 打包器模块缓存     → getToken()
          │  4. 有界存储扫描       → 形似令牌的值
          ▼
   候选按来源与结构排序
          │
          ▼
   由 Discord /users/@me 判定哪个才是真的
```

页面只负责*提议*。客户端中的其他模块会给出长度和字符集与令牌完全一致的字符串 ——
验证码、分析 ID、随机数 —— 任何本地手段都无法把它们与真实会话区分开。因此页面会
返回所有可能的值，并标注它们的来源，以及是否具备真实令牌的*结构*（base64url 分段，
且首段解码后是数字形式的账号 ID），再由 worker 向 Discord 求证哪个是真的：候选按
可信度依次尝试，数量有上限，第一个被 Discord 接受的即胜出。一次误判只会浪费一个
请求，而不是让整次捕获失败；当没有找到任何可用内容时，现在会明确说明，而不是只抛出
一个裸的 401。

### 登录原理

登录是同一个故事的反向版本，也踩着同一个坑：客户端在页面卸载时会把它内存中持有的
会话发布出来，因此一次朴素的存储写入，会被本该用来激活该会话的那次重载所抹除。
所以这次写入会：

- 按客户端存储的方式保存令牌 —— 带 JSON 引号，这正是只要值存在时 `getItem` 就会
  返回的形式；
- 在找得到时调用客户端自己的 `setToken`，并短暂等待模块缓存随 bundle 启动而填充；
- 注册一个一次性的 `beforeunload` 监听器，重新断言目标值。监听器按注册顺序执行，
  所以我们的会在客户端自身处理器之后运行并胜出。它会自行移除，因此后续导航不受影响。

退出登录使用同一个守卫、相反的意图，这正是已退出的标签页在重载后依然保持退出的原因。

> ⚠️ **只捕获你自己的账号。** 令牌就是密码。本项目是一个独立的开源工具，
> **与 Discord Inc. 没有任何关联、未获授权、也未被官方认可**。令牌的用法 ——
> 包括你自己的令牌 —— 受 Discord 服务条款约束。

---

## 📁 项目结构

```
src/
├── manifest.json          MV3 manifest
├── assets/icons/          生成的 PNG（16/32/48/128/512）
│
├── core/                  不含 Chrome API、不含 DOM —— 纯领域逻辑
│   ├── constants.ts       项目中所有可调数值
│   ├── types.ts           领域模型 + worker 消息协议
│   ├── logger.ts          带令牌脱敏的分域日志
│   └── utils/             编码、异步控制流、格式化
│
├── crypto/                保险库
│   ├── aes-gcm.ts         信封加密
│   ├── key-derivation.ts  PBKDF2 / 设备密钥
│   └── vault.ts           锁状态机、原子换钥
│
├── platform/              Chrome API 的薄封装
│   ├── messaging.ts       到 worker 的类型化请求/响应
│   └── settings.ts        明文偏好设置
│
├── services/              应用逻辑
│   ├── discord-client.ts  唯一调用 Discord API 的模块
│   ├── account-service.ts 编排
│   ├── session-injector.ts 登录 / 退出
│   └── token-extractor.ts  从活动标签页捕获
│
├── background/            service worker
│   ├── index.ts           只做监听器接线
│   ├── router.ts          请求 → 处理函数，永不抛错
│   ├── menu.ts            右键菜单
│   └── badge.ts           工具栏徽章
│
├── ui/                    共享、无框架
│   ├── icons.ts           SVG 图标集
│   ├── dom.ts             元素辅助函数
│   ├── feedback.ts        提示、面板、忙碌状态
│   └── styles/            tokens → base → components
│
├── popup/                 380 × 600 弹窗界面
└── options/               完整设置页
```

依赖方向严格单向：`ui → platform → services → crypto → core`。`core/` 中没有任何
模块引入 Chrome API，这正是让安全关键代码得以独立测试的原因。

---

## 🛠️ 开发与质量门禁

```bash
npm install

npm run typecheck      # tsc --noEmit，strict 模式
npm run lint          # 对整个仓库运行 eslint + prettier
npm run verify:crypto  # 跑真实的 AES-GCM / PBKDF2 / 换钥路径
npm run verify:api     # 断言令牌所经由的请求
npm run verify:signin  # 以桩化的浏览器 API 驱动登录流程
npm run verify:extract  # 以桩化的 Discord 标签页驱动捕获
npm run verify:format  # 校验纯格式化与 CDN URL 辅助函数
npm run verify:page    # 以假页面驱动被注入页面的函数
npm run verify:docs    # README 中的所有相对链接均可解析
npm run build          # 打包 + 拷贝 + 校验到 dist/
npm run watch          # 增量重建
npm run icons          # 重新生成 PNG 集合
npm run icons:preview  # 在 icon-sheet.html 中生成图标总览
npm run clean          # 删除 dist/
npm run pack           # 构建并打包为可提交商店的 zip
npm run verify         # 按顺序运行全部十道门禁
```

构建会拒绝输出一个 manifest 或 HTML 引用了不存在文件的 `dist/` —— 损坏的包会让
构建失败，而不是等到 Chrome 里才出问题。

| 门禁 | 检查数 | 它存在的原因 |
| --- | --- | --- |
| `typecheck` | strict `tsc` | 类型、无用导入、API 漂移 |
| `lint` | eslint + prettier | 无用代码、未定义全局、风格漂移——`tsc` 单独抓不到的机械性错误 |
| `verify:crypto` | 20 | 密文不泄露令牌、IV 不复用、错误密码被拒、锁定有效、换钥迁移全部记录且无丢失 |
| `verify:api` | 18 | 令牌在正确的请求头中传输、无前缀无空白；200/401/429 分类正确 |
| `verify:signin` | 15 | 登录等待已提交文档、跨 frame 回退、单次刷新自愈、失败时报告标签页而非令牌 |
| `verify:extract` | 11 | 捕获等待已提交文档、点名每种失败模式、no-storage 恢复只花一次刷新 |
| `verify:page` | 41 | 四个捕获层级、候选排序，以及压过客户端自身处理器的卸载守卫 |
| `verify:format` | 23 | 头像与装扮的 CDN URL、令牌列表解析、雪花 ID 解码与时间分档 |
| `verify:docs` | 6 | 五个 README 中的所有相对链接都指向真实文件 |
| `build` | manifest + HTML | `dist/` 中每个被引用的文件都真实存在 |

每个测试套件都因抓到过真实缺陷而存在。`verify:crypto` 发现了一个首次运行的缺陷：
全新配置文件生成了设备密钥，却仍在读取初始化前的元数据。`verify:api` 抓到过一个
`Token ` 前缀，它让 Discord 对完全有效的令牌回复 `401 Unauthorized`，而当时其他所有
门禁都是绿的。`verify:page` 精确复现了 Chrome 的注入模型 —— 把函数自身的源码放到
一个空 realm 中求值 —— 因为那个让捕获失效了数月的缺陷，是一个被注入的函数去引用
了页面中并不存在的模块绑定，并被它自己的 `try/catch` 吞掉。

---

## ❓ 常见问题

**它会偷走我的账号吗？**
不会。没有服务器，没有统计分析，除 `discord.com` 之外没有任何网络请求。
去读 `src/manifest.json` 和 `src/services/discord-client.ts` —— 它们很短，而且整个
代码库都可以审计。

**为什么不直接读 `localStorage.getItem('token')`？**
因为现代 Discord 把令牌保存在内存中，只在页面卸载时才镜像到存储。参见
[令牌捕获原理](#-令牌捕获原理)。

**我的账号显示已过期。**
Discord 已使该会话失效。请从仍然登录的标签页重新捕获令牌并重新保存。

**能在 Firefox 上使用吗？**
目前不行。该扩展面向 Chromium MV3，并使用带 `world: 'MAIN'` 的
`chrome.scripting.executeScript`，Firefox 的实现方式不同。

**密码模式能保护我不受恶意软件侵害吗？**
不能。任何已在你的身份下运行的东西都能读取进程内存。它保护的是*存储的*副本，
而这才是共用或已备份机器上的现实风险。

---

## 📈 Star 历史

为这个仓库点个星就是最好的支持！

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=nguyenphanno/Extensions-Discord-Token-Login&type=Date" />
  </picture>
</p>

---

## ⚠️ 免责声明

- 本项目是一个独立的开源工具，**与 Discord Inc. 没有任何关联、未获授权、亦未被
  官方认可**。
- "Discord" 及 Discord 标识是 Discord Inc. 的商标。
- 请在遵守 Discord 服务条款的前提下负责任地使用本扩展。切勿把你的认证令牌分享给
  不可信任的第三方。
- 作者不对任何因不当使用导致的账号丢失或限制承担责任。

---

## 📜 许可

基于 [MIT License](LICENSE) 发布。由 [nguyenphanno](https://github.com/nguyenphanno)
用 ❤️ 构建。

编辑代码时若想增量重建，请使用 `npm run watch`。

