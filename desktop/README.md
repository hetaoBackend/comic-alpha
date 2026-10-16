# ComicPerfect：Web 与 macOS

两个入口共用 `index.html`、`frontend/` 和 Flask 业务代码。Mac 应用内置 Python 服务，安装后的用户无需安装 Python、uv 或 Node。

## 开发与运行

Web 保持原有方式：在项目根目录运行 `./start.sh`，浏览器打开 `http://localhost:8000`。

Mac 开发入口（首次需要 Node/npm 和 uv）：

```sh
npm install
npm run desktop:prepare
npm run desktop
```

Mac 窗口自动启动服务，支持系统编辑菜单、缩放、全屏、原生导出对话框和 Dock 重新打开。窗口位置、大小、缩放与每个创作空间的阅读位置会保留；外接显示器断开时会将窗口移回可见区域。关闭、重新载入或切换空间前，会等待草稿和分镜同步。生成仍在进行或保存失败时会说明影响，并提供继续创作的选项。Command+Q 同时退出服务；关闭窗口后遵循 macOS 惯例保留应用。

Web 默认使用 8000/5003。Mac 客户端使用 `comicperfect://app` 内部界面协议与父子进程 stdin/stdout 管道，不创建 TCP 监听端口；Web 与客户端可独立运行。Mac 只允许一个应用实例。升级后界面来源改变，旧来源中的模型偏好需要重新设置；已保存到创作空间的作品、图像和加密凭据保留。

## 打包

在目标架构的 Mac 上执行：

```sh
npm run desktop:pack   # 本机缓存目录中的 mac-arm64/ComicPerfect.app（Apple Silicon）
npm run desktop:dist   # 生成 DMG 和 ZIP
```

打包脚本先用 PyInstaller 收集后端及依赖，再用 Electron Builder 生成应用。应用构建于 `~/Library/Caches/ComicPerfect/build/`，避免 iCloud 同步元数据导致签名失败；DMG 和 ZIP 完成后复制到项目 `dist/`。Apple Silicon 和 Intel 需分别在相应架构环境构建，不能用当前架构的 Python 服务直接生成另一架构安装包。

默认使用 ad-hoc 本地签名，不会自动选择电脑上的开发者证书。正式分发需用 Electron Builder 的 `-c.mac.identity="Developer ID Application: …"` 覆盖签名身份，并配置开发者自己的 CSC_*、APPLE_* 签名和公证环境变量。默认输出供本地验证的未公证应用。

Mac App Store 使用独立的 `appstore:check`、`appstore:dev` 和 `appstore:release` 流程，详见 [商店发布记录](../docs/app-store/README.md)。商店构建排除第三方角色参考图和示例漫画，普通本地构建保留原有资源。商店版使用无监听端口的进程间通信、系统文件夹授权和加密凭据，Codex 登录从菜单主动连接。商店版最低 macOS 15，当前仅 Apple Silicon；实际提交状态以发布记录为准。

## 数据与现有创作空间

- 开发模式复用仓库中的创作空间及 `backend/static/images`，与本机 Web 端共享服务端草稿；浏览器与桌面窗口的 localStorage（API 设置等）分别保存。
- 安装版数据位于 `~/Library/Application Support/ComicPerfect/workspace/`，包含 `ComicBrain/` 和 `images/`。应用更新不覆盖这些数据。
- 新安装仅带可复用工作空间骨架；安装包不会包含作者的 Wiki、production 章节、草稿、凭据或历史生成图片。
- 菜单“创作空间 → 选择已有创作空间…”可关联现有完整创作空间并重启。自动查找相邻的 `backend/static/images` 或 `images`；非标准布局可用“选择图片文件夹…”为当前空间指定图片目录。按空间记录该目录，不移动或删除图片。草稿缓存按空间标识隔离；旧缓存仅迁入首次关联的空间，不会在切换后混入另一空间。
- `COMICBRAIN_ROOT`、`COMIC_IMAGE_DIR` 可覆盖路径，环境变量优先于菜单设置；Finder 启动时通常不会继承终端环境变量。
- Codex 路径继续读取本机 `~/.codex/auth.json`（或 `CODEX_AUTH_FILE`），不会将凭据打进安装包。首次使用前需在本机完成 Codex 登录；OpenAI/Gemini 仍在创作设置中配置。

## 共享运行机制

`serve_frontend.py` 继续作为唯一静态服务器，严格限制公开目录。它额外提供不缓存的 `/runtime-config.js`，将实际 API 地址传入前端；Web 可用 `COMIC_API_BASE_URL` 指定可访问的后端 `/api` 地址。HTTPS 部署需要配套 HTTPS API 或同源反向代理，完整私有创作空间功能仍要求本机访问。

图片写入、引用加载和界面读取统一使用 `COMIC_IMAGE_DIR`，不向 `.app` 包内写文件。Mac 采用固定界面来源保存 localStorage；图片使用内部协议的相对路径。渲染窗口禁用 Node、启用隔离和沙箱，外部网页在系统浏览器中打开。

验证：`npm run test:frontend` 与 `uv run --project backend python -m unittest discover -s backend/tests`。启动日志在应用数据目录的 `desktop-service.log`。


## 共用代码与桌面边界

| 层 | 代码 | 职责 |
| --- | --- | --- |
| 创作界面与业务编排 | `frontend/js/app.js`、`consoleViews.js`、`consoleStore.js` | 两端完全共用：系列、单篇、分镜、出图、版本、封面、复盘、社交文案、保存与导出 |
| 应用命令 | `frontend/js/commandContract.js`、`appCommands.js` | 一份命令定义；Web 快捷键与 Mac 菜单进入相同处理器；统一保存与离开前检查 |
| 产品后端 | `backend/controllers/`、`backend/services/` | 一份 Flask API 与业务服务；模型调用与创作数据处理不依赖 Electron |
| 路径与并发 | `backend/runtime_paths.py`、`workspace_lock.py` | 统一资源/图片/空间路径；草稿写入使用跨进程锁和修订冲突检查 |
| 原生适配 | `desktop/window.cjs`、`menu.cjs`、`settings.cjs` | macOS 窗口、菜单、系统目录选择、原生下载对话框和壳配置 |
| 隔离通信 | `desktop/preload.cjs`、`bridge.cjs` | 仅传递命令、状态和保存确认；校验来源和主框架；不开放任意文件或进程 API |
| 运行与打包 | `desktop/service.cjs`、`server.py`、`build_*.py/cjs` | 管理本地进程、管道通信、骨架初始化与打包；不实现任何创作功能 |

禁止在 desktop 目录重新实现生成、保存、导出或作品数据模型。平台分支只用于原生能力或适配文案。`loading.html` 仅是服务启动期间的占位页。

两端能力一致，不代表自动同步各浏览器的凭据与设置。关联同一创作空间及图片目录时可访问相同服务端作品；同一修订被两端同时编辑时，后保存者收到冲突提示，修改保留在本机，不会静默覆盖。

## 常用快捷键

Web 与 Mac 使用同一命令定义；Mac 使用 Command，其他系统使用 Ctrl。

| 快捷键 | 操作 |
| --- | --- |
| Command/Ctrl+N | 新建单篇漫画 |
| Command/Ctrl+Shift+N | 新建系列 |
| Command/Ctrl+S | 立即保存草稿及待同步分镜 |
| Command/Ctrl+Shift+E | 导出当前作品；未出图时导出草稿 JSON |
| Command/Ctrl+, | 创作设置 |
| Command/Ctrl+1 / 2 / 3 | 工作台 / 系列 / 作品 |
| Command/Ctrl+[ / ] | 后退 / 前进 |

Mac 的 Command+W 关闭窗口，Command+R 安全重新载入，Command+Q 退出。Web 使用浏览器的关闭和刷新操作；本机草稿立即保留，未完成同步在重新打开后重试，生成任务进行中或本机保存失败时由浏览器提示。

## 系列人物设定

系列详情的“人物设定”支持添加或移除人物、修改名字、上传或移除参考图，并显式保存。每位人物最多 8 张参考图；支持 10 MB 以内的 PNG、JPG、WebP。初次读取系列时从已确认的人物视觉资产导入，尚无剧情档案的已确认视觉来源也会导入。候选图不自动成为出图依据。

人物配置保存在当前创作空间的 `production/.characters/<series-id>.json`，预览副本使用当前图片目录。配置用于后续系列页面和封面生成，不自动改写人物正史或历史成品；人物改名保留原名字用于匹配旧脚本。两个窗口同时保存时使用修订号检测冲突。
