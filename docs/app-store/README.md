# ComicPerfect Mac App Store 发布

当前状态：2026-10-16 已完成 build 11 的无端口修复和出图兼容修复，待用户解锁后上传并送审。尚未完成本轮送审。

## 已建立

- Apple 团队：Tianxin Shi，`44PCQLFNRD`；沿用 TwhWiki 已建立的本机签名身份，不复制私钥。
- Bundle ID：`com.comicperfect.desktop`。
- [App Store Connect](https://appstoreconnect.apple.com/apps/6821960622/distribution/macos/version/inflight)：macOS，版本 `0.1.1`，简体中文，SKU `COMICPERFECT-MAC-001`，手动发布。文案、关键词、支持 URL 和版权已保存。已核实免费（中国大陆 ¥0.00），仅中国大陆供应。
- [隐私政策](https://the-way-here-support.finedeer64.chatgpt.site/comicperfect/privacy.html)和[支持页](https://the-way-here-support.finedeer64.chatgpt.site/comicperfect/support.html)已公开发布；现有 The Way Here 页面保留。
- 两份 ComicPerfect 专用开发/分发描述文件已生成并下载，不能使用 TwhWiki 的描述文件代替。

## 构建

使用 `COMIC_APPLE_TEAM_ID`、`COMIC_APPLE_PROFILE`、`COMIC_APPLE_IDENTITY`、`COMIC_BUILD_NUMBER` 设置非敏感签名配置。identity 使用证书共有的持有人姓名，profile 必须对应本应用。构建号必须递增。

```sh
npm run appstore:check
npm run appstore:dev
# 实测通过后，将 profile 切为本应用的商店分发描述文件
npm run appstore:release
```

输出在 `~/Library/Caches/ComicPerfect/app-store/`，避开 iCloud 元数据。开发包用于本机运行；商店分发包不能按普通应用直接运行，最终 PKG 用 Apple Transporter 上传。

商店包使用 MAS Electron、App Sandbox、无端口的进程间管道通信、Python 3.12 独立构建环境及 macOS 15 最低系统。当前只验证 Apple Silicon 构建；orjson 原生模块要求 macOS 15，最低系统尚未实机验证。

商店构建排除所有 `assets` 中的角色参考图与示例漫画；本机原文件保留。生成、用户自带参考图、封面等能力保留。安装包只收录公开前端和可复用工作空间骨架，不打包私人 Wiki、production、历史图片或凭据。

## 商店适配

- 文件夹使用系统选择器和持久化安全书签，退出服务后释放授权；失效时回到应用空间并提示重新选择。
- 桌面 API Key 使用钥匙串支持的加密存储，成功迁移后移除可见旧浏览器条目；失败不回退明文。
- Codex 通过用户选择的登录文件导入访问凭据，加密保存；不导入历史、插件或服务配置。过期需要重新连接。
- 首次向每个服务发送前提示接收方和数据；许可只在本次启动期间有效，撤回会重启并停止服务。每个生成请求由主进程签发一次性、绑定正文的授权，后端拒绝缺失、篡改、过期和重放授权。
- 商店包只运行签名资源中的确定性 Python 工具；用户创作空间中的可变脚本不作为可执行更新加载。
- 帮助菜单提供公开隐私和支持入口。Python 依赖的许可与元数据随包保存，Electron 原有许可保留。

## 实际验收记录

- 普通基线：初始前端 43 项、后端 72 项通过。最终前端/桌面 51 项、后端 77 项通过，覆盖共享授权、安全书签、凭据失败和 MIME 沙盒回归；商店同版本 Python 3.12 环境也通过全部 77 项后端测试。
- build 1：签名通过，服务因与普通版的 18764 端口冲突启动失败；已为商店版使用 18765。
- build 2：签名与本地监听成功，但 Python 尝试读取 `/etc/apache2/mime.types` 被沙盒拒绝，页面加载失败。
- build 3：固定 Python 3.12 并新增图标；签名通过。仅 `mimetypes.init(files=[])` 仍会读取 knownfiles，启动失败。
- build 4：清空 MIME knownfiles 后构建与签名通过。依赖许可元数据的首次构建错误已修复。尚未完成应用实测。
- build 5：加入不可变工具路由及最低系统声明，构建和深度严格签名检查通过。因 Mac 锁屏，尚未进行此包的实机功能验收；没有商店分发 PKG、上传或审核提交。
- build 6/7：补齐 Python 许可证并修复凭据同步 IPC 的重复返回。最终 build 7 构建、深度严格签名和包内容检查通过：macOS 15，App Sandbox 开启，无包外符号链接、登录/环境私密文件或角色参考图。后续已解锁并完成下述本机验收。

证据和日志位于本机缓存 `app-store/evidence/` 与 `/tmp/comicperfect-*.log`，不打包、不提交私人运行材料。已发现问题不能用普通测试通过替代沙盒验收。

- build 7 本机沙盒实测：用户授权经系统选择器导入本机 Codex 登录，仅用于匿名验收。原创小猫故事文字生成和图像生成成功，ZIP 导出验证有效；重启恢复草稿和图像成功。外部文件夹经选择器授权后可写入，重启可继续访问；测试后恢复应用默认空间。
- build 8/9：拒绝 AI 共享时改为明确说明“内容未发送”，修复升级后的旧前端缓存。最终 build 9 拒绝共享实测正确；不再重复付费生成。撤回授权停止服务的流程通过自动测试，未重复进行运行中撤回的实机测试。
- build 9 分发：版本 0.1.1，arm64，最低 macOS 15；深度严格签名通过，安装包由专用 Installer 身份签名，无包外链接、私密登录配置、参考图或私人生产项目。production/README.md 为可复用骨架说明；Python-LICENSE.txt 和依赖许可已包含。
- App Privacy 已发布，年龄分级 13+，分类图形和设计，审核联系人和说明已保存；真实样例 ZIP 和 3 张 JPEG 实拍截图已上传并通过提交校验。首次 PNG 处理失败，已移除后重新编码上传，未修改画面内容。中国大陆供应及免费价格已确认；无 ICP 号码，未填写虚构信息。

## 审核结果与限制

1. Transporter 于 22:59 交付，Apple 处理成功；已选择 build 9。加密问卷申报同时使用标准算法，不在法国分发。首次提交校验提示 PNG 截图处理失败；原图为 2560×1600、RGB、无 alpha，具体失败原因未确定。重新编码 JPEG 并上传后校验通过，于 23:16 正式提交，后台显示“已提交 1 个项目”和“等待审核”。
   - 提交 ID：`7db1df03-9f50-4b96-9b9d-98bddc81d6e9`
   - [审核记录](https://appstoreconnect.apple.com/apps/6821960622/distribution/reviewsubmissions/details/7db1df03-9f50-4b96-9b9d-98bddc81d6e9)
   - 手动发布、免费、仅中国大陆；目前尚未审核通过或上架。
   - 本机凭证：`app-store/evidence/app-review-build-9-submitted.png`、`transporter-build-9-delivered.png`。
2. 用户没有可供 Apple 使用的图像服务 Key。非公开审核说明已提供可用文字服务配置，并如实注明出图需审核员自行配置可用服务；本机 Codex 凭据未提供给 Apple。附带的是实际生成的样例，未加入模拟生成或隐藏能力。Apple 仍可能要求补充出图访问。
3. 最低系统 macOS 15 和干净的新系统用户尚未实机验证；本次使用 macOS 26.6.2 的签名沙盒开发包完成验收。菜单退出后已验证 18765 不再监听，验收主进程已结束。
4. 分发包 SHA-256：`1ed5109197051213429db863991e3213da2c5d7fea44ef625a36f4dcf30fd03c`。
操作授权来自用户本次直接提交要求；签署新法律协议等界面规则要求单独确认的动作仍需在发生时处理。提交成功不等于审核通过或已经上架。

## 2026-10-14 补充审核

Apple 于 10 月 13 日 14:29 以 Guideline 2.1 - Information Needed - New App Submission 拒绝首次提交；说明开发者审核历史有限，要求录屏和补充资料。消息未指出具体崩溃或功能缺陷。

要求：真机最新版系统、从启动开始的典型流程录屏；用途及受众；主要功能访问步骤和所需凭据/样例；外部服务；地区差异；受保护内容及相关授权。还需同时更新 App Review Notes。

10 月 14 日已在 macOS 26.6.2 (25G83) 完成沙盒开发签名 build 9 演示：新原创匿名故事、真实 Codex 文字生成、标题编辑自动保存、真实 Codex 图像生成、放大预览、系统选择器 ZIP 导出、停止 AI 共享并重启、作品恢复。ZIP 内 page-1.png 有效。开发签名与提交包的 app.asar 及 197 项不可变应用内容一致；原生二进制签名及独立冻结的 Python 档案并非逐字节一致，不声称整个包相同。

视频由用户手动启动/停止系统录屏；仅裁掉应用外聊天/桌面边缘及前后等待，未拼接或模拟功能。附件 ComicPerfect-build-9-review.mp4，471 秒，1280×800，45,948,578 字节，SHA-256 cd8bc0a2b9d164f6325242727303a3909a789fa8b7d4bb1391f569a14cb5ffe1。原始录屏只留本地，未上传。

15:00 已发送六项英文说明与视频附件，后台消息数从 1 变为 2，显示提交者回复及视频文件。无新功能修改、无新构建上传。仍如实说明无图像审核 Key，不向 Apple 提供本机 Codex 登录。

15:04 已完成重新提交。同一提交 ID `7db1df03-9f50-4b96-9b9d-98bddc81d6e9`，后台项目和提交均显示“等待审核”，提交日期更新为 2026-10-14 15:04。审核备注包含全部六项资料、录屏消息引用和现有非公开文字审核凭据；本地文档不保存该凭据。价格/地区/手动发布方式未更改。重新提交凭证位于本机缓存 `app-store/evidence/app-review-build-9-resubmitted-2026-10-14.png`。

## 2026-10-16 无监听端口修复

Apple 于 10 月 15 日 16:02 的自动消息指出 `com.apple.security.network.server` 未见匹配功能，按 2.4.5 拒绝继续审核。核对代码后，旧 Mac 客户端确实依赖两个本机 HTTP 监听（界面和 API），并非仅 Web 版使用，因此不能只删权限保留原实现。

build 10 将所有 Mac 客户端改为 `comicperfect://app` 内部界面协议，经父子进程 stdin/stdout 管道直接调用 WSGI 应用及公开文件解析器。客户端不再创建 HTTP/TCP 服务器；Web 版继续使用原有 `serve_frontend.py` 和 Flask 启动方式。删除商店 `network.server` 权限，保留必要的 `network.client` 以连接用户选择的 AI 服务。私有来源检查、一次性正文绑定的生成授权、文件公开白名单、加密凭据及目录沙盒授权继续适用。客户端来源改变后，旧来源模型偏好需重新设置；创作空间作品/图片及加密凭据保留。

验证：前端/桌面 53 项、后端 77 项通过；源运行进程中将 socket.bind/listen 替换为直接失败仍可正常启动、访问健康检查/图片并拒绝私人路径和外部来源。冻结后未重签的暂存运行包 3 项集成检查通过。直接从非沙盒命令行运行已签名继承沙盒子进程会被系统终止，不据此声称签名包命令行验收通过；实际签名沙盒应用已在物理 Mac 成功打开旧作品、导出有效 ZIP，并完成拒绝共享和真实文字生成。应用及后代进程的 lsof TCP LISTEN 结果为空。

签名：Apple 时间戳端点经当前网络返回 502，两次签名尝试失败。未修改系统代理或 TLS 校验。Mac App Store 专用签名采用显式 `COMIC_APPLE_TIMESTAMP=none`，保留原签名身份、沙盒和深度严格验证；此选择仅用于 MAS 流程，不适用于 Developer ID 公证分发。最终应用/安装包签名通过，权限核验 network.server=false，network.client=true。包中无未授权角色图、私密登录配置或包外符号链接。

商店包：0.1.1 (10)，SHA-256 `1abd9b411f003394cd163dff8d30cafaece9f5a6875be8c485aa6abf597d3ce6`。原 build 9 证据包保留。支持网站版本 4 已公开部署，ComicPerfect 隐私页说明更新为进程间通信，旧 TwhWiki 页面保持原样。已于 01:04 通过 Transporter 交付，但最终送审使用 build 11。

最终验收时另发现 Codex 出图顶层固定 `gpt-5.5` 被服务端以 HTTP 400 拒绝。按官方文档确认图像工具支持后，改用项目文字路径已验证的 `gpt-6.1-sol`，保留 GPT Image 工具模型和输出契约，加入可覆盖的 `CODEX_IMAGE_RESPONSES_MODEL` 配置。构建号递增为 11；中间 build 10 已上传但不用于送审。

build 11：前端/桌面 54 项、后端 77 项、冻结暂存包 3 项通过；严格签名验证通过，主程序、所有 helper 和 Python 运行进程签名均无 network.server。最终包 SHA-256 `ebdd71e81f16efab954169389e653870752d9c6e15b3443eb532eabc0439e886`。无角色参考图、私人凭据或包外链接。01:09 真实出图完成，已查看 PNG 并确认新图片路径保存进匿名验收草稿；没有 TCP 监听。用户解锁后，09:30 已通过 Transporter 成功交付 build 11，Apple 正在处理；交付截图已保存为 `app-store/evidence/transporter-build-11-delivered.png`。审核回复与新备注随后已发送并保存，详见下述送审结果。

用户完成后台登录后，09:48 已发送针对 Guideline 2.4.5 的英文回复，消息数变为 4；新备注保留原非公开文字审核 Key，补充 build 11 无监听端口说明，原样例附件保留。已选择 0.1.1 (11)，完成标准加密及不在法国分发的出口合规问卷。09:49 正式重新提交，同一提交 ID `7db1df03-9f50-4b96-9b9d-98bddc81d6e9`；后台提交和项目均显示“等待审核”，构建为 0.1.1 (11)。手动发布方式保留，未更改价格和销售地区。本轮已重新送审，尚未审核通过或上架。凭证：`app-store/evidence/app-review-build-11-resubmitted-2026-10-16.png`。
