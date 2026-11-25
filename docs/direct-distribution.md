# ComicPerfect 官网分发

官网下载版与 Mac App Store 版是两个独立入口。官网版是经 Developer ID Application 签名、Apple 公证并订书的 DMG，下载后可直接打开；商店版见 [商店发布记录](app-store/README.md)。`desktop:pack` 与 `desktop:dist` 只生成 ad-hoc 签名的本机测试包，不能作为官网正式包分发。

## 常规顺序

1. `npm run test:frontend` 与 `uv run --project backend python -m unittest discover -s backend/tests` 通过。
2. Mac 处于解锁状态；钥匙串中有唯一一张 Developer ID Application 证书及私钥；`APPLE_KEYCHAIN_PROFILE` 指向已有的 notarytool 钥匙串配置。公证凭据在锁屏时不可读。
3. `npm run desktop:release`，然后 `npm run desktop:release:publish`。
4. `npm run desktop:release:site`，再由账号持有人部署支持网站。

```sh
npm run desktop:release:prepare                                   # 只写出签名与公证配置，不访问凭据
APPLE_KEYCHAIN_PROFILE=<profile> npm run desktop:release:check   # 核验证书与公证凭据
node desktop/build_direct.cjs --sign-only                         # 只签名并验证启动，不公证，不可分发
APPLE_KEYCHAIN_PROFILE=<profile> npm run desktop:release
npm run desktop:release:publish
npm run desktop:release:site
```

产物在 `~/Library/Caches/ComicPerfect/direct/`，避开 iCloud 元数据。Apple 密码、公证凭据和签名私钥只存在于系统钥匙串，不写入项目。

## 各步骤保证的内容

- `desktop:release`：后端以 `--public` 暂存，与商店版一样只保留 `assets/brand`，不含第三方角色参考图、示例漫画和展示截图。扫描后端全部原生二进制的最低系统版本，与 Electron 的要求取较高者写入 `LSMinimumSystemVersion`。electron-builder 只负责打包并以 Hardened Runtime 签名；脚本核对深层严格签名和签名者类型，检查包内无越界链接和私密文件，然后提交应用公证、订书并验证票据与 Gatekeeper，再用 `--prepackaged` 从已订书的应用生成 DMG（不重新签名），单独公证并订书 DMG，最后把 DMG 中的副本安装到临时目录，用隔离的用户目录和创作空间真实启动，确认窗口、本机服务、API 与静态资源可用。全部通过才写入 `release.json` 的 `ready: true`（含应用与 DMG 的公证编号）、`SHA256SUMS.txt` 和 `startup-verification.json`。
- 公证与订书不交给 electron-builder：Apple 已经接受公证之后，取票据的网络请求一旦中断，它会让整个构建报失败并丢掉后续步骤。脚本自己提交公证，并对订书重试。公证凭据不可用时流程直接停止，不会产出未公证的安装包。
- `desktop:release:publish`：重新核对哈希、票据和 Gatekeeper；先以草稿上传到 `origin` 对应的 GitHub Release（`COMIC_RELEASE_REPO` 可覆盖），核对 GitHub 托管文件的大小与 SHA-256 摘要后才公开；随后从公开地址完整下载并再次比对哈希，写入 `public-verification.json`。同一版本已公开后拒绝覆盖，须先递增版本。
- `desktop:release:site`：仅在 `release.json` 就绪且公开下载已核验时，把版本、大小、系统要求和 SHA-256 填入 [下载页](app-store/site/download.html)，并与首页、帮助、隐私页一并写入支持站源码目录（`COMIC_SITE_DIST` 可覆盖）。部署由账号持有人完成。

## 与商店版的差别

官网版不使用 App Sandbox，没有逐服务的 AI 共享确认；Codex 路径直接读取本机 `~/.codex/auth.json`。创作空间与凭据的保存位置见 [桌面说明](../desktop/README.md)。

## 安装包内容约定

- 只包含公开前端、桌面壳和可复用工作空间骨架，不打包私人 Wiki、production、历史图片或凭据。
- 当前只验证 Apple Silicon 构建；Intel 需在相应架构环境单独构建。

## 发布记录

### 0.1.1（2026-11-25）

首个官网版本，Apple Silicon，最低 macOS 15.0，160,328,845 字节。

- [发布页](https://github.com/hetaoBackend/comic-alpha/releases/tag/mac-v0.1.1)
- 固定下载：`https://github.com/hetaoBackend/comic-alpha/releases/download/mac-v0.1.1/ComicPerfect-0.1.1-arm64.dmg`
- SHA-256：`2eef95adeb8c52bb670c4f813fe831432d9eb7307bac8eb9bcab598b90ce3079`
- 签名：Developer ID Application: Tianxin Shi (44PCQLFNRD)，Hardened Runtime。
- 公证：应用 `754b4e72-9a7a-4baa-bf77-a40e3ee733e6`、DMG `b3bb4134-ecc5-4d62-82e1-1addfcf62172`，均为 Accepted 且已附票据；应用与 DMG 的 Gatekeeper 评估均为 Notarized Developer ID。
- 验证：从 DMG 安装副本后隔离启动通过，测试进程与临时目录已清理；GitHub 托管文件的大小与摘要与本机一致；从公开地址完整下载后 SHA-256 再次匹配。发布前前端/桌面 90 项、后端 150 项测试通过。
- 来源：构建自提交 `7e0752e` 及其后未提交的工作区改动，标签只指向该提交，发布说明已写明。

本次确认的问题与处理：

- Electron 的 `LSMinimumSystemVersion` 默认是 13.0，但后端的 `orjson` 原生模块要求 macOS 15.0。安装包据此声明 15.0，并由脚本在每次构建时实测，不再手写。
- 首次尝试把公证交给 electron-builder 内置流程：Apple 已接受（`8ec37686-549f-4781-909c-989041c48ba8`），但取票据时网络中断，构建报失败且不生成 DMG。该产物未发布；流程改为脚本自行公证、订书带重试、`--prepackaged` 生成 DMG。
- 默认配置会把框架内一百多个语言包当作二进制逐个签名，每个都要取一次时间戳；已加入与商店构建相同的忽略列表。

尚未完成或未验证：

- 官网下载页已写入支持站源码目录（未提交），**尚未部署**，目前只有 GitHub 的直接下载链接可用。
- 现有隐私政策写的是“通过 Apple App Store 分发”，Codex 连接与共享确认的描述也是商店版流程；使用帮助页仍提到已移除的 18764/18765 端口。上线官网下载页前应由运营者补充官网版说明。
- 只在 macOS 27.2 的本机做过启动验证，最低系统 macOS 15 未实机验证；未在另一台没有开发环境的 Mac 上验收。
- 下载由 GitHub 托管。发布当天 13:43–13:48 从本机直连 `github.com` 14 次失败 9 次，随后走系统代理与直连共 48 次全部成功；大陆网络直连可能间歇性不稳，尚未提供其他镜像。
- 没有自动更新，也没有 Intel 版本；安装包不含第三方角色参考图。
