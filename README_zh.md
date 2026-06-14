# 🎨 漫画分镜生成器

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | [简体中文](./README_zh.md)

<div align="center">
  <img src="./assets/banner.jpeg" alt="logo" width="200" height="auto" />
  <h1>Comic Panel Generator</h1>
  <p>一个基于 AI 的漫画分镜脚本生成工具，支持多页漫画生成和图片导出</p>
</div>

## 📸 截图与示例

### 界面演示

<table>
<tr>
<td width="50%">

**中文界面**

![中文界面](./assets/demos/screenshot_cn.png)

</td>
<td width="50%">

**英文界面**

![英文界面](./assets/demos/screenshot_en.png)

</td>
</tr>
<tr>
<td colspan="2">

**配置面板**

![配置面板](./assets/demos/config-panel.png)

</td>
</tr>
</table>

### 生成的漫画示例

<table>
<tr>
<td width="50%">

**中文漫画示例**

![哆啦A梦漫画](./assets/examples/doraemon-sample-comic_cn.png)

</td>
<td width="50%">

**英文漫画示例**

![美式漫画](./assets/examples/american-comic-sample.png)

</td>
</tr>
</table>

> 💡 **查看更多示例和演示请访问 [assets 文件夹](./assets/README.md)**

## 项目架构

```
comic_alpha/
├── assets/                     # 演示截图和示例漫画
│   ├── demos/                 # UI 截图和演示
│   └── examples/              # 生成的漫画示例
├── backend/                    # 后端服务
│   ├── app.py                 # Flask 应用入口文件
│   ├── controllers/           # API 控制器
│   ├── services/              # 业务逻辑服务
│   ├── static/                # 静态资源（包含生成的图片）
│   ├── pyproject.toml         # Python 项目配置
│   └── uv.lock                # Python 依赖锁定文件
├── frontend/                   # 前端资源
│   ├── css/
│   │   └── style.css         # 样式文件
│   └── js/
│       ├── i18n.js           # 国际化模块
│       ├── theme.js          # 主题管理模块
│       ├── api.js            # API 调用模块
│       ├── config.js         # 配置管理模块
│       ├── renderer.js       # 渲染模块
│       ├── pageManager.js    # 页面管理模块
│       ├── sessionManager.js # 会话管理模块
│       ├── exporter.js       # 图片导出模块
│       └── app.js            # 主控制器
├── index.html                 # 主页面
├── start.sh                   # Linux/macOS 启动脚本
└── start.bat                  # Windows 启动脚本
```

## 技术栈

### 后端
- **Python 3.8+**
- **Flask**: Web 框架
- **Codex OAuth、OpenAI、Google Gemini**: 文本和图片生成来源
- **Flask-CORS**: 跨域支持

### 前端
- **原生 JavaScript**: 模块化设计
- **HTML5 + CSS3**: 界面
- **html2canvas**: 图片导出

## 快速开始

### 方式一：使用启动脚本（推荐）

运行一键启动脚本：

```bash
# 对于 macOS/Linux
chmod +x start.sh
./start.sh

# 对于 Windows
start.bat
```

### 方式二：手动启动

#### 1. 安装后端依赖

本项目使用 [uv](https://github.com/astral-sh/uv) 进行极速依赖管理。

```bash
cd backend
# 使用 uv 同步依赖（自动创建虚拟环境）
uv sync
```

#### 2. 启动后端服务

```bash
# 使用 uv 运行应用
uv run app.py
```

后端服务将在 `http://localhost:5003` 启动。

#### 3. 打开前端页面

使用本地服务器：

```bash
# 使用 Python 启动简单的 HTTP 服务器
python -m http.server 8000
```

然后访问 `http://localhost:8000`

## 使用说明

### 界面设置

#### 主题切换
- 点击右上角的 **🌙/☀️** 按钮可以在深色模式和浅色模式之间切换
- 主题偏好会自动保存到本地存储
- 如果未设置偏好，会自动跟随系统主题

#### 语言切换
- 点击右上角的语言选择器可以在中文和英文之间切换
- 支持的语言：中文（简体）、English
- 语言偏好会自动保存

### 配置 API

1. 点击右上角的 **⚙️ 配置** 按钮
2. 选择 **模型来源**：
   - **Codex（免 Key）** 使用本机 Codex 登录，仅允许 localhost 调用，浏览器不会保存 token。
   - **Google Gemini** 需要 Google API Key。
   - **OpenAI / 兼容接口** 需要 API Key，也可填写自定义 Base URL。
3. 在 **模型细节** 中配置文本模型、图片来源、图片模型、尺寸、质量和 reasoning effort。
4. 点击 **💾 保存配置**

### 生成漫画

1. 确保已配置所选模型来源
2. 在文本框中描述你想要的漫画内容（支持直接粘贴图片作为创作参考）
3. 设置生成页数（1-10页）
4. 点击 **AI 生成多页分镜**
5. 等待生成完成

### 编辑和导出

- 使用 **← 上一页** / **下一页 →** 按钮浏览多页漫画
- 可以直接编辑 JSON 脚本，然后点击 **生成分镜** 重新渲染
- 点击 **🎨 生成当前页漫画** 将草图转换为完整的漫画图片
  - 自动捕获当前草图作为参考图片
  - 生成的图片会保持草图的布局和构图
- 点击 **🎨 生成所有页漫画** 批量生成所有页面的完整漫画
  - 自动遍历所有页面，逐页生成完整漫画
  - 智能使用前几页作为参考，保持角色和风格的一致性
- 点击 **🎨 生成封面** 为你的漫画生成一张精美的封面图
  - 自动提取已生成的故事内容作为参考
  - 确保封面角色与故事内容高度一致
- 点击 **📱 生成小红书内容** 自动生成适合小红书发布的内容
  - 根据漫画内容自动生成吸引人的标题
  - 生成 200-500 字的正文内容，包含 emoji 和分段
  - 自动生成 5-8 个相关话题标签
  - 支持一键复制全部内容
- 点击 **下载当前页** 导出单页草图
- 点击 **下载所有页面** 批量导出所有草图页面

## 🖼️ 参考图功能说明

本项目支持强大的参考图功能，以确保漫画生成的连贯性和高质量：

### 1. 角色与道具一致性 (Character Consistency)
- **原理**：系统支持通过 **粘贴图片** (在输入框直接 Ctrl+V) 或使用 **前面已生成的页面** 作为基准传递给 AI。
- **作用**：AI 会提取参考图中的角色容貌、发型、服装以及特定道具的特征，确保在整个漫画系列中角色形象保持高度一致，不会出现中途“变脸”或“换装”的情况。
- **本地风格参考图**：`assets/refer_image/<style>/` 下的图片会按文件名匹配角色。可选的 `characters.json` 可以把“三太子”等用户别名映射到 `哪吒.jpg`。
- **Codex 性能预算**：Codex 生图只发送当前页命中的参考角色，会限制历史页参考图数量，并在上传前缩小参考图。可通过 `CODEX_MAX_PREVIOUS_PAGE_REFERENCES`、`CODEX_MAX_COVER_PAGE_REFERENCES`、`CODEX_REFERENCE_MAX_SIDE` 调整。

### 2. 布局草图参考 (Layout Reference)
- **原理**：系统左侧显示的实时草图（由 JSON 脚本渲染的分镜界面）会被作为布局参考提供给 AI。
- **作用**：AI 会精准还原草图中的分镜布局、人物位置和构图比例，实现“所见即所得”的生成效果。

### 3. 封面一致性 (Cover Consistency)
- **原理**：生成封面时，系统会将已生成的故事页面作为参考。
- **作用**：确保封面上的主角形象、核心场景与正文内容完美匹配，提升作品的专业感。

### 4. 快速草稿 (Faster Drafts)
- 快速迭代时建议把图片质量设为 `low`、尺寸设为 `1024x1024`、reasoning effort 设为 `low`。
- Codex 生图适合本地免 Key 使用，但图像工具本身可能比直连 provider API 慢；对延迟敏感时建议直接使用 OpenAI Image API 或 Gemini。

## API 文档

### 后端 API

#### 1. 健康检查

```
GET /api/health
```

响应：
```json
{
  "status": "ok",
  "message": "Comic generator API is running"
}
```

#### 2. 生成漫画脚本

```
POST /api/generate
```

请求体：
```json
{
  "google_api_key": "your-google-api-key",
  "api_key": "your-openai-api-key (可选)",
  "prompt": "描述漫画内容",
  "page_count": 3,
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini"
}
```

响应：
```json
{
  "success": true,
  "pages": [...],
  "page_count": 3
}
```

#### 3. 验证脚本格式

```
POST /api/validate
```

请求体：
```json
{
  "script": {...}
}
```

响应：
```json
{
  "valid": true
}
```

#### 4. 生成最终漫画图

```
POST /api/generate-image
```

请求体：
```json
{
  "page_data": {
    "title": "页面标题",
    "rows": [...]
  },
  "image_provider": "codex",
  "image_model": "gpt-image-2",
  "image_size": "1024x1536",
  "image_quality": "medium",
  "reasoning_effort": "medium",
  "reference_img": "data:image/png;base64,...",
  "extra_body": [
    { "imageUrl": "/backend/static/images/previous-page.png" }
  ]
}
```

说明：
- `reference_img` 会自动传入当前草图的base64数据
- 生成的图片会参考草图的布局和构图
- 支持base64格式和URL格式
- `image_provider` 支持 `codex`、`google`、`openai`
- Codex 凭证仅允许 localhost 调用，因为它使用本机 Codex 登录态

响应：
```json
{
  "success": true,
  "image_url": "生成的图片URL",
  "prompt": "使用的提示词"
}
```

#### 5. 生成小红书内容（新功能！）

```
POST /api/generate-xiaohongshu
```

请求体：
```json
{
  "google_api_key": "your-google-api-key",
  "api_key": "your-openai-api-key (可选)",
  "comic_data": [
    {
      "title": "第1页标题",
      "rows": [...]
    }
  ],
  "base_url": "https://api.openai.com/v1",
  "model": "gpt-4o-mini"
}
```

说明：
- `comic_data` 可以是单个页面对象或页面数组
- 自动提取漫画内容并生成适合小红书的文案
- 生成的内容包括标题、正文和标签

响应：
```json
{
  "success": true,
  "title": "吸引人的标题 ✨",
  "content": "正文内容，包含emoji和分段...",
  "tags": ["漫画", "AI创作", "小红书", ...]
}
```

## 前端模块说明

### i18n.js - 国际化
- 支持多语言切换（中文/英文）
- 使用 localStorage 持久化语言偏好
- 提供翻译函数和 UI 更新机制

### theme.js - 主题管理
- 支持深色/浅色模式切换
- 自动检测系统主题偏好
- 使用 localStorage 持久化主题设置
- 平滑的主题切换动画

### config.js - 配置管理
- 管理用户配置（API Key, Base URL, Model）
- 使用 localStorage 持久化存储

### api.js - API 调用
- 封装所有后端 API 调用
- 统一错误处理

### renderer.js - 渲染引擎
- 将 JSON 数据渲染为漫画分镜
- 支持自定义样式

### pageManager.js - 页面管理
- 管理多页漫画状态
- 提供页面导航功能

### sessionManager.js - 会话管理
- 管理多个生成会话
- 将会话数据（脚本、图片、设置）持久化到 localStorage
- 支持会话创建、切换和删除

### exporter.js - 图片导出
- 单页导出
- 批量导出
- 使用 html2canvas 生成高质量图片

### app.js - 主控制器
- 协调所有模块
- 处理用户交互
- 管理应用状态

## JSON 脚本格式

```json
{
  "title": "漫画标题",
  "rows": [
    {
      "height": "180px",
      "panels": [
        { "text": "分镜描述文字" },
        { "text": "另一个分镜", "bg": "#f0f0f0" }
      ]
    }
  ]
}
```

### 字段说明

- `title`: 页面标题（可选）
- `rows`: 分镜行数组
  - `height`: 行高（默认 150px）
  - `panels`: 面板数组
    - `text`: 分镜描述文字
    - `bg`: 背景色（可选）

## 开发指南

### 添加新功能

1. **后端功能**: 在 `backend/app.py` 中添加新的路由
2. **前端 API**: 在 `frontend/js/api.js` 中添加对应的调用方法
3. **UI 交互**: 在 `frontend/js/app.js` 中添加控制逻辑

### 自定义样式

编辑 `frontend/css/style.css` 文件来修改界面样式。

### 扩展渲染器

在 `frontend/js/renderer.js` 中修改 `_createPanel` 方法来支持更多面板样式。

## 常见问题

### Q: 生成失败，提示 "Failed to fetch"
A: 请确保后端服务已启动（`python backend/app.py`），并检查 Base URL 配置是否正确。

### Q: 如何使用自定义模型？
A: 在配置面板中选择"自定义模型"，然后输入模型名称（如 `kimi-k2`）。

### Q: 图片导出失败
A: 确保已加载 html2canvas 库，检查浏览器控制台是否有错误信息。

### Q: 如何部署到生产环境？
A: 
1. 后端使用 Gunicorn 或 uWSGI 部署
2. 前端使用 Nginx 或其他 Web 服务器托管
3. 配置 CORS 允许前端域名访问后端

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
