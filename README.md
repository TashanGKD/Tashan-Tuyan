# Tashan-Tuyan

基于公开的 [yrjmdqmmx/Tuyan](https://github.com/yrjmdqmmx/Tuyan)，
沿用 Apache 2.0 许可证，原始提交见 `UPSTREAM.json`。
杭州正式网站继续使用原仓库、分支和部署流程。

本仓库只部署 `codex/**` 测试分支。GitHub Actions 构建 Docker 镜像，
由构建机下载校验后的镜像并通过 SSH 导入他山，以避开服务器拉取大文件不稳定的问题；
调用他山已有的 `/var/www/github-actions/configs/scripts/deploy-subdomain.sh`，
生成 `https://<repo>-<branch>.tashan.chat/`。
不改他山组织设置、已有项目和共享脚本。

每个预览运行 Web、登录网关、Core 和独立 MongoDB 单成员副本集。
只暴露 Web 端口；数据库、Core 和网关均监听容器内回环地址。
`data-<repo>-<branch>` 挂载 `/data`，保存数据库及随机生成的会话和加密密钥；
更新镜像保留数据。附件及结果使用独立私有 OSS，访问凭据只授权该测试桶。
不导入正式账号、附件、历史记录或模型密钥。
部署后只对本容器固定共享脚本分配的回环端口，保证重启后 Nginx 仍能连接。

## 配置

仓库 Secrets：`DEPLOY_HOST=tashan.chat`、`DEPLOY_USER=deploy`、
`SSH_PRIVATE_KEY`、`SSH_KNOWN_HOSTS`。
每个部署 UID 对应的 GitHub Environment 设置 `PREVIEW_OSS_CONFIG`：

```json
{"bucket":"tuyan-preview-...","region":"oss-cn-hangzhou","accessKeyId":"<secret>","accessKeySecret":"<secret>"}
```

该桶必须为私有，CORS 只允许该预览的准确 Origin，
RAM 权限仅覆盖该桶。新增分支需要先配置它自己的环境和测试桶；
缺配置时工作流失败，不回退到正式站。

## 当前边界

- 使用独立邮箱密码账号，注册后直接登录；邮件投递、密码找回与 Watcha SSO 暂未配置。
- 模型密钥由测试账号自行连接或填写；不复制正式账号中的密钥。
- TokenDance 授权回调及一组模型的真实 PNG 生成已验收；不代表全部型号均已验证。
- 当前仅启用原项目已审查的直连渠道。没有连接杭州、香港、新加坡的内部代理。
- 他山没有注册 gVisor；统计绘图执行器保持关闭。PNG / SVG 流程单独验收。
- 公开源码不代表公开测试数据。预览站使用登录隔离，禁止搜索引擎索引。
- 单实例预览更新会短暂停机；不是生产高可用部署。
- 不自动清理持久卷或测试记录；删除卷会永久删除该环境数据库。

部署成功以 Actions 成功、HTTPS `/ready`、版本回执和实际功能验证为准。

当前站点：<https://tashan-tuyan-codex-test.tashan.chat/>。
部署、持久化、TokenDance 授权、真实 PNG 生成与刷新后的历史读取已通过。
验收图存在文字拼写问题，功能通过不代表成图质量通过。
具体证据和未完成项见 [验收记录](deploy/tashan/ACCEPTANCE.md)。
