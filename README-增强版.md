# TGbot-D1 3.0.5 增强版说明

本文件是 Fork（realadmin/TGbot-D1）对原作者 [moistrr/TGbot-D1](https://github.com/moistrr/TGbot-D1) 的增强说明。
原项目未附开源许可证，本 Fork 通过 GitHub 站内 Fork 机制分享，代码著作权归原作者所有；增强部分仅供个人学习与自用部署。

增强版文件：`TGbot-D1创新版本3.0.5-增强版.js`（基于原版 `TGbot-D1创新版本3.0.5.js` 修改，原版文件未改动）。

**部署请看专门为本增强版重写的教程：[部署教程-增强版.md](部署教程-增强版.md)（小白向）。** 本仓库自带的原版教程（3.0.0 教程与 PDF）是给原版用的，其 setWebhook 示例缺少 `secret_token` 与完整的 `allowed_updates`，照它部署增强版会导致功能缺失，请勿混用。

## 增强内容

1. **Cloudflare Turnstile 人机验证**
   - 待验证用户点击验证按钮后打开 Worker 自带的验证页，完成 Turnstile 校验即通过；验证链接以 Webhook 密钥做 HMAC 签名、绑定用户 ID、10 分钟过期，并核对 siteverify 返回的 hostname。
   - 管理员菜单「基础配置」可切换验证方式；未配置 Turnstile 密钥时自动回退原版静态问答验证，部署顺序与原版一致。
   - 新增可选环境变量：`TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`；可选 `PUBLIC_URL` 覆盖验证页域名推导。

2. **消息反应（表情回应）双向同步**
   - 访客对消息贴/取消反应，话题中的对应消息同步；管理员在话题中贴/取消，访客侧同步（显示为机器人名义的反应）。
   - 仅同步普通 emoji，自定义表情跳过；机器人自身反应不回环；只对部署本版之后转发的新消息有效。

3. **消息编辑原地同步（替代原版的对比通知）**
   - 任一侧编辑消息，对侧对应消息原地更新（文字 `editMessageText` 并保留原格式、说明/媒体 `editMessageCaption` / `editMessageMedia`，媒体文件本身被替换时也能同步）。
   - 注：Telegram 对 Bot API 的编辑按静默编辑处理，不显示原生「已编辑」角标——所有机器人如此，非本版缺陷。
   - 无对应关系或原地编辑失败时，自动回退原版的「原内容/新内容」对比通知，编辑不会丢失。

4. **拉黑 / 解除拉黑提醒**（v1.0.1 新增）
   - 访客在私聊拉黑（停止）机器人时，其话题内即时出现提醒；解除拉黑同样提醒；D1 标记去重。上线前已被拉黑的用户，在管理员回复发送被拒时走同一标记兜底提醒。

5. **一行编辑提示（滚动更新）**
   - 原地编辑成功后补发一条 `✏️ 对方修改了这条消息`，以回复形式关联到被改的消息，作为「已编辑」的替代标记。
   - 同一条消息多次编辑时，先撤回上一条提示再发新的，每条消息只保留最新的一条提示。

## 与原版部署的差异

除原版教程的变量（`BOT_TOKEN`、`ADMIN_IDS`、`ADMIN_GROUP_ID`、`WEBHOOK_SECRET` 与 D1 绑定 `TG_BOT_DB`）外：

1. 如需 Turnstile 验证，再加 `TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY` 两个变量（Turnstile 小部件的主机名填 Worker 域名）；不加则用原版问答验证。
2. 注册 Webhook 时必须带上 `allowed_updates`，且务必包含 `secret_token`，例如：

   `https://api.telegram.org/bot<机器人令牌>/setWebhook?url=<Worker地址>&secret_token=<你的WEBHOOK_SECRET>&allowed_updates=["message","edited_message","callback_query","message_reaction","my_chat_member"]`

   其中 `message_reaction` 是反应同步的前提，`edited_message` 是编辑同步的前提，`my_chat_member` 是拉黑提醒的前提，缺哪类就少哪类功能。
3. 机器人需要群组管理员的「删除消息」权限（编辑提示的滚动撤回要用）；置顶、删除话题等权限同原版教程。

其余部署步骤（建 D1、建 Worker、粘贴代码、绑定变量）与原版教程完全一致。
