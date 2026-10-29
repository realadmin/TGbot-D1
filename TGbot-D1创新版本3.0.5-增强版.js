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
  block_threshold: 3,
  authorized_admins: 2000,
  block_keyword: 200,
  auto_reply_pattern: 200,
  auto_reply_response: 4000,
  filter_text: 5000
};

const ADMIN_STATE_TTL_MS = 10 * 60 * 1000;
const RULE_PAGE_SIZE = 20;
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

  botCommandsPromise = telegramApi(
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
}
      ]
    }
  ).catch((error) => {
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

function clampPage(page, totalItems) {
  const totalPages = Math.max(
    1,
    Math.ceil(totalItems / RULE_PAGE_SIZE)
  );

  const normalizedPage = Number.isInteger(Number(page))
    ? Number(page)
    : 0;

  return {
    page: Math.max(
      0,
      Math.min(normalizedPage, totalPages - 1)
    ),
    totalPages
  };
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
  } catch (error) {
    console.error(
      '清理数据库失败：',
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

async function dbMessageDataPut(
  userId,
  messageId,
  data,
  env
) {
  await env.TG_BOT_DB.prepare(`
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
  ).run();
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

async function getAdminState(userId, env) {
  const raw = await dbConfigGet(
    `admin_state:${userId}`,
    env
  );

  if (!raw) return null;

  const state = safeJsonParse(raw, null);

  if (!state || typeof state !== 'object') {
    await clearAdminState(userId, env);
    return null;
  }

  if (
    !state.createdAt ||
    Date.now() - Number(state.createdAt) >
      ADMIN_STATE_TTL_MS
  ) {
    await clearAdminState(userId, env);
    return null;
  }

  return state;
}

async function setAdminState(userId, state, env) {
  await dbConfigPut(
    `admin_state:${userId}`,
    JSON.stringify({
      ...state,
      createdAt: Date.now()
    }),
    env
  );
}

async function clearAdminState(userId, env) {
  await dbConfigDelete(
    `admin_state:${userId}`,
    env
  );
}

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
  firstMessageDate = null
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

  const topicName = (
    `${displayName} (${userId})`
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

  const infoCard = `
👤 <b>用户资料卡</b>
<b>姓名:</b> ${clickableName}
<b>用户名:</b> ${usernameText}
<b>ID:</b> <code>${escapeHtml(userId)}</code>
${firstTimeText}
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
    firstMessageDate
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
    if (isMessageNotModifiedError(error)) {
      return {
        updated: false,
        reason: 'not_modified'
      };
    }

    throw error;
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

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'editForumTopic',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(
          user.topic_id
        ),
        name: payload.topicName
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

  return {
    updated: true,
    reason: 'updated'
  };
}

async function createInfoCard(
  message,
  user,
  topicId,
  env
) {
  const payload = buildUserInfoPayload(
    message.from,
    message.date
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
  for (let i = 0; i < 12; i += 1) {
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

async function saveUserMessageRecord(
  message,
  env
) {
  if (!message.text && !message.caption) {
    return;
  }

  try {
    await dbMessageDataPut(
      String(message.from.id),
      getMessageStorageKey(
        'user',
        message.message_id
      ),
      {
        text:
          message.text ||
          message.caption ||
          '',
        date: message.date
      },
      env
    );
  } catch (error) {
    console.error(
      '保存用户消息记录失败：',
      error?.message || error
    );
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

  let copiedMessageId = null;

  try {
    const copyResult = await telegramApi(
      env.BOT_TOKEN,
      'copyMessage',
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
      }
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
      await telegramApi(
      env.BOT_TOKEN,
      'copyMessage',
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
      }
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

  await saveUserMessageRecord(
    message,
    env
  );
}
async function relayAdminMessageToUser(
  message,
  userId,
  env
) {
  const copyResult = await telegramApi(
    env.BOT_TOKEN,
    'copyMessage',
    {
      chat_id: String(userId),
      from_chat_id:
        String(message.chat.id),
      message_id: message.message_id
    }
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
    await dbMessageDataPut(
      REACTION_MAP_USER,
      `p:${userId}:${privateMessageId}`,
      {
        text: String(topicMessageId),
        date: now
      },
      env
    );

    await dbMessageDataPut(
      REACTION_MAP_USER,
      `t:${topicMessageId}`,
      {
        text:
          `${userId}:${privateMessageId}`,
        date: now
      },
      env
    );
  } catch (error) {
    console.error(
      '保存消息配对失败：',
      error?.message || error
    );
  }
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

    if (!stored?.text) {
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
  const text = `
⚙️ <b>机器人主配置菜单</b>

请选择要管理的配置类别：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '📝 基础配置（验证问答）',
          callback_data:
            'config:menu:base'
        }
      ],
      [
        {
          text: '🤖 自动回复管理',
          callback_data:
            'config:menu:autoreply'
        }
      ],
      [
        {
          text: '🚫 关键词屏蔽管理',
          callback_data:
            'config:menu:keyword'
        }
      ],
      [
        {
          text: '🔗 按类型过滤管理',
          callback_data:
            'config:menu:filter'
        }
      ],
      [
        {
          text: '🧑‍💻 协管员授权设置',
          callback_data:
            'config:menu:authorized'
        }
      ],
      [
        {
          text: '🔄 刷新主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showBaseMenu(
  chatId,
  env,
  messageId = 0
) {
  const welcomeMsg = await getConfig(
    'welcome_msg',
    env
  );

  const verificationQuestion =
    await getConfig('verif_q', env);

  const verificationAnswer =
    await getConfig('verif_a', env);

  const verifyModeSetting =
    await getConfig(
      'verify_mode',
      env,
      'turnstile'
    );

  const turnstileReady =
    isTurnstileConfigured(env);

  const effectiveVerifyMode =
    verifyModeSetting ===
      'turnstile' && turnstileReady
      ? 'turnstile'
      : 'quiz';

  const text = `
⚙️ <b>基础配置（人机验证）</b>

<b>当前设置：</b>
• 欢迎消息：${escapeHtml(welcomeMsg).slice(0, 30)}${welcomeMsg.length > 30 ? '…' : ''}
• 验证问题：${escapeHtml(verificationQuestion).slice(0, 30)}${verificationQuestion.length > 30 ? '…' : ''}
• 验证答案：<code>${escapeHtml(verificationAnswer)}</code>
• 验证方式：${effectiveVerifyMode === 'turnstile' ? 'Turnstile 小程序' : '静态问答'}${verifyModeSetting === 'turnstile' && !turnstileReady ? '（未配置 TURNSTILE 密钥，自动回退静态问答）' : ''}

请选择要修改的配置项：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '📝 编辑欢迎消息',
          callback_data:
            'config:edit:welcome_msg'
        }
      ],
      [
        {
          text: '❓ 编辑验证问题',
          callback_data:
            'config:edit:verif_q'
        }
      ],
      [
        {
          text: '🔑 编辑验证答案',
          callback_data:
            'config:edit:verif_a'
        }
      ],
      [
        {
          text:
            effectiveVerifyMode ===
            'turnstile'
              ? '🔀 切换为静态问答验证'
              : '🔀 切换为 Turnstile 验证',
          callback_data:
            `config:verifymode:${
              effectiveVerifyMode ===
              'turnstile'
                ? 'quiz'
                : 'turnstile'
            }`
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showAutoReplyMenu(
  chatId,
  env,
  messageId = 0
) {
  const rules = await getAutoReplyRules(env);

  const text = `
🤖 <b>自动回复管理</b>

当前规则数量：${rules.length}

新增规则格式：
<code>关键词表达式===回复内容</code>
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '➕ 新增规则',
          callback_data:
            'config:add:keyword_responses'
        }
      ],
      [
        {
          text: '📋 查看规则列表',
          callback_data:
            'config:list:keyword_responses:0'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showKeywordMenu(
  chatId,
  env,
  messageId = 0
) {
  const keywords =
    await getBlockKeywords(env);

  const threshold =
    await getBlockThreshold(env);

  const preview = keywords
    .slice(0, 5)
    .map(
      (keyword) =>
        `• ${escapeHtml(keyword)}`
    )
    .join('\n') || '无';

  const text = `
🚫 <b>关键词屏蔽管理</b>

当前阈值：<code>${threshold}</code>
当前规则数量：${keywords.length}

前 5 条预览：
${preview}
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '➕ 新增屏蔽关键词',
          callback_data:
            'config:add:block_keywords'
        }
      ],
      [
        {
          text: '📝 修改屏蔽阈值',
          callback_data:
            'config:edit:block_threshold'
        }
      ],
      [
        {
          text: '📋 查看关键词列表',
          callback_data:
            'config:list:block_keywords:0'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

function filterStatus(value) {
  return value ? '✅ 开' : '❌ 关';
}

async function showFilterMenu(
  chatId,
  env,
  messageId = 0
) {
  const filters =
    await getFilterConfig(env);

  const text = `
🔗 <b>按类型过滤管理</b>

点击按钮即可切换状态：
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text:
            `1. 图片/视频/文件 ` +
            filterStatus(filters.media),
          callback_data:
            'config:toggle:' +
            'enable_image_forwarding:' +
            `${!filters.media}`
        }
      ],
      [
        {
          text:
            `2. 链接 ` +
            filterStatus(filters.link),
          callback_data:
            'config:toggle:' +
            'enable_link_forwarding:' +
            `${!filters.link}`
        },
        {
          text:
            `3. 文本 ` +
            filterStatus(filters.text),
          callback_data:
            'config:toggle:' +
            'enable_text_forwarding:' +
            `${!filters.text}`
        }
      ],
      [
        {
          text:
            `4. 音频/语音 ` +
            filterStatus(
              filters.audio_voice
            ),
          callback_data:
            'config:toggle:' +
            'enable_audio_forwarding:' +
            `${!filters.audio_voice}`
        }
      ],
      [
        {
          text:
            `5. 贴纸/GIF ` +
            filterStatus(
              filters.sticker_gif
            ),
          callback_data:
            'config:toggle:' +
            'enable_sticker_forwarding:' +
            `${!filters.sticker_gif}`
        }
      ],
      [
        {
          text:
            `6. 用户转发 ` +
            filterStatus(
              filters.user_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_user_forwarding:' +
            `${!filters.user_forward}`
        }
      ],
      [
        {
          text:
            `7. 群组转发 ` +
            filterStatus(
              filters.group_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_group_forwarding:' +
            `${!filters.group_forward}`
        }
      ],
      [
        {
          text:
            `8. 频道转发 ` +
            filterStatus(
              filters.channel_forward
            ),
          callback_data:
            'config:toggle:' +
            'enable_channel_forwarding:' +
            `${!filters.channel_forward}`
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
  };

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });
}

async function showAuthorizedMenu(
  chatId,
  env,
  messageId = 0
) {
  const primaryAdmins =
    getPrimaryAdminIds(env);

  const authorized =
    await getAuthorizedAdmins(env);

  const all = [
    ...new Set([
      ...primaryAdmins,
      ...authorized
    ])
  ];

  const text = `
🧑‍💻 <b>协管员授权设置</b>

<b>主管理员：</b>
<code>${escapeHtml(primaryAdmins.join(', ') || '无')}</code>

<b>已授权协管员：</b>
<code>${escapeHtml(authorized.join(', ') || '无')}</code>

<b>总人数：</b>${all.length}

输入格式：多个 ID 使用英文逗号分隔。
  `.trim();

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: '✏️ 设置/修改协管员列表',
          callback_data:
            'config:edit:authorized_admins'
        }
      ],
      [
        {
          text:
            `🗑️ 清空协管员列表 ` +
            `(${authorized.length}人)`,
          callback_data:
            'config:clear:authorized_admins'
        }
      ],
      [
        {
          text: '⬅️ 返回主菜单',
          callback_data: 'config:menu'
        }
      ]
    ]
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
  env
) {
  const exp =
    Date.now() + VERIFY_LINK_TTL_MS;

  const signature =
    await hmacSha256Hex(
      env.WEBHOOK_SECRET,
      `tsverify:${userId}:${exp}`
    );

  const params = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    s: signature
  });

  return `${origin}/verify?${params.toString()}`;
}

async function checkVerifySignature(
  userId,
  expRaw,
  signature,
  env
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
      `tsverify:${uid}:${exp}`
    );

  return timingSafeEqualString(
    expected,
    String(signature || '')
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
  const payload = JSON.stringify({
    u: String(params.u),
    e: String(params.e),
    s: String(params.s)
  });

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
          token: token
        })
      });

      var data = {};

      try {
        data = await resp.json();
      } catch (ignored) {}

      if (resp.ok && data.ok) {
        setStatus('✅ 验证成功！可以关闭此页面，回到 Telegram 继续发送消息。');

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

  const valid =
    await checkVerifySignature(
      u,
      e,
      s,
      env
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
    renderVerifyPage(env, { u, e, s }),
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
      env
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

async function sendAdminInputError(
  userId,
  text,
  env
) {
  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: userId,
      text
    }
  );
}

async function handleAdminConfigInput(
  userId,
  text,
  state,
  env
) {
  if (
    !state ||
    state.action !== 'awaiting_input'
  ) {
    await clearAdminState(userId, env);
    return;
  }

  if (
    String(text || '').toLowerCase() ===
    '/cancel'
  ) {
    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '❌ 已取消输入。'
      }
    );

    await showMainMenu(userId, env);
    return;
  }

  let finalValue = String(text || '');

  if (!finalValue.trim()) {
    await sendAdminInputError(
      userId,
      '⚠️ 输入内容不能为空，或发送 /cancel 取消。',
      env
    );

    return;
  }

  if (state.key === 'welcome_msg') {
    if (
      finalValue.length >
      LIMITS.welcome_msg
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 欢迎消息最多允许 ` +
        `${LIMITS.welcome_msg} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'verif_q') {
    if (
      finalValue.length > LIMITS.verif_q
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 验证问题最多允许 ` +
        `${LIMITS.verif_q} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'verif_a') {
    finalValue = finalValue.trim();

    if (
      finalValue.length > LIMITS.verif_a
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 验证答案最多允许 ` +
        `${LIMITS.verif_a} 个字符。`,
        env
      );

      return;
    }
  }

  if (state.key === 'block_threshold') {
    const threshold = Number(
      finalValue.trim()
    );

    if (
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      threshold > 100
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 屏蔽阈值必须是 1 到 100 之间的整数。',
        env
      );

      return;
    }

    finalValue = String(threshold);
  }

  if (state.key === 'authorized_admins') {
    if (
      finalValue.length >
      LIMITS.authorized_admins
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 协管员列表内容过长。',
        env
      );

      return;
    }

    const ids = [
      ...new Set(
        finalValue
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      )
    ];

    const invalidIds = ids.filter(
      (id) => !/^\d+$/.test(id)
    );

    if (invalidIds.length > 0) {
      await sendAdminInputError(
        userId,
        `⚠️ 以下 ID 格式不正确：` +
        `${invalidIds.slice(0, 5).join(', ')}`,
        env
      );

      return;
    }

    finalValue = JSON.stringify(ids);
  }

  if (state.key === 'block_keywords_add') {
    const newKeyword =
      finalValue.trim();

    if (
      newKeyword.length >
      LIMITS.block_keyword
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 关键词表达式最多允许 ` +
        `${LIMITS.block_keyword} 个字符。`,
        env
      );

      return;
    }

    try {
      validateRegexPattern(newKeyword);
    } catch (error) {
      await sendAdminInputError(
        userId,
        `⚠️ 无效的表达式：` +
        `${error?.message || error}`,
        env
      );

      return;
    }

    const keywords =
      await getBlockKeywords(env);

    if (keywords.includes(newKeyword)) {
      await sendAdminInputError(
        userId,
        '⚠️ 该关键词已经存在。',
        env
      );

      return;
    }

    keywords.push(newKeyword);

    await setConfig(
      'block_keywords',
      JSON.stringify(keywords),
      env
    );

    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '✅ 屏蔽关键词已添加。'
      }
    );

    await showKeywordMenu(userId, env);
    return;
  }

  if (
    state.key === 'keyword_responses_add'
  ) {
    const separatorIndex =
      finalValue.indexOf('===');

    const keywordExpression =
      separatorIndex >= 0
        ? finalValue
            .slice(0, separatorIndex)
            .trim()
        : '';

    const responseText =
      separatorIndex >= 0
        ? finalValue
            .slice(separatorIndex + 3)
            .trim()
        : '';

    if (
      !keywordExpression ||
      !responseText
    ) {
      await sendAdminInputError(
        userId,
        '⚠️ 格式错误，请使用：' +
        '关键词表达式===回复内容',
        env
      );

      return;
    }

    if (
      keywordExpression.length >
      LIMITS.auto_reply_pattern
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 关键词表达式最多允许 ` +
        `${LIMITS.auto_reply_pattern} 个字符。`,
        env
      );

      return;
    }

    if (
      responseText.length >
      LIMITS.auto_reply_response
    ) {
      await sendAdminInputError(
        userId,
        `⚠️ 回复内容最多允许 ` +
        `${LIMITS.auto_reply_response} 个字符。`,
        env
      );

      return;
    }

    try {
      validateRegexPattern(
        keywordExpression
      );
    } catch (error) {
      await sendAdminInputError(
        userId,
        `⚠️ 无效的表达式：` +
        `${error?.message || error}`,
        env
      );

      return;
    }

    const rules =
      await getAutoReplyRules(env);

    rules.push({
      id: randomId(),
      keywords: keywordExpression,
      response: responseText
    });

    await setConfig(
      'keyword_responses',
      JSON.stringify(rules),
      env
    );

    await clearAdminState(userId, env);

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: '✅ 自动回复规则已添加。'
      }
    );

    await showAutoReplyMenu(userId, env);
    return;
  }

  await setConfig(
    state.key,
    finalValue,
    env
  );

  await clearAdminState(userId, env);

  await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: userId,
      text:
        `✅ 配置项 ${state.key} 已更新。`
    }
  );

  if (
    [
      'welcome_msg',
      'verif_q',
      'verif_a'
    ].includes(state.key)
  ) {
    await showBaseMenu(userId, env);
  } else if (
    state.key === 'block_threshold'
  ) {
    await showKeywordMenu(userId, env);
  } else if (
    state.key === 'authorized_admins'
  ) {
    await showAuthorizedMenu(
      userId,
      env
    );
  } else {
    await showMainMenu(userId, env);
  }
}

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

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (user.is_blocked) {
    return;
  }

  if (isPrimary) {
    const adminState =
      await getAdminState(userId, env);

    if (adminState) {
      if (!message.text) {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: chatId,
            text:
              '⚠️ 当前正在等待文本配置，' +
              '请发送文字或使用 /cancel 取消。'
          }
        );

        return;
      }

      await handleAdminConfigInput(
        userId,
        message.text,
        adminState,
        env
      );

      return;
    }
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
    /^\/([a-zA-Z_]+)(?:@\w+)?(?:\s+(.+))?$/
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
  'card'
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

    if (
      message.text ||
      message.caption
    ) {
      await dbMessageDataPut(
        userId,
        getMessageStorageKey(
          'admin',
          message.message_id
        ),
        {
          text:
            message.text ||
            message.caption ||
            '',
          date: message.date
        },
        env
      );
    }
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

  await dbMessageDataPut(
    userId,
    storageKey,
    {
      text: newContent,
      date:
        editedMessage.edit_date ||
        editedMessage.date
    },
    env
  );

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
            chat_id: env.ADMIN_GROUP_ID,
            message_id:
              Number(oldHint.text)
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
      const sentHint = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id:
            Number(user.topic_id),
          text: EDIT_HINT_TEXT,
          reply_parameters: {
            message_id: Number(pair.text)
          }
        }
      );

      if (sentHint?.message_id) {
        await dbMessageDataPut(
          REACTION_MAP_USER,
          hintKey,
          {
            text: String(
              sentHint.message_id
            ),
            date:
              Math.floor(Date.now() / 1000)
          },
          env
        );
      }
    } catch (error) {
      console.error(
        '发送编辑提示失败：',
        error?.message || error
      );
    }

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
${escapeHtml(stored.text)}

<b>新消息内容：</b>
${escapeHtml(newText)}
  `.trim();

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `t:${editedMessage.message_id}`,
    env
  );

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
    await dbMessageDataPut(
      userId,
      storageKey,
      {
        text: newText,
        date:
          editedMessage.edit_date ||
          editedMessage.date
      },
      env
    );

    const hintKey =
      `hint:t:${editedMessage.message_id}`;

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
            chat_id: userId,
            message_id:
              Number(oldHint.text)
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
      const sentHint = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: userId,
          text: EDIT_HINT_TEXT,
          reply_parameters: {
            message_id:
              Number(counterpartId)
          }
        }
      );

      if (sentHint?.message_id) {
        await dbMessageDataPut(
          REACTION_MAP_USER,
          hintKey,
          {
            text: String(
              sentHint.message_id
            ),
            date:
              Math.floor(Date.now() / 1000)
          },
          env
        );
      }
    } catch (error) {
      console.error(
        '发送编辑提示失败：',
        error?.message || error
      );
    }

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

    await dbMessageDataPut(
      userId,
      storageKey,
      {
        text: newText,
        date:
          editedMessage.edit_date ||
          editedMessage.date
      },
      env
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

async function handleConfigMenu(
  chatId,
  messageId,
  key,
  env
) {
  if (key === 'base') {
    return showBaseMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'autoreply') {
    return showAutoReplyMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'keyword') {
    return showKeywordMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'filter') {
    return showFilterMenu(
      chatId,
      env,
      messageId
    );
  }

  if (key === 'authorized') {
    return showAuthorizedMenu(
      chatId,
      env,
      messageId
    );
  }

  return showMainMenu(
    chatId,
    env,
    messageId
  );
}

async function handleRuleList(
  chatId,
  messageId,
  type,
  pageValue,
  env
) {
  let rows = [];
  let text = '';

  if (type === 'keyword_responses') {
    const rules =
      await getAutoReplyRules(env);

    const pageInfo =
      clampPage(pageValue, rules.length);

    const start =
      pageInfo.page * RULE_PAGE_SIZE;

    const pageRules = rules.slice(
      start,
      start + RULE_PAGE_SIZE
    );

    text =
      `📋 <b>自动回复规则列表</b>\n\n` +
      `共 ${rules.length} 条，` +
      `第 ${pageInfo.page + 1}/` +
      `${pageInfo.totalPages} 页`;

    rows = pageRules.map((rule, index) => {
  const absoluteIndex = start + index;

  const keywordPreview = Array.from(
    String(rule.keywords || '')
  )
    .slice(0, 25)
    .join('');

  return [
    {
      text:
        `删除 ${absoluteIndex + 1}. ` +
        `${keywordPreview}`,
      callback_data:
        `config:delete:keyword_responses:` +
        `${absoluteIndex}:${pageInfo.page}`
    }
  ];
});


    const navigation = [];

    if (pageInfo.page > 0) {
      navigation.push({
        text: '⬅️ 上一页',
        callback_data:
          `config:list:keyword_responses:` +
          `${pageInfo.page - 1}`
      });
    }

    if (
      pageInfo.page <
      pageInfo.totalPages - 1
    ) {
      navigation.push({
        text: '下一页 ➡️',
        callback_data:
          `config:list:keyword_responses:` +
          `${pageInfo.page + 1}`
      });
    }

    if (navigation.length) {
      rows.push(navigation);
    }

    rows.push([
      {
        text: '⬅️ 返回',
        callback_data:
          'config:menu:autoreply'
      }
    ]);
  } else if (
    type === 'block_keywords'
  ) {
    const keywords =
      await getBlockKeywords(env);

    const pageInfo =
      clampPage(pageValue, keywords.length);

    const start =
      pageInfo.page * RULE_PAGE_SIZE;

    const pageKeywords = keywords.slice(
      start,
      start + RULE_PAGE_SIZE
    );

    text =
      `📋 <b>屏蔽关键词列表</b>\n\n` +
      `共 ${keywords.length} 条，` +
      `第 ${pageInfo.page + 1}/` +
      `${pageInfo.totalPages} 页`;

    rows = pageKeywords.map(
      (keyword, index) => [
        {
          text:
            `删除 ${start + index + 1}. ` +
            `${String(keyword).slice(0, 25)}`,
          callback_data:
            `config:delete:block_keywords:` +
            `${start + index}:${pageInfo.page}`
        }
      ]
    );

    const navigation = [];

    if (pageInfo.page > 0) {
      navigation.push({
        text: '⬅️ 上一页',
        callback_data:
          `config:list:block_keywords:` +
          `${pageInfo.page - 1}`
      });
    }

    if (
      pageInfo.page <
      pageInfo.totalPages - 1
    ) {
      navigation.push({
        text: '下一页 ➡️',
        callback_data:
          `config:list:block_keywords:` +
          `${pageInfo.page + 1}`
      });
    }

    if (navigation.length) {
      rows.push(navigation);
    }

    rows.push([
      {
        text: '⬅️ 返回',
        callback_data:
          'config:menu:keyword'
      }
    ]);
  } else {
    return;
  }

  await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup: {
      inline_keyboard: rows
    }
  });
}

async function handleRuleDelete(
  chatId,
  messageId,
  type,
  value,
  page,
  env
) {
  if (type === 'keyword_responses') {
  const rules =
    await getAutoReplyRules(env);

  const index = Number(value);

  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index < rules.length
  ) {
    rules.splice(index, 1);

    await setConfig(
      'keyword_responses',
      JSON.stringify(rules),
      env
    );
  }

  return handleRuleList(
    chatId,
    messageId,
    type,
    page,
    env
  );
}


  if (type === 'block_keywords') {
    const keywords =
      await getBlockKeywords(env);

    const index = Number(value);

    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < keywords.length
    ) {
      keywords.splice(index, 1);

      await setConfig(
        'block_keywords',
        JSON.stringify(keywords),
        env
      );
    }

    return handleRuleList(
      chatId,
      messageId,
      type,
      page,
      env
    );
  }
}

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

async function handleConfigCallback(
  callbackQuery,
  env
) {
  const chatId =
    String(callbackQuery.from.id);

  const message =
    callbackQuery.message;

  if (!message?.message_id) {
    await answerCallback(
      callbackQuery.id,
      env,
      '菜单消息不存在。',
      true
    );

    return;
  }

  if (!isPrimaryAdmin(chatId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '只有主管理员可以修改配置。',
      true
    );

    return;
  }

  const parts =
    String(callbackQuery.data || '')
      .split(':');

  const action = parts[1] || '';
  const key = parts[2] || '';
  const value = parts[3];
  const extra = parts[4];

  await answerCallback(
    callbackQuery.id,
    env,
    '处理中…'
  );

  if (action === 'menu') {
    await handleConfigMenu(
      chatId,
      message.message_id,
      key,
      env
    );

    return;
  }

  if (action === 'toggle') {
    const allowedToggleKeys = new Set([
      'enable_image_forwarding',
      'enable_link_forwarding',
      'enable_text_forwarding',
      'enable_audio_forwarding',
      'enable_sticker_forwarding',
      'enable_user_forwarding',
      'enable_group_forwarding',
      'enable_channel_forwarding'
    ]);

    if (!allowedToggleKeys.has(key)) {
      return;
    }

    await setConfig(
      key,
      value === 'true'
        ? 'true'
        : 'false',
      env
    );

    await showFilterMenu(
      chatId,
      env,
      message.message_id
    );

    return;
  }

  if (action === 'verifymode') {
    await setConfig(
      'verify_mode',
      key === 'turnstile'
        ? 'turnstile'
        : 'quiz',
      env
    );

    await showBaseMenu(
      chatId,
      env,
      message.message_id
    );

    return;
  }

  if (action === 'edit') {
    const editableKeys = new Set([
      'welcome_msg',
      'verif_q',
      'verif_a',
      'block_threshold',
      'authorized_admins'
    ]);

    if (!editableKeys.has(key)) {
      return;
    }

    await setAdminState(
      chatId,
      {
        action: 'awaiting_input',
        key
      },
      env
    );

    let prompt =
      `请发送新的 ${key} 值：`;

    if (key === 'welcome_msg') {
      prompt = '请发送新的欢迎消息：';
    } else if (key === 'verif_q') {
      prompt = '请发送新的验证问题：';
    } else if (key === 'verif_a') {
      prompt =
        '请发送新的验证答案；多个答案使用 | 分隔：';
    } else if (
      key === 'block_threshold'
    ) {
      prompt =
        '请发送新的屏蔽次数阈值（1～100）：';
    } else if (
      key === 'authorized_admins'
    ) {
      prompt =
        '请发送协管员 ID 列表，多个 ID 使用英文逗号分隔：';
    }

    await renderMenu(env, {
      chatId,
      messageId: message.message_id,
      text:
        `${prompt}\n\n` +
        `状态将在 10 分钟后过期。\n` +
        `发送 /cancel 取消。`,
      parse_mode: undefined
    });

    return;
  }

  if (action === 'add') {
    if (
      ![
        'keyword_responses',
        'block_keywords'
      ].includes(key)
    ) {
      return;
    }

    await setAdminState(
      chatId,
      {
        action: 'awaiting_input',
        key: `${key}_add`
      },
      env
    );

    const prompt =
      key === 'keyword_responses'
        ? '请发送新的自动回复规则：\n' +
          '格式：关键词表达式===回复内容'
        : '请发送新的屏蔽关键词表达式：';

    await renderMenu(env, {
      chatId,
      messageId: message.message_id,
      text:
        `${prompt}\n\n` +
        `状态将在 10 分钟后过期。\n` +
        `发送 /cancel 取消。`,
      parse_mode: undefined
    });

    return;
  }

  if (action === 'list') {
    await handleRuleList(
      chatId,
      message.message_id,
      key,
      value || 0,
      env
    );

    return;
  }

  if (action === 'delete') {
    await handleRuleDelete(
      chatId,
      message.message_id,
      key,
      value,
      extra || 0,
      env
    );

    return;
  }

  if (
    action === 'clear' &&
    key === 'authorized_admins'
  ) {
    await setConfig(
      'authorized_admins',
      '[]',
      env
    );

    await showAuthorizedMenu(
      chatId,
      env,
      message.message_id
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

  let user =
    await dbUserGetOrCreate(
      targetUserId,
      env
    );

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

  if (data.startsWith('config:')) {
    await handleConfigCallback(
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

  if (
    (await dbConfigGet(flagKey, env)) ===
    '1'
  ) {
    return;
  }

  await dbConfigPut(flagKey, '1', env);

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

    return new Response('OK', {
      status: 200,
      headers: {
        'content-type':
          'text/plain; charset=utf-8'
      }
    });
  }
};
