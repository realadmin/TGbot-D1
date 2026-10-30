/* ============================================================================
 * 改版说明（2026-10-29，基于审计通过的 TGbot-D1 3.0.5）
 * 新增 Cloudflare Turnstile 小程序（Web App）人机验证：
 * - 配置项 verify_mode（管理菜单可切换 turnstile / quiz），默认 turnstile；
 * - 需在 Worker 变量中另加 TURNSTILE_SITE_KEY 与 TURNSTILE_SECRET_KEY，
 *   两者缺一时自动回退原静态问答验证，机器人不会因缺密钥不可用；
 * - 验证链接用 WEBHOOK_SECRET 做 HMAC-SHA256 签名，绑定用户 ID 与
 *   10 分钟有效期；确认接口在服务端调 siteverify 校验并核对 hostname。
 * 追加（反应同步版）：转发时在 messages 表存消息配对（rxmap 索引），
 * 新增 message_reaction 处理，两侧反应经 setMessageReaction 双向镜像；
 * 需在 setWebhook 时用 allowed_updates 订阅 message_reaction 才有效。
 * 追加（新手引导）：主菜单新增「📖 新手引导」网页按钮，
 * GET /guide 小白向使用手册（复用 usrlist 签名、仅主管理员）：
 * 项目说明、开始使用、验证、接待日常、命令速查、管理台、
 * 用户列表与统计、版本更新、常见问题九节，纯静态页。
 * 本版起版本号升至 v1.1.0（BOT_VERSION）。
 * 追加（连带删除版）：/delete 删除话题侧消息后，按 rxmap 配对
 * 连带删除客人私聊中的原消息（机器人可删私聊 incoming 消息、
 * 限发送未满 48 小时）；客人已自行删除视为已删、不提示，其余
 * 失败在话题里留一行说明；话题侧删除与墓碑行为不变。
 * 追加（改名解耦与列表跳转）：修复「已有备注时重设新备注、
 * 话题名不跟着变」——原刷新流程把改名排在资料卡编辑之后，
 * 卡片编辑返回未修改（或失败）会提前结束、把改名吃掉；现
 * 改名拆为独立helper并在资料卡编辑之前先行同步，没有资料
 * 卡时也用存档资料直接改名。网页用户列表每行新增「💬 话
 * 题」按钮（/api/users 附带 topic_id 与群链接号），点按经
 * openTelegramLink 直达话题群里该用户的话题。
 * 追加（备注进标题版）：话题名改为「备注｜名字 (ID)」——备注
 * 非空时取其第一行非空内容（单独限长 40 字）放在话题名最前
 * 面，方便在话题列表侧边栏直接看到；无备注时与原格式一致。
 * 新建话题与资料卡刷新（含备注变更后的强制刷新）共用同一拼
 * 名，备注保存/删除即自动同步话题名。
 * 追加（管理台验证区调整）：基础配置里验证方式移到验证问题
 * 之前；选 Turnstile 时问题/答案两项整段隐藏（选静态问答才显示）。
 * 追加（列表页标签页）：网页用户列表改为「用户列表 / 数据统计」
 * 双标签页（默认列表页），统计不再把搜索与筛选结果挤出可视区。
 * 追加（管理员备注）：用户表新增 admin_note（ensureUserColumn
 * 迁移），资料卡展示备注；话题命令 /note 查看/设置、/notedelete
 * 删除（命令参数支持多行）；网页用户列表可查看/编辑/搜索备注，
 * 保存后自动刷新对应话题的资料卡。
 * 追加（引用转发）：转发时保留回复引用关系——按配对表把被
 * 引用消息换算到对侧 ID，以 reply_parameters 发出；客户端框选
 * 的部分引用（quote/quote_position/quote_entities）原样带过去。
 * 发送三级降级：带片段引用 → 整条引用 → 普通消息，保证引用
 * 对不上时消息本身不丢（另带 allow_sending_without_reply）。
 * 追加（服务消息修复）：话题内的服务消息（关闭/重开/改名/置顶
 * 通知等）不再被误当作管理员回复去转发——原版入口未排除这类
 * 消息，copyMessage 必然被 Telegram 拒绝（the message can't
 * be copied）并在话题里误报转发失败；现于话题回复入口静默忽略。
 * 追加（瘦身版）：行为不变的保守瘦身——网页接口的签名鉴权、
 * 页面响应、签名链接生成三处重复实现合并为共用helper，用户
 * 列表操作改走管理台的请求体解析helper，配置读取复用既有
 * getAuthorizedAdmins，并删除从未被读取的 LIMITS.block_threshold
 * 死字段；全部端点输出经哈希基线比对不变、回归 99/99。
 * 追加（管理台版）：管理面板全量网页化（主人方案一）——新增
 * /panel 网页管理台与 /api/config 系列接口（复用 usrlist 签名、
 * 仅主管理员；写入校验与原按钮版逐项一致），承接基础配置、类型
 * 过滤、屏蔽关键词、自动回复、协管员五块；Telegram 侧删除全部
 * config:* 配置菜单、列表页与待输入流程，主菜单只保留网页管理
 * 台/用户列表两个 web_app 入口与检查更新；旧消息上的 config 按
 * 钮点击只回迁移提示。话题资料卡按钮与 / 命令不受影响。
 * 追加（统计版）：网页版用户列表页顶部新增数据统计区——新接口
 * GET /api/stats（复用 usrlist 签名鉴权、仅主管理员）实时聚合：
 * 用户总览（总数/已验证/待验证/未开始/已封禁/已静音/已拉黑机器
 * 人，不含主管理员行）、新增与活跃（过去 24 小时/7 天/30 天滚动
 * 窗口，按 created_at/updated_at）、消息量（访客消息数 rxmap 的
 * t: 映射行、管理员回复数 admin: 路由行，按 date 统计、仅保留
 * 90 天，口径在页面明示）。全部 COUNT 查询，不新增存储。
 * 追加（自查修复版）：三遍深度自查（数据流/并发/契约）后的修复集——
 * 验证页 m 参数白名单+JSON 转义；Release 链接域名白名单；话题等待
 * 3s→10s；TTL 清理改为条件删除防竞态；活跃打卡只写时间戳；更新
 * 通知改为原子占用+全失败释放、失败不覆盖新鲜缓存；拉黑标记原子
 * 占用；消息配对单次 batch 写入；/delete 写墓碑行防已删内容被编辑
 * 回退通知重发；编辑提示竞态收尾；资料卡回调加管理员守卫且不为
 * 不存在用户建行；话题未知命令不再转发给访客；过期结果文案明示；
 * 删除用户连带清理其配对行；用户列表操作接口加 body 大小上限；
 * 私聊命令注册补 help。
 * 追加（命令下线版）：/finduser 命令与其 usrmgr 回调、搜索菜单
 * 一并移除，网页版用户列表完全平替；purgeManagedUser 保留，
 * 供网页版删除操作复用。
 * 追加（菜单精简版）：主菜单删除「用户搜索与删除」按钮（网页版
 * 用户列表已覆盖其用途）；/finduser 命令与既有回调处理保留，
 * 历史菜单消息上的旧按钮仍可正常打开说明页。
 * 追加（用户列表版）：主菜单新增「📋 用户列表（网页版）」Mini App
 * 入口——签名链接（usrlist 域、30 分钟、仅主管理员）打开 /users 页，
 * 列表一次拉取后在本地搜索/筛选/排序/翻页（无 Telegram 往返延迟），
 * 行内可重置验证或删除（可选连带话题），操作经 /api/users/action
 * 逐次验签并复用 purgeManagedUser 等既有守卫。
 * 追加（菜单检查版）：主菜单新增「🔄 检查更新」按钮（updchk 回调，
 * 仅主管理员），点按即手动检查并在菜单内展示结果（有更新时附
 * Release 页按钮），与 /version 命令共用同一套缓存与节流。
 * 追加（更新检查版）：自动检查 GitHub 仓库 realadmin/TGbot-D1 的
 * 最新 Release 与内置 BOT_VERSION 比较；结果缓存在 D1 config
 * （成功 6 小时 / 失败 30 分钟，手动 /version 有 5 分钟地板），
 * 由请求流 1% 概率顺带触发（与数据库清理同机制，无需 Cron）；
 * 发现未通知过的新版本时私聊通知主管理员一次；主菜单显示版本行。
 * 追加（命令菜单版）：ensureBotCommands 补注册改版命令——默认作用域
 * 加话题命令 reverify；另以 all_private_chats 作用域注册 start、
 * testverify、finduser（私聊菜单不再混入群命令）。部署后任意请求
 * 触发一次注册即全端生效。
 * 追加（不存正文版）：D1 不再保存任何消息正文——访客侧正文记录停写，
 * 管理员侧仅保留 text 为空的路由行（供编辑事件定位目标用户），编辑
 * 回退通知的原文位置显示占位符。正文只存在于 Telegram。存量正文行
 * 可由主人在 D1 控制台执行 DELETE FROM messages WHERE user_id !=
 * 'rxmap'; 立即清除，或等待原有 90 天清理。
 * 追加（用户管理版）：管理员私聊 /finduser 关键词 按 ID/用户名/名字
 * 搜索用户，结果可一键重置验证（保留话题映射，重验后回原话题）或
 * 删除记录（确认页可选连带删除话题，避免无主话题残留）；主菜单加
 * 「用户搜索与删除」入口。仅主管理员可用，管理员账号不可被操作。
 * 追加（超时清理版）：新增配置 verified_ttl_days（默认 0=关闭，
 * 「基础配置」菜单可改）：已验证/待验证用户超过该天数无活跃时，
 * 在日常清理中删除其 users 行与名下 messages 记录以回收空间；
 * 被屏蔽/静音（管理员处置）与管理员账号豁免。活跃时间按 users
 * 表 updated_at 计，访客发消息时至多每天打卡一次刷新。
 * 追加（验证调试版）：管理员私聊命令 /testverify 生成测试模式验证
 * 链接（独立签名域，确认成功只回测试结果、不改任何用户状态，仅限
 * 管理员），可反复打开 Turnstile 页调试；话题命令 /reverify 可把
 * 该用户重置为待验证状态，便于用测试号完整重走验证流程。
 * 追加（拉黑提醒版）：订阅 my_chat_member，用户在私聊拉黑/解除拉黑
 * 机器人时在该用户话题内提醒（D1 标记去重）；管理员回复发送被
 * 「bot was blocked」拒绝时走同一标记兜底提醒。需在 setWebhook 的
 * allowed_updates 中包含 my_chat_member 才有事件提醒。
 * 追加（提示去重版）：同一条消息多次编辑时，先撤回上一条编辑提示
 * 再发新的，每条消息永远只保留最新的一条提示。
 * 追加（编辑提示版）：原地编辑成功后补一条一行小提示，
 * 以「回复」形式关联到被改的那条消息（Bot API 编辑不带原生「已编辑」
 * 角标，此为替代标记）；编辑失败回退时仍用原详细通知，不再叠加提示。
 * 追加（原地编辑版）：消息编辑改为优先原地修改对侧对应消息
 * （editMessageText / editMessageCaption / editMessageMedia，
 * 客户端会自动显示「已编辑」），无配对或原地编辑失败时回退原通知方式。
 * 其余逻辑与原版保持一致。
 * ==========================================================================*/

const USER_STATE = {
  NEW: 'new',
  PENDING: 'pending_verification',
  VERIFIED: 'verified'
};

const DEFAULTS = {
  welcome_msg:
    '在发消息之前，先完成人机验证，验证完成之后请等待3秒钟之后再发送消息以防发生失败！',
  verif_q:
    '问题：1+1=?\n\n提示：\n1. 正确答案不是“2”。\n2. 答案在机器人简介内，请看简介的答案进行回答。',
  verif_a: '3',
  verify_mode: 'turnstile',
  keyword_responses: '[]',
  block_keywords: '[]',
  block_threshold: '5',
  verified_ttl_days: '0',
  authorized_admins: '[]',

  enable_image_forwarding: 'true',
  enable_link_forwarding: 'true',
  enable_text_forwarding: 'true',
  enable_audio_forwarding: 'true',
  enable_sticker_forwarding: 'true',
  enable_user_forwarding: 'true',
  enable_group_forwarding: 'true',
  enable_channel_forwarding: 'true'
};

const LIMITS = {
  welcome_msg: 4000,
  verif_q: 4000,
  verif_a: 300,
  authorized_admins: 2000,
  block_keyword: 200,
  auto_reply_pattern: 200,
  auto_reply_response: 4000,
  filter_text: 5000
};

const TOPIC_LOCK_TIMEOUT_SECONDS = 30;
const DATABASE_RETENTION_SECONDS = 90 * 24 * 60 * 60;

const USER_UPDATE_FIELDS = new Set([
  'user_state',
  'is_blocked',
  'is_muted',
  'block_count',
  'topic_id',
  'info_card_message_id',
  'user_info_json',
  'admin_note',
  'topic_creating',
  'topic_lock_at',
  'created_at',
  'updated_at'
]);

let migrationPromise = null;
let botCommandsPromise = null;

async function ensureBotCommands(env) {
  if (botCommandsPromise) {
    return botCommandsPromise;
  }

  botCommandsPromise = Promise.all([
    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        commands: [
          {
            command: 'ban',
            description: '封禁当前话题用户'
          },
          {
            command: 'unban',
            description: '解除当前话题用户封禁'
          },
          {
            command: 'delete',
            description: '删除被回复的消息'
          },
          {
            command: 'terminate',
            description: '删除当前用户话题'
          },
          {
            command: 'card',
            description: '重新创建当前用户资料卡'
          },
          {
            command: 'reverify',
            description: '让当前话题用户重新验证'
          },
          {
            command: 'note',
            description: '给当前话题用户打备注（/note 内容）'
          },
          {
            command: 'notedelete',
            description: '删除当前话题用户的备注'
          }
        ]
      }
    ),

    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        scope: { type: 'all_private_chats' },
        commands: [
          {
            command: 'start',
            description: '开始使用'
          },
          {
            command: 'help',
            description: '获取帮助'
          },
          {
            command: 'testverify',
            description: '打开 Turnstile 验证测试页'
          },
          {
            command: 'version',
            description: '查看版本与检查更新'
          }
        ]
      }
    )
  ]).catch((error) => {
    botCommandsPromise = null;

    console.error(
      '注册机器人命令失败：',
      error?.message || error
    );
  });

  return botCommandsPromise;
}


/* -------------------------------------------------------------------------- */
/*                               通用辅助函数                                   */
/* -------------------------------------------------------------------------- */

function escapeHtml(text) {
  if (text === null || text === undefined) return '';

  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMessageNotModifiedError(error) {
  return String(error?.message || error)
    .toLowerCase()
    .includes('message is not modified');
}


function toBoolText(value, defaultValue = true) {
  if (typeof value !== 'string') return defaultValue;
  return value.toLowerCase() === 'true';
}

function formatTimestamp(timestamp) {
  if (!timestamp) return '[]';

  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '[]';
  }

  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false
  });
}

function randomId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function hasLinks(message) {
  const entities = [
    ...(message?.entities || []),
    ...(message?.caption_entities || [])
  ];

  return entities.some((entity) => {
    return (
      entity.type === 'url' ||
      entity.type === 'text_link' ||
      entity.type === 'email'
    );
  });
}

function getForwardType(message) {
  const origin = message?.forward_origin;

  if (origin) {
    if (
      origin.type === 'user' ||
      origin.type === 'hidden_user'
    ) {
      return 'user';
    }

    if (origin.type === 'channel') {
      return 'channel';
    }

    if (origin.type === 'chat') {
      const chatType = origin.sender_chat?.type;

      if (chatType === 'channel') {
        return 'channel';
      }

      if (
        chatType === 'group' ||
        chatType === 'supergroup'
      ) {
        return 'group';
      }

      return 'group';
    }
  }

  // 兼容旧版 Telegram Bot API 字段
  if (message?.forward_from_chat?.type === 'channel') {
    return 'channel';
  }

  if (
    message?.forward_from_chat?.type === 'group' ||
    message?.forward_from_chat?.type === 'supergroup'
  ) {
    return 'group';
  }

  if (
    message?.forward_from ||
    message?.forward_sender_name
  ) {
    return 'user';
  }

  return null;
}

function detectMessageKind(message) {
  if (
    message?.photo ||
    message?.video ||
    message?.document ||
    message?.video_note
  ) {
    return 'media';
  }

  if (message?.audio || message?.voice) {
    return 'audio_voice';
  }

  if (message?.sticker || message?.animation) {
    return 'sticker_gif';
  }

  if (message?.text || message?.caption) {
    return 'text';
  }

  return 'other';
}

function getMessageText(message) {
  return String(
    message?.text ||
    message?.caption ||
    ''
  ).slice(0, LIMITS.filter_text);
}

function getMessageStorageKey(direction, messageId) {
  return `${direction}:${messageId}`;
}

function isTopicInvalidError(error) {
  const text = String(error?.message || error).toLowerCase();

  return (
    text.includes('message thread not found') ||
    text.includes('message thread is closed') ||
    text.includes('topic_closed') ||
    text.includes('topic was deleted') ||
    text.includes('forum topic was closed') ||
    text.includes('message thread id is invalid')
  );
}

function validateEnvironment(env) {
  const missing = [];

  if (!env.BOT_TOKEN) missing.push('BOT_TOKEN');
  if (!env.ADMIN_GROUP_ID) missing.push('ADMIN_GROUP_ID');
  if (!env.ADMIN_IDS) missing.push('ADMIN_IDS');
  if (!env.WEBHOOK_SECRET) missing.push('WEBHOOK_SECRET');
  if (!env.TG_BOT_DB) missing.push('TG_BOT_DB');

  if (missing.length > 0) {
    throw new Error(
      `缺少环境变量或绑定：${missing.join(', ')}`
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             Telegram API 封装                               */
/* -------------------------------------------------------------------------- */

async function telegramApi(
  token,
  method,
  params = {},
  attempt = 0
) {
  const url =
    `https://api.telegram.org/bot${token}/${method}`;

  let response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (attempt < 2) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    throw new Error(
      `Telegram 网络请求失败 (${method})：` +
      `${error?.message || error}`
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Telegram API 返回非 JSON 内容 ` +
      `(${method}, HTTP ${response.status})`
    );
  }

  if (!data.ok) {
    const retryAfter = Number(
      data.parameters?.retry_after || 0
    );

    if (
      data.error_code === 429 &&
      retryAfter > 0 &&
      attempt < 2
    ) {
      await sleep(
        Math.min(retryAfter * 1000, 10000)
      );

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    if (
      response.status >= 500 &&
      attempt < 2
    ) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1
      );
    }

    const error = new Error(
      data.description ||
      `Telegram API 错误：${method}`
    );

    error.errorCode = data.error_code;
    error.parameters = data.parameters;

    throw error;
  }

  return data.result;
}

/* -------------------------------------------------------------------------- */
/*                                数据库迁移                                    */
/* -------------------------------------------------------------------------- */

async function ensureUserColumn(
  env,
  columnName,
  definition
) {
  const result = await env.TG_BOT_DB.prepare(
    'PRAGMA table_info(users)'
  ).all();

  const columns = result?.results || [];
  const exists = columns.some(
    (column) => column.name === columnName
  );

  if (!exists) {
    await env.TG_BOT_DB.prepare(
      `ALTER TABLE users ADD COLUMN ` +
      `${columnName} ${definition}`
    ).run();
  }
}

async function dbMigrate(env) {
  if (!env.TG_BOT_DB) {
    throw new Error(
      "D1 database binding 'TG_BOT_DB' is missing."
    );
  }

  const queries = [
    `
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY NOT NULL,
      user_state TEXT NOT NULL DEFAULT 'new',
      is_blocked INTEGER NOT NULL DEFAULT 0,
      is_muted INTEGER NOT NULL DEFAULT 0,
      block_count INTEGER NOT NULL DEFAULT 0,
      topic_id TEXT,
      info_card_message_id TEXT,
      user_info_json TEXT,
      admin_note TEXT NOT NULL DEFAULT '',
      topic_creating INTEGER NOT NULL DEFAULT 0,
      topic_lock_at INTEGER,
      created_at INTEGER,
      updated_at INTEGER
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS messages (
      user_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      text TEXT,
      date INTEGER,
      PRIMARY KEY (user_id, message_id)
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS processed_updates (
      update_id TEXT PRIMARY KEY NOT NULL,
      processed_at INTEGER NOT NULL
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_users_topic_id
    ON users(topic_id)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_messages_date
    ON messages(date)
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_processed_updates_time
    ON processed_updates(processed_at)
    `
  ];

  await env.TG_BOT_DB.batch(
    queries.map((query) =>
      env.TG_BOT_DB.prepare(query)
    )
  );

  // 兼容旧数据库结构
  await ensureUserColumn(
    env,
    'topic_creating',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await ensureUserColumn(
    env,
    'topic_lock_at',
    'INTEGER'
  );

  await ensureUserColumn(
    env,
    'admin_note',
    "TEXT NOT NULL DEFAULT ''"
  );
}

async function ensureMigration(env) {
  if (!migrationPromise) {
    migrationPromise = dbMigrate(env).catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}

async function cleanupDatabase(env) {
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - DATABASE_RETENTION_SECONDS;

  try {
    await env.TG_BOT_DB.batch([
      env.TG_BOT_DB.prepare(
        'DELETE FROM messages WHERE date < ?'
      ).bind(cutoff),

      env.TG_BOT_DB.prepare(
        'DELETE FROM processed_updates ' +
        'WHERE processed_at < ?'
      ).bind(cutoff)
    ]);

    await cleanupExpiredUsers(env, now);
  } catch (error) {
    console.error(
      '清理数据库失败：',
      error?.message || error
    );
  }
}

async function cleanupExpiredUsers(env, now) {
  const ttlDays =
    Number(
      await getConfig(
        'verified_ttl_days',
        env,
        '0'
      )
    ) || 0;

  if (
    !Number.isInteger(ttlDays) ||
    ttlDays <= 0
  ) {
    return;
  }

  const cutoff = now - ttlDays * 86400;

  const result =
    await env.TG_BOT_DB.prepare(
      'SELECT user_id FROM users ' +
      'WHERE user_state IN (?, ?) ' +
      'AND is_blocked = 0 AND is_muted = 0 ' +
      'AND updated_at IS NOT NULL ' +
      'AND updated_at < ? LIMIT 200'
    )
      .bind(
        USER_STATE.VERIFIED,
        USER_STATE.PENDING,
        cutoff
      )
      .all();

  for (const row of result?.results || []) {
    const userId = String(row.user_id);

    // 管理员（含协管员）账号永不清理。
    if (await isAdminUser(userId, env)) {
      continue;
    }

    // 删除时复检全部条件，避免「选中后用户恰好回来活跃」
    // 的竞态把活跃用户误删（TOCTOU）。
    const deleted =
      await env.TG_BOT_DB.prepare(
        'DELETE FROM users WHERE user_id = ? ' +
        'AND user_state IN (?, ?) ' +
        'AND is_blocked = 0 AND is_muted = 0 ' +
        'AND updated_at < ?'
      )
        .bind(
          userId,
          USER_STATE.VERIFIED,
          USER_STATE.PENDING,
          cutoff
        )
        .run();

    if (
      deleted?.meta &&
      deleted.meta.changes === 0
    ) {
      continue;
    }

    await env.TG_BOT_DB.prepare(
      'DELETE FROM messages WHERE user_id = ?'
    )
      .bind(userId)
      .run();

    await dbConfigDelete(
      `botblocked:${userId}`,
      env
    );
  }
}

async function touchUserActivity(user, env) {
  const now =
    Math.floor(Date.now() / 1000);

  // 至多每天打卡一次，避免每条消息多一次写。
  if (now - Number(user.updated_at || 0) < 86400) {
    return;
  }

  try {
    // 只写时间戳本身：写回快照里的 user_state 会在竞态下
    // 覆盖管理员刚做的重置/状态变更。
    await env.TG_BOT_DB.prepare(
      'UPDATE users SET updated_at = ? ' +
      'WHERE user_id = ?'
    )
      .bind(now, user.user_id)
      .run();
  } catch (error) {
    console.error(
      '刷新用户活跃时间失败：',
      error?.message || error
    );
  }
}

async function claimUpdate(updateId, env) {
  if (
    updateId === null ||
    updateId === undefined
  ) {
    return true;
  }

  const result = await env.TG_BOT_DB.prepare(`
    INSERT OR IGNORE INTO processed_updates (
      update_id,
      processed_at
    ) VALUES (?, ?)
  `).bind(
    String(updateId),
    Math.floor(Date.now() / 1000)
  ).run();

  return Number(result?.meta?.changes || 0) > 0;
}

/* -------------------------------------------------------------------------- */
/*                               配置数据库操作                                  */
/* -------------------------------------------------------------------------- */

async function dbConfigGet(key, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT value FROM config WHERE key = ?'
  ).bind(key).first();

  return row ? row.value : null;
}

async function dbConfigPut(key, value, env) {
  await env.TG_BOT_DB.prepare(`
    INSERT INTO config (key, value)
    VALUES (?, ?)
    ON CONFLICT(key)
    DO UPDATE SET value = excluded.value
  `).bind(key, String(value)).run();
}

async function dbConfigClaim(key, value, env) {
  // 原子占用：仅当当前值与目标值不同才写入，
  // 返回 true 表示本次调用完成了这次状态迁移。
  const result = await env.TG_BOT_DB.prepare(
    'INSERT INTO config (key, value) ' +
    'VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE ' +
    'SET value = excluded.value ' +
    'WHERE config.value != excluded.value'
  )
    .bind(key, String(value))
    .run();

  return !result?.meta || result.meta.changes > 0;
}

async function dbConfigDelete(key, env) {
  await env.TG_BOT_DB.prepare(
    'DELETE FROM config WHERE key = ?'
  ).bind(key).run();
}

async function getConfig(
  key,
  env,
  defaultValue = ''
) {
  const value = await dbConfigGet(key, env);

  if (value !== null) {
    return value;
  }

  if (DEFAULTS[key] !== undefined) {
    return DEFAULTS[key];
  }

  return defaultValue;
}

async function setConfig(key, value, env) {
  await dbConfigPut(key, value, env);
}

/* -------------------------------------------------------------------------- */
/*                                用户数据库操作                                 */
/* -------------------------------------------------------------------------- */

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    is_blocked: Number(user.is_blocked) === 1,
    is_muted: Number(user.is_muted) === 1,
    topic_creating:
      Number(user.topic_creating) === 1,
    user_info: user.user_info_json
      ? safeJsonParse(user.user_info_json, null)
      : null
  };
}

async function dbUserGet(userId, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT * FROM users WHERE user_id = ?'
  ).bind(String(userId)).first();

  return normalizeUser(row);
}

async function dbUserGetOrCreate(userId, env) {
  const normalizedId = String(userId);
  const now = Math.floor(Date.now() / 1000);

  await env.TG_BOT_DB.prepare(`
    INSERT OR IGNORE INTO users (
      user_id,
      user_state,
      is_blocked,
      is_muted,
      block_count,
      topic_creating,
      created_at,
      updated_at
    ) VALUES (?, ?, 0, 0, 0, 0, ?, ?)
  `).bind(
    normalizedId,
    USER_STATE.NEW,
    now,
    now
  ).run();

  return dbUserGet(normalizedId, env);
}

async function dbUserUpdate(userId, data, env) {
  if (
    !data ||
    Object.keys(data).length === 0
  ) {
    return;
  }

  const payload = {
    ...data,
    updated_at: Math.floor(Date.now() / 1000)
  };

  if (payload.user_info !== undefined) {
    payload.user_info_json =
      payload.user_info === null
        ? null
        : JSON.stringify(payload.user_info);

    delete payload.user_info;
  }

  const keys = Object.keys(payload).filter(
    (key) => USER_UPDATE_FIELDS.has(key)
  );

  if (keys.length === 0) {
    return;
  }

  const fields = keys
    .map((key) => `${key} = ?`)
    .join(', ');

  const values = keys.map((key) => {
    const value = payload[key];

    if (
      key === 'is_blocked' ||
      key === 'is_muted' ||
      key === 'topic_creating'
    ) {
      if (typeof value === 'boolean') {
        return value ? 1 : 0;
      }
    }

    return value;
  });

  await env.TG_BOT_DB.prepare(
    `UPDATE users SET ${fields} WHERE user_id = ?`
  ).bind(
    ...values,
    String(userId)
  ).run();
}

async function dbTopicUserGet(topicId, env) {
  const row = await env.TG_BOT_DB.prepare(
    'SELECT user_id FROM users WHERE topic_id = ?'
  ).bind(String(topicId)).first();

  return row ? row.user_id : null;
}

async function incrementBlockCount(
  userId,
  threshold,
  env
) {
  await env.TG_BOT_DB.prepare(`
    UPDATE users
    SET
      block_count = block_count + 1,
      is_blocked = CASE
        WHEN block_count + 1 >= ? THEN 1
        ELSE is_blocked
      END,
      updated_at = ?
    WHERE user_id = ?
  `).bind(
    threshold,
    Math.floor(Date.now() / 1000),
    String(userId)
  ).run();

  const user = await dbUserGetOrCreate(userId, env);

  return {
    currentCount: Number(user.block_count || 0),
    shouldAutoBlock:
      Number(user.block_count || 0) >= threshold,
    isBlocked: user.is_blocked
  };
}

/* -------------------------------------------------------------------------- */
/*                               消息记录数据库                                  */
/* -------------------------------------------------------------------------- */

function messageDataPutStatement(
  userId,
  messageId,
  data,
  env
) {
  return env.TG_BOT_DB.prepare(`
    INSERT INTO messages (
      user_id,
      message_id,
      text,
      date
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, message_id)
    DO UPDATE SET
      text = excluded.text,
      date = excluded.date
  `).bind(
    String(userId),
    String(messageId),
    data?.text || '',
    data?.date || null
  );
}

async function dbMessageDataPut(
  userId,
  messageId,
  data,
  env
) {
  await messageDataPutStatement(
    userId,
    messageId,
    data,
    env
  ).run();
}

async function dbMessageDataDelete(
  userId,
  messageId,
  env
) {
  await env.TG_BOT_DB.prepare(
    'DELETE FROM messages ' +
    'WHERE user_id = ? AND message_id = ?'
  )
    .bind(String(userId), String(messageId))
    .run();
}

async function dbMessageDataGet(
  userId,
  messageId,
  env
) {
  const row = await env.TG_BOT_DB.prepare(`
    SELECT text, date
    FROM messages
    WHERE user_id = ?
      AND message_id = ?
  `).bind(
    String(userId),
    String(messageId)
  ).first();

  return row || null;
}

/* -------------------------------------------------------------------------- */
/*                               管理员权限管理                                  */
/* -------------------------------------------------------------------------- */

function getPrimaryAdminIds(env) {
  if (!env.ADMIN_IDS) return [];

  return env.ADMIN_IDS
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function isPrimaryAdmin(userId, env) {
  return getPrimaryAdminIds(env).includes(
    String(userId)
  );
}

async function getAuthorizedAdmins(env) {
  const raw = await getConfig(
    'authorized_admins',
    env,
    '[]'
  );

  const list = safeJsonParse(raw, []);

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((value) => String(value).trim())
    .filter((value) => /^\d+$/.test(value));
}

async function isAdminUser(userId, env) {
  if (isPrimaryAdmin(userId, env)) {
    return true;
  }

  const admins = await getAuthorizedAdmins(env);

  return admins.includes(String(userId));
}

/* -------------------------------------------------------------------------- */
/*                             管理员输入状态管理                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                              正则及过滤规则                                   */
/* -------------------------------------------------------------------------- */

function mergeRegexFlags(...groups) {
  // 禁止 g/y，避免 test() 状态化。
  const allowed = 'imsuv';
  let merged = '';

  for (const group of groups) {
    for (const flag of String(group || '')) {
      if (
        allowed.includes(flag) &&
        !merged.includes(flag)
      ) {
        merged += flag;
      }
    }
  }

  // u 和 v 不能同时使用
  if (
    merged.includes('u') &&
    merged.includes('v')
  ) {
    merged = merged.replace('v', '');
  }

  return merged;
}

function looksDangerousRegex(source) {
  // 只能防住部分常见灾难性回溯，不是完整正则分析器。
  const nestedQuantifier =
    /(\([^)]*[+*][^)]*\))[+*{]/;

  const repeatedWildcard =
    /(\.\*|\.\+).*(\.\*|\.\+)/;

  return (
    nestedQuantifier.test(source) ||
    repeatedWildcard.test(source)
  );
}

function buildRegexRule(
  pattern,
  defaultFlags = 'i'
) {
  let source = String(pattern || '').trim();
  let flags = defaultFlags;

  if (!source) {
    throw new Error('表达式不能为空');
  }

  if (
    source.length >
    LIMITS.auto_reply_pattern
  ) {
    throw new Error(
      `表达式不能超过 ` +
      `${LIMITS.auto_reply_pattern} 个字符`
    );
  }

  const literalMatch = source.match(
    /^\/([\s\S]*)\/([a-z]*)$/i
  );

  if (literalMatch) {
    source = literalMatch[1];
    flags = mergeRegexFlags(
      defaultFlags,
      literalMatch[2]
    );
  }

  const inlineFlagsMatch = source.match(
    /^\(\?([a-z]+)\)/i
  );

  if (inlineFlagsMatch) {
    flags = mergeRegexFlags(
      flags,
      inlineFlagsMatch[1].toLowerCase()
    );

    source = source.slice(
      inlineFlagsMatch[0].length
    );
  }

  if (!source) {
    throw new Error('正则表达式内容不能为空');
  }

  if (looksDangerousRegex(source)) {
    throw new Error(
      '表达式可能造成严重性能问题，请简化正则'
    );
  }

  return new RegExp(source, flags);
}

function validateRegexPattern(pattern) {
  buildRegexRule(pattern);
}

async function getAutoReplyRules(env) {
  const raw = await getConfig(
    'keyword_responses',
    env,
    '[]'
  );

  const rules = safeJsonParse(raw, []);

  return Array.isArray(rules)
    ? rules.filter(
        (rule) =>
          rule &&
          typeof rule === 'object' &&
          rule.keywords !== undefined
      )
    : [];
}

async function getBlockKeywords(env) {
  const raw = await getConfig(
    'block_keywords',
    env,
    '[]'
  );

  const keywords = safeJsonParse(raw, []);

  return Array.isArray(keywords)
    ? keywords.map(String)
    : [];
}

async function getBlockThreshold(env) {
  const raw = await getConfig(
    'block_threshold',
    env,
    '5'
  );

  const threshold = Number(raw);

  if (
    !Number.isInteger(threshold) ||
    threshold < 1 ||
    threshold > 100
  ) {
    return 5;
  }

  return threshold;
}

async function findBlockKeyword(text, env) {
  if (!text) return null;

  const keywords = await getBlockKeywords(env);
  const safeText = String(text).slice(
    0,
    LIMITS.filter_text
  );

  for (const keyword of keywords) {
    try {
      const regex = buildRegexRule(keyword);

      if (regex.test(safeText)) {
        return keyword;
      }
    } catch (error) {
      console.error(
        '无效屏蔽关键词正则：',
        keyword,
        error?.message || error
      );
    }
  }

  return null;
}

async function matchAutoReply(text, env) {
  if (!text) return null;

  const rules = await getAutoReplyRules(env);
  const safeText = String(text).slice(
    0,
    LIMITS.filter_text
  );

  for (const rule of rules) {
    try {
      const regex = buildRegexRule(
        rule.keywords
      );

      if (regex.test(safeText)) {
        return rule.response || null;
      }
    } catch (error) {
      console.error(
        '自动回复规则错误：',
        rule,
        error?.message || error
      );
    }
  }

  return null;
}

async function getFilterConfig(env) {
  return {
    media: toBoolText(
      await getConfig(
        'enable_image_forwarding',
        env,
        'true'
      )
    ),
    link: toBoolText(
      await getConfig(
        'enable_link_forwarding',
        env,
        'true'
      )
    ),
    text: toBoolText(
      await getConfig(
        'enable_text_forwarding',
        env,
        'true'
      )
    ),
    audio_voice: toBoolText(
      await getConfig(
        'enable_audio_forwarding',
        env,
        'true'
      )
    ),
    sticker_gif: toBoolText(
      await getConfig(
        'enable_sticker_forwarding',
        env,
        'true'
      )
    ),
    user_forward: toBoolText(
      await getConfig(
        'enable_user_forwarding',
        env,
        'true'
      )
    ),
    group_forward: toBoolText(
      await getConfig(
        'enable_group_forwarding',
        env,
        'true'
      )
    ),
    channel_forward: toBoolText(
      await getConfig(
        'enable_channel_forwarding',
        env,
        'true'
      )
    )
  };
}

async function checkForwardFilters(message, env) {
  const filters = await getFilterConfig(env);
  const kind = detectMessageKind(message);
  const forwardType = getForwardType(message);

  if (kind === 'media' && !filters.media) {
    return {
      ok: false,
      reason: '当前不允许发送图片、视频或文件。'
    };
  }

  if (
    kind === 'audio_voice' &&
    !filters.audio_voice
  ) {
    return {
      ok: false,
      reason: '当前不允许发送语音或音频。'
    };
  }

  if (
    kind === 'sticker_gif' &&
    !filters.sticker_gif
  ) {
    return {
      ok: false,
      reason: '当前不允许发送贴纸或 GIF。'
    };
  }

  if (kind === 'text' && !filters.text) {
    return {
      ok: false,
      reason: '当前不允许发送文本。'
    };
  }

  if (hasLinks(message) && !filters.link) {
    return {
      ok: false,
      reason: '当前不允许发送链接。'
    };
  }

  if (
    forwardType === 'user' &&
    !filters.user_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自用户的消息。'
    };
  }

  if (
    forwardType === 'group' &&
    !filters.group_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自群组的消息。'
    };
  }

  if (
    forwardType === 'channel' &&
    !filters.channel_forward
  ) {
    return {
      ok: false,
      reason: '当前不允许转发来自频道的消息。'
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                             用户资料卡与话题                                  */
/* -------------------------------------------------------------------------- */

function buildUserInfoPayload(
  from,
  firstMessageDate = null,
  adminNote = ''
) {
  const userId = String(from.id);
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';

  const displayName = (
    `${firstName}` +
    `${lastName ? ` ${lastName}` : ''}`
  ).trim() || '未知用户';

  const usernameRaw = from.username || '';

  const usernameDisplay = usernameRaw
    ? `@${usernameRaw}`
    : '无';

  // 话题名把备注放最前面，方便在话题列表侧边栏直接
  // 看到：只取备注第一行非空内容并单独限长；无备注时
  // 与原格式一致。总长仍守话题名的 128 字上限。
  const noteTitleLine = String(adminNote || '')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line) || '';

  const noteTitle =
    noteTitleLine.length > 40
      ? `${noteTitleLine.slice(0, 40)}…`
      : noteTitleLine;

  const topicName = (
    noteTitle
      ? `${noteTitle}｜${displayName} (${userId})`
      : `${displayName} (${userId})`
  ).slice(0, 128);

  const clickableName =
    `<a href="tg://user?id=${userId}">` +
    `${escapeHtml(displayName)}</a>`;

  const usernameText = usernameRaw
    ? `<a href="https://t.me/` +
      `${encodeURIComponent(usernameRaw)}">` +
      `@${escapeHtml(usernameRaw)}</a>`
    : '无';

  const firstTimeText = firstMessageDate
    ? `<b>首次消息时间:</b> ` +
      `<code>${escapeHtml(
        formatTimestamp(firstMessageDate)
      )}</code>`
    : '';

  const noteText = adminNote
    ? `\n<b>备注:</b> ${escapeHtml(adminNote)}`
    : '';

  const infoCard = `
👤 <b>用户资料卡</b>
<b>姓名:</b> ${clickableName}
<b>用户名:</b> ${usernameText}
<b>ID:</b> <code>${escapeHtml(userId)}</code>
${firstTimeText}${noteText}
  `.trim();

  return {
    userId,
    displayName,
    usernameRaw,
    usernameDisplay,
    topicName,
    infoCard
  };
}

function getProfileUrl(usernameRaw) {
  const username = String(
    usernameRaw || ''
  ).trim();

  if (
    !/^[A-Za-z0-9_]{5,32}$/.test(username)
  ) {
    return null;
  }

  return (
    `https://t.me/` +
    encodeURIComponent(username)
  );
}

function getInfoCardButtons(
  userId,
  isBlocked,
  isMuted,
  usernameRaw = ''
) {
  const rows = [
    [
      {
        text: isBlocked
          ? '✅ 解除屏蔽'
          : '🚫 屏蔽用户',
        callback_data:
          `${isBlocked ? 'unblock' : 'block'}:` +
          `${userId}`
      },
      {
        text: isMuted
          ? '🔔 恢复通知'
          : '🔕 静音通知',
        callback_data:
          `${isMuted ? 'unmute' : 'mute'}:` +
          `${userId}`
      }
    ],
    [
      {
        text: '📌 置顶资料卡',
        callback_data: `pin_card:${userId}`
      },
      {
        text: '🔄 刷新资料卡',
        callback_data:
          `refresh_card:${userId}`
      }
    ]
  ];

  const profileUrl =
    getProfileUrl(usernameRaw);

  /*
   * 只有用户具有有效公开用户名时，
   * 才显示“查看资料”按钮。
   *
   * 不再使用 tg://user?id=... 作为按钮链接，
   * 避免 BUTTON_USER_PRIVACY_RESTRICTED。
   */
  if (profileUrl) {
    rows.push([
      {
        text: '👤 查看资料',
        url: profileUrl
      }
    ]);
  }

  return {
    inline_keyboard: rows
  };
}


function buildCardSignature(payload) {
  return JSON.stringify({
    name: payload.displayName || '',
    usernameRaw: payload.usernameRaw || ''
  });
}

async function renameForumTopic(
  topicId,
  topicName,
  env
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(
          topicId
        ),
        name: topicName
      }
    );
  } catch (error) {
    const message = String(
      error?.message || error
    );

    if (
      !message.includes(
        'TOPIC_NOT_MODIFIED'
      ) &&
      !message.includes(
        'topic is not modified'
      )
    ) {
      console.error(
        '更新话题名称失败：',
        message
      );
    }
  }
}

async function refreshUserInfoCard(
  userId,
  from,
  env,
  force = false
) {
  const user = await dbUserGetOrCreate(
    userId,
    env
  );

  if (
    !user.topic_id ||
    !user.info_card_message_id
  ) {
    return {
      updated: false,
      reason: 'missing_card'
    };
  }

  const firstMessageDate =
    user.user_info?.first_message_date ||
    user.created_at ||
    null;

  const payload = buildUserInfoPayload(
    from,
    firstMessageDate,
    user.admin_note || ''
  );

  // 话题名先行同步：改名不依赖资料卡编辑的结果——
  // 卡片内容未变（编辑返回未修改）或编辑失败时，
  // 话题名也必须跟上（备注变更走的就是这条路径）。
  await renameForumTopic(
    user.topic_id,
    payload.topicName,
    env
  );

  const oldSignature = JSON.stringify({
    name: user.user_info?.name || '',
    usernameRaw:
      user.user_info?.username_raw || ''
  });

  const newSignature =
    buildCardSignature(payload);

  if (
    !force &&
    oldSignature === newSignature
  ) {
    return {
      updated: false,
      reason: 'not_modified'
    };
  }

    try {
    await telegramApi(
      env.BOT_TOKEN,
      'editMessageText',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_id: Number(
          user.info_card_message_id
        ),
        text: payload.infoCard,
        parse_mode: 'HTML',
        reply_markup: getInfoCardButtons(
          userId,
          user.is_blocked,
          user.is_muted,
          payload.usernameRaw
        )
      }
    );
  } catch (error) {
    if (!isMessageNotModifiedError(error)) {
      throw error;
    }
  }


  await dbUserUpdate(
    userId,
    {
      user_info: {
        name: payload.displayName,
        username: payload.usernameDisplay,
        username_raw: payload.usernameRaw,
        first_message_date: firstMessageDate
      }
    },
    env
  );

  return {
    updated: true,
    reason: 'updated'
  };
}

// 备注变更后把话题里的资料卡原地刷新（无卡片时静默跳过）。
async function refreshCardAfterNoteChange(
  userId,
  env
) {
  try {
    const user = await dbUserGet(userId, env);

    if (!user?.topic_id) {
      return;
    }

    if (!user?.info_card_message_id) {
      // 没有资料卡时资料卡刷新走不通，但话题名仍要
      // 同步：用存档资料拼出话题名后直接改名。
      const payload = buildUserInfoPayload(
        {
          id: Number(userId),
          first_name:
            user.user_info?.name || '未知用户',
          username:
            user.user_info?.username_raw || ''
        },
        null,
        user.admin_note || ''
      );

      await renameForumTopic(
        user.topic_id,
        payload.topicName,
        env
      );

      return;
    }

    const chatObject = await telegramApi(
      env.BOT_TOKEN,
      'getChat',
      { chat_id: String(userId) }
    );

    await refreshUserInfoCard(
      userId,
      chatObject,
      env,
      true
    );
  } catch (error) {
    console.error(
      '备注变更后刷新资料卡失败：',
      error?.message || error
    );
  }
}

async function createInfoCard(
  message,
  user,
  topicId,
  env
) {
  const payload = buildUserInfoPayload(
    message.from,
    message.date,
    user.admin_note || ''
  );

  const sent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id: Number(topicId),
      text: payload.infoCard,
      parse_mode: 'HTML',
      reply_markup: getInfoCardButtons(
        payload.userId,
        user.is_blocked,
        user.is_muted,
        payload.usernameRaw
      )
    }
  );

  await dbUserUpdate(
    payload.userId,
    {
      info_card_message_id:
        String(sent.message_id),
      user_info: {
        name: payload.displayName,
        username: payload.usernameDisplay,
        username_raw: payload.usernameRaw,
        first_message_date: message.date
      }
    },
    env
  );

  return sent.message_id;
}
const infoCardPromises = new Map();

async function ensureUserInfoCard(
  message,
  user,
  topicId,
  env
) {
  const userId = String(message.from.id);
  const lockKey = `${userId}:${topicId}`;

  const freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  if (freshUser.info_card_message_id) {
    return freshUser.info_card_message_id;
  }

  if (infoCardPromises.has(lockKey)) {
    return infoCardPromises.get(lockKey);
  }

  const task = (async () => {
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const currentUser =
        await dbUserGetOrCreate(userId, env);

      if (currentUser.info_card_message_id) {
        return currentUser.info_card_message_id;
      }

      try {
        return await createInfoCard(
          message,
          currentUser,
          topicId,
          env
        );
      } catch (error) {
        lastError = error;

        console.error(
          `创建资料卡失败（${attempt}/3），用户 ${userId}：`,
          error?.message || error
        );

        if (attempt < 3) {
          await sleep(attempt * 500);
        }
      }
    }

    console.error(
      `用户 ${userId} 的资料卡创建失败：`,
      lastError?.message || lastError
    );

    return null;
  })();

  infoCardPromises.set(lockKey, task);

  try {
    return await task;
  } finally {
    if (infoCardPromises.get(lockKey) === task) {
      infoCardPromises.delete(lockKey);
    }
  }
}

async function recreateUserInfoCard(
  userId,
  topicId,
  env
) {
  const normalizedUserId = String(userId);
  const normalizedTopicId = String(topicId);

  let user = await dbUserGetOrCreate(
    normalizedUserId,
    env
  );

  const oldCardMessageId =
    user.info_card_message_id;

  const userInfo = user.user_info || {};

  const displayName =
    String(userInfo.name || '').trim() ||
    `用户 ${normalizedUserId}`;

  const usernameRaw =
    String(userInfo.username_raw || '').trim();

  const firstMessageDate = Number(
    userInfo.first_message_date ||
    user.created_at ||
    Math.floor(Date.now() / 1000)
  );

  await dbUserUpdate(
    normalizedUserId,
    {
      topic_id: normalizedTopicId,
      info_card_message_id: null,
      topic_creating: false,
      topic_lock_at: null
    },
    env
  );

  user = await dbUserGetOrCreate(
    normalizedUserId,
    env
  );

  const syntheticMessage = {
    from: {
      id: normalizedUserId,
      first_name: displayName,
      username: usernameRaw || undefined
    },
    date: firstMessageDate
  };

  let newCardMessageId;

  try {
    newCardMessageId = await createInfoCard(
      syntheticMessage,
      user,
      normalizedTopicId,
      env
    );
  } catch (error) {
    // 重建失败时恢复旧资料卡 ID，避免数据库状态进一步损坏。
    await dbUserUpdate(
      normalizedUserId,
      {
        info_card_message_id:
          oldCardMessageId || null
      },
      env
    );

    throw error;
  }

  // 新卡创建成功后再删除旧卡，避免先删除后创建失败。
  if (
    oldCardMessageId &&
    String(oldCardMessageId) !==
      String(newCardMessageId)
  ) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id: Number(oldCardMessageId)
        }
      );
    } catch (error) {
      console.warn(
        `旧资料卡不存在或无法删除，用户 ${normalizedUserId}：`,
        error?.message || error
      );
    }
  }

  return newCardMessageId;
}

async function waitForUserTopic(userId, env) {
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);

    const user = await dbUserGet(
      userId,
      env
    );

    if (user?.topic_id) {
      return user.topic_id;
    }

    if (!user?.topic_creating) {
      break;
    }
  }

  return null;
}

async function ensureUserTopic(
  message,
  existingUser,
  env
) {
  const userId = String(message.from.id);
  let user =
    existingUser ||
    await dbUserGetOrCreate(userId, env);

if (user.topic_id) {
  if (!user.info_card_message_id) {
    await ensureUserInfoCard(
      message,
      user,
      user.topic_id,
      env
    );
  }

  return user.topic_id;
}

  const now = Math.floor(Date.now() / 1000);
  const staleTime =
    now - TOPIC_LOCK_TIMEOUT_SECONDS;

  const lockResult =
    await env.TG_BOT_DB.prepare(`
      UPDATE users
      SET
        topic_creating = 1,
        topic_lock_at = ?,
        updated_at = ?
      WHERE user_id = ?
        AND topic_id IS NULL
        AND (
          topic_creating = 0
          OR topic_lock_at IS NULL
          OR topic_lock_at < ?
        )
    `).bind(
      now,
      now,
      userId,
      staleTime
    ).run();

  const acquired =
    Number(lockResult?.meta?.changes || 0) > 0;

  if (!acquired) {
    const topicId = await waitForUserTopic(
      userId,
      env
    );

    if (topicId) {
      return topicId;
    }

    user = await dbUserGetOrCreate(
      userId,
      env
    );

    if (user.topic_id) {
      return user.topic_id;
    }

    throw new Error(
      '用户话题正在创建，请稍后重试'
    );
  }

  try {
    const payload = buildUserInfoPayload(
      message.from,
      message.date
    );

    const topic = await telegramApi(
      env.BOT_TOKEN,
      'createForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        name: payload.topicName
      }
    );

    const topicId = String(
      topic.message_thread_id
    );

    // 先保存话题 ID，避免资料卡发送失败时重复创建话题。
    await dbUserUpdate(
      userId,
      {
        topic_id: topicId,
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    await ensureUserInfoCard(
      message,
      user,
      topicId,
      env
    );

    return topicId;
  } catch (error) {
    await dbUserUpdate(
      userId,
      {
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    throw error;
  }
}

async function maybeAutoRefreshUserCard(
  message,
  env
) {
  if (!message?.from?.id) return;

  const userId = String(message.from.id);
  const user = await dbUserGetOrCreate(
    userId,
    env
  );

  if (
    !user.topic_id ||
    !user.info_card_message_id
  ) {
    return;
  }

  const oldName =
    user.user_info?.name || '';

  const oldUsernameRaw =
    user.user_info?.username_raw || '';

  const newName = (
    `${message.from.first_name || ''}` +
    `${message.from.last_name
      ? ` ${message.from.last_name}`
      : ''}`
  ).trim() || '未知用户';

  const newUsernameRaw =
    message.from.username || '';

  if (
    oldName === newName &&
    oldUsernameRaw === newUsernameRaw
  ) {
    return;
  }

  try {
    await refreshUserInfoCard(
      userId,
      message.from,
      env
    );
  } catch (error) {
    console.error(
      '自动刷新资料卡失败：',
      error?.message || error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                消息转发                                       */
/* -------------------------------------------------------------------------- */


// 组装对侧引用参数：counterpartId 是被引用消息在目标会话
// 里的 ID；message.quote 存在时把部分引用片段原样带上。
function buildReplyParameters(
  message,
  counterpartId
) {
  const replyParameters = {
    message_id: Number(counterpartId),
    allow_sending_without_reply: true
  };

  const quote = message?.quote;

  if (
    quote &&
    typeof quote.text === 'string' &&
    quote.text
  ) {
    replyParameters.quote = quote.text;

    if (Number.isFinite(quote.position)) {
      replyParameters.quote_position =
        quote.position;
    }

    if (
      Array.isArray(quote.entities) &&
      quote.entities.length
    ) {
      replyParameters.quote_entities =
        quote.entities;
    }
  }

  return replyParameters;
}

// 引用转发三级降级：带片段引用 → 整条引用 → 普通发送。
// 只有带 reply_parameters 的尝试失败时才逐级重试，
// 最后一级仍失败则把错误抛回调用方原有处理。
async function copyMessageWithReplyFallback(
  token,
  params,
  replyParameters
) {
  if (!replyParameters) {
    return telegramApi(
      token,
      'copyMessage',
      params
    );
  }

  try {
    return await telegramApi(
      token,
      'copyMessage',
      {
        ...params,
        reply_parameters: replyParameters
      }
    );
  } catch (firstError) {
    if (!replyParameters.quote) {
      return telegramApi(
        token,
        'copyMessage',
        params
      );
    }

    const wholeReply = { ...replyParameters };

    delete wholeReply.quote;
    delete wholeReply.quote_position;
    delete wholeReply.quote_entities;

    try {
      return await telegramApi(
        token,
        'copyMessage',
        {
          ...params,
          reply_parameters: wholeReply
        }
      );
    } catch {
      return telegramApi(
        token,
        'copyMessage',
        params
      );
    }
  }
}

async function relayUserMessageToTopic(
  message,
  user,
  env
) {
  const userId = String(message.from.id);

  // 获取最新用户状态，防止并发请求使用过期数据。
  let freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  // 统一确保话题存在，同时补建缺失的资料卡。
  let topicId = await ensureUserTopic(
    message,
    freshUser,
    env
  );

  freshUser = await dbUserGetOrCreate(
    userId,
    env
  );

  if (!freshUser.info_card_message_id) {
    await ensureUserInfoCard(
      message,
      freshUser,
      topicId,
      env
    );
  } else {
    await maybeAutoRefreshUserCard(
      message,
      env
    );
  }

  // 若访客引用了某条机器人消息，把引用换算到话题侧 ID。
  let replyParameters = null;

  const visitorRepliedId =
    message.reply_to_message?.message_id;

  if (visitorRepliedId) {
    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `p:${userId}:${visitorRepliedId}`,
      env
    );

    const topicCounterpart = String(
      pair?.text || ''
    );

    if (/^\d+$/.test(topicCounterpart)) {
      replyParameters = buildReplyParameters(
        message,
        topicCounterpart
      );
    }
  }

  let copiedMessageId = null;

  try {
    const copyResult =
      await copyMessageWithReplyFallback(
      env.BOT_TOKEN,
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        from_chat_id:
          String(message.chat.id),
        message_id:
          message.message_id,
        disable_notification:
          Boolean(
            freshUser.is_blocked ||
            freshUser.is_muted
          )
      },
      replyParameters
    );

    copiedMessageId =
      copyResult?.message_id || null;
  } catch (error) {
    if (!isTopicInvalidError(error)) {
      throw error;
    }

    console.error(
      '用户话题已失效，准备重建：',
      error?.message || error
    );

    await dbUserUpdate(
      userId,
      {
        topic_id: null,
        info_card_message_id: null,
        topic_creating: false,
        topic_lock_at: null
      },
      env
    );

    const refreshedUser =
      await dbUserGetOrCreate(
        userId,
        env
      );

    const newTopicId =
      await ensureUserTopic(
        message,
        refreshedUser,
        env
      );

    const newestUser =
      await dbUserGetOrCreate(
        userId,
        env
      );

    if (!newestUser.info_card_message_id) {
      await ensureUserInfoCard(
        message,
        newestUser,
        newTopicId,
        env
      );
    }

    const retryCopyResult =
      await copyMessageWithReplyFallback(
      env.BOT_TOKEN,
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(newTopicId),
        from_chat_id:
          String(message.chat.id),
        message_id:
          message.message_id,
        disable_notification:
          Boolean(
            newestUser.is_blocked ||
            newestUser.is_muted
          )
      },
      replyParameters
    );

    copiedMessageId =
      retryCopyResult?.message_id ||
      null;

    topicId = newTopicId;
  }

  if (copiedMessageId) {
    await storeMessagePair(
      userId,
      message.message_id,
      copiedMessageId,
      env
    );
  }

}

async function relayAdminMessageToUser(
  message,
  userId,
  env
) {
  // 若管理员引用了话题里的某条消息，把引用换算到访客
  // 私聊侧的原始消息 ID（配对不存在或已墓碑时不带引用）。
  let replyParameters = null;

  const adminRepliedId =
    message.reply_to_message?.message_id;

  if (adminRepliedId) {
    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `t:${adminRepliedId}`,
      env
    );

    const pairText = String(pair?.text || '');

    if (pairText && pairText !== 'gone') {
      const [pairUserId, pairPrivateId] =
        pairText.split(':');

      if (
        pairUserId === String(userId) &&
        /^\d+$/.test(pairPrivateId || '')
      ) {
        replyParameters =
          buildReplyParameters(
            message,
            pairPrivateId
          );
      }
    }
  }

  const copyResult =
    await copyMessageWithReplyFallback(
      env.BOT_TOKEN,
      {
        chat_id: String(userId),
        from_chat_id:
          String(message.chat.id),
        message_id: message.message_id
      },
      replyParameters
    );

  if (copyResult?.message_id) {
    await storeMessagePair(
      userId,
      copyResult.message_id,
      message.message_id,
      env
    );
  }

  return copyResult;
}

/* -------------------------------------------------------------------------- */
/*                      消息反应同步（改版新增）                               */
/* -------------------------------------------------------------------------- */

const REACTION_MAP_USER = 'rxmap';

const EDIT_HINT_TEXT = '✏️ 对方修改了这条消息';

async function storeMessagePair(
  userId,
  privateMessageId,
  topicMessageId,
  env
) {
  const now =
    Math.floor(Date.now() / 1000);

  try {
    // 两个方向的配对一次 batch 写入，避免半对儿。
    await env.TG_BOT_DB.batch([
      messageDataPutStatement(
        REACTION_MAP_USER,
        `p:${userId}:${privateMessageId}`,
        {
          text: String(topicMessageId),
          date: now
        },
        env
      ),

      messageDataPutStatement(
        REACTION_MAP_USER,
        `t:${topicMessageId}`,
        {
          text:
            `${userId}:${privateMessageId}`,
          date: now
        },
        env
      )
    ]);
  } catch (error) {
    console.error(
      '保存消息配对失败：',
      error?.message || error
    );
  }
}

async function replaceEditHint(
  env,
  { chatId, threadId, replyToMessageId, hintKey }
) {
  const oldHint = await dbMessageDataGet(
    REACTION_MAP_USER,
    hintKey,
    env
  );

  if (oldHint?.text) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: chatId,
          message_id: Number(oldHint.text)
        }
      );
    } catch (error) {
      console.error(
        '删除旧编辑提示失败：',
        error?.message || error
      );
    }
  }

  try {
    const params = {
      chat_id: chatId,
      text: EDIT_HINT_TEXT,
      reply_parameters: {
        message_id: Number(replyToMessageId)
      }
    };

    if (threadId !== undefined) {
      params.message_thread_id = threadId;
    }

    const sentHint = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    if (sentHint?.message_id) {
      await dbMessageDataPut(
        REACTION_MAP_USER,
        hintKey,
        {
          text: String(sentHint.message_id),
          date: Math.floor(Date.now() / 1000)
        },
        env
      );

      // 并发编辑竞态收尾：提示指针若已被后来的编辑
      // 改写，本次这条就是落败者，删掉以保持恒一条。
      const currentHint =
        await dbMessageDataGet(
          REACTION_MAP_USER,
          hintKey,
          env
        );

      if (
        currentHint &&
        currentHint.text !==
          String(sentHint.message_id)
      ) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'deleteMessage',
            {
              chat_id: chatId,
              message_id:
                Number(sentHint.message_id)
            }
          );
        } catch (error) {
          /* 收尾失败无妨 */
        }
      }
    }
  } catch (error) {
    console.error(
      '发送编辑提示失败：',
      error?.message || error
    );
  }
}

async function tombstoneTopicMessage(
  topicMessageId,
  env
) {
  // 管理员用 /delete 删掉话题侧消息后调用：把该消息的同步
  // 映射标记为 gone 并清掉路由行与提示，之后对它的编辑/反应
  // 一律静默丢弃，防止被删内容借回退通知重新出现。
  let resolvedPair = null;

  try {
    const now =
      Math.floor(Date.now() / 1000);

    const pair = await dbMessageDataGet(
      REACTION_MAP_USER,
      `t:${topicMessageId}`,
      env
    );

    let userId = null;

    if (pair?.text && pair.text !== 'gone') {
      const separator =
        pair.text.indexOf(':');

      if (separator > 0) {
        userId =
          pair.text.slice(0, separator);

        const privateMessageId =
          pair.text.slice(separator + 1);

        resolvedPair = {
          userId,
          privateMessageId
        };

        await dbMessageDataPut(
          REACTION_MAP_USER,
          `t:${topicMessageId}`,
          { text: 'gone', date: now },
          env
        );

        await dbMessageDataPut(
          REACTION_MAP_USER,
          `p:${userId}:${privateMessageId}`,
          { text: 'gone', date: now },
          env
        );

        const hintSpecs = [
          {
            key: `hint:t:${topicMessageId}`,
            chatId: userId
          },
          {
            key:
              `hint:p:${userId}:` +
              `${privateMessageId}`,
            chatId: env.ADMIN_GROUP_ID
          }
        ];

        for (const spec of hintSpecs) {
          const hint =
            await dbMessageDataGet(
              REACTION_MAP_USER,
              spec.key,
              env
            );

          if (hint?.text) {
            try {
              await telegramApi(
                env.BOT_TOKEN,
                'deleteMessage',
                {
                  chat_id: spec.chatId,
                  message_id:
                    Number(hint.text)
                }
              );
            } catch (error) {
              /* 提示可能已被手动删除 */
            }

            await dbMessageDataDelete(
              REACTION_MAP_USER,
              spec.key,
              env
            );
          }
        }
      }
    }

    if (!userId) {
      const owner =
        await env.TG_BOT_DB.prepare(
          'SELECT user_id FROM messages ' +
          'WHERE message_id = ?'
        )
          .bind(
            getMessageStorageKey(
              'admin',
              topicMessageId
            )
          )
          .first();

      userId = owner?.user_id
        ? String(owner.user_id)
        : null;
    }

    if (userId) {
      await dbMessageDataDelete(
        userId,
        getMessageStorageKey(
          'admin',
          topicMessageId
        ),
        env
      );
    }
  } catch (error) {
    console.error(
      '标记已删除消息失败：',
      error?.message || error
    );
  }

  return resolvedPair;
}

function extractEmojiReactions(
  reactions
) {
  if (!Array.isArray(reactions)) {
    return [];
  }

  const emojis = [];

  for (const item of reactions) {
    if (
      item?.type === 'emoji' &&
      item.emoji &&
      !emojis.includes(item.emoji)
    ) {
      emojis.push(item.emoji);
    }
  }

  return emojis;
}

async function mirrorReaction(
  env,
  targetChatId,
  targetMessageId,
  emojis
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'setMessageReaction',
      {
        chat_id: String(targetChatId),
        message_id:
          Number(targetMessageId),
        reaction: emojis.map(
          (emoji) => ({
            type: 'emoji',
            emoji
          })
        )
      }
    );
  } catch (error) {
    // 目标消息已删除、该聊天不允许此反应等情况直接忽略。
    console.warn(
      '镜像消息反应失败（已忽略）：',
      error?.message || error
    );
  }
}

function isNotModifiedError(error) {
  return String(
    error?.message || error
  )
    .toLowerCase()
    .includes('message is not modified');
}

function buildEditedMedia(source) {
  const extra = {};

  if (source.caption !== undefined) {
    extra.caption = source.caption;
  }

  if (source.caption_entities) {
    extra.caption_entities =
      source.caption_entities;
  }

  if (source.photo?.length) {
    return {
      type: 'photo',
      media:
        source.photo[
          source.photo.length - 1
        ].file_id,
      ...extra
    };
  }

  if (source.video) {
    return {
      type: 'video',
      media: source.video.file_id,
      ...extra
    };
  }

  if (source.animation) {
    return {
      type: 'animation',
      media: source.animation.file_id,
      ...extra
    };
  }

  if (source.document) {
    return {
      type: 'document',
      media: source.document.file_id,
      ...extra
    };
  }

  if (source.audio) {
    return {
      type: 'audio',
      media: source.audio.file_id,
      ...extra
    };
  }

  return null;
}

async function tryEditCounterpartMessage(
  env,
  targetChatId,
  targetMessageId,
  source
) {
  const chatId = String(targetChatId);
  const messageId =
    Number(targetMessageId);

  if (!messageId) {
    return false;
  }

  try {
    if (source.text) {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        text: source.text
      };

      if (source.entities) {
        params.entities = source.entities;
      }

      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        params
      );

      return true;
    }

    const media = buildEditedMedia(source);

    if (media) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'editMessageMedia',
          {
            chat_id: chatId,
            message_id: messageId,
            media
          }
        );

        return true;
      } catch (error) {
        if (isNotModifiedError(error)) {
          return true;
        }

        // 媒体本身替换失败时，退而求其次只同步说明文字。
        if (source.caption === undefined) {
          throw error;
        }
      }
    }

    if (source.caption !== undefined) {
      const params = {
        chat_id: chatId,
        message_id: messageId,
        caption: source.caption || ''
      };

      if (source.caption_entities) {
        params.caption_entities =
          source.caption_entities;
      }

      await telegramApi(
        env.BOT_TOKEN,
        'editMessageCaption',
        params
      );

      return true;
    }

    return false;
  } catch (error) {
    if (isNotModifiedError(error)) {
      return true;
    }

    console.warn(
      '原地编辑对应消息失败，改用通知方式：',
      error?.message || error
    );

    return false;
  }
}

async function handleMessageReaction(
  reaction,
  env
) {
  const chat = reaction?.chat;
  const reactor = reaction?.user;

  if (!chat || !reactor) {
    return;
  }

  // 忽略机器人账号的反应：镜像动作本身会产生反应更新，
  // 不过滤会来回打转；其他机器人的反应也不转发。
  if (reactor.is_bot) {
    return;
  }

  const emojis =
    extractEmojiReactions(
      reaction.new_reaction
    );

  if (chat.type === 'private') {
    const userId = String(chat.id);

    if (String(reactor.id) !== userId) {
      return;
    }

    const stored =
      await dbMessageDataGet(
        REACTION_MAP_USER,
        `p:${userId}:${reaction.message_id}`,
        env
      );

    if (
      !stored?.text ||
      stored.text === 'gone'
    ) {
      return;
    }

    await mirrorReaction(
      env,
      env.ADMIN_GROUP_ID,
      stored.text,
      emojis
    );

    return;
  }

  if (
    String(chat.id) ===
    String(env.ADMIN_GROUP_ID)
  ) {
    const reactorId =
      String(reactor.id);

    if (
      !(await isAdminUser(
        reactorId,
        env
      ))
    ) {
      return;
    }

    const stored =
      await dbMessageDataGet(
        REACTION_MAP_USER,
        `t:${reaction.message_id}`,
        env
      );

    if (!stored?.text) {
      return;
    }

    const separator =
      stored.text.indexOf(':');

    if (separator < 1) {
      return;
    }

    const userId =
      stored.text.slice(0, separator);

    const privateMessageId =
      stored.text.slice(separator + 1);

    await mirrorReaction(
      env,
      userId,
      privateMessageId,
      emojis
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               菜单渲染函数                                    */
/* -------------------------------------------------------------------------- */

async function renderMenu(
  env,
  {
    chatId,
    messageId = 0,
    text,
    reply_markup,
    parse_mode = 'HTML'
  }
) {
  const params = {
    chat_id: chatId,
    text,
    parse_mode,
    reply_markup
  };

  if (!messageId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editMessageText',
      {
        ...params,
        message_id: messageId
      }
    );
  } catch (error) {
    const errorText = String(
      error?.message || error
    ).toLowerCase();

    if (
      errorText.includes(
        'message is not modified'
      )
    ) {
      return;
    }

    if (
      errorText.includes(
        'message to edit not found'
      ) ||
      errorText.includes(
        "message can't be edited"
      )
    ) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        params
      );

      return;
    }

    throw error;
  }
}

async function showMainMenu(
  chatId,
  env,
  messageId = 0
) {
  const updateCache =
    await readUpdateCache(env);

  const updateState =
    describeUpdateState(updateCache);

  const versionLine =
    updateState.status === 'update' &&
    updateCache?.url
      ? `\n\n当前版本：${BOT_VERSION}｜🆕 <a href="${escapeHtml(updateCache.url)}">有新版本 ${escapeHtml(updateCache.tag)}</a>`
      : `\n\n当前版本：${BOT_VERSION}`;

  const text = `
⚙️ <b>机器人主菜单</b>

管理面板已搬到网页。${versionLine}
  `.trim();

  const keyboard = [];

  const listOrigin = getPublicOrigin(
    lastRequestOrigin,
    env
  );

  if (listOrigin) {
    keyboard.push([
      {
        text: '🛠 网页管理台',
        web_app: {
          url: await buildPanelUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);

    keyboard.push([
      {
        text: '📋 用户列表（网页版）',
        web_app: {
          url: await buildUserListUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);

    keyboard.push([
      {
        text: '📖 新手引导',
        web_app: {
          url: await buildGuideUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);
  }

  keyboard.push([
    {
      text: '🔄 检查更新',
      callback_data: 'updchk:check'
    }
  ]);

  const reply_markup = {
    inline_keyboard: keyboard
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

/* -------------------------------------------------------------------------- */
/*                               验证处理                                       */
/* -------------------------------------------------------------------------- */

async function handleStart(
  chatId,
  env,
  origin = ''
) {
  const welcomeMessage = await getConfig(
    'welcome_msg',
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: welcomeMessage
    }
  );

  const mode =
    await getEffectiveVerifyMode(env);

  if (mode === 'turnstile') {
    await sendTurnstilePrompt(
      chatId,
      env,
      origin
    );
  } else {
    const verificationQuestion =
      await getConfig('verif_q', env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: verificationQuestion
      }
    );
  }

  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.PENDING
    },
    env
  );
}

async function handleVerification(
  chatId,
  answer,
  env
) {
  const expected = await getConfig(
    'verif_a',
    env,
    '3'
  );

  const expectedAnswers = expected
    .split('|')
    .map((item) =>
      item.trim().toLowerCase()
    )
    .filter(Boolean);

  const normalized = String(answer || '')
    .trim()
    .toLowerCase();

  const isCorrect =
    expectedAnswers.includes(normalized);

  if (!isCorrect) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '🥺 抱歉，这次没有回答正确，' +
          '请重新查看提示后再试。'
      }
    );

    return false;
  }

  // 先更新状态，再通知用户，避免用户快速发送消息时状态未保存。
  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.VERIFIED
    },
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '🎉 验证成功！现在可以开始发送消息了。'
    }
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/*                    Turnstile 小程序验证（改版新增）                          */
/* -------------------------------------------------------------------------- */

const VERIFY_LINK_TTL_MS = 10 * 60 * 1000;

function isTurnstileConfigured(env) {
  return Boolean(
    env.TURNSTILE_SITE_KEY &&
    env.TURNSTILE_SECRET_KEY
  );
}

async function getEffectiveVerifyMode(env) {
  const mode = await getConfig(
    'verify_mode',
    env,
    'turnstile'
  );

  if (
    mode === 'turnstile' &&
    isTurnstileConfigured(env)
  ) {
    return 'turnstile';
  }

  return 'quiz';
}

function getPublicOrigin(requestOrigin, env) {
  const configured = String(
    env.PUBLIC_URL || ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (configured) {
    return configured;
  }

  return String(requestOrigin || '')
    .trim()
    .replace(/\/+$/, '');
}

async function hmacSha256Hex(key, data) {
  const encoder = new TextEncoder();

  const cryptoKey =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(String(key)),
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

  const signature =
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      encoder.encode(String(data))
    );

  return [...new Uint8Array(signature)]
    .map((byte) =>
      byte.toString(16).padStart(2, '0')
    )
    .join('');
}

function timingSafeEqualString(a, b) {
  const left = String(a || '');
  const right = String(b || '');

  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let i = 0; i < left.length; i += 1) {
    diff |=
      left.charCodeAt(i) ^
      right.charCodeAt(i);
  }

  return diff === 0;
}

async function buildVerifyUrl(
  origin,
  userId,
  env,
  testMode = false
) {
  const exp =
    Date.now() + VERIFY_LINK_TTL_MS;

  const signature =
    await hmacSha256Hex(
      env.WEBHOOK_SECRET,
      testMode
        ? `tsverify-test:${userId}:${exp}`
        : `tsverify:${userId}:${exp}`
    );

  const params = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    s: signature
  });

  if (testMode) {
    params.set('m', 'test');
  }

  return `${origin}/verify?${params.toString()}`;
}

async function checkVerifySignature(
  userId,
  expRaw,
  signature,
  env,
  testMode = false
) {
  const uid = String(userId || '');

  if (!/^\d{1,20}$/.test(uid)) {
    return false;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (
    !Number.isFinite(exp) ||
    exp <= now ||
    exp > now + VERIFY_LINK_TTL_MS + 60 * 1000
  ) {
    return false;
  }

  const expected =
    await hmacSha256Hex(
      env.WEBHOOK_SECRET,
      testMode
        ? `tsverify-test:${uid}:${exp}`
        : `tsverify:${uid}:${exp}`
    );

  return timingSafeEqualString(
    expected,
    String(signature || '')
  );
}

async function sendTestVerifyPrompt(
  chatId,
  env,
  origin
) {
  if (!isTurnstileConfigured(env)) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '⚠️ 尚未配置 Turnstile 密钥，' +
          '无法打开测试验证页。'
      }
    );

    return;
  }

  const base = getPublicOrigin(
    origin,
    env
  );

  if (!base) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '⚠️ 无法确定验证页地址，' +
          '无法打开测试验证页。'
      }
    );

    return;
  }

  const url = await buildVerifyUrl(
    base,
    chatId,
    env,
    true
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '🧪 Turnstile 测试验证（测试模式）：' +
        '完成验证只会显示测试结果，' +
        '不会修改任何用户的验证状态。' +
        '链接 10 分钟内有效，' +
        '需要新链接随时再发 /testverify。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🧪 打开测试验证页',
              web_app: { url }
            }
          ]
        ]
      }
    }
  );
}

async function sendTurnstilePrompt(
  chatId,
  env,
  origin
) {
  const base = getPublicOrigin(
    origin,
    env
  );

  if (!base) {
    // 无法确定验证页地址时回退静态问题，避免访客卡死。
    const question = await getConfig(
      'verif_q',
      env
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: question
      }
    );

    return;
  }

  const url = await buildVerifyUrl(
    base,
    chatId,
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        '请点击下方按钮完成人机验证，' +
        '链接 10 分钟内有效。' +
        '验证通过后即可发送消息。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔐 点我完成人机验证',
              web_app: { url }
            }
          ]
        ]
      }
    }
  );
}

function renderVerifyPage(env, params) {
  // m 不在签名覆盖范围内，只接受白名单值；
  // 同时把 < 转义掉，杜绝跳出内联脚本块。
  const payload = JSON.stringify({
    u: String(params.u),
    e: String(params.e),
    s: String(params.s),
    m: params.m === 'test' ? 'test' : ''
  }).replace(/</g, '\\u003c');

  const siteKey = escapeHtml(
    env.TURNSTILE_SITE_KEY
  );

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>人机验证</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px 16px; background: #17212b; color: #fff; }
  main { max-width: 420px; margin: 0 auto; text-align: center; }
  h1 { font-size: 20px; margin: 8px 0 12px; }
  p { color: #a7b5c4; font-size: 14px; line-height: 1.6; }
  .cf-turnstile { display: flex; justify-content: center; margin: 20px 0; }
  #status { min-height: 24px; color: #fff; }
</style>
</head>
<body>
<main>
  <h1>人机验证</h1>
  <p>请完成下方验证，确认您不是机器人。</p>
  <div class="cf-turnstile" data-sitekey="${siteKey}" data-callback="onTurnstileSuccess" data-error-callback="onTurnstileError"></div>
  <p id="status"></p>
</main>
<script>
  var payload = ${payload};

  function setStatus(text) {
    document.getElementById('status').textContent = text;
  }

  async function onTurnstileSuccess(token) {
    setStatus('正在确认验证结果…');

    try {
      var resp = await fetch('/verify/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          u: payload.u,
          e: payload.e,
          s: payload.s,
          m: payload.m,
          token: token
        })
      });

      var data = {};

      try {
        data = await resp.json();
      } catch (ignored) {}

      if (resp.ok && data.ok) {
        if (payload.m === 'test') {
          setStatus('✅ 测试验证成功！这是测试模式，未修改任何用户的验证状态，可以关闭此页面。');
        } else {
          setStatus('✅ 验证成功！可以关闭此页面，回到 Telegram 继续发送消息。');
        }

        if (window.Telegram && Telegram.WebApp) {
          Telegram.WebApp.ready();
        }
      } else {
        setStatus('❌ 验证未通过，请刷新页面重试。');

        if (window.turnstile) {
          turnstile.reset();
        }
      }
    } catch (error) {
      setStatus('❌ 网络异常，请刷新页面重试。');
    }
  }

  function onTurnstileError() {
    setStatus('❌ 验证组件加载失败，请检查网络后刷新页面。');
  }
</script>
</body>
</html>`;
}

async function handleVerifyPage(
  request,
  env
) {
  if (!isTurnstileConfigured(env)) {
    return new Response(
      '验证服务尚未配置完成，请联系管理员。',
      {
        status: 503,
        headers: {
          'content-type':
            'text/plain; charset=utf-8'
        }
      }
    );
  }

  const url = new URL(request.url);

  const u =
    url.searchParams.get('u') || '';
  const e =
    url.searchParams.get('e') || '';
  const s =
    url.searchParams.get('s') || '';

  const m =
    url.searchParams.get('m') || '';

  const valid =
    await checkVerifySignature(
      u,
      e,
      s,
      env,
      m === 'test'
    );

  if (!valid) {
    return new Response(
      '验证链接无效或已过期，' +
      '请回到机器人发送 /start 获取新链接。',
      {
        status: 403,
        headers: {
          'content-type':
            'text/plain; charset=utf-8'
        }
      }
    );
  }

  return new Response(
    renderVerifyPage(env, { u, e, s, m }),
    {
      status: 200,
      headers: {
        'content-type':
          'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}

async function handleVerifyConfirm(
  request,
  env
) {
  const jsonResponse = (
    status,
    data
  ) =>
    new Response(
      JSON.stringify(data),
      {
        status,
        headers: {
          'content-type':
            'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );

  if (!isTurnstileConfigured(env)) {
    return jsonResponse(503, {
      ok: false,
      error: 'not_configured'
    });
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return jsonResponse(400, {
      ok: false,
      error: 'bad_json'
    });
  }

  const u = String(body?.u || '');
  const e = String(body?.e || '');
  const s = String(body?.s || '');

  const testMode =
    String(body?.m || '') === 'test';
  const token =
    String(body?.token || '');

  if (
    token.length < 10 ||
    token.length > 2048
  ) {
    return jsonResponse(400, {
      ok: false,
      error: 'bad_token'
    });
  }

  const valid =
    await checkVerifySignature(
      u,
      e,
      s,
      env,
      testMode
    );

  if (!valid) {
    return jsonResponse(403, {
      ok: false,
      error: 'bad_signature'
    });
  }

  let verifyResult;

  try {
    const form = new URLSearchParams();

    form.set(
      'secret',
      env.TURNSTILE_SECRET_KEY
    );
    form.set('response', token);

    const remoteIp = request.headers.get(
      'CF-Connecting-IP'
    );

    if (remoteIp) {
      form.set('remoteip', remoteIp);
    }

    const resp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: form
      }
    );

    verifyResult = await resp.json();
  } catch (error) {
    console.error(
      'Turnstile siteverify 调用失败：',
      error?.message || error
    );

    return jsonResponse(502, {
      ok: false,
      error: 'siteverify_unreachable'
    });
  }

  if (!verifyResult?.success) {
    console.warn(
      'Turnstile 校验未通过：',
      JSON.stringify(
        verifyResult?.['error-codes'] || []
      )
    );

    return jsonResponse(403, {
      ok: false,
      error: 'turnstile_failed'
    });
  }

  const expectedHost =
    new URL(request.url).hostname;

  if (
    verifyResult.hostname &&
    verifyResult.hostname !==
      expectedHost
  ) {
    console.warn(
      'Turnstile hostname 不匹配：',
      verifyResult.hostname,
      expectedHost
    );

    return jsonResponse(403, {
      ok: false,
      error: 'hostname_mismatch'
    });
  }

  if (testMode) {
    if (!(await isAdminUser(u, env))) {
      return jsonResponse(403, {
        ok: false,
        error: 'test_not_allowed'
      });
    }

    return jsonResponse(200, {
      ok: true,
      test: true
    });
  }

  const user =
    await dbUserGetOrCreate(u, env);

  if (
    user.user_state !==
    USER_STATE.VERIFIED
  ) {
    await dbUserUpdate(
      u,
      {
        user_state: USER_STATE.VERIFIED
      },
      env
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: u,
        text:
          '🎉 验证成功！现在可以开始发送消息了。'
      }
    );
  }

  return jsonResponse(200, {
    ok: true
  });
}

/* -------------------------------------------------------------------------- */
/*                             管理员配置输入处理                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                               私聊消息处理                                    */
/* -------------------------------------------------------------------------- */

async function handleBlockedKeyword(
  userId,
  chatId,
  hitKeyword,
  env
) {
  const threshold =
    await getBlockThreshold(env);

  const result = await incrementBlockCount(
    userId,
    threshold,
    env
  );

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text:
        `⚠️ 您的消息触发了关键词过滤器 ` +
        `(${result.currentCount}/${threshold} 次)，` +
        `消息已丢弃。`
    }
  );

  if (result.shouldAutoBlock) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '❌ 您已多次触发关键词过滤，' +
          '当前已被自动屏蔽。'
      }
    );
  }

  console.log(
    `用户 ${userId} 命中关键词：`,
    hitKeyword
  );
}

async function handlePrivateMessage(
  message,
  env,
  origin = ''
) {
  if (!message?.chat?.id) return;

  const chatId =
    String(message.chat.id);

  const userId =
    String(message.from?.id || chatId);

  const text = getMessageText(message);
  const commandText =
    String(message.text || '').trim();

  const isPrimary =
    isPrimaryAdmin(userId, env);

  const isAdmin =
    await isAdminUser(userId, env);

  if (
    commandText === '/start' ||
    commandText === '/help'
  ) {
    if (isPrimary) {
      await showMainMenu(chatId, env);
      return;
    }

    const user =
      await dbUserGetOrCreate(
        userId,
        env
      );

    if (isAdmin) {
      if (
        user.user_state !==
        USER_STATE.VERIFIED
      ) {
        await dbUserUpdate(
          userId,
          {
            user_state:
              USER_STATE.VERIFIED
          },
          env
        );
      }

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '✅ 您是已授权协管员，可以在管理群用户话题中回复消息。'
        }
      );

      return;
    }

    if (
      user.user_state ===
      USER_STATE.VERIFIED
    ) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '您已通过验证，可以直接发送消息。'
        }
      );
    } else {
      await handleStart(chatId, env, origin);
    }

    return;
  }

  if (commandText === '/testverify') {
    if (isAdmin) {
      await sendTestVerifyPrompt(
        chatId,
        env,
        origin
      );
    }

    return;
  }

  if (commandText === '/version') {
    if (isPrimary) {
      const state = await checkForUpdates(
        env,
        true
      );

      const described =
        describeUpdateState(state);

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            'ℹ️ <b>版本信息</b>\n\n' +
            `当前版本：${BOT_VERSION}\n` +
            escapeHtml(described.line) +
            (state?.url &&
            described.status === 'update'
              ? `\n<a href="${escapeHtml(state.url)}">打开 Release 页</a>`
              : '') +
            (described.status === 'failed'
              ? '\n⚠️ 最近一次检查失败，请稍后再试。'
              : ''),
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }
      );
    }

    return;
  }

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (user.is_blocked) {
    return;
  }

  if (
    user.user_state ===
    USER_STATE.VERIFIED
  ) {
    await touchUserActivity(user, env);
  }

  if (
    isAdmin &&
    user.user_state !==
      USER_STATE.VERIFIED
  ) {
    await dbUserUpdate(
      userId,
      {
        user_state: USER_STATE.VERIFIED
      },
      env
    );

    user.user_state =
      USER_STATE.VERIFIED;
  }

  if (
    user.user_state === USER_STATE.NEW
  ) {
    await handleStart(chatId, env, origin);
    return;
  }

  if (
    user.user_state ===
    USER_STATE.PENDING
  ) {
    const mode =
      await getEffectiveVerifyMode(env);

    if (mode === 'turnstile') {
      await sendTurnstilePrompt(
        chatId,
        env,
        origin
      );

      return;
    }

    if (!message.text) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            '请使用文字回答验证问题。'
        }
      );

      return;
    }

    await handleVerification(
      chatId,
      message.text,
      env
    );

    return;
  }

  if (
    user.user_state !==
    USER_STATE.VERIFIED
  ) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          '请使用 /start 命令开始验证。'
      }
    );

    return;
  }

  const hitKeyword =
    await findBlockKeyword(text, env);

  if (hitKeyword) {
    await handleBlockedKeyword(
      userId,
      chatId,
      hitKeyword,
      env
    );

    return;
  }

  const filterResult =
    await checkForwardFilters(
      message,
      env
    );

  if (!filterResult.ok) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text:
          `⚠️ ${filterResult.reason}`
      }
    );

    return;
  }

  const autoReply =
    await matchAutoReply(text, env);

  if (autoReply) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: autoReply
      }
    );
  }

  await relayUserMessageToTopic(
    message,
    user,
    env
  );
}

/* -------------------------------------------------------------------------- */
/*                              管理员回复处理                                   */
/* -------------------------------------------------------------------------- */
function parseAdminCommand(text) {
  const value = String(text || '').trim();

  const match = value.match(
    /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+([\s\S]+))?$/
  );

  if (!match) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    argument: match[2]?.trim() || ''
  };
}

async function resolveTopicUserId(
  message,
  env,
  argument = ''
) {
  if (argument) {
    const userId = argument
      .split(/\s+/)[0]
      .trim();

    if (/^\d+$/.test(userId)) {
      return userId;
    }

    return null;
  }

  if (!message?.message_thread_id) {
    return null;
  }

  return dbTopicUserGet(
    String(message.message_thread_id),
    env
  );
}

async function sendTopicNotice(
  message,
  text,
  env
) {
  return telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id:
        Number(message.message_thread_id),
      text
    }
  );
}

async function handleAdminCommand(
  message,
  env
) {
  const parsed =
    parseAdminCommand(message.text);

  if (!parsed) {
    return false;
  }

  const allowedCommands = new Set([
  'ban',
  'unban',
  'delete',
  'terminate',
  'card',
  'reverify',
  'note',
  'notedelete'
]);

  if (!allowedCommands.has(parsed.command)) {
    return false;
  }

  const senderId =
    String(message.from?.id || '');

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    return true;
  }

  const topicId = String(
    message.message_thread_id || ''
  );

  if (!topicId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        text:
          '⚠️ 这些命令只能在用户话题中使用。'
      }
    );

    return true;
  }

  if (parsed.command === 'reverify') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的用户 ID。\n' +
        '也可以使用：/reverify 用户ID',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      {
        user_state: USER_STATE.PENDING
      },
      env
    );

    await sendTopicNotice(
      message,
      '🔄 已将该用户重置为待验证状态。\n' +
      '对方下次发送消息或 /start 时，' +
      '将重新进行人机验证。',
      env
    );

    return true;
  }

  if (
    parsed.command === 'note' ||
    parsed.command === 'notedelete'
  ) {
    // 备注命令只按话题定位用户，绝不把参数当作用户 ID
    // （备注内容可能以数字开头）。
    const userId =
      await resolveTopicUserId(
        message,
        env
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的用户 ID。',
        env
      );

      return true;
    }

    const target =
      await dbUserGetOrCreate(userId, env);

    if (parsed.command === 'notedelete') {
      if (!target.admin_note) {
        await sendTopicNotice(
          message,
          '📝 当前没有备注可删除。',
          env
        );

        return true;
      }

      await dbUserUpdate(
        userId,
        { admin_note: '' },
        env
      );

      await refreshCardAfterNoteChange(
        userId,
        env
      );

      await sendTopicNotice(
        message,
        '🗑 备注已删除。',
        env
      );

      return true;
    }

    const noteText = parsed.argument;

    if (!noteText) {
      await sendTopicNotice(
        message,
        target.admin_note
          ? `📝 当前备注：\n${target.admin_note}`
          : '📝 当前暂无备注。\n' +
            '用法：/note 备注内容',
        env
      );

      return true;
    }

    if (noteText.length > 500) {
      await sendTopicNotice(
        message,
        '⚠️ 备注太长（上限 500 字），未保存。',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      { admin_note: noteText },
      env
    );

    await refreshCardAfterNoteChange(
      userId,
      env
    );

    await sendTopicNotice(
      message,
      '📝 备注已保存。',
      env
    );

    return true;
  }

  if (parsed.command === 'ban') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的用户 ID。\n' +
        '也可以使用：/ban 用户ID',
        env
      );

      return true;
    }

    const user =
      await dbUserGetOrCreate(
        userId,
        env
      );

    await dbUserUpdate(
      userId,
      {
        is_blocked: true
      },
      env
    );

    await sendTopicNotice(
      message,
      `🚫 已封禁用户 ${userId}。`,
      env
    );

    if (!user.is_blocked) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: userId,
            text:
              '⚠️ 您已被管理员封禁，' +
              '无法继续发送消息。'
          }
        );
      } catch (error) {
        console.error(
          '发送封禁通知失败：',
          error?.message || error
        );
      }
    }

    return true;
  }

  if (parsed.command === 'unban') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的用户 ID。\n' +
        '也可以使用：/unban 用户ID',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      {
        is_blocked: false,
        block_count: 0
      },
      env
    );

    await sendTopicNotice(
      message,
      `✅ 已解除用户 ${userId} 的封禁。`,
      env
    );

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: userId,
          text:
            '✅ 管理员已解除对您的封禁，' +
            '现在可以继续发送消息。'
        }
      );
    } catch (error) {
      console.error(
        '发送解禁通知失败：',
        error?.message || error
      );
    }

    return true;
  }

  if (parsed.command === 'delete') {
    const repliedMessage =
      message.reply_to_message;

    if (!repliedMessage?.message_id) {
      await sendTopicNotice(
        message,
        '⚠️ 请先回复要删除的消息，再发送 /delete。',
        env
      );

      return true;
    }

    let deletedPair = null;

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id:
            repliedMessage.message_id
        }
      );

      deletedPair =
        await tombstoneTopicMessage(
          repliedMessage.message_id,
          env
        );

      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_id:
            message.message_id
        }
      );
    } catch (error) {
      await sendTopicNotice(
        message,
        `❌ 删除消息失败：` +
        `${error?.message || error}`,
        env
      );
    }

    // 连带删除客人私聊中的原消息（存在配对时）：
    // 客人已自行删除（not found）视为已删、不提示；
    // 其余失败（如消息超过 48 小时、机器人被拉黑）
    // 在话题里留一行说明，话题侧删除结果不变。
    if (deletedPair) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'deleteMessage',
          {
            chat_id: deletedPair.userId,
            message_id:
              Number(
                deletedPair.privateMessageId
              )
          }
        );
      } catch (error) {
        const reason =
          error?.message || String(error);

        if (!/not found/i.test(reason)) {
          await sendTopicNotice(
            message,
            '⚠️ 话题侧已删除，但客人私聊中的' +
              `原消息删除失败：${reason}`,
            env
          );
        }
      }
    }

    return true;
  }
if (parsed.command === 'card') {
  const userId =
    await resolveTopicUserId(
      message,
      env,
      parsed.argument
    );

  if (!userId) {
    await sendTopicNotice(
      message,
      '❌ 找不到当前话题对应的用户 ID。\n' +
      '映射丢失时可以使用：/card 用户ID',
      env
    );

    return true;
  }

  try {
    await dbUserGetOrCreate(userId, env);

    // 指定用户 ID 时，将当前话题重新绑定给该用户。
    if (parsed.argument) {
      await env.TG_BOT_DB.prepare(`
        UPDATE users
        SET
          topic_id = NULL,
          info_card_message_id = NULL,
          topic_creating = 0,
          topic_lock_at = NULL,
          updated_at = ?
        WHERE topic_id = ?
          AND user_id <> ?
      `).bind(
        Math.floor(Date.now() / 1000),
        topicId,
        String(userId)
      ).run();

      await dbUserUpdate(
        userId,
        {
          topic_id: topicId,
          topic_creating: false,
          topic_lock_at: null
        },
        env
      );
    }

    await recreateUserInfoCard(
      userId,
      topicId,
      env
    );

    await sendTopicNotice(
      message,
      `✅ 用户 ${userId} 的资料卡已重新创建。`,
      env
    );
  } catch (error) {
    console.error(
      `重建用户 ${userId} 的资料卡失败：`,
      error?.stack ||
      error?.message ||
      error
    );

    await sendTopicNotice(
      message,
      `❌ 重新创建资料卡失败：` +
      `${error?.message || error}`,
      env
    );
  }

  return true;
}

  if (parsed.command === 'terminate') {
    const userId =
      await resolveTopicUserId(
        message,
        env,
        parsed.argument
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的用户 ID。\n' +
        '也可以使用：/terminate 用户ID',
        env
      );

      return true;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id:
            Number(topicId)
        }
      );

      await dbUserUpdate(
        userId,
        {
          topic_id: null,
          info_card_message_id: null,
          topic_creating: false,
          topic_lock_at: null
        },
        env
      );
    } catch (error) {
      await sendTopicNotice(
        message,
        `❌ 删除话题失败：` +
        `${error?.message || error}`,
        env
      );
    }

    return true;
  }

  return false;
}

async function handleAdminReply(
  message,
  env
) {
  if (
    !message?.is_topic_message ||
    !message?.message_thread_id
  ) {
    return;
  }

  if (
    String(message.chat.id) !==
    String(env.ADMIN_GROUP_ID)
  ) {
    return;
  }

  if (message.from?.is_bot) {
    return;
  }

  // 话题服务消息（关闭/重开/改名/置顶通知等）不是管理员的
  // 回复内容，且 Telegram 不允许复制，直接忽略，
  // 避免误报「转发失败」。
  if (
    message.forum_topic_created ||
    message.forum_topic_edited ||
    message.forum_topic_closed ||
    message.forum_topic_reopened ||
    message.general_forum_topic_hidden ||
    message.general_forum_topic_unhidden ||
    message.pinned_message
  ) {
    return;
  }

  const senderId =
    String(message.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
  return;
}

if (
  message.text &&
  message.text.trim().startsWith('/')
) {
  const handled =
    await handleAdminCommand(
      message,
      env
    );

  if (handled) {
    return;
  }

  // 形如命令但不在白名单里：多半是打错或已下线的命令，
  // 提示管理员并吞掉，不要转发给访客。
  const parsedUnknown =
    parseAdminCommand(message.text);

  if (parsedUnknown) {
    await sendTopicNotice(
      message,
      `⚠️ 未识别的命令 /${parsedUnknown.command}，未转发给用户。`,
      env
    );

    return;
  }
}

const topicId =
  String(message.message_thread_id);


  const userId =
    await dbTopicUserGet(
      topicId,
      env
    );

  if (!userId) {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        text:
          '❌ 找不到该话题对应的用户 ID，无法转发消息。'
      }
    );

    return;
  }

  try {
    await relayAdminMessageToUser(
      message,
      userId,
      env
    );

    // 改版：只写空正文的路由行，供管理员编辑事件定位目标用户，
    // 不保存消息正文（正文只存在于 Telegram）。
    await dbMessageDataPut(
      userId,
      getMessageStorageKey(
        'admin',
        message.message_id
      ),
      {
        text: '',
        date: message.date
      },
      env
    );
  } catch (error) {
    console.error(
      '管理员消息转发失败：',
      error?.message || error
    );

    if (isBotBlockedError(error)) {
      const wasFlagged =
        (await dbConfigGet(
          `botblocked:${userId}`,
          env
        )) === '1';

      await noteBotBlocked(userId, env);

      if (wasFlagged) {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id:
              Number(topicId),
            text:
              '❌ 对方已拉黑机器人，' +
              '这条消息未能送达。'
          }
        );
      }

      return;
    }

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(topicId),
        text:
          `❌ 转发消息给用户 ${userId} 失败：` +
          `${error?.message || error}`
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               编辑消息处理                                    */
/* -------------------------------------------------------------------------- */

async function handleRelayEditedMessage(
  editedMessage,
  env
) {
  if (!editedMessage?.from?.id) return;

  const userId =
    String(editedMessage.from.id);

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (
    user.is_blocked ||
    user.user_state !==
      USER_STATE.VERIFIED ||
    !user.topic_id
  ) {
    return;
  }

  const text =
    getMessageText(editedMessage);

  const hitKeyword =
    await findBlockKeyword(text, env);

  if (hitKeyword) {
    await handleBlockedKeyword(
      userId,
      String(editedMessage.chat.id),
      hitKeyword,
      env
    );

    return;
  }

  const filterResult =
    await checkForwardFilters(
      editedMessage,
      env
    );

  if (!filterResult.ok) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id:
            String(editedMessage.chat.id),
          text:
            `⚠️ 编辑后的消息未通过过滤：` +
            `${filterResult.reason}`
        }
      );
    } catch (error) {
      console.error(
        '发送编辑过滤提示失败：',
        error?.message || error
      );
    }

    return;
  }

  const storageKey =
    getMessageStorageKey(
      'user',
      editedMessage.message_id
    );

  const stored =
    await dbMessageDataGet(
      userId,
      storageKey,
      env
    );

  const originalText =
    stored?.text ||
    '[原始内容无法获取或不是文本内容]';

  const originalDate = stored?.date
    ? formatTimestamp(stored.date)
    : '[发送时间无法获取]';

  const newContent =
    editedMessage.text ||
    editedMessage.caption ||
    '[非文本或媒体内容]';

  const notificationText = `
⚠️ <b>用户消息已修改</b>

<b>原消息发送时间：</b>
<code>${escapeHtml(originalDate)}</code>

<b>原始内容：</b>
${escapeHtml(originalText)}

<b>修改后的内容：</b>
${escapeHtml(newContent)}
  `.trim();

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `p:${userId}:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退通知。
  if (pair?.text === 'gone') {
    return;
  }

  let editedInPlace = false;

  if (pair?.text) {
    editedInPlace =
      await tryEditCounterpartMessage(
        env,
        env.ADMIN_GROUP_ID,
        pair.text,
        editedMessage
      );
  }

  if (editedInPlace) {
    const hintKey =
      `hint:p:${userId}:` +
      `${editedMessage.message_id}`;

    await replaceEditHint(env, {
      chatId: env.ADMIN_GROUP_ID,
      threadId: Number(user.topic_id),
      replyToMessageId: Number(pair.text),
      hintKey
    });

    try {
      await maybeAutoRefreshUserCard(
        editedMessage,
        env
      );
    } catch (error) {
      console.error(
        '自动刷新资料卡失败：',
        error?.message || error
      );
    }

    return;
  }

  try {
    await maybeAutoRefreshUserCard(
      editedMessage,
      env
    );

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: notificationText,
        parse_mode: 'HTML'
      }
    );
  } catch (error) {
    console.error(
      '处理用户编辑消息失败：',
      error?.message || error
    );
  }
}

async function handleAdminEditedReply(
  editedMessage,
  env
) {
  if (
    !editedMessage?.is_topic_message ||
    !editedMessage?.message_thread_id
  ) {
    return;
  }

  if (
    String(editedMessage.chat.id) !==
    String(env.ADMIN_GROUP_ID)
  ) {
    return;
  }

  if (editedMessage.from?.is_bot) {
    return;
  }

  const senderId =
    String(editedMessage.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    return;
  }

  const topicId =
    String(editedMessage.message_thread_id);

  const userId =
    await dbTopicUserGet(
      topicId,
      env
    );

  if (!userId) {
    return;
  }

  const storageKey =
    getMessageStorageKey(
      'admin',
      editedMessage.message_id
    );

  const stored =
    await dbMessageDataGet(
      userId,
      storageKey,
      env
    );

  if (!stored) {
    return;
  }

  const newText =
    editedMessage.text ||
    editedMessage.caption ||
    '[媒体内容]';

  const originalTime =
    formatTimestamp(stored.date);

  const editTime =
    formatTimestamp(
      editedMessage.edit_date ||
      editedMessage.date
    );

  const notificationText = `
⚠️ <b>管理员编辑了之前的回复</b>

<b>原发送或上次编辑时间：</b>
<code>${escapeHtml(originalTime)}</code>

<b>本次编辑时间：</b>
<code>${escapeHtml(editTime)}</code>

<b>原消息内容：</b>
${escapeHtml(stored.text || '[原始内容未保存]')}

<b>新消息内容：</b>
${escapeHtml(newText)}
  `.trim();

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `t:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退通知。
  if (pair?.text === 'gone') {
    return;
  }

  let editedInPlace = false;
  let counterpartId = null;

  if (pair?.text) {
    const separator =
      pair.text.indexOf(':');

    if (
      separator > 0 &&
      pair.text.slice(0, separator) ===
        String(userId)
    ) {
      counterpartId =
        pair.text.slice(separator + 1);

      editedInPlace =
        await tryEditCounterpartMessage(
          env,
          userId,
          counterpartId,
          editedMessage
        );
    }
  }

  if (editedInPlace) {
    const hintKey =
      `hint:t:${editedMessage.message_id}`;

    await replaceEditHint(env, {
      chatId: userId,
      replyToMessageId: Number(counterpartId),
      hintKey
    });

    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: notificationText,
        parse_mode: 'HTML'
      }
    );

  } catch (error) {
    console.error(
      '处理管理员编辑消息失败：',
      error?.message || error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             配置列表和删除处理                                 */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                              Callback Query                                 */
/* -------------------------------------------------------------------------- */

async function answerCallback(
  callbackId,
  env,
  text = '',
  showAlert = false
) {
  try {
    await telegramApi(
      env.BOT_TOKEN,
      'answerCallbackQuery',
      {
        callback_query_id: callbackId,
        text,
        show_alert: showAlert
      }
    );
  } catch (error) {
    console.error(
      '回答 Callback Query 失败：',
      error?.message || error
    );
  }
}

async function handleUserCardCallback(
  callbackQuery,
  env
) {
  const message =
    callbackQuery.message;

  if (
    !message ||
    String(message.chat.id) !==
      String(env.ADMIN_GROUP_ID)
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '该按钮只能在管理群中使用。',
      true
    );

    return;
  }

  const [
    action,
    targetUserId
  ] = String(
    callbackQuery.data || ''
  ).split(':');

  const allowedActions = new Set([
    'block',
    'unblock',
    'mute',
    'unmute',
    'pin_card',
    'refresh_card'
  ]);

  if (
    !allowedActions.has(action) ||
    !/^\d+$/.test(
      String(targetUserId || '')
    )
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '无效操作。',
      true
    );

    return;
  }

  if (await isAdminUser(targetUserId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '不能对管理员账号执行此操作。',
      true
    );

    return;
  }

  let user =
    await dbUserGet(
      targetUserId,
      env
    );

  if (!user) {
    await answerCallback(
      callbackQuery.id,
      env,
      '无效操作。',
      true
    );

    return;
  }

  if (action === 'pin_card') {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'pinChatMessage',
        {
          chat_id: message.chat.id,
          message_id:
            message.message_id,
          disable_notification: true
        }
      );

      await dbUserUpdate(
        targetUserId,
        {
          info_card_message_id:
            String(message.message_id)
        },
        env
      );

      await answerCallback(
        callbackQuery.id,
        env,
        '✅ 已置顶资料卡。'
      );
    } catch (error) {
      await answerCallback(
        callbackQuery.id,
        env,
        `❌ 置顶失败：` +
        `${error?.message || error}`,
        true
      );
    }

    return;
  }

  if (action === 'refresh_card') {
    try {
      const chatObject =
        await telegramApi(
          env.BOT_TOKEN,
          'getChat',
          {
            chat_id: targetUserId
          }
        );

      const result =
        await refreshUserInfoCard(
          targetUserId,
          chatObject,
          env,
          true
        );

      let tip = '✅ 资料卡已刷新。';

      if (!result.updated) {
        if (result.reason === 'missing_card') {
          tip = '⚠️ 找不到资料卡消息。';
        } else if (
          result.reason === 'not_modified'
        ) {
          tip = '✅ 资料卡已是最新，无需刷新。';
        }
      }


      await answerCallback(
        callbackQuery.id,
        env,
        tip
      );
    } catch (error) {
      console.error(
        '刷新资料卡失败：',
        error?.message || error
      );

      await answerCallback(
        callbackQuery.id,
        env,
        `❌ 刷新失败：` +
        `${error?.message || error}`,
        true
      );
    }

    return;
  }

  try {
    if (
      action === 'block' ||
      action === 'unblock'
    ) {
      await dbUserUpdate(
        targetUserId,
        {
          is_blocked:
            action === 'block'
        },
        env
      );
    }

    if (
      action === 'mute' ||
      action === 'unmute'
    ) {
      await dbUserUpdate(
        targetUserId,
        {
          is_muted:
            action === 'mute'
        },
        env
      );
    }

    user = await dbUserGetOrCreate(
      targetUserId,
      env
    );

    const usernameRaw =
      user.user_info?.username_raw || '';

    await telegramApi(
      env.BOT_TOKEN,
      'editMessageReplyMarkup',
      {
        chat_id: message.chat.id,
        message_id:
          message.message_id,
        reply_markup:
          getInfoCardButtons(
            targetUserId,
            user.is_blocked,
            user.is_muted,
            usernameRaw
          )
      }
    );

    let toast = '✅ 操作成功。';

    if (action === 'block') {
      toast = '🚫 已屏蔽该用户。';
    }

    if (action === 'unblock') {
      toast = '✅ 已解除屏蔽。';
    }

    if (action === 'mute') {
      toast = '🔕 已静音通知。';
    }

    if (action === 'unmute') {
      toast = '🔔 已恢复通知。';
    }

    await answerCallback(
      callbackQuery.id,
      env,
      toast
    );
  } catch (error) {
    console.error(
      `处理 ${action} 失败：`,
      error?.message || error
    );

    await answerCallback(
      callbackQuery.id,
      env,
      '❌ 操作失败，请重试。',
      true
    );
  }
}

async function handleCallbackQuery(
  callbackQuery,
  env
) {
  if (!callbackQuery?.from?.id) {
    return;
  }

  const senderId =
    String(callbackQuery.from.id);

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    await answerCallback(
      callbackQuery.id,
      env,
      '您无权执行该操作。',
      true
    );

    return;
  }

  const data =
    String(callbackQuery.data || '');

  if (data === 'menu:main') {
    await answerCallback(
      callbackQuery.id,
      env
    );

    await showMainMenu(
      String(callbackQuery.from.id),
      env,
      callbackQuery.message?.message_id || 0
    );

    return;
  }

  if (data.startsWith('config:')) {
    // 配置菜单已迁移到网页管理台，
    // 旧消息上的按钮只回一条迁移提示。
    await answerCallback(
      callbackQuery.id,
      env,
      '⚙️ 配置已迁移到网页管理台，请回主菜单打开。',
      true
    );

    return;
  }

  if (data.startsWith('updchk:')) {
    await handleUpdateCheckCallback(
      callbackQuery,
      env
    );

    return;
  }

  await handleUserCardCallback(
    callbackQuery,
    env
  );
}

/* -------------------------------------------------------------------------- */
/*                               Update 入口                                    */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*                         拉黑 / 解除拉黑提醒（改版新增）                        */
/* -------------------------------------------------------------------------- */

function isBotBlockedError(error) {
  return /blocked by the user/i.test(
    String(error?.message || error)
  );
}

async function noteBotBlocked(userId, env) {
  const flagKey = `botblocked:${userId}`;

  // 原子占用：my_chat_member 与发送失败兜底两条触发路径
  // 并发命中时，只让先占用成功的一方发提醒。
  const claimed = await dbConfigClaim(
    flagKey,
    '1',
    env
  );

  if (!claimed) {
    return;
  }

  const user =
    await dbUserGetOrCreate(userId, env);

  if (user.is_blocked || !user.topic_id) {
    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text:
          '🚫 对方已将机器人拉黑，' +
          '后续消息将无法送达。'
      }
    );
  } catch (error) {
    console.error(
      '发送拉黑提醒失败：',
      error?.message || error
    );
  }
}

async function noteBotUnblocked(
  userId,
  env
) {
  const flagKey = `botblocked:${userId}`;

  if (
    (await dbConfigGet(flagKey, env)) !==
    '1'
  ) {
    return;
  }

  await dbConfigDelete(flagKey, env);

  const user =
    await dbUserGetOrCreate(userId, env);

  if (user.is_blocked || !user.topic_id) {
    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text:
          '✅ 对方已解除对机器人的拉黑，' +
          '可以继续正常收发消息。'
      }
    );
  } catch (error) {
    console.error(
      '发送解除拉黑提醒失败：',
      error?.message || error
    );
  }
}

async function handleMyChatMember(
  chatMember,
  env
) {
  if (
    !chatMember ||
    chatMember.chat?.type !== 'private'
  ) {
    return;
  }

  const userId = String(chatMember.chat.id);

  if (await isAdminUser(userId, env)) {
    return;
  }

  const oldStatus =
    chatMember.old_chat_member?.status;

  const newStatus =
    chatMember.new_chat_member?.status;

  if (
    newStatus === 'kicked' &&
    oldStatus !== 'kicked'
  ) {
    await noteBotBlocked(userId, env);
  } else if (
    oldStatus === 'kicked' &&
    newStatus === 'member'
  ) {
    await noteBotUnblocked(userId, env);
  }
}

async function purgeManagedUser(
  userId,
  deleteTopic,
  env
) {
  const user =
    await dbUserGetOrCreate(userId, env);

  let topicDeleted = false;

  if (deleteTopic && user.topic_id) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id:
            Number(user.topic_id)
        }
      );

      topicDeleted = true;
    } catch (error) {
      console.error(
        '删除话题失败（继续删记录）：',
        error?.message || error
      );
    }
  }

  await env.TG_BOT_DB.batch([
    env.TG_BOT_DB.prepare(
      'DELETE FROM messages WHERE user_id = ?'
    ).bind(userId),

    env.TG_BOT_DB.prepare(
      'DELETE FROM users WHERE user_id = ?'
    ).bind(userId),

    env.TG_BOT_DB.prepare(
      'DELETE FROM messages ' +
      'WHERE user_id = ? ' +
      'AND (message_id LIKE ? OR ' +
      '(message_id LIKE ? AND text LIKE ?))'
    ).bind(
      REACTION_MAP_USER,
      `p:${userId}:%`,
      't:%',
      `${userId}:%`
    )
  ]);

  await dbConfigDelete(
    `botblocked:${userId}`,
    env
  );

  return topicDeleted;
}

/* -------------------------------------------------------------------------- */
/*                         自动检查更新（改版新增）                             */
/* -------------------------------------------------------------------------- */

const BOT_VERSION = 'v1.1.0';
const UPDATE_REPO = 'realadmin/TGbot-D1';
const UPDATE_CACHE_KEY = 'sys:latest-release';
const UPDATE_NOTIFIED_KEY = 'sys:update-notified';
const UPDATE_FRESH_MS = 6 * 60 * 60 * 1000;
const UPDATE_NEGATIVE_MS = 30 * 60 * 1000;
const UPDATE_MANUAL_FLOOR_MS = 5 * 60 * 1000;

function compareVersions(a, b) {
  const parse = (value) =>
    String(value || '')
      .replace(/^v/i, '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const diff = (left[i] || 0) - (right[i] || 0);

    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

async function readUpdateCache(env) {
  const raw =
    await dbConfigGet(UPDATE_CACHE_KEY, env);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function fetchLatestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'tgbotd1-update-check'
      },
      signal: AbortSignal.timeout(8000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `GitHub API ${response.status}`
    );
  }

  const data = await response.json();

  if (!data?.tag_name) {
    throw new Error('GitHub 返回缺少 tag_name');
  }

  const rawUrl = String(data.html_url || '');

  return {
    tag: String(data.tag_name),
    url: rawUrl.startsWith('https://github.com/')
      ? rawUrl
      : `https://github.com/${UPDATE_REPO}/releases`,
    name: String(data.name || data.tag_name)
  };
}

async function checkForUpdates(env, force = false) {
  const now = Date.now();
  const cache = await readUpdateCache(env);

  if (cache?.lastAttempt) {
    const floor = force
      ? UPDATE_MANUAL_FLOOR_MS
      : cache.lastOk
        ? UPDATE_FRESH_MS
        : UPDATE_NEGATIVE_MS;

    if (now - cache.lastAttempt < floor) {
      return cache;
    }
  }

  let next;

  try {
    const release = await fetchLatestRelease();

    next = {
      tag: release.tag,
      url: release.url,
      name: release.name,
      checkedAt: now,
      lastAttempt: now,
      lastOk: true
    };
  } catch (error) {
    console.error(
      '检查更新失败：',
      error?.message || error
    );

    // 已有新鲜的成功结果时，失败不覆盖它，
    // 免得菜单在接下来一段时间里误报失败/过期。
    if (
      cache?.lastOk &&
      cache.checkedAt &&
      now - cache.checkedAt < UPDATE_FRESH_MS
    ) {
      return cache;
    }

    next = {
      tag: cache?.tag || null,
      url: cache?.url || null,
      name: cache?.name || null,
      checkedAt: cache?.checkedAt || 0,
      lastAttempt: now,
      lastOk: false
    };
  }

  await dbConfigPut(
    UPDATE_CACHE_KEY,
    JSON.stringify(next),
    env
  );

  if (
    next.lastOk &&
    next.tag &&
    compareVersions(next.tag, BOT_VERSION) > 0
  ) {
    // 先原子占用通知名额再发送，避免并发检查重复通知；
    // 若一个管理员都没送达，释放名额留待下次重试。
    const claimed = await dbConfigClaim(
      UPDATE_NOTIFIED_KEY,
      next.tag,
      env
    );

    if (claimed) {
      let delivered = 0;

      for (const adminId of
        getPrimaryAdminIds(env)) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: adminId,
              text:
                '🆕 <b>机器人有新版本可用</b>\n\n' +
                `当前版本：${BOT_VERSION}\n` +
                `最新版本：<a href="${escapeHtml(next.url)}">${escapeHtml(next.tag)}</a>\n\n` +
                '到 GitHub 仓库的 Release 页下载新版代码，' +
                '粘贴到 Worker 里部署即可（与平时部署方法相同）。',
              parse_mode: 'HTML',
              disable_web_page_preview: true
            }
          );

          delivered += 1;
        } catch (error) {
          console.error(
            '发送更新通知失败：',
            error?.message || error
          );
        }
      }

      if (delivered === 0) {
        await dbConfigDelete(
          UPDATE_NOTIFIED_KEY,
          env
        );
      }
    }
  }

  return next;
}

async function maybeCheckForUpdates(env) {
  try {
    await checkForUpdates(env);
  } catch (error) {
    console.error(
      '自动检查更新异常：',
      error?.message || error
    );
  }
}

function describeUpdateState(cache) {
  if (!cache || !cache.tag) {
    return {
      status: cache ? 'failed' : 'unknown',
      line: '最新版本：未知（尚无成功检查记录）'
    };
  }

  const timeText = cache.checkedAt
    ? formatTimestamp(
        Math.floor(cache.checkedAt / 1000)
      )
    : '未知';

  if (compareVersions(cache.tag, BOT_VERSION) > 0) {
    return {
      status: 'update',
      line:
        `最新版本：${cache.tag}（🆕 有更新，上次成功检查：${timeText}）`
    };
  }

  if (!cache.lastOk) {
    return {
      status: 'stale',
      line:
        `最新版本：${cache.tag}（已是最新，上次成功检查：${timeText}；最近一次检查失败，显示上次结果）`
    };
  }

  return {
    status: 'current',
    line:
      `最新版本：${cache.tag}（已是最新，上次成功检查：${timeText}）`
  };
}

async function handleUpdateCheckCallback(
  callbackQuery,
  env
) {
  const senderId =
    String(callbackQuery.from.id);

  if (!isPrimaryAdmin(senderId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '仅主管理员可执行此操作。',
      true
    );

    return;
  }

  const chatId =
    String(callbackQuery.message.chat.id);

  const messageId =
    callbackQuery.message.message_id;

  const before = await readUpdateCache(env);

  const state = await checkForUpdates(
    env,
    true
  );

  const throttled = Boolean(
    before &&
    state &&
    before.lastAttempt === state.lastAttempt
  );

  const described =
    describeUpdateState(state);

  let text =
    '🔄 <b>检查更新</b>\n\n' +
    `当前版本：${BOT_VERSION}\n` +
    escapeHtml(described.line);

  if (described.status === 'failed') {
    text +=
      '\n⚠️ 最近一次检查失败，请稍后再试。';
  }

  if (throttled) {
    text +=
      '\n（刚检查过不久，这是缓存结果；' +
      '手动检查最短间隔 5 分钟。）';
  }

  const keyboard = [];

  if (
    described.status === 'update' &&
    state?.url
  ) {
    keyboard.push([
      {
        text: '⬇️ 打开 Release 页',
        url: state.url
      }
    ]);
  }

  keyboard.push([
    {
      text: '🔄 再次检查',
      callback_data: 'updchk:check'
    }
  ]);

  keyboard.push([
    {
      text: '⬅️ 返回主菜单',
      callback_data: 'menu:main'
    }
  ]);

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                         网页版用户列表（改版新增）                           */
/* -------------------------------------------------------------------------- */

const USERLIST_LINK_TTL_MS = 30 * 60 * 1000;

let lastRequestOrigin = '';

async function buildSignedPanelUrl(
  origin,
  adminId,
  env,
  path
) {
  const exp = Date.now() + USERLIST_LINK_TTL_MS;

  const signature = await hmacSha256Hex(
    env.WEBHOOK_SECRET,
    `usrlist:${adminId}:${exp}`
  );

  const params = new URLSearchParams({
    u: String(adminId),
    e: String(exp),
    s: signature
  });

  return `${origin}${path}?${params.toString()}`;
}

async function buildUserListUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/users'
  );
}

async function buildGuideUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/guide'
  );
}

async function checkUserListAuth(uid, expRaw, signature, env) {
  const id = String(uid || '');

  if (!/^\d{1,20}$/.test(id)) {
    return null;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (
    !Number.isFinite(exp) ||
    exp <= now ||
    exp > now + USERLIST_LINK_TTL_MS + 60 * 1000
  ) {
    return null;
  }

  const expected = await hmacSha256Hex(
    env.WEBHOOK_SECRET,
    `usrlist:${id}:${exp}`
  );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return null;
  }

  if (!isPrimaryAdmin(id, env)) {
    return null;
  }

  return id;
}

async function panelQueryAdminId(request, env) {
  const url = new URL(request.url);

  return checkUserListAuth(
    url.searchParams.get('u'),
    url.searchParams.get('e'),
    url.searchParams.get('s'),
    env
  );
}

async function signedPageResponse(
  request,
  env,
  builder,
  expiredText
) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return new Response(
      '<!doctype html><meta charset="utf-8">' +
      '<p style="font-family:sans-serif;padding:24px">' +
      expiredText +
      '</p>',
      {
        status: 403,
        headers: {
          'content-type': 'text/html; charset=utf-8'
        }
      }
    );
  }

  return new Response(builder(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8'
    }
  });
}

function parseUserInfoForList(user) {
  let name = '';
  let username = '';

  try {
    const info = JSON.parse(
      user.user_info_json || '{}'
    );

    name = String(
      info.name ||
      [info.first_name, info.last_name]
        .filter(Boolean)
        .join(' ') ||
      ''
    );

    username = String(
      info.username_raw || info.username || ''
    );

    if (username === '无') {
      username = '';
    }
  } catch (error) {
    name = '';
    username = '';
  }

  return { name, username };
}

async function handleUserListPage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildUserListPage,
    '链接无效或已过期，请回到机器人主菜单重新打开用户列表。'
  );
}

async function handleUserListApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const result = await env.TG_BOT_DB.prepare(
    'SELECT user_id, user_state, is_blocked, ' +
    'is_muted, topic_id, created_at, updated_at, ' +
    'user_info_json, admin_note FROM users ' +
    'ORDER BY updated_at DESC LIMIT 1000'
  )
    .all();

  const rows = result?.results || [];

  const users = rows
    .filter(
      (user) => !isPrimaryAdmin(user.user_id, env)
    )
    .map((user) => {
      const info = parseUserInfoForList(user);

      return {
        id: String(user.user_id),
        name: info.name,
        username: info.username,
        state: user.is_blocked
          ? 'blocked'
          : String(user.user_state || ''),
        muted: Boolean(user.is_muted),
        topic: Boolean(user.topic_id),
        topic_id: user.topic_id
          ? String(user.topic_id)
          : '', 
        created_at: user.created_at || 0,
        updated_at: user.updated_at || 0,
        note: user.admin_note || ''
      };
    });

  const groupLinkId = String(
    env.ADMIN_GROUP_ID || ''
  ).replace(/^-100/, '');

  return Response.json({
    ok: true,
    group: groupLinkId,
    users
  });
}

async function countRows(env, sql, binds) {
  const row = await env.TG_BOT_DB.prepare(sql)
    .bind(...binds)
    .first();

  return Number(row?.n || 0);
}

async function countUsersWhere(env, extraSql, binds) {
  const adminIds = getPrimaryAdminIds(env);

  let sql = 'SELECT COUNT(*) AS n FROM users';
  const allBinds = [];

  if (adminIds.length) {
    sql +=
      ' WHERE user_id NOT IN (' +
      adminIds.map(() => '?').join(',') +
      ')';

    allBinds.push(...adminIds);
  }

  if (extraSql) {
    sql +=
      (adminIds.length ? ' AND ' : ' WHERE ') +
      extraSql;

    allBinds.push(...binds);
  }

  return countRows(env, sql, allBinds);
}

async function handleStatsApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const since1 = now - 86400;
  const since7 = now - 7 * 86400;
  const since30 = now - 30 * 86400;

  const inSql =
    'SELECT COUNT(*) AS n FROM messages ' +
    'WHERE user_id = ? AND message_id LIKE ? ' +
    'AND date >= ?';

  const outSql =
    'SELECT COUNT(*) AS n FROM messages ' +
    'WHERE message_id LIKE ? AND date >= ?';

  const [
    total,
    verified,
    pending,
    fresh,
    blocked,
    muted,
    botBlocked,
    new1,
    new7,
    new30,
    act1,
    act7,
    act30,
    in1,
    in7,
    in30,
    out1,
    out7,
    out30
  ] = await Promise.all([
    countUsersWhere(env, '', []),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.VERIFIED]
    ),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.PENDING]
    ),
    countUsersWhere(
      env,
      'user_state = ?',
      [USER_STATE.NEW]
    ),
    countUsersWhere(env, 'is_blocked = 1', []),
    countUsersWhere(env, 'is_muted = 1', []),
    countRows(
      env,
      'SELECT COUNT(*) AS n FROM config ' +
      'WHERE key LIKE ? AND value = ?',
      ['botblocked:%', '1']
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since1]
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since7]
    ),
    countUsersWhere(
      env,
      'created_at >= ?',
      [since30]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since1]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since7]
    ),
    countUsersWhere(
      env,
      'updated_at >= ?',
      [since30]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since1]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since7]
    ),
    countRows(
      env,
      inSql,
      [REACTION_MAP_USER, 't:%', since30]
    ),
    countRows(env, outSql, ['admin:%', since1]),
    countRows(env, outSql, ['admin:%', since7]),
    countRows(env, outSql, ['admin:%', since30])
  ]);

  return Response.json({
    ok: true,
    users: {
      total,
      verified,
      pending,
      fresh,
      blocked,
      muted,
      botBlocked
    },
    growth: { d1: new1, d7: new7, d30: new30 },
    active: { d1: act1, d7: act7, d30: act30 },
    messages: {
      in: { d1: in1, d7: in7, d30: in30 },
      out: { d1: out1, d7: out7, d30: out30 }
    }
  });
}

async function buildPanelUrl(origin, adminId, env) {
  return buildSignedPanelUrl(
    origin,
    adminId,
    env,
    '/panel'
  );
}

async function handlePanelPage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildPanelPage,
    '链接无效或已过期，请回到机器人主菜单重新打开网页管理台。'
  );
}

async function handleGuidePage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildGuidePage,
    '链接无效或已过期，请回到机器人主菜单重新打开新手引导。'
  );
}

function buildGuidePage() {
  return `<!doctype html>
<html lang=\"zh-CN\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>新手引导</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-padding-top: 190px; }
  body { font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0f1a24; color: #dbe6f2; padding-bottom: 30px; }
  header { position: sticky; top: 0; background: #13222f; padding: 12px 14px 10px; border-bottom: 1px solid #22374a; z-index: 3; }
  h1 { font-size: 19px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 3px; line-height: 1.55; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
  .chip { color: #b8cbdd; text-decoration: none; font-size: 12.5px; border: 1px solid #2b3a47; padding: 5px 10px; border-radius: 999px; }
  main { padding: 12px; max-width: 760px; margin: 0 auto; }
  section { background: #16242f; border: 1px solid #22374a; border-radius: 12px; padding: 14px 15px; margin-bottom: 12px; }
  h2 { font-size: 16px; margin-bottom: 9px; }
  p, li { font-size: 14px; line-height: 1.7; color: #c6d5e3; }
  ul, ol { padding-left: 20px; }
  li { margin: 3px 0; }
  p { margin: 6px 0; }
  code { background: #0d1620; border: 1px solid #2b3a47; border-radius: 6px; padding: 1px 6px; font-size: 13px; color: #9fd0ff; white-space: nowrap; }
  .cmd { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px dashed #22374a; align-items: baseline; }
  .cmd:last-child { border-bottom: 0; }
  .cmd div { font-size: 13.5px; line-height: 1.6; color: #c6d5e3; }
  .tip { background: #2a2118; border: 1px solid #57452a; color: #ecd9ac; border-radius: 10px; padding: 9px 12px; font-size: 13.5px; line-height: 1.65; margin-top: 9px; }
  .q { font-weight: 600; color: #eef5fb; margin-top: 11px; font-size: 14px; }
  b.k { color: #fff; }
</style>
</head>
<body>
<header id="ghead">
  <h1>📖 新手引导</h1>
  <div class=\"sub\">双向客服机器人使用手册 · 当前版本 ${BOT_VERSION}<br>看完这一页，就能上手接待访客了。</div>
  <div class=\"chips\">
    <a class=\"chip\" href=\"#g-intro\">项目说明</a>
    <a class=\"chip\" href=\"#g-start\">开始使用</a>
    <a class=\"chip\" href=\"#g-verify\">验证</a>
    <a class=\"chip\" href=\"#g-chat\">接待日常</a>
    <a class=\"chip\" href=\"#g-cmd\">命令速查</a>
    <a class=\"chip\" href=\"#g-panel\">网页管理台</a>
    <a class=\"chip\" href=\"#g-users\">用户列表</a>
    <a class=\"chip\" href=\"#g-update\">版本更新</a>
    <a class=\"chip\" href=\"#g-faq\">常见问题</a>
  </div>
</header>
<main>

  <section id=\"g-intro\">
    <h2>🧭 项目说明</h2>
    <p>这是一个<b class=\"k\">双向客服机器人</b>。访客在私聊里给机器人发消息，消息会自动转到管理员群里一个属于他本人的专属「话题」；你在话题里打字回复，机器人再把话带回访客的私聊。一人一个话题，谁和谁的话分得清清楚楚，不会串线。</p>
    <ul>
      <li>它是在开源项目 TGbot-D1（3.0.5）基础上增强的版本：真人验证、表情同步、消息编辑同步、拉黑提醒、网页管理台、用户列表与数据统计、自动检查更新，都包含在你现在用的这一版里。</li>
      <li><b class=\"k\">隐私口径：</b>机器人只负责「搬运」消息，<b class=\"k\">不保存聊天正文</b>。数据库里只留转发所需的配对记录，并只保留 90 天。</li>
      <li><b class=\"k\">费用：</b>它跑在 Cloudflare 的免费额度上，日常使用量完全免费，不用绑卡。</li>
    </ul>
  </section>

  <section id=\"g-start\">
    <h2>🚀 开始使用</h2>
    <ol>
      <li><b class=\"k\">打开主菜单：</b>在机器人私聊里发送 <code>/start</code>，网页管理台、用户列表和这本引导都在这里。</li>
      <li><b class=\"k\">先定验证方式：</b>进「网页管理台 → 基础配置」，选一种验证方式（推荐 Turnstile，访客点一下就通过），顺便把欢迎消息改成你想对访客说的第一句话。</li>
      <li><b class=\"k\">把机器人发给访客：</b>访客打开私聊、完成验证之后给你发消息，你的群里就会自动多出一个以他名字命名的话题。</li>
      <li><b class=\"k\">在话题里直接回复：</b>不需要任何额外设置，在他的话题里打字、发图，就是发给他本人。</li>
    </ol>
    <div class=\"tip\">访客那边的视角：打开机器人 → 点「开始」→ 按提示完成一次验证 → 直接打字聊天。验证只做一次，之后不用再验。</div>
  </section>

  <section id=\"g-verify\">
    <h2>🛡 验证</h2>
    <p>验证是用来挡垃圾机器人和广告号的：没通过验证的人，发什么都不会转进群里。</p>
    <ul>
      <li><b class=\"k\">Turnstile 小程序验证（推荐）：</b>访客点「开始验证」按钮，弹出一个小页面自动完成人机校验，几秒通过，体验最顺。</li>
      <li><b class=\"k\">静态问答验证：</b>你出一道题，访客答对才放行；答案可以准备多个，用竖线 <code>|</code> 分隔，答中任意一个都算对。</li>
      <li><b class=\"k\">在哪里切换：</b>网页管理台 → 基础配置 → 验证方式。选了 Turnstile 后，问题和答案两项会自动隐藏；如果还没配好 Turnstile 密钥，机器人会自动用问答模式兜底，不会把人卡死。</li>
      <li><b class=\"k\">让某人重新验证：</b>打开他的话题，发送 <code>/reverify</code>，他下一次发消息前要重新过一遍验证。</li>
      <li><b class=\"k\">自己先试一遍：</b>私聊发送 <code>/testverify</code> 会拿到一个测试验证链接，点开能看到访客眼中的验证页长什么样；测试模式只是看看样子，不会真的放行或记录任何人。</li>
    </ul>
  </section>

  <section id=\"g-chat\">
    <h2>💬 接待日常</h2>
    <ul>
      <li><b class=\"k\">资料卡：</b>每个话题顶部都钉着访客的资料卡（名字、ID、状态、你的备注）。卡片不见了就在话题里发 <code>/card</code> 重新生成；卡片上的按钮可以直接封禁、解封、静音、刷新。</li>
      <li><b class=\"k\">引用回复会跟着走：</b>你在话题里引用某条消息再回复，访客那边看到的也是引用着他原话的回复；访客引用着回复你时同理，连他框选一小段文字的「部分引用」都会原样带过去。</li>
      <li><b class=\"k\">改错字会同步：</b>直接编辑你已发送的消息，对方那边会同步改好，旁边出现一行「✏️ 对方修改了这条消息」的小提示。Telegram 不给机器人提供官方的「已编辑」标记，这行提示就是补这个用的；访客编辑他的消息时，你这边也一样。</li>
      <li><b class=\"k\">删消息两边一起删：</b>在话题里回复选中要删的那条消息，再发 <code>/delete</code>，两边同时删除。</li>
      <li><b class=\"k\">表情回应会同步：</b>你给某条消息贴的 emoji，对方那边也会贴上（会显示成机器人贴的，因为 Telegram 只允许机器人以自己的名义贴）。</li>
      <li><b class=\"k\">拉黑有提醒：</b>访客把机器人拉黑时，他的话题里会出现 🚫 提醒；他取消拉黑时有 ✅ 提醒，不用你去猜他还在不在。</li>
    </ul>
  </section>

  <section id=\"g-cmd\">
    <h2>⌨️ 命令速查</h2>
    <p>下面这些命令都在<b class=\"k\">访客的话题里</b>发送（在私聊里发没用）：</p>
    <div class=\"cmd\"><code>/ban</code><div>封禁这位访客：他的消息不再转进来。</div></div>
    <div class=\"cmd\"><code>/unban</code><div>解除封禁，恢复正常转发。</div></div>
    <div class=\"cmd\"><code>/delete</code><div>先回复选中一条消息、再发这条命令：双向删除那条消息。</div></div>
    <div class=\"cmd\"><code>/terminate</code><div>结束会话并删掉整个话题（删了找不回来，谨慎用）。</div></div>
    <div class=\"cmd\"><code>/card</code><div>重新生成这个话题的资料卡。</div></div>
    <div class=\"cmd\"><code>/reverify</code><div>让这位访客重新做一次验证。</div></div>
    <div class=\"cmd\"><code>/note 内容</code><div>给这位访客存一条只有管理员看得到的备注（如「老客户，注意时效」）；只发 /note 是查看，/notedelete 是删除。</div></div>
    <p style=\"margin-top:10px\">在<b class=\"k\">私聊</b>里用的命令：</p>
    <div class=\"cmd\"><code>/start</code><div>打开主菜单。</div></div>
    <div class=\"cmd\"><code>/testverify</code><div>拿一条验证页的测试链接，自己先体验一遍。</div></div>
    <div class=\"cmd\"><code>/version</code><div>查看当前版本，以及有没有新版本。</div></div>
  </section>

  <section id=\"g-panel\">
    <h2>🛠 网页管理台</h2>
    <p>从主菜单打开，<b class=\"k\">只有主管理员能进</b>。所有设置都集中在这里，改完点对应的「保存」立即生效：</p>
    <ul>
      <li><b class=\"k\">基础配置：</b>欢迎消息、验证方式与题目、已验证超时清理。超时清理填一个天数（比如 90），长期没动静的用户会被自动清除并释放位置；填 0 表示永不自动清。注意：被清掉的人下次再来会新建一个话题，老话题会留着当存档。</li>
      <li><b class=\"k\">类型过滤：</b>不想转发的消息类型（贴纸、语音、视频等）在这里关掉，对方发了也不会过到对面去。</li>
      <li><b class=\"k\">屏蔽关键词：</b>访客的话里出现关键词会被拦下并记一次数，次数达到你设的阈值就自动封禁他。不会写正则表达式也没关系，直接填普通词句就行。</li>
      <li><b class=\"k\">自动回复：</b>访客的话包含某个词时，机器人自动回一句你预设的话（比如包含「价格」就自动回价目说明）。</li>
      <li><b class=\"k\">协管员：</b>把帮你接待的人的 Telegram 数字 ID 填进来（多个用逗号隔开）。协管员能在话题里回复、用命令、贴表情，但进不了网页管理台，也看不到用户列表。</li>
    </ul>
    <div class=\"tip\">管理台的网页链接 30 分钟过期；打开时提示过期，回主菜单重新点一次就行。</div>
  </section>

  <section id=\"g-users\">
    <h2>📋 用户列表与数据统计</h2>
    <ul>
      <li><b class=\"k\">两个标签页：</b>「用户列表」和「数据统计」，默认打开列表页，点顶部标签切换。</li>
      <li><b class=\"k\">找人：</b>顶部搜索框可以按名字、用户名、数字 ID、甚至你写的备注来搜；下面的「全部 / 已验证 / 待验证 / 已屏蔽」是快速筛选；还能换排序顺序。</li>
      <li><b class=\"k\">对某个人操作：</b>每行有「重置验证」（让他重新验证）、「话题」（一键跳到话题群里和他的对话）、「删除」（删掉他的记录，可勾选连话题一起删）和「备注」（写一句只有管理员看得到的话，会同步显示到他的资料卡上）。</li>
      <li><b class=\"k\">统计页：</b>能看到用户总数、已验证 / 待验证人数，以及过去 24 小时、7 天、30 天分别新增了多少人、多少人活跃、收发了多少条消息。提醒一句：消息量是按转发记录数的，系统只留最近 90 天，所以统计最多往前看 90 天。</li>
    </ul>
  </section>

  <section id=\"g-update\">
    <h2>🔄 版本与更新</h2>
    <ul>
      <li>主菜单底部有一行当前版本号；有新版本时，那一行会变成可以点开的链接，机器人也会私聊通知主管理员一次（只通知一次，不刷屏）。</li>
      <li>想手动确认时，点主菜单的「🔄 检查更新」；查太勤会被限速（5 分钟最多查一次），这是故意的，防止白白消耗额度。</li>
      <li>升级不丢东西：用户、配置、备注都存在数据库里，按项目仓库里的部署教程、换上新版文件重新部署即可。</li>
    </ul>
  </section>

  <section id=\"g-faq\">
    <h2>❓ 常见问题</h2>
    <p class=\"q\">关掉某个话题，是不是就把这个访客停掉了？</p>
    <p>不是。关话题只对普通群成员生效，机器人和管理员照样能在里面发消息。想真正停掉一个访客，在他的话题里发 /ban；想连话题一起清掉，发 /terminate。</p>
    <p class=\"q\">输入 / 时，/note 这些新命令不出现在候选里？</p>
    <p>那是 Telegram App 自己缓存了旧的命令名单，彻底关掉 App 再重开就会刷新；等不及也可以把命令手打全，一样有效。</p>
    <p class=\"q\">编辑过的消息为什么没有官方的「已编辑」小字？</p>
    <p>Telegram 不允许机器人给消息加官方编辑标记，所以机器人用一行「✏️ 对方修改了这条消息」的提示代替，一样看得懂。</p>
    <p class=\"q\">贴的表情为什么显示成机器人贴的？</p>
    <p>Telegram 只允许机器人以自己的名义贴表情，同步到对方那边自然显示机器人名字，这个改不了。</p>
    <p class=\"q\">访客说验证一直过不了，怎么办？</p>
    <p>先让他换个网络或重启 App 再试；你也可以发 /testverify 自己点一遍，看看验证页是否正常，或者在管理台临时把验证方式切成静态问答，让他先通过。</p>
    <p class=\"q\">网页打开提示「链接无效或已过期」？</p>
    <p>管理台、用户列表和这本引导的链接都是 30 分钟有效的签名链接，回机器人主菜单重新打开即可。</p>
  </section>

</main>
<script>
  function gFixPad() {
    var hd = document.getElementById('ghead');
    if (hd) document.documentElement.style.scrollPaddingTop = (hd.offsetHeight + 10) + 'px';
  }
  window.addEventListener('resize', gFixPad);
  gFixPad();
</script>
</body>
</html>`;
}

function buildPanelPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>网页管理台</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; }
  header { position: sticky; top: 0; background: #17212b; padding: 12px 14px; z-index: 2; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid #2b3a47; color: #9db2c5; font-size: 13px; text-decoration: none; }
  main { padding: 12px 12px 34px; }
  section { background: #17212b; border-radius: 12px; padding: 13px 14px; margin-bottom: 12px; scroll-margin-top: 108px; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  label { display: block; color: #9db2c5; font-size: 12.5px; margin: 12px 0 5px; }
  label:first-of-type { margin-top: 2px; }
  textarea, input[type=text], input[type=number], select { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 15px; }
  textarea { resize: vertical; line-height: 1.5; }
  .hint { color: #5f7488; font-size: 12px; margin-top: 5px; line-height: 1.5; }
  .save { margin-top: 8px; padding: 7px 18px; border-radius: 8px; border: 0; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; }
  .save:disabled { opacity: .5; }
  .danger { background: #5c2222; color: #ffb4b4; }
  .swrow { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #22303d; }
  .swrow:last-child { border-bottom: 0; }
  .swrow span { font-size: 14.5px; }
  .swrow input { width: 22px; height: 22px; accent-color: #2b5278; }
  .item { display: flex; gap: 8px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid #22303d; }
  .item:last-child { border-bottom: 0; }
  .item .tx { flex: 1; font-size: 14px; word-break: break-all; line-height: 1.5; }
  .item .tx .sub { color: #9db2c5; font-size: 12.5px; }
  .item button { padding: 5px 11px; border-radius: 8px; border: 0; background: #5c2222; color: #ffb4b4; font-size: 13px; cursor: pointer; flex-shrink: 0; }
  .addrow { display: flex; gap: 8px; margin-top: 10px; }
  .addrow input { flex: 1; }
  .addrow button { padding: 8px 15px; border-radius: 8px; border: 0; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; flex-shrink: 0; }
  .empty { color: #5f7488; font-size: 13px; padding: 6px 0; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #2b5278; color: #fff; padding: 9px 16px; border-radius: 10px; display: none; font-size: 14px; z-index: 5; max-width: 86vw; text-align: center; }
  .loadfail { text-align: center; color: #f28b8b; padding: 30px 0; }
</style>
</head>
<body>
<header>
  <h1>🛠 网页管理台</h1>
  <div class="chips">
    <a class="chip" href="#sec-base">基础配置</a>
    <a class="chip" href="#sec-filter">类型过滤</a>
    <a class="chip" href="#sec-keyword">屏蔽关键词</a>
    <a class="chip" href="#sec-reply">自动回复</a>
    <a class="chip" href="#sec-admin">协管员</a>
  </div>
</header>
<main id="main">
  <div class="empty" id="loading">加载中…</div>

  <section id="sec-base" hidden>
    <h2>📝 基础配置（验证）</h2>
    <label>欢迎消息</label>
    <textarea id="f_welcome" rows="4"></textarea>
    <button class="save" data-k="welcome_msg" data-t="f_welcome">保存</button>
    <label>验证方式</label>
    <select id="f_verifymode">
      <option value="turnstile">Turnstile 小程序验证</option>
      <option value="quiz">静态问答验证</option>
    </select>
    <div class="hint" id="vmode_hint"></div>
    <button class="save" data-k="verify_mode" data-t="f_verifymode">保存</button>
    <div id="w_verifq">
    <label>验证问题（静态问答模式）</label>
    <textarea id="f_verifq" rows="3"></textarea>
    <button class="save" data-k="verif_q" data-t="f_verifq">保存</button>
    </div>
    <div id="w_verifa">
    <label>验证答案（多个答案用 | 分隔）</label>
    <input type="text" id="f_verifa">
    <button class="save" data-k="verif_a" data-t="f_verifa">保存</button>
    </div>
    <label>已验证超时清理（天，0 = 永不自动清理）</label>
    <input type="number" id="f_ttl" min="0" max="3650" step="1">
    <div class="hint">超过该天数无活跃的已验证/待验证用户会被自动清除（含其话题映射，旧话题保留为无主存档）。</div>
    <button class="save" data-k="verified_ttl_days" data-t="f_ttl">保存</button>
  </section>

  <section id="sec-filter" hidden>
    <h2>🔗 按类型过滤</h2>
    <div id="filters"></div>
    <div class="hint">关掉的类型将不再转发给对方。点开关立即生效。</div>
  </section>

  <section id="sec-keyword" hidden>
    <h2>🚫 屏蔽关键词</h2>
    <label>自动封禁阈值（命中次数，1～100）</label>
    <input type="number" id="f_threshold" min="1" max="100" step="1">
    <button class="save" data-k="block_threshold" data-t="f_threshold">保存</button>
    <label>关键词列表（支持正则表达式）</label>
    <div id="kw_list"></div>
    <div class="addrow">
      <input type="text" id="kw_new" placeholder="新的屏蔽关键词/表达式">
      <button id="kw_add">添加</button>
    </div>
  </section>

  <section id="sec-reply" hidden>
    <h2>🤖 自动回复</h2>
    <div id="rp_list"></div>
    <label>新增规则：关键词表达式（支持正则）</label>
    <input type="text" id="rp_pattern" placeholder="例如：价格|多少钱">
    <label>回复内容</label>
    <textarea id="rp_response" rows="3"></textarea>
    <button class="save" id="rp_add">添加规则</button>
  </section>

  <section id="sec-admin" hidden>
    <h2>🧑‍💻 协管员</h2>
    <label>协管员 ID 列表（英文逗号分隔）</label>
    <textarea id="f_admins" rows="2"></textarea>
    <div class="hint">协管员可在话题里回复访客、使用话题命令与资料卡按钮，但不能改配置。主管理员不在此列。</div>
    <button class="save" data-k="authorized_admins" data-t="f_admins">保存</button>
    <button class="save danger" id="admins_clear">清空协管员</button>
  </section>
</main>
<div id="toast"></div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var FILTER_DEFS = [
  ['enable_image_forwarding', '图片/视频/文件'],
  ['enable_link_forwarding', '链接'],
  ['enable_text_forwarding', '文本'],
  ['enable_audio_forwarding', '音频/语音'],
  ['enable_sticker_forwarding', '贴纸/GIF'],
  ['enable_user_forwarding', '用户转发'],
  ['enable_group_forwarding', '群组转发'],
  ['enable_channel_forwarding', '频道转发']
];
var KW = [], RP = [];

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2200);
}

function post(path, extra) {
  var b = { u: AUTH.u, e: AUTH.e, s: AUTH.s };
  for (var k in extra) b[k] = extra[k];
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b)
  }).then(function (r) { return r.json(); });
}

function renderKw() {
  var box = document.getElementById('kw_list');
  box.textContent = '';
  if (!KW.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '暂无关键词';
    box.appendChild(e);
    return;
  }
  KW.forEach(function (kw, i) {
    var row = document.createElement('div');
    row.className = 'item';
    var tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = (i + 1) + '. ' + kw;
    row.appendChild(tx);
    var b = document.createElement('button');
    b.textContent = '删除';
    b.onclick = function () {
      b.disabled = true;
      post('/api/config/list', { key: 'block_keywords', op: 'delete', index: i }).then(function (d) {
        if (d.ok) { KW = d.keywords; toast('已删除'); renderKw(); }
        else { b.disabled = false; toast('删除失败：' + (d.error || '')); }
      });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}

function renderRp() {
  var box = document.getElementById('rp_list');
  box.textContent = '';
  if (!RP.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = '暂无自动回复规则';
    box.appendChild(e);
    return;
  }
  RP.forEach(function (r, i) {
    var row = document.createElement('div');
    row.className = 'item';
    var tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = r.keywords;
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = '→ ' + r.response;
    tx.appendChild(sub);
    row.appendChild(tx);
    var b = document.createElement('button');
    b.textContent = '删除';
    b.onclick = function () {
      b.disabled = true;
      post('/api/config/list', { key: 'keyword_responses', op: 'delete', index: i }).then(function (d) {
        if (d.ok) { RP = d.autoReplies; toast('已删除'); renderRp(); }
        else { b.disabled = false; toast('删除失败：' + (d.error || '')); }
      });
    };
    row.appendChild(b);
    box.appendChild(row);
  });
}

function renderFilters(vals) {
  var box = document.getElementById('filters');
  box.textContent = '';
  FILTER_DEFS.forEach(function (def) {
    var row = document.createElement('div');
    row.className = 'swrow';
    var s = document.createElement('span');
    s.textContent = def[1];
    row.appendChild(s);
    var c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = !!vals[def[0]];
    c.onchange = function () {
      var want = c.checked;
      post('/api/config/toggle', { key: def[0], value: want }).then(function (d) {
        if (d.ok) toast(def[1] + (want ? ' 已开启' : ' 已关闭'));
        else { c.checked = !want; toast('修改失败：' + (d.error || '')); }
      }).catch(function () { c.checked = !want; toast('修改失败'); });
    };
    row.appendChild(c);
    box.appendChild(row);
  });
}

var saveBtns = document.querySelectorAll('.save[data-k]');
for (var i = 0; i < saveBtns.length; i++) {
  saveBtns[i].onclick = function () {
    var btn = this;
    var key = btn.getAttribute('data-k');
    var el = document.getElementById(btn.getAttribute('data-t'));
    btn.disabled = true;
    post('/api/config/set', { key: key, value: el.value }).then(function (d) {
      btn.disabled = false;
      if (d.ok) toast('已保存');
      else toast('保存失败：' + (d.error || ''));
    }).catch(function () { btn.disabled = false; toast('保存失败'); });
  };
}

document.getElementById('kw_add').onclick = function () {
  var el = document.getElementById('kw_new');
  var v = el.value.trim();
  if (!v) { toast('先输入关键词'); return; }
  post('/api/config/list', { key: 'block_keywords', op: 'add', value: v }).then(function (d) {
    if (d.ok) { KW = d.keywords; el.value = ''; toast('已添加'); renderKw(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('rp_add').onclick = function () {
  var p = document.getElementById('rp_pattern');
  var r = document.getElementById('rp_response');
  post('/api/config/list', { key: 'keyword_responses', op: 'add', pattern: p.value, response: r.value }).then(function (d) {
    if (d.ok) { RP = d.autoReplies; p.value = ''; r.value = ''; toast('规则已添加'); renderRp(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('admins_clear').onclick = function () {
  post('/api/config/set', { key: 'authorized_admins', value: '' }).then(function (d) {
    if (d.ok) { document.getElementById('f_admins').value = ''; toast('协管员已清空'); }
    else toast('清空失败：' + (d.error || ''));
  });
};

function applyVmode() {
  var quiz = document.getElementById('f_verifymode').value === 'quiz';
  document.getElementById('w_verifq').style.display = quiz ? '' : 'none';
  document.getElementById('w_verifa').style.display = quiz ? '' : 'none';
}
document.getElementById('f_verifymode').addEventListener('change', applyVmode);

fetch('/api/config?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.ok) {
      document.getElementById('loading').className = 'loadfail';
      document.getElementById('loading').textContent = '加载失败：无权访问或链接已过期，请回主菜单重新打开。';
      return;
    }
    document.getElementById('loading').hidden = true;
    document.getElementById('f_welcome').value = d.welcome_msg || '';
    document.getElementById('f_verifq').value = d.verif_q || '';
    document.getElementById('f_verifa').value = d.verif_a || '';
    document.getElementById('f_verifymode').value = d.verify_mode || 'turnstile';
    applyVmode();
    document.getElementById('vmode_hint').textContent = d.turnstileReady ? '' : '提示：尚未配置 TURNSTILE 密钥，即使选择 Turnstile 也会自动回退为静态问答。';
    document.getElementById('f_ttl').value = d.verified_ttl_days;
    document.getElementById('f_threshold').value = d.block_threshold;
    document.getElementById('f_admins').value = (d.authorizedAdmins || []).join(', ');
    KW = d.keywords || [];
    RP = d.autoReplies || [];
    renderFilters(d.filters || {});
    renderKw();
    renderRp();
    var secs = document.querySelectorAll('section');
    for (var j = 0; j < secs.length; j++) secs[j].hidden = false;
  })
  .catch(function () {
    document.getElementById('loading').className = 'loadfail';
    document.getElementById('loading').textContent = '加载失败，请回主菜单重新打开。';
  });
</script>
</body>
</html>`;
}

function validateScalarConfig(key, rawValue) {
  // 与原按钮版待输入流程逐项一致的校验与规范化。
  const raw = String(rawValue ?? '');

  if (key === 'welcome_msg') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.welcome_msg) {
      return {
        error:
          `欢迎消息最多允许 ${LIMITS.welcome_msg} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'verif_q') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.verif_q) {
      return {
        error:
          `验证问题最多允许 ${LIMITS.verif_q} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'verif_a') {
    const value = raw.trim();

    if (!value) {
      return { error: '内容不能为空' };
    }

    if (value.length > LIMITS.verif_a) {
      return {
        error:
          `验证答案最多允许 ${LIMITS.verif_a} 个字符`
      };
    }

    return { value };
  }

  if (key === 'verify_mode') {
    if (raw !== 'turnstile' && raw !== 'quiz') {
      return { error: '验证方式无效' };
    }

    return { value: raw };
  }

  if (key === 'verified_ttl_days') {
    const days = Number(raw.trim());

    if (
      !Number.isInteger(days) ||
      days < 0 ||
      days > 3650
    ) {
      return {
        error:
          '超时天数必须是 0 到 3650 之间的整数（0 表示不自动清理）'
      };
    }

    return { value: String(days) };
  }

  if (key === 'block_threshold') {
    const threshold = Number(raw.trim());

    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      threshold > 100
    ) {
      return {
        error: '屏蔽阈值必须是 1 到 100 之间的整数'
      };
    }

    return { value: String(threshold) };
  }

  if (key === 'authorized_admins') {
    if (raw.length > LIMITS.authorized_admins) {
      return { error: '协管员列表内容过长' };
    }

    const ids = [
      ...new Set(
        raw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];

    const invalidIds = ids.filter(
      (id) => !/^\d+$/.test(id)
    );

    if (invalidIds.length > 0) {
      return {
        error:
          '以下 ID 格式不正确：' +
          invalidIds.slice(0, 5).join(', ')
      };
    }

    return { value: JSON.stringify(ids) };
  }

  return { error: '不允许修改的配置项' };
}

async function readPanelPostBody(request, env) {
  if (
    Number(
      request.headers.get('content-length') || 0
    ) > 16384
  ) {
    return {
      response: Response.json(
        { ok: false, error: 'too large' },
        { status: 413 }
      )
    };
  }

  let body;

  try {
    body = await request.json();
  } catch (error) {
    return {
      response: Response.json(
        { ok: false, error: 'bad json' },
        { status: 400 }
      )
    };
  }

  const adminId = await checkUserListAuth(
    body?.u,
    body?.e,
    body?.s,
    env
  );

  if (!adminId) {
    return {
      response: Response.json(
        { ok: false, error: 'unauthorized' },
        { status: 403 }
      )
    };
  }

  return { body };
}

async function handleConfigApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env);

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const filters = await getFilterConfig(env);
  const rules = await getAutoReplyRules(env);

  return Response.json({
    ok: true,
    welcome_msg: await getConfig('welcome_msg', env),
    verif_q: await getConfig('verif_q', env),
    verif_a: await getConfig('verif_a', env),
    verify_mode: await getConfig(
      'verify_mode',
      env,
      'turnstile'
    ),
    turnstileReady: isTurnstileConfigured(env),
    verified_ttl_days:
      Number(
        await getConfig('verified_ttl_days', env, '0')
      ) || 0,
    block_threshold: await getBlockThreshold(env),
    filters: {
      enable_image_forwarding: filters.media,
      enable_link_forwarding: filters.link,
      enable_text_forwarding: filters.text,
      enable_audio_forwarding: filters.audio_voice,
      enable_sticker_forwarding: filters.sticker_gif,
      enable_user_forwarding: filters.user_forward,
      enable_group_forwarding: filters.group_forward,
      enable_channel_forwarding:
        filters.channel_forward
    },
    keywords: await getBlockKeywords(env),
    autoReplies: rules.map((rule) => ({
      id: String(rule.id || ''),
      keywords: String(rule.keywords || ''),
      response: String(rule.response || '')
    })),
    authorizedAdmins:
      await getAuthorizedAdmins(env)
  });
}

async function handleConfigSet(request, env) {
  const parsed = await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;
  const key = String(body?.key || '');
  const rawValue = Array.isArray(body?.value)
    ? body.value.map(String).join(',')
    : body?.value;

  const result = validateScalarConfig(key, rawValue);

  if (result.error) {
    return Response.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  await setConfig(key, result.value, env);

  return Response.json({ ok: true });
}

async function handleConfigToggle(request, env) {
  const parsed = await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;

  const allowedKeys = new Set([
    'enable_image_forwarding',
    'enable_link_forwarding',
    'enable_text_forwarding',
    'enable_audio_forwarding',
    'enable_sticker_forwarding',
    'enable_user_forwarding',
    'enable_group_forwarding',
    'enable_channel_forwarding'
  ]);

  const key = String(body?.key || '');

  if (!allowedKeys.has(key)) {
    return Response.json(
      { ok: false, error: '不允许的开关项' },
      { status: 400 }
    );
  }

  if (typeof body?.value !== 'boolean') {
    return Response.json(
      { ok: false, error: '开关值无效' },
      { status: 400 }
    );
  }

  await setConfig(
    key,
    body.value ? 'true' : 'false',
    env
  );

  return Response.json({ ok: true });
}

async function handleConfigList(request, env) {
  const parsed = await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const { body } = parsed;
  const key = String(body?.key || '');
  const op = String(body?.op || '');

  if (key === 'block_keywords') {
    const keywords = await getBlockKeywords(env);

    if (op === 'add') {
      const value = String(body?.value || '').trim();

      if (!value) {
        return Response.json(
          { ok: false, error: '关键词不能为空' },
          { status: 400 }
        );
      }

      if (value.length > LIMITS.block_keyword) {
        return Response.json(
          {
            ok: false,
            error:
              `关键词表达式最多允许 ${LIMITS.block_keyword} 个字符`
          },
          { status: 400 }
        );
      }

      try {
        validateRegexPattern(value);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              '无效的表达式：' +
              (error?.message || error)
          },
          { status: 400 }
        );
      }

      if (keywords.includes(value)) {
        return Response.json(
          { ok: false, error: '该关键词已经存在' },
          { status: 400 }
        );
      }

      keywords.push(value);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );

      return Response.json({ ok: true, keywords });
    }

    if (op === 'delete') {
      const index = Number(body?.index);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= keywords.length
      ) {
        return Response.json(
          { ok: false, error: '序号无效' },
          { status: 400 }
        );
      }

      keywords.splice(index, 1);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );

      return Response.json({ ok: true, keywords });
    }
  }

  if (key === 'keyword_responses') {
    const rules = await getAutoReplyRules(env);

    const mapped = () =>
      rules.map((rule) => ({
        id: String(rule.id || ''),
        keywords: String(rule.keywords || ''),
        response: String(rule.response || '')
      }));

    if (op === 'add') {
      const pattern =
        String(body?.pattern || '').trim();

      const response =
        String(body?.response || '').trim();

      if (!pattern || !response) {
        return Response.json(
          {
            ok: false,
            error: '关键词表达式和回复内容都不能为空'
          },
          { status: 400 }
        );
      }

      if (pattern.length > LIMITS.auto_reply_pattern) {
        return Response.json(
          {
            ok: false,
            error:
              `关键词表达式最多允许 ${LIMITS.auto_reply_pattern} 个字符`
          },
          { status: 400 }
        );
      }

      if (
        response.length > LIMITS.auto_reply_response
      ) {
        return Response.json(
          {
            ok: false,
            error:
              `回复内容最多允许 ${LIMITS.auto_reply_response} 个字符`
          },
          { status: 400 }
        );
      }

      try {
        validateRegexPattern(pattern);
      } catch (error) {
        return Response.json(
          {
            ok: false,
            error:
              '无效的表达式：' +
              (error?.message || error)
          },
          { status: 400 }
        );
      }

      rules.push({
        id: randomId(),
        keywords: pattern,
        response
      });

      await setConfig(
        'keyword_responses',
        JSON.stringify(rules),
        env
      );

      return Response.json({
        ok: true,
        autoReplies: mapped()
      });
    }

    if (op === 'delete') {
      const index = Number(body?.index);

      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= rules.length
      ) {
        return Response.json(
          { ok: false, error: '序号无效' },
          { status: 400 }
        );
      }

      rules.splice(index, 1);

      await setConfig(
        'keyword_responses',
        JSON.stringify(rules),
        env
      );

      return Response.json({
        ok: true,
        autoReplies: mapped()
      });
    }
  }

  return Response.json(
    { ok: false, error: '不支持的操作' },
    { status: 400 }
  );
}

async function handleUserListAction(request, env) {
  const parsed =
    await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const body = parsed.body;

  const targetId = String(body?.userId || '');
  const action = String(body?.action || '');

  if (!/^\d{1,20}$/.test(targetId)) {
    return Response.json(
      { ok: false, error: 'bad userId' },
      { status: 400 }
    );
  }

  if (await isAdminUser(targetId, env)) {
    return Response.json(
      { ok: false, error: '不能对管理员账号执行此操作' },
      { status: 403 }
    );
  }

  if (action === 'reset') {
    await dbUserUpdate(
      targetId,
      { user_state: USER_STATE.PENDING },
      env
    );

    return Response.json({ ok: true });
  }

  if (action === 'note') {
    const noteText = String(
      body?.note ?? ''
    ).trim();

    if (noteText.length > 500) {
      return Response.json(
        {
          ok: false,
          error: '备注太长（上限 500 字）'
        },
        { status: 400 }
      );
    }

    await dbUserUpdate(
      targetId,
      { admin_note: noteText },
      env
    );

    await refreshCardAfterNoteChange(
      targetId,
      env
    );

    return Response.json({ ok: true });
  }

  if (action === 'delete') {
    await purgeManagedUser(
      targetId,
      body?.deleteTopic === true,
      env
    );

    return Response.json({ ok: true });
  }

  return Response.json(
    { ok: false, error: 'unknown action' },
    { status: 400 }
  );
}

function buildUserListPage() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>用户列表</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; }
  header { position: sticky; top: 0; background: #17212b; padding: 12px 14px; z-index: 2; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  input[type=search] { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 15px; }
  .chips { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 13px; cursor: pointer; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  .tabs { display: flex; gap: 8px; margin-top: 10px; }
  .tab { flex: 1; padding: 8px 0; border-radius: 9px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 14px; cursor: pointer; }
  .tab.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  select { margin-top: 10px; padding: 6px; border-radius: 8px; background: #0f141a; color: #e8edf2; border: 1px solid #2b3a47; }
  main { padding: 10px 12px 30px; }
  .card { background: #17212b; border-radius: 12px; padding: 11px 12px; margin-bottom: 9px; }
  .nm { font-weight: 600; font-size: 15px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 2px; word-break: break-all; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; margin-right: 5px; }
  .b-ok { background: #1d4d2b; color: #8be09a; }
  .b-pend { background: #5c4a17; color: #f2cd72; }
  .b-ban { background: #5c2222; color: #f28b8b; }
  .b-dim { background: #2b3a47; color: #9db2c5; }
  .ops { margin-top: 9px; display: flex; gap: 8px; }
  .ops button, .cf button { padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; cursor: pointer; }
  .rst { background: #2b5278; color: #fff; }
  .del { background: #5c2222; color: #ffb4b4; }
  .cf { margin-top: 9px; display: none; gap: 8px; flex-wrap: wrap; }
  .cf.open { display: flex; }
  .cf .a { background: #8c2f2f; color: #fff; }
  .cf .b { background: #5c2222; color: #ffb4b4; }
  .cf .c { background: #2b3a47; color: #e8edf2; }
  .note { margin-top: 8px; font-size: 13px; color: #b8c9d9; white-space: pre-wrap; word-break: break-word; }
  .ntb { background: #2b3a47; color: #e8edf2; }
  .ne { margin-top: 9px; display: none; }
  .ne.open { display: block; }
  .ne textarea { width: 100%; box-sizing: border-box; min-height: 62px; padding: 8px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 14px; }
  .ne .row { display: flex; gap: 8px; margin-top: 7px; }
  .ne button { padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; cursor: pointer; }
  .ne .c { background: #2b3a47; color: #e8edf2; }
  .pager { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; }
  .pager button { padding: 7px 16px; border-radius: 8px; border: 1px solid #2b3a47; background: #17212b; color: #e8edf2; cursor: pointer; }
  .pager button:disabled { opacity: .4; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #2b5278; color: #fff; padding: 9px 16px; border-radius: 10px; display: none; font-size: 14px; }
  .empty { text-align: center; color: #9db2c5; padding: 34px 0; }
  #statsBox { margin-bottom: 14px; }
  .stitle { font-size: 15px; font-weight: 600; margin: 2px 0 4px; }
  .sgroup { color: #9db2c5; font-size: 12px; margin: 10px 0 6px; }
  .srow { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 8px; }
  .stile { background: #17212b; border-radius: 10px; padding: 8px 10px; }
  .sv { font-size: 19px; font-weight: 700; }
  .sl { color: #9db2c5; font-size: 11.5px; margin-top: 1px; }
  .snote { color: #5f7488; font-size: 11.5px; margin-top: 9px; line-height: 1.5; }
  .sloading { color: #9db2c5; font-size: 13px; padding: 6px 0; }
</style>
</head>
<body>
<header>
  <h1>📋 用户列表 <span id="cnt" style="color:#9db2c5;font-size:13px"></span></h1>
  <div class="tabs">
    <button class="tab on" id="tabList">📋 用户列表</button>
    <button class="tab" id="tabStats">📊 数据统计</button>
  </div>
</header>
<main>
  <section id="paneList">
  <input type="search" id="q" placeholder="搜索名字、用户名、ID 或备注…">
  <div class="chips" id="chips">
    <button class="chip on" data-f="all">全部</button>
    <button class="chip" data-f="verified">已验证</button>
    <button class="chip" data-f="pending">待验证</button>
    <button class="chip" data-f="blocked">已屏蔽</button>
  </div>
  <select id="sort">
    <option value="active">按最近活跃</option>
    <option value="new">按最新注册</option>
    <option value="old">按最早注册</option>
  </select>
  <div id="list"><div class="empty">加载中…</div></div>
  <div class="pager">
    <button id="prev">← 上一页</button>
    <span id="pinfo" style="color:#9db2c5;font-size:13px"></span>
    <button id="next">下一页 →</button>
  </div>
  </section>
  <section id="paneStats" style="display:none">
    <div class="stitle">📊 数据统计</div>
    <div id="sgrid"><div class="sloading">统计加载中…</div></div>
    <div class="snote">消息量按同步映射记录统计（仅保留最近 90 天）；新增与活跃为滚动窗口（过去 24 小时 / 7 天 / 30 天）。</div>
  </section>
</main>
<div id="toast"></div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var all = [], filt = 'all', query = '', page = 1;
var GROUP_C = '';
var PAGE = 15;
var LABEL = { verified: '已验证', pending_verification: '待验证', blocked: '已屏蔽' };
var CLS = { verified: 'b-ok', pending_verification: 'b-pend', blocked: 'b-ban' };

function toast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function () { t.style.display = 'none'; }, 2000);
}

function fmt(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString('zh-CN', { hour12: false });
}

function visible() {
  var list = all.filter(function (u) {
    if (filt === 'verified' && u.state !== 'verified') return false;
    if (filt === 'pending' && u.state !== 'pending_verification') return false;
    if (filt === 'blocked' && u.state !== 'blocked') return false;
    if (query) {
      var hay = (u.name + ' @' + u.username + ' ' + u.id + ' ' + (u.note || '')).toLowerCase();
      if (hay.indexOf(query) === -1) return false;
    }
    return true;
  });
  var s = document.getElementById('sort').value;
  list.sort(function (a, b) {
    if (s === 'new') return b.created_at - a.created_at;
    if (s === 'old') return a.created_at - b.created_at;
    return b.updated_at - a.updated_at;
  });
  return list;
}

function act(id, action, delTopic, note) {
  var body = { u: AUTH.u, e: AUTH.e, s: AUTH.s, action: action, userId: id, deleteTopic: !!delTopic, note: note };
  return fetch('/api/users/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) { return r.json(); });
}

function render() {
  var list = visible();
  var pages = Math.max(1, Math.ceil(list.length / PAGE));
  if (page > pages) page = pages;
  document.getElementById('cnt').textContent = '共 ' + list.length + ' 人';
  document.getElementById('pinfo').textContent = page + ' / ' + pages + ' 页';
  document.getElementById('prev').disabled = page <= 1;
  document.getElementById('next').disabled = page >= pages;
  var box = document.getElementById('list');
  box.textContent = '';
  if (!list.length) {
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '没有符合条件的用户';
    box.appendChild(d);
    return;
  }
  list.slice((page - 1) * PAGE, page * PAGE).forEach(function (u) {
    var card = document.createElement('div');
    card.className = 'card';
    var nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = u.name || '(无名字记录)';
    card.appendChild(nm);
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = (u.username ? '@' + u.username + ' · ' : '') + 'ID ' + u.id;
    card.appendChild(sub);
    var sub2 = document.createElement('div');
    sub2.className = 'sub';
    var b1 = document.createElement('span');
    b1.className = 'badge ' + (CLS[u.state] || 'b-dim');
    b1.textContent = LABEL[u.state] || u.state;
    sub2.appendChild(b1);
    var b2 = document.createElement('span');
    b2.className = 'badge b-dim';
    b2.textContent = u.topic ? '有话题' : '无话题';
    sub2.appendChild(b2);
    var t = document.createElement('span');
    t.textContent = '最近活跃 ' + fmt(u.updated_at);
    sub2.appendChild(t);
    card.appendChild(sub2);
    if (u.note) {
      var nd = document.createElement('div');
      nd.className = 'note';
      nd.textContent = '📝 ' + u.note;
      card.appendChild(nd);
    }
    var ne = document.createElement('div');
    ne.className = 'ne';
    var ta = document.createElement('textarea');
    ta.maxLength = 500;
    ta.placeholder = '给这个用户写点备注（仅管理员可见）…';
    ne.appendChild(ta);
    var nerow = document.createElement('div');
    nerow.className = 'row';
    var sv = document.createElement('button');
    sv.className = 'rst';
    sv.textContent = '保存备注';
    sv.onclick = function () {
      var v = ta.value.trim();
      if (v.length > 500) { toast('备注太长（上限 500 字）'); return; }
      sv.disabled = true;
      act(u.id, 'note', false, v).then(function (d) {
        sv.disabled = false;
        if (d.ok) { u.note = v; toast(v ? '备注已保存' : '备注已清空'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    };
    var cnb = document.createElement('button');
    cnb.className = 'c';
    cnb.textContent = '取消';
    cnb.onclick = function () { ne.className = 'ne'; };
    nerow.appendChild(sv);
    nerow.appendChild(cnb);
    ne.appendChild(nerow);
    var ops = document.createElement('div');
    ops.className = 'ops';
    var rb = document.createElement('button');
    rb.className = 'rst';
    rb.textContent = '🔄 重置验证';
    rb.onclick = function () {
      rb.disabled = true;
      act(u.id, 'reset', false).then(function (d) {
        rb.disabled = false;
        if (d.ok) { u.state = 'pending_verification'; toast('已重置为待验证'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    };
    var nb = document.createElement('button');
    nb.className = 'ntb';
    nb.textContent = '📝 备注';
    nb.onclick = function () { ta.value = u.note || ''; ne.className = 'ne open'; ta.focus(); };
    ops.appendChild(nb);
    if (u.topic && u.topic_id && GROUP_C) {
      var jb = document.createElement('button');
      jb.className = 'ntb';
      jb.textContent = '💬 话题';
      jb.onclick = function () {
        var url = 'https://t.me/c/' + GROUP_C + '/' + u.topic_id;
        if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
        else window.open(url, '_blank');
      };
      ops.appendChild(jb);
    }
    ops.appendChild(rb);
    var db = document.createElement('button');
    db.className = 'del';
    db.textContent = '🗑 删除';
    var cf = document.createElement('div');
    cf.className = 'cf';
    var mk = function (cls, txt, fn) {
      var b = document.createElement('button');
      b.className = cls;
      b.textContent = txt;
      b.onclick = fn;
      return b;
    };
    cf.appendChild(mk('a', '仅删除记录', function () {
      act(u.id, 'delete', false).then(function (d) {
        if (d.ok) { all = all.filter(function (x) { return x.id !== u.id; }); toast('已删除记录'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    }));
    cf.appendChild(mk('b', '连话题一起删', function () {
      act(u.id, 'delete', true).then(function (d) {
        if (d.ok) { all = all.filter(function (x) { return x.id !== u.id; }); toast('已删除记录与话题'); render(); }
        else toast('操作失败：' + (d.error || ''));
      });
    }));
    cf.appendChild(mk('c', '取消', function () { cf.className = 'cf'; }));
    db.onclick = function () { cf.className = 'cf open'; };
    ops.appendChild(db);
    card.appendChild(ops);
    card.appendChild(cf);
    card.appendChild(ne);
    box.appendChild(card);
  });
}

document.getElementById('q').addEventListener('input', function (e) {
  query = e.target.value.trim().toLowerCase();
  page = 1;
  render();
});
document.getElementById('chips').addEventListener('click', function (e) {
  if (!e.target.dataset || !e.target.dataset.f) return;
  filt = e.target.dataset.f;
  var cs = document.querySelectorAll('.chip');
  for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (cs[i].dataset.f === filt ? ' on' : '');
  page = 1;
  render();
});
document.getElementById('sort').addEventListener('change', function () { page = 1; render(); });
document.getElementById('prev').onclick = function () { if (page > 1) { page--; render(); } };
document.getElementById('next').onclick = function () { page++; render(); };

function showTab(which) {
  var isStats = which === 'stats';
  document.getElementById('paneList').style.display = isStats ? 'none' : '';
  document.getElementById('paneStats').style.display = isStats ? '' : 'none';
  document.getElementById('tabList').className = 'tab' + (isStats ? '' : ' on');
  document.getElementById('tabStats').className = 'tab' + (isStats ? ' on' : '');
  window.scrollTo(0, 0);
}
document.getElementById('tabList').onclick = function () { showTab('list'); };
document.getElementById('tabStats').onclick = function () { showTab('stats'); };

function stile(v, l) {
  var d = document.createElement('div');
  d.className = 'stile';
  var a = document.createElement('div');
  a.className = 'sv';
  a.textContent = v;
  var b = document.createElement('div');
  b.className = 'sl';
  b.textContent = l;
  d.appendChild(a);
  d.appendChild(b);
  return d;
}

function sgroup(title, tiles) {
  var wrap = document.createElement('div');
  var t = document.createElement('div');
  t.className = 'sgroup';
  t.textContent = title;
  wrap.appendChild(t);
  var row = document.createElement('div');
  row.className = 'srow';
  tiles.forEach(function (x) { row.appendChild(x); });
  wrap.appendChild(row);
  return wrap;
}

function statsFail() {
  var box = document.getElementById('sgrid');
  box.textContent = '';
  var e = document.createElement('div');
  e.className = 'sloading';
  e.textContent = '统计加载失败（不影响用户列表）';
  box.appendChild(e);
}

fetch('/api/stats?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.ok) { statsFail(); return; }
    var box = document.getElementById('sgrid');
    box.textContent = '';
    box.appendChild(sgroup('用户总览', [
      stile(d.users.total, '用户总数'),
      stile(d.users.verified, '已验证'),
      stile(d.users.pending, '待验证'),
      stile(d.users.fresh, '未开始'),
      stile(d.users.blocked, '已封禁'),
      stile(d.users.muted, '已静音'),
      stile(d.users.botBlocked, '已拉黑机器人')
    ]));
    box.appendChild(sgroup('新增用户', [
      stile(d.growth.d1, '过去 24 小时'),
      stile(d.growth.d7, '过去 7 天'),
      stile(d.growth.d30, '过去 30 天')
    ]));
    box.appendChild(sgroup('活跃用户', [
      stile(d.active.d1, '过去 24 小时'),
      stile(d.active.d7, '过去 7 天'),
      stile(d.active.d30, '过去 30 天')
    ]));
    box.appendChild(sgroup('消息量（访客 / 管理员回复）', [
      stile(d.messages.in.d1 + ' / ' + d.messages.out.d1, '过去 24 小时'),
      stile(d.messages.in.d7 + ' / ' + d.messages.out.d7, '过去 7 天'),
      stile(d.messages.in.d30 + ' / ' + d.messages.out.d30, '过去 30 天')
    ]));
  })
  .catch(statsFail);

fetch('/api/users?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (!d.ok) {
      document.getElementById('list').innerHTML = '<div class="empty">加载失败：无权访问或链接已过期，请回主菜单重新打开。</div>';
      return;
    }
    all = d.users;
    GROUP_C = d.group || '';
    render();
  })
  .catch(function () {
    document.getElementById('list').innerHTML = '<div class="empty">加载失败，请回主菜单重新打开。</div>';
  });
</script>
</body>
</html>`;
}

async function handleUpdate(
  update,
  env,
  origin = ''
) {
  const accepted = await claimUpdate(
    update?.update_id,
    env
  );

  if (!accepted) {
    console.log(
      '忽略重复 Update：',
      update?.update_id
    );

    return;
  }

  if (update.message) {
    if (
      update.message.chat.type ===
      'private'
    ) {
      await handlePrivateMessage(
        update.message,
        env,
        origin
      );
    } else if (
      String(update.message.chat.id) ===
      String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminReply(
        update.message,
        env
      );
    }

    return;
  }

  if (update.edited_message) {
    if (
      update.edited_message.chat.type ===
      'private'
    ) {
      await handleRelayEditedMessage(
        update.edited_message,
        env
      );
    } else if (
      String(
        update.edited_message.chat.id
      ) === String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminEditedReply(
        update.edited_message,
        env
      );
    }

    return;
  }

  if (update.message_reaction) {
    await handleMessageReaction(
      update.message_reaction,
      env
    );

    return;
  }

  if (update.my_chat_member) {
    await handleMyChatMember(
      update.my_chat_member,
      env
    );

    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(
      update.callback_query,
      env
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Cloudflare Worker 入口                               */
/* -------------------------------------------------------------------------- */

export default {
  async fetch(request, env, ctx) {
    try {
      validateEnvironment(env);
      await ensureMigration(env);

      ctx.waitUntil(
        ensureBotCommands(env)
      );
    } catch (error) {
      console.error(
        '初始化失败：',
        error?.message || error
      );

      return new Response(
        `Initialization Error: ` +
        `${error?.message || error}`,
        {
          status: 500,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    const requestUrl = new URL(request.url);

    lastRequestOrigin = requestUrl.origin;

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/verify'
    ) {
      return handleVerifyPage(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname ===
        '/verify/confirm'
    ) {
      return handleVerifyConfirm(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/users'
    ) {
      return handleUserListPage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/users'
    ) {
      return handleUserListApi(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/stats'
    ) {
      return handleStatsApi(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/panel'
    ) {
      return handlePanelPage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/guide'
    ) {
      return handleGuidePage(
        request,
        env
      );
    }

    if (
      request.method === 'GET' &&
      requestUrl.pathname === '/api/config'
    ) {
      return handleConfigApi(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/set'
    ) {
      return handleConfigSet(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/toggle'
    ) {
      return handleConfigToggle(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/config/list'
    ) {
      return handleConfigList(
        request,
        env
      );
    }

    if (
      request.method === 'POST' &&
      requestUrl.pathname === '/api/users/action'
    ) {
      return handleUserListAction(
        request,
        env
      );
    }

    if (request.method === 'GET') {
      return new Response(
        'Telegram Bot Worker is running.',
        {
          status: 200,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    if (request.method !== 'POST') {
      return new Response(
        'Method Not Allowed',
        {
          status: 405,
          headers: {
            Allow: 'GET, POST'
          }
        }
      );
    }

    const webhookSecret = request.headers.get(
      'X-Telegram-Bot-Api-Secret-Token'
    );

    if (
      !webhookSecret ||
      webhookSecret !== env.WEBHOOK_SECRET
    ) {
      console.warn(
        '收到未通过 Webhook Secret 验证的请求。'
      );

      return new Response(
        'Unauthorized',
        {
          status: 401
        }
      );
    }

    let update;

    try {
      update = await request.json();
    } catch (error) {
      console.error(
        '解析 Telegram Update 失败：',
        error?.message || error
      );

      return new Response(
        'Bad Request',
        {
          status: 400
        }
      );
    }

    ctx.waitUntil(
      handleUpdate(
        update,
        env,
        requestUrl.origin
      ).catch(
        (error) => {
          console.error(
            '异步处理 Update 失败：',
            error?.stack ||
            error?.message ||
            error
          );
        }
      )
    );

    if (Math.random() < 0.01) {
      ctx.waitUntil(
        cleanupDatabase(env)
      );
    }

    if (Math.random() < 0.01) {
      ctx.waitUntil(
        maybeCheckForUpdates(env)
      );
    }

    return new Response('OK', {
      status: 200,
      headers: {
        'content-type':
          'text/plain; charset=utf-8'
      }
    });
  }
};
