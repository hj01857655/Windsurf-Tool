# WARP.md

本文件为 WARP (warp.dev) 提供在此代码库中工作的指导。

## 项目概述

Windsurf-Tool 是一个用于管理 Windsurf IDE 账号的 Electron 桌面应用程序。它自动化账号注册、切换和管理，具有批量注册、邮箱验证码接收和自动登录工作流等功能。

**技术栈**: Electron 27.1.0, Puppeteer (puppeteer-real-browser), Node.js IMAP, robotjs (Windows), AppleScript (macOS)

**平台支持**: macOS (完全支持), Windows (适配中)

## 开发命令

### 运行应用程序
```bash
# 以生产模式启动应用
npm start

# 以开发模式启动（启用 DevTools）
npm run dev
```

### 构建发行版
```bash
# 构建所有平台（交互式脚本）
chmod +x build.sh
./build.sh

# 构建特定平台
npm run build:mac          # macOS (x64 和 arm64)
npm run build:mac-arm64    # 仅 macOS Apple Silicon
npm run build:win          # Windows (NSIS 安装程序 + 便携版)
npm run build:linux        # Linux (AppImage + deb)
```

**重要提示**: Windows 构建必须在 Windows 系统上进行，因为需要编译原生模块（robotjs）。

### 安装依赖
```bash
npm install
```

## 高层架构

### 核心架构模式：平台特定的管理器工厂

应用程序使用**工厂模式**来抽象平台差异：

```
WindsurfManagerFactory
  ├─ macOS → WindsurfManager (based on AppleScript 自动化)
  └─ Windows → WindsurfManagerWindows (robotjs + PowerShell 自动化)
```

- `windsurfManagerFactory.js`：检测操作系统并返回适当的管理器实例
- 平台管理器实现相同接口，但使用不同的自动化技术
- 主进程使用工厂，无需知道平台特定实现细节

### 主要组件

#### 1. **Electron 主进程** (`main.js`)
- 处理所有操作的 IPC 处理器（注册、账号切换、配置管理）
- 连接渲染进程与 Node.js 模块
- 管理账号和配置存储的文件 I/O

#### 2. **账号注册系统**
- **RegistrationBot** (`registrationBot.js`)：自动化 Windsurf 账号注册
  - 使用 `puppeteer-real-browser` 自动绕过 Cloudflare Turnstile
  - 生成随机姓名和基于域名的邮箱
  - 支持批量注册，可配置并发数（最多 4 个窗口）
  - 验证码请求间隔 15 秒，避免混淆
  
- **EmailReceiver** (`emailReceiver.js`)：基于 IMAP 的本地验证码接收
  - 无需后端服务器 - 直接连接用户的 IMAP 邮箱
  - 每 5 秒轮询一次验证邮件
  - 重试机制：最多 3 次，间隔 30 秒

#### 3. **账号切换系统**
- **WindsurfManager** (macOS)：使用 AppleScript 进行 UI 自动化
  - 完整重置：关闭应用 → 清除配置/缓存 → 重置机器 ID → 重启
  - 自动引导：通过键盘模拟（Enter 键）完成前 3 个屏幕
  - 登录按钮点击：专用 AppleScript 文件 (`clickLogin.applescript`)
  
- **WindsurfManagerWindows**：使用 robotjs + PowerShell
  - 通过 `tasklist`/`taskkill` 进行进程控制
  - 使用 PowerShell Win32 API 调用进行窗口检测和激活
  - 使用 robotjs 进行键盘模拟

#### 4. **浏览器自动化** (`browserAutomation.js`)
- 基于 Puppeteer 的浏览器自动登录流程
- 检测并等待系统浏览器打开 Windsurf 登录 URL（通过 AppleScript）
- 启动独立的 Puppeteer 实例填写登录表单
- 验证码处理：检测 Cloudflare Turnstile 并等待完成
- 清理：登录后关闭 Puppeteer 浏览器，保留系统浏览器

#### 5. **多语言支持** (`i18n.js`)
- 支持简体中文 (`zh-CN`) 和英文 (`en`)
- 首次启动时显示语言选择界面
- 所有 UI 元素的翻译键

### 关键数据流

**批量注册流程**：
```
用户输入（数量） → RegistrationBot.batchRegister()
  → 每个账号（最多 4 个并发）：
    1. 启动 puppeteer-real-browser
    2. 填写注册表单（姓名、邮箱、密码）
    3. 自动绕过 Cloudflare Turnstile
    4. 等待 15 秒 → EmailReceiver.getVerificationCode()
    5. 输入验证码 → 完成注册
    6. 保存到 accounts.json
```

**账号切换流程**（完全自动）：
```
用户选择账号 → IPC 'auto-switch-account'
  → WindsurfManager.fullReset()：
    1. 关闭 Windsurf (macOS 上 killall -9, Windows 上 taskkill /F)
    2. 删除缓存、配置子目录
    3. 重置 storage.json 和 machineid 文件中的机器 ID
    4. 创建预设配置以跳过欢迎界面
  → WindsurfManager.autoLogin()：
    1. 启动 Windsurf
    2. 自动完成引导（4 个屏幕）
    3. BrowserAutomation.autoLogin() 进行网页登录
```

**机器 ID 重置**（防止设备指纹追踪）：
- 生成新值：`machineId` (64 字符十六进制), `sqmId` (带花括号的 UUID), `devDeviceId` (UUID), `machineid` (UUID)
- 更新 `User/globalStorage/storage.json` 和根目录的 `machineid` 文件
- 将文件设置为只读（macOS 上 chmod 444）以防止覆盖

### 文件存储位置

**macOS**:
- 账号：`~/Library/Application Support/Windsurf-Tool 1.0/accounts.json`
- 配置：`~/Library/Application Support/Windsurf-Tool 1.0/config.json`
- Windsurf 配置：`~/Library/Application Support/Windsurf/`

**Windows**:
- 账号：`%APPDATA%\Windsurf-Tool 1.0\accounts.json`
- 配置：`%APPDATA%\Windsurf-Tool 1.0\config.json`
- Windsurf 配置：`%APPDATA%\Windsurf\`

### 需要维护的关键模式

1. **平台检测**：添加操作系统特定代码时始终使用 `process.platform` 检查
2. **异步错误处理**：所有管理器方法返回 `{ success: boolean, message/error: string }`
3. **日志模式**：管理器接受 `logCallback` 函数以向渲染进程流式传输日志
4. **账号模式**：所有账号至少必须包含 `{ id, email, password, createdAt }`
5. **Pro 试用期**：从 `createdAt` 开始硬编码为 13 天

## 测试注册/登录

不使用 UI 测试注册机器人：
```javascript
// 在 main.js IPC 处理器或单独的测试脚本中
const RegistrationBot = require('./src/registrationBot');
const config = {
  emailDomains: ['yourdomain.com'],
  emailConfig: {
    host: 'imap.example.com',
    port: 993,
    user: 'your@example.com',
    password: 'your-app-password'
  }
};
const bot = new RegistrationBot(config);
bot.registerAccount(console.log).then(result => {
  console.log('Result:', result);
});
```

## Windows 特定注意事项

**当前状态**：Windows 支持已部分实现，但需要测试。

**关键差异**：
- 配置路径：`APPDATA` vs `~/Library/Application Support`
- 进程管理：`taskkill` vs `killall`
- UI 自动化：robotjs vs AppleScript
- 窗口激活：PowerShell Win32 API vs `tell application`

**测试 Windows 功能**：
1. 验证 robotjs 正确安装（需要 Visual Studio Build Tools）
2. 测试 `WindsurfManagerWindows.closeWindsurf()` 和 `launchWindsurf()`
3. 测试 `completeOnboarding()` 中的键盘模拟
4. 确保 PowerShell 窗口检测脚本工作正常

## Cloudflare 绕过

此项目使用带有 `turnstile: true` 选项的 `puppeteer-real-browser` 来自动处理 Cloudflare Turnstile 挑战。该库：
- 提供真实浏览器指纹
- 自动解决 Turnstile 挑战
- 无需手动干预

**不要**尝试实现自定义的 Cloudflare 绕过逻辑 - 依赖该库即可。

## 重要配置

**邮箱域名设置**（注册所需）：
- 用户必须在 Cloudflare Email Routing 中配置域名
- Catch-all 转发应将 `*@domain.com` 路由到用户的 IMAP 邮箱
- 域名存储在 `config.json` 的 `emailDomains` 数组中

**IMAP 配置**（验证码所需）：
- 必须使用应用专用密码，而不是账户密码
- QQ 邮箱：在设置中生成授权码
- Gmail：在 Google 账户设置中生成应用密码
- 存储在 `config.json` 的 `emailConfig` 中
