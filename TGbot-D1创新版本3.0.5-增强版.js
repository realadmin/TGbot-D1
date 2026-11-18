/* =====================================================================
 * TGbot-D1 3.0.5 增强版（Fork 自 moistrr/TGbot-D1；单文件 Worker，
 * 版本号见下方 BOT_VERSION 常量。逐版变更史见仓库 README-增强版.md
 * 与各 Release 说明，本文件头只留部署与维护必须知道的事项。）
 * =====================================================================
 * 部署要点
 * - 必填变量：BOT_TOKEN、ADMIN_IDS（逗号分隔，主管理员在前）、
 *   ADMIN_GROUP_ID、WEBHOOK_SECRET；D1 绑定名必须为 TG_BOT_DB。
 * - 可选变量：TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY；选了
 *   Turnstile 又缺密钥时不再自动回退问答（默认答案公开可抄），
 *   访客会看到未配置提示、管理员会收到告警，须补齐密钥或改选
 *   静态问答 / 顺序点击（管理员显式选问答不受影响）。
 * - setWebhook 的 url 须以 /webhook 结尾（根路径不再受理更新），
 *   且须带 secret_token，allowed_updates 含 message /
 *   edited_message / callback_query / message_reaction /
 *   my_chat_member / chat_member 六类，缺类对应功能会静默失效
 *   （缺 chat_member 时管理群成员看门狗不工作）。
 * 安全模型
 * - 出口只有 api.telegram.org、Turnstile siteverify 与 GitHub
 *   Release 检查三处；无硬编码凭据；SQL 全参数化。
 * - 验证链接用 WEBHOOK_SECRET 的 HMAC-SHA256 签名（绑访客、10 分
 *   钟）；网页（指南 / 管理台 / 访客列表）复用 usrlist 签名（绑主
 *   管理员、10 分钟），接口每次复核身份，后两页仅主管理员可用。
 * - 网页链接签名掺各页 epoch，管理台「安全与审计」可一键让某页
 *   已发链接全部失效；删除、发证、改配置等敏感操作另带一次性凭
 *   证（绑管理员、动作与参数），管理操作记审计日志（保留 90 天）。
 * - Webhook 改同步处理：成功才回 200，失败回 500 由 Telegram
 *   重推；同一更新连失败 3 次转死信告警（限流延迟不计入次数）；中继复制前先落意向行，
 *   重推不重复投递。
 * - D1 不存消息正文：只存转发配对（rxmap）、状态与备注；配对类记
 *   录 90 天清理；verified_ttl_days 到期删访客行与话题映射，回来
 *   的人会新建话题；reverify_ttl_days（温和版）到期只把已验证访客
 *   改回待验证，档案、备注与话题都保留，回来重验后还在原话题。
 * 功能清单（与仓库 README-增强版 条目对应）
 * Turnstile / 静态问答 / 顺序点击多验证方式与回退；管理员一次性通行证（网页访客列表发放，机器人私聊送达，30 分钟有效、凭 Telegram 身份确认、用后即焚，救济怎么也过不了验证的访客）；验证提示、通行证与成功回执都会记录消息 ID 并自动清理：通过验证即撤回提示与未用通行证，成功回执在访客发出首条消息时撤回（转发成功后亦有兜底清理，记账失败则回执自删不留孤儿），过期通行证在访客下次互动时清扫，状态类消息只保留最新一条；访客列表会显示待验证访客的通行证状态（已发证剩余分钟），发证动作返回到期时间并即时刷新行内徽标；第三轮三路审计修复：删人/重置/超时清理连带作废通行证、Turnstile 确认补封禁检查、删证与发证改原子条件操作、熔断到期通知与熔断回复改原子占用、验证提示加 3 分钟节流、反应镜像补访客状态检查、初始化错误不外泄细节、节流标记在验证成功/删人/超时清理时一并清掉；引用转发（含部分引用，三级降级）；
 * 反应双向同步；原地编辑同步 + 被改副本下方附「✍🏼已编辑」内联按钮标记（与普通聊天编辑一样静默、无新消息提醒，Bot API 编辑
 * 无原生标记）；拉黑 / 取消拉黑提醒（my_chat_member + 403 兜底、
 * 标记去重）；/delete 按配对连带删除私聊原消息（原生删除无机器人
 * 事件、无法同步，属平台限制）；管理员备注 /note 同步到话题名
 * 「备注｜名字 (ID)」；网页访客列表（搜索 / 筛选 / 分页 / 备注 /
 * 跳话题）与数据统计（24h / 7d / 30d，统计口径 90 天）；网页管理
 * 台（原按钮菜单已下线，旧按钮回迁移提示）；新手引导 /guide；
 * 自动检查更新；服务熔断 /pause /resume（手动触发，闸门在去重之
 * 前；到期惰性恢复——由到期后第一条更新触发解除并通知，属刻意
 * 设计；服务熔断回复每访客每轮最多一条，由新消息与按钮点击触发，被封禁者静默；管理台里关闭服务熔断回复时语句输入框自动隐藏；熔断期间访客新发的消息当场删除（私聊收到的消息 48 小时内可删，与 /delete 连带删除同一机制）；对熔断前已送达消息的编辑与反应同样拒收（编辑等于变相发新消息），被拒时每位访客每轮至多收到一张独立警告（pausewarn 记账、恢复时自动删除、文案可配，是否发送跟随熔断回复开关），不触发熔断回复；恢复服务时把每位访客那张「请稍后再试」原地翻成「✅ 服务已恢复」，该恢复提示会在访客下一次发消息时自动撤回）；主菜单只保留最新一对：删除推迟一轮，新菜单送达后删的是上一条菜单与触发它的 /start，最新一条 /start 始终保留在聊天里方便点按重发、刷新过期的网页链接（追踪存 config 的 mainmenu:<chatId>，JSON {m, c}）；三页 POST 出口带错误码翻译，unauthorized 显示为「链接已过期，重新发送 /start 换新菜单」，不再把英文错误码原样弹给管理员；整段对话清空：网页访客列表删除升级为「连话题、私聊一起清空」（连带批量删除访客私聊中的聊天副本），话题内 /clear 命令做同样的双边清空但保留话题与访客档案，均按 rxmap 配对批量删除、私聊侧受 48 小时限制、执行后报告实删与删不掉的条数；命令回执类话题通知（备注查看/保存/删除、重置验证、封禁/解封结果、资料卡重建、话题内熔断开启/恢复/状态结果、未识别命令）改为短暂显示，发出约 5 秒后自动删除；访客解除拉黑、发出 ✅ 提醒时，之前那条 🚫 拉黑提醒会被一并删掉（编号记在 blocknotice:<访客>）；话题里管理员发出的命令消息在处理后一并撤回（未识别的命令同样），只短暂留回执、不留命令原文；主菜单追踪记录带写入时间戳，超过 48 小时（记录里的消息号已过 Telegram 删除窗口）会被数据库清扫整行删掉，读到过期记录时也直接跳过注定失败的删除。第四轮审计修复：问答验证答错 5 次锁定 30 分钟防穷举；三页签名链接按用途分权（引导/列表/管理台互不通用），签名密钥可改用独立的 LINK_SECRET 与 webhook 校验值解耦（未配置时回退 WEBHOOK_SECRET）；整段对话清空仅主管理员可操作、确认防重复执行、访客记录已删时点确认不再把空档案建回来，且清空只删开始那一刻收集到的快照记录（清空期间新到的消息配对不受影响），提示行改分块批量查询与批量删除；拉黑提醒记账竞态收尾，删档与超时清理一并清记账；主菜单追踪清扫按值条件删防误删新鲜记录、原地编辑不再刷新追踪时间戳（时间戳只记消息号的出生时刻）、旧格式纯数字追踪恢复解析；话题被手动关闭时先重开原话题再投递、不再误判失效重建；转发失败（内容受保护等）会在话题里提醒、群权限丢失时改走主管理员私聊告警；已验证访客发送过频会被限流丢弃并提醒；反应同步补匿名管理员处理，付费/自定义 emoji 不再误清已镜像的普通反应；短暂通知落 ephem 记账，定时删除没赶上时由数据库清扫补删；菜单签名链接的来源地址改为随请求传递（去掉可被任意请求覆盖的全局变量）；以频道身份发帖等没有 from 的消息直接忽略、不再抛错；命令 @ 的机器人名不是本机器人时完全忽略；/note 保存失败时保留命令原文便于改了重发。定制化扩展：管理台「基础配置」含参数与开关（转发限流强度、通行证/验证链接有效期、问答锁定次数与时长、命令回执停留秒数可调，均带范围校验；功能开关含反应同步、转发失败提醒、拉黑提醒（编辑标记为写死特性、不设开关）），另有「文案与呈现」（验证成功/答错、熔断恢复、拉黑/解封五句文案可改；话题名四种样式；主菜单五个按钮逐个显隐；访客列表默认排序与每页条数存服务端配置）；按访客例外：信任开关（is_trusted 与 relay_exempt 已合并为一个概念、两标记同写同清：列表/资料卡设置即置已验证并按验证成功收尾，闸门处对未验证的信任访客自动放行，一并免转发限流与类型过滤、免两种超时清理，屏蔽关键词与关键词自动封禁同样豁免；重置验证与 /reverify 连带撤销，资料卡按钮仅主管理员），列表行带「🤝 已信任」徽标与切换按钮，/api/users 附 uiDefaults 供列表页套用默认排序与页大小。
 * 三页（指南 / 管理台 / 访客列表）约定
 * - 页眉 position:fixed + 脚本实测高度补偿 body padding-top，
 *   不要改回 sticky：iOS 上 sticky 在滚动中逐帧重定位会闪烁。
 * - 滚动一律脚本逐帧驱动（requestAnimationFrame），不要改用原生
 *   behavior:smooth 或 matchMedia 门控：原生平滑在 Telegram 内嵌
 *   网页视图 / 嵌套滚动环境会退化为瞬移；签名页响应已加
 *   Cache-Control: no-store 防网页视图缓存旧页，不要去掉。
 * - 逐帧动画可被滚轮 / 触摸打断；指南与管理台带滚动定位高亮
 *   （scrollspy），访客列表的标签 / 筛选切换带方向滑动动画。
 */

const USER_STATE = {
  NEW: 'new',
  PENDING: 'pending_verification',
  VERIFIED: 'verified'
};

const DEFAULTS = {
  welcome_msg:
    '🎉 验证成功！现在可以开始发送消息了。',
  verif_q:
    '问题：1+1=?\n\n提示：\n1. 正确答案不是“2”。\n2. 答案在机器人简介内，请看简介的答案进行回答。',
  verif_a: '3',
  verify_mode: 'turnstile',
  keyword_responses: '[]',
  block_keywords: '[]',
  block_threshold: '5',
  verified_ttl_days: '0',
  reverify_ttl_days: '0',
  pause_reply_enabled: 'true',
  pause_reply_text: '请稍后再试',
  authorized_admins: '[]',
  member_allow_ids: '[]',

  relay_burst: '30',
  relay_refill_per_sec: '5',
  pass_ttl_min: '30',
  verify_link_min: '10',
  quiz_max_attempts: '5',
  quiz_lock_min: '30',
  notice_stay_sec: '5',

  reaction_sync_enabled: 'true',
  relay_fail_notice_enabled: 'true',
  block_notice_enabled: 'true',

  quiz_wrong_text:
    '🥺 抱歉，这次没有回答正确，请重新查看提示后再试。',
  pause_restored_text:
    '✅ 服务已恢复，可以正常发送消息了。',
  pause_warn_text:
    '编辑或贴反应转发失败，请稍后再试',
  block_notice_text:
    '🚫 对方已将机器人拉黑，后续消息将无法送达。',
  unblock_notice_text:
    '✅ 对方已解除对机器人的拉黑，可以继续正常收发消息。',
  visitor_blocked_text:
    '⚠️ 您已被管理员封禁，无法继续发送消息。',
  visitor_unblocked_text:
    '✅ 管理员已解除对您的封禁，现在可以继续发送消息。',
  keyword_hit_text:
    '⚠️ 您的消息触发了关键词过滤器 ' +
    '({count}/{threshold} 次)，消息已丢弃。',
  verify_card_text:
    '请点击下方按钮完成人机验证，' +
    '链接 {minutes} 分钟内有效。' +
    '验证通过后即可发送消息。',
  pass_deliver_text:
    '管理员发放了一张验证通行证\n\n' +
    '如果人机验证一直过不去，点击下方按钮即可直接通过验证。\n' +
    '通行证 {minutes} 分钟内有效，且只能使用一次。',
  quiz_lock_text:
    '🚫 答错次数过多，验证已锁定 ' +
    '{minutes} 分钟，请稍后再试。',
  filter_send_text:
    '🚫 当前不允许发送{type}。',
  filter_forward_text:
    '🚫 当前不允许转发来自{source}的消息。',
  unsupported_notice_text:
    '⚠️ 这类消息机器人暂时无法转达，已提醒管理员。',

  topic_title_style: 'note_first',
  menu_btn_panel: 'true',
  menu_btn_list: 'true',
  menu_btn_guide: 'true',
  menu_btn_updchk: 'true',
  menu_btn_pause: 'true',
  userlist_sort: 'act_desc',
  userlist_page_size: '20',
  display_tz: 'Asia/Singapore',

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
  member_allow_ids: 2000,
  block_keyword: 200,
  pause_reply_text: 500,
  auto_reply_pattern: 200,
  auto_reply_response: 4000,
  filter_text: 5000
};

const TOPIC_LOCK_TIMEOUT_SECONDS = 30;
const DATABASE_RETENTION_SECONDS = 90 * 24 * 60 * 60;

const USER_UPDATE_FIELDS = new Set([
  'user_state',
  'is_blocked',
  'block_count',
  'topic_id',
  'info_card_message_id',
  'user_info_json',
  'search_name',
  'search_username',
  'admin_note',
  'verify_prompt_msg_id',
  'receipt_msg_id',
  'is_trusted',
  'relay_exempt',
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

  // 命令菜单按身份分范围：访客在任何聊天里只看得到
  // start；管理员命令只注册到主管理员本人的私聊；
  // 话题命令只注册到接待群。四份注册各自覆盖同范围的
  // 旧值，旧版混在一起的菜单不会残留。
  const publicCommands = [
    {
      command: 'start',
      description: '开始使用'
    }
  ];

  const adminPrivateCommands = [
    ...publicCommands,
    {
      command: 'testverify',
      description: '打开 Turnstile 验证测试页'
    },
    {
      command: 'version',
      description: '查看版本与检查更新'
    },
    {
      command: 'panel',
      description: '打开网页管理台'
    },
    {
      command: 'pause',
      description: '服务熔断（可带分钟数）'
    },
    {
      command: 'resume',
      description: '恢复机器人服务'
    }
  ];

  const topicCommands = [
    {
      command: 'ban',
      description: '封禁当前话题访客'
    },
    {
      command: 'unban',
      description: '解除当前话题访客封禁'
    },
    {
      command: 'delete',
      description: '删除被回复的消息'
    },
    {
      command: 'clear',
      description: '清空与当前话题访客的全部聊天记录'
    },
    {
      command: 'terminate',
      description: '删除当前访客话题'
    },
    {
      command: 'card',
      description: '重新创建当前访客资料卡'
    },
    {
      command: 'reverify',
      description: '让当前话题访客重新验证'
    },
    {
      command: 'note',
      description: '给当前话题访客打备注（/note 内容）'
    },
    {
      command: 'notedelete',
      description: '删除当前话题访客的备注'
    },
    {
      command: 'pause',
      description: '服务熔断（/pause 分钟）'
    },
    {
      command: 'resume',
      description: '恢复机器人服务'
    }
  ];

  const registrations = [
    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        commands: publicCommands
      }
    ),

    telegramApi(
      env.BOT_TOKEN,
      'setMyCommands',
      {
        scope: { type: 'all_private_chats' },
        commands: publicCommands
      }
    )
  ];

  for (const adminId of getPrimaryAdminIds(env)) {
    registrations.push(
      telegramApi(
        env.BOT_TOKEN,
        'setMyCommands',
        {
          scope: {
            type: 'chat',
            chat_id: adminId
          },
          commands: adminPrivateCommands
        }
      )
    );
  }

  // 接待群 id 缺失或不可解析时只跳过话题命令这一份，
  // 不影响其余范围的注册。
  const groupId = String(env.ADMIN_GROUP_ID || '').trim();

  if (groupId && Number.isFinite(Number(groupId))) {
    registrations.push(
      telegramApi(
        env.BOT_TOKEN,
        'setMyCommands',
        {
          scope: {
            type: 'chat',
            chat_id: groupId
          },
          commands: topicCommands
        }
      )
    );
  }

  botCommandsPromise = Promise.all(registrations).catch((error) => {
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

// 展示时区（资料卡 / 更新状态行等的渲染时区）：
// 默认 Asia/Singapore，管理台「文案与呈现」可改（config
// display_tz）。formatTimestamp 是同步函数，时区由 async
// 调用点先读好再透传进来；这里只做合法性收口——带外写
// 入的垃圾值一律回退默认，绝不让一个坏时区把渲染打崩。
// Intl 试建结果按原始值缓存，避免热路径反复试建。
const DEFAULT_DISPLAY_TZ = 'Asia/Singapore';
const displayTzCache = new Map();

function resolveDisplayTimeZone(raw) {
  const value = String(raw || '').trim();

  if (!value) {
    return DEFAULT_DISPLAY_TZ;
  }

  if (displayTzCache.has(value)) {
    return displayTzCache.get(value);
  }

  let resolved = DEFAULT_DISPLAY_TZ;

  try {
    new Intl.DateTimeFormat('zh-CN', {
      timeZone: value
    });

    resolved = value;
  } catch (_) {
    resolved = DEFAULT_DISPLAY_TZ;
  }

  displayTzCache.set(value, resolved);

  return resolved;
}

async function getDisplayTimeZone(env) {
  return resolveDisplayTimeZone(
    await getConfig(
      'display_tz',
      env,
      DEFAULT_DISPLAY_TZ
    )
  );
}

function formatTimestamp(timestamp, timeZone) {
  if (!timestamp) return '[]';

  const date = new Date(Number(timestamp) * 1000);

  if (Number.isNaN(date.getTime())) {
    return '[]';
  }

  return date.toLocaleString('zh-CN', {
    timeZone: resolveDisplayTimeZone(timeZone),
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
    text.includes('topic was deleted') ||
    text.includes('forum topic was closed') ||
    text.includes('message thread id is invalid')
  );
}

// 话题只是被管理员手动「关闭」（不是删除/失效）：
// 关闭不该触发重建新话题，调用方先尝试重开原话题。
function isTopicClosedError(error) {
  const text = String(error?.message || error).toLowerCase();

  return (
    text.includes('message thread is closed') ||
    text.includes('topic_closed')
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

  // 签名密钥强度下限：每位待验证访客都持有一条用此密钥
  // 签发的链接（明文参数 + 对应 HMAC），等于公开了可供
  // 离线爆破的样本对——弱口令被字典爆破后，五种签名
  // 链接全可伪造。这里直接拒绝启动并写明原因。
  if (String(env.WEBHOOK_SECRET).length < 16) {
    throw new Error(
      'WEBHOOK_SECRET 太短（至少 16 个字符）：' +
      '请换成足够长的随机字符串，弱密钥会被离线爆破'
    );
  }

  if (
    env.LINK_SECRET &&
    String(env.LINK_SECRET).length < 16
  ) {
    throw new Error(
      'LINK_SECRET 太短（至少 16 个字符）：' +
      '请换成足够长的随机字符串，弱密钥会被离线爆破'
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                             Telegram API 封装                               */
/* -------------------------------------------------------------------------- */

// 非幂等方法（发出即产生新消息/新话题）：网络异常或 5xx 时
// 不能重试——请求可能已被 Telegram 处理、只是响应丢失，
// 重试会重复投递且重复副本没有配对记录。429 表示请求被拒
// 未处理，仍可重试；其余方法（编辑/删除/读取等）维持重试。
// 429 分流：retry_after ≤ 15 秒睡满后重试；更长则抛
// RateLimitDeferred 交调用方延后处理，不在请求里硬睡。
const NON_IDEMPOTENT_METHODS = new Set([
  'sendMessage',
  'copyMessage',
  'createForumTopic'
]);

async function telegramApi(
  token,
  method,
  params = {},
  attempt = 0,
  stats = null
) {
  // 可选子请求计数：传入 { n } 时每次实际尝试（含内部
  // 重试的递归）在入口 +1，供有硬预算的调用方（如整段
  // 清空）按真实子请求数计量；不传时零行为变化。
  if (stats) {
    stats.n = Number(stats.n || 0) + 1;
  }

  const mayRetry = !NON_IDEMPOTENT_METHODS.has(method);
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
    if (attempt < 2 && mayRetry) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1,
        stats
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
    // 边缘节点偶尔回非 JSON 的错误页（502/503/429 的
    // HTML）：状态码属可重试类、且本方法可重试时，按
    // 与网络失败相同的节拍重试，别让删除/编辑等幂等
    // 方法一次不试就失败。非幂等方法的 mayRetry 为
    // false，5xx 非 JSON 照样不重试（防重复投递）。
    if (
      (response.status === 429 ||
        response.status >= 500) &&
      attempt < 2 &&
      mayRetry
    ) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1,
        stats
      );
    }

    throw new Error(
      `Telegram API 返回非 JSON 内容 ` +
      `(${method}, HTTP ${response.status})`
    );
  }

  if (!data.ok) {
    const retryAfter = Number(
      data.parameters?.retry_after || 0
    );

    if (data.error_code === 429 && retryAfter > 0) {
      // retry_after 超过 15 秒不在请求内硬睡：抛可识别的
      // 限流延迟错误，由调用方按「稍后重来」处理（webhook
      // 同步路径的接线在后续批次：删占位回 500 延后重推）。
      if (retryAfter > 15) {
        const deferred = new Error(
          `Telegram 限流，需等待 ${retryAfter} 秒` +
          `（${method}）`
        );

        deferred.name = 'RateLimitDeferred';
        deferred.retryAfter = retryAfter;
        deferred.errorCode = 429;

        throw deferred;
      }

      if (attempt < 2) {
        await sleep(retryAfter * 1000);

        return telegramApi(
          token,
          method,
          params,
          attempt + 1,
          stats
        );
      }
    }

    if (
      response.status >= 500 &&
      attempt < 2 &&
      mayRetry
    ) {
      await sleep(500 * (attempt + 1));

      return telegramApi(
        token,
        method,
        params,
        attempt + 1,
        stats
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
    try {
      await env.TG_BOT_DB.prepare(
        `ALTER TABLE users ADD COLUMN ` +
        `${columnName} ${definition}`
      ).run();
    } catch (error) {
      // 多个实例并发迁移时，后到者会撞上「列已存在」，视为成功。
      if (
        !String(error?.message || error).includes(
          'duplicate column'
        )
      ) {
        throw error;
      }
    }
  }
}

async function ensureAuditColumn(
  env,
  columnName,
  definition
) {
  const result = await env.TG_BOT_DB.prepare(
    'PRAGMA table_info(admin_audit)'
  ).all();

  const columns = result?.results || [];
  const exists = columns.some(
    (column) => column.name === columnName
  );

  if (!exists) {
    try {
      await env.TG_BOT_DB.prepare(
        `ALTER TABLE admin_audit ADD COLUMN ` +
        `${columnName} ${definition}`
      ).run();
    } catch (error) {
      // 多个实例并发迁移时，后到者会撞上「列已存在」，视为成功。
      if (
        !String(error?.message || error).includes(
          'duplicate column'
        )
      ) {
        throw error;
      }
    }
  }
}

async function ensureProcessedColumn(
  env,
  columnName,
  definition
) {
  const result = await env.TG_BOT_DB.prepare(
    'PRAGMA table_info(processed_updates)'
  ).all();

  const columns = result?.results || [];
  const exists = columns.some(
    (column) => column.name === columnName
  );

  if (!exists) {
    try {
      await env.TG_BOT_DB.prepare(
        `ALTER TABLE processed_updates ADD COLUMN ` +
        `${columnName} ${definition}`
      ).run();
    } catch (error) {
      // 多个实例并发迁移时，后到者会撞上「列已存在」，视为成功。
      if (
        !String(error?.message || error).includes(
          'duplicate column'
        )
      ) {
        throw error;
      }
    }
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
      processed_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'done',
      attempts INTEGER NOT NULL DEFAULT 0
    )
    `,
    `
    CREATE TABLE IF NOT EXISTS admin_audit (
      ts INTEGER NOT NULL,
      admin_id TEXT,
      action TEXT,
      target TEXT,
      result TEXT,
      detail TEXT
    )
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_users_state_updated
      ON users (user_state, updated_at);
    CREATE INDEX IF NOT EXISTS idx_users_created_at
      ON users (created_at);
    CREATE INDEX IF NOT EXISTS idx_users_updated_at
      ON users (updated_at);
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
    `,
    `
    CREATE INDEX IF NOT EXISTS idx_admin_audit_ts
    ON admin_audit(ts)
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

  await ensureUserColumn(
    env,
    'verify_prompt_msg_id',
    'INTEGER'
  );

  await ensureUserColumn(
    env,
    'receipt_msg_id',
    'INTEGER'
  );

  await ensureUserColumn(
    env,
    'is_trusted',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await ensureUserColumn(
    env,
    'relay_exempt',
    'INTEGER NOT NULL DEFAULT 0'
  );

  await ensureUserColumn(
    env,
    'search_name',
    'TEXT'
  );

  await ensureUserColumn(
    env,
    'search_username',
    'TEXT'
  );

  await ensureAuditColumn(
    env,
    'epoch',
    'TEXT'
  );

  await ensureAuditColumn(
    env,
    'ip',
    'TEXT'
  );

  await ensureProcessedColumn(
    env,
    'status',
    "TEXT NOT NULL DEFAULT 'done'"
  );

  await ensureProcessedColumn(
    env,
    'attempts',
    'INTEGER NOT NULL DEFAULT 0'
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

// 短暂通知补删清扫：定时删除随请求上下文被回收时
// 没删成的回执，按 ephem: 记账在这里补删。
async function sweepEphemeralNotices(env) {
  let rows = [];

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('ephem:%')
      .all();

    rows = result?.results || [];
  } catch (error) {
    console.error(
      '读取短暂通知记账失败：',
      error?.message || error
    );

    return;
  }

  const nowMs = Date.now();

  // 单轮上限 50 行：残留行异常多时不在一轮里串行删到底，
  // 剩下的留下一次清扫（本函数随数据库清扫反复触发）。
  let handled = 0;

  for (const row of rows) {
    if (handled >= 50) {
      break;
    }

    try {
      const msgId = String(row.key).slice(6);

      if (!/^\d+$/.test(msgId)) {
        await dbConfigDelete(String(row.key), env);

        handled += 1;

        continue;
      }

      let parsed = null;

      try {
        parsed = JSON.parse(row.value);
      } catch (_) {
        parsed = null;
      }

      const dueAt = Number(parsed?.at || 0);

      if (dueAt && dueAt <= nowMs) {
        await quietDeleteMessage(
          env,
          parsed?.c || env.ADMIN_GROUP_ID,
          msgId
        );

        await dbConfigDeleteIfValue(
          String(row.key),
          String(row.value),
          env
        );

        handled += 1;
      }
    } catch (error) {
      console.error(
        '补删一条短暂通知失败：',
        error?.message || error
      );
    }
  }
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

    // 各类清扫互相隔离：一类抛错不再拖累同轮其余清扫。
    for (const sweep of [
      () => cleanupExpiredUsers(env, now),
      () => cleanupReverifyExpiredUsers(env, now),
      () => cleanupStaleMenuTracks(env),
      () => sweepEphemeralNotices(env),
      () => cleanupOldAuditRows(env),
      () => sweepExpiredNonces(env),
      () => sweepStaleUpdateClaims(env),
      () => sweepRetiredMarkConfigKeys(env),
      () => sweepRetiredMutedFlags(env)
    ]) {
      try {
        await sweep();
      } catch (error) {
        console.error(
          '单项清扫失败（继续其余清扫）：',
          error?.message || error
        );
      }
    }
  } catch (error) {
    console.error(
      '清理数据库失败：',
      error?.message || error
    );
  }
}

// 一次性存量清理（-v151b14）：编辑标记的双向开关已取
// 消、标记写死为常开特性，旧总开关与两个方向键不再有
// 任何读点；存量库里若还存着它们的值，随概率清扫逐个
// 删行，不留惰性孤儿。删除幂等：无行即空操作，删净后
// 每轮清扫只是三次空删，故可长期挂在清扫链上、不设
// 完成标记。
async function sweepRetiredMarkConfigKeys(env) {
  for (const key of [
    'hint_enabled',
    'hint_on_visitor_edit',
    'hint_on_admin_edit'
  ]) {
    await dbConfigDelete(key, env);
  }
}

// 一次性存量清理（-v160b2）：is_muted（已静音）标记彻底
// 退役——统计、转发静默投递与超时清理豁免都不再读它，
// 界面与接口也不再暴露；存量库里还挂着 1 的行随概率清
// 扫一次清零，免得标记无声残留。清零幂等：清净后每轮
// 清扫只是一次零命中更新。第十轮审计起加完成标记
// （见函数内说明），清净确认后不再每轮空转全表。
async function sweepRetiredMutedFlags(env) {
  // 完成标记（第十轮审计）：清零确认后落
  // sys:muted-swept，后续清扫见标记直接跳过。标
  // 记不怕被新数据「失效」的前提是 is_muted 再无
  // 写 1 的路径——dbUserUpdate 的字段白名单已摘
  // 除该列、建行 INSERT 不写该列（默认 0）、全仓
  // 唯一的写点就是本函数的清零 UPDATE——标记落
  // 下后不可能再有行变回 1。落标记的条件是本轮
  // UPDATE 影响行数为 0（确已清净）：本轮清了若
  // 干行则不落标记，下一轮确认 0 后再落，存量行
  // 不会被标记挡在门外。
  if (
    (await dbConfigGet('sys:muted-swept', env)) === '1'
  ) {
    return;
  }

  const swept = await env.TG_BOT_DB.prepare(
    'UPDATE users SET is_muted = 0 ' +
    'WHERE is_muted != 0'
  ).run();

  invalidateAllUserRows(env);

  if (Number(swept?.meta?.changes || 0) === 0) {
    await dbConfigPut('sys:muted-swept', '1', env);
  }
}

// 卡死占位清扫：同步处理模型下，一条更新 10 分钟还没
// 处理完只可能是进程已死。pending 占位留着会把该更新
// 的后续投递一直挡在「在途重复」上，这里整行删掉，
// 之后的全新投递可从零处理（中继有意向行防重复复制）。
async function sweepStaleUpdateClaims(env) {
  const cutoff =
    Math.floor(Date.now() / 1000) -
    UPDATE_CLAIM_STALE_SECONDS;

  await env.TG_BOT_DB.prepare(
    'DELETE FROM processed_updates ' +
    "WHERE status = 'pending' AND processed_at < ?"
  ).bind(cutoff).run();
}

// 主菜单追踪（mainmenu:<chatId>）超过保鲜期后，里面的消息号
// 已过 Telegram 删除窗口、留着也没用，整个记录删掉。
// 没有时间戳的旧记录不动：下次打开菜单覆盖写入时会带上
// 时间戳，之后自然进入清扫范围。
async function cleanupStaleMenuTracks(env) {
  let rows = [];

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('mainmenu:%')
      .all();

    rows = result?.results || [];
  } catch (error) {
    console.error(
      '读取主菜单追踪记录失败：',
      error?.message || error
    );

    return;
  }

  const nowMs = Date.now();

  for (const row of rows) {
    let t = 0;

    try {
      t = Number(JSON.parse(row.value)?.t) || 0;
    } catch (_) {
      t = 0;
    }

    if (t && nowMs - t > MENU_TRACK_TTL_MS) {
      // 按快照值条件删：枚举之后管理员恰好开了菜单、
      // 写入了新鲜记录时，不要把新鲜行误删掉。
      await dbConfigDeleteIfValue(
        String(row.key),
        String(row.value),
        env
      );
    }
  }
}

// 温和版超时处理：已验证访客长期不活跃时只改回待验证，
// 档案、备注与话题映射都保留，对方回来重新验证后
// 还在原来的话题里继续聊。不动 updated_at：不活跃时钟
// 继续按最后一次真实活动走，删档版（verified_ttl_days）
// 的计时不受影响，两者可叠加（先改回、后删档）。
async function cleanupReverifyExpiredUsers(env, now) {
  const ttlDays =
    Number(
      await getConfig(
        'reverify_ttl_days',
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
      'SELECT user_id, is_trusted, relay_exempt FROM users ' +
      'WHERE user_state IN (?, ?) ' +
      'AND is_blocked = 0 ' +
      'AND updated_at IS NOT NULL ' +
      'AND updated_at < ? LIMIT 200'
    )
      .bind(
        USER_STATE.VERIFIED,
        USER_STATE.VERIFIED,
        cutoff
      )
      .all();

  // 协管员名单整轮只读一次（逐行 isAdminUser 会逐行读配置）。
  const coAdminSet = new Set(
    (await getAuthorizedAdmins(env)).map(String)
  );

  const isAdminRow = (id) =>
    isPrimaryAdmin(id, env) || coAdminSet.has(String(id));

  for (const row of result?.results || []) {
    const userId = String(row.user_id);

    // 管理员（含协管员）账号永不改动。
    if (isAdminRow(userId)) {
      continue;
    }

    // 已信任的访客不改（共享谓词 isTrustedRow：
    // is_trusted 与 relay_exempt 任一为真），
    // 否则改回待验证与信任免验的口径互相打架。
    if (isTrustedRow(row)) {
      continue;
    }

    // 改状态时复检全部条件，避免「选中后访客恰好回来活跃」
    // 的竞态把活跃访客误改（TOCTOU）；只改状态、不动 updated_at。
    await env.TG_BOT_DB.prepare(
      'UPDATE users SET user_state = ? ' +
      'WHERE user_state = ? ' +
      'AND is_blocked = 0 ' +
      'AND updated_at < ? AND user_id = ?'
    )
      .bind(
        USER_STATE.PENDING,
        USER_STATE.VERIFIED,
        cutoff,
        userId
      )
      .run();

    invalidateUserRow(env, userId);
  }
}

// 删档版 TTL 单轮删除预算（第十轮审计）：每删一人
// 要连带约二十条 D1 操作（删行、清配对与提示行、
// 作废通行证、删熔断卡、一串记账行），旧候选上限
// 200 人一轮可达约 4400 条——TTL 开启后的清扫轮
// 能把日写额度打穿一截。单轮最多实际删除这么多
// 人，剩余留下轮（清扫随请求概率触发、轮次不断）；
// 候选仍取 200，跳过行（管理员 / 已信任 / 复检未
// 删）不占预算。默认关闭（verified_ttl_days=0）时
// 本函数在读到配置后直接返回，行为不变。
const TTL_SWEEP_DELETE_BUDGET = 25;

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

  let deletedUsers = 0;

  const result =
    await env.TG_BOT_DB.prepare(
      'SELECT user_id, is_trusted, relay_exempt FROM users ' +
      'WHERE user_state IN (?, ?) ' +
      'AND is_blocked = 0 ' +
      'AND updated_at IS NOT NULL ' +
      'AND updated_at < ? LIMIT 200'
    )
      .bind(
        USER_STATE.VERIFIED,
        USER_STATE.PENDING,
        cutoff
      )
      .all();

  // 协管员名单整轮只读一次（逐行 isAdminUser 会逐行读配置）。
  const coAdminSet = new Set(
    (await getAuthorizedAdmins(env)).map(String)
  );

  const isAdminRow = (id) =>
    isPrimaryAdmin(id, env) || coAdminSet.has(String(id));

  for (const row of result?.results || []) {
    const userId = String(row.user_id);

    // 管理员（含协管员）账号永不清理。
    if (isAdminRow(userId)) {
      continue;
    }

    // 已信任的访客不清理（共享谓词 isTrustedRow），
    // 否则信任标记随档案一起消失（已随 SELECT 带出，不再逐行点读）。
    if (isTrustedRow(row)) {
      continue;
    }

    // 单轮删除预算：删满即停，剩余留下轮（跳过行
    // 不占预算，见 TTL_SWEEP_DELETE_BUDGET 说明）。
    if (deletedUsers >= TTL_SWEEP_DELETE_BUDGET) {
      break;
    }

    // 删行前留好完整记录：拉黑提醒的 🚫 本体在话题里，
    // 删完行就查不到话题 ID 了（与删人路径同口径）。
    const fullUser = await dbUserGet(userId, env);

    // 删除时复检全部条件，避免「选中后访客恰好回来活跃」
    // 的竞态把活跃访客误删（TOCTOU）。
    const deleted =
      await env.TG_BOT_DB.prepare(
        'DELETE FROM users WHERE user_id = ? ' +
        'AND user_state IN (?, ?) ' +
        'AND is_blocked = 0 ' +
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

    deletedUsers += 1;

    invalidateUserRow(env, userId);

    await env.TG_BOT_DB.prepare(
      'DELETE FROM messages WHERE user_id = ?'
    )
      .bind(userId)
      .run();

    // 配对/提示行与删人路径同口径一并清（此前残留到 90 天清扫）。
    await env.TG_BOT_DB.prepare(
      'DELETE FROM messages ' +
      'WHERE user_id = ? ' +
      'AND (message_id LIKE ? OR ' +
      '(message_id LIKE ? AND text LIKE ?))'
    )
      .bind(
        REACTION_MAP_USER,
        `p:${userId}:%`,
        't:%',
        `${userId}:%`
      )
      .run();

    await dbConfigDelete(
      `botblocked:${userId}`,
      env
    );

    // 连带作废通行证：删记录并删访客私聊里的证消息
    // （与删人路径 purgeManagedUser 同口径，此前只删记录、
    // 证消息本体残留在访客私聊里）。
    await voidUserPass(env, userId);

    await dbConfigDelete(
      `pausenote:${userId}`,
      env
    );

    // 熔断三类卡连本体一起删（见 deletePauseCardsForUser）。
    await deletePauseCardsForUser(env, userId);

    await dbConfigDelete(
      `promptat:${userId}`,
      env
    );

    await dbConfigDelete(
      `startmsg:${userId}`,
      env
    );

    await dbConfigDelete(
      `seq:${userId}`,
      env
    );

    await dbConfigDelete(
      `bannotice:${userId}`,
      env
    );

    await dbConfigDelete(
      `unbannotice:${userId}`,
      env
    );

    // 拉黑提醒：话题还在时先删话题里的 🚫 本体，
    // 再删记账行（与删人路径同口径）。
    const staleBlockNotice =
      await dbConfigGet(
        `blocknotice:${userId}`,
        env
      );

    if (staleBlockNotice && fullUser?.topic_id) {
      await quietDeleteMessage(
        env,
        env.ADMIN_GROUP_ID,
        staleBlockNotice
      );
    }

    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );

    await dbConfigDelete(
      `quizlock:${userId}`,
      env
    );

    await dbConfigDelete(
      `copyfail:${userId}`,
      env
    );
  }
}

async function touchUserActivity(user, env) {
  const now =
    Math.floor(Date.now() / 1000);

  // 节流 23 小时（82800 秒），比活跃统计的最小窗口
  // （24 小时）短 1 小时：节流与窗口等长时，窗口沿
  // 附近的活跃会漏计——上次打卡在 24 小时多一点点
  // 之前、本人一直在发消息，打卡却要等满 86400 秒
  // 才刷新，统计在窗口沿把人漏掉（第十轮审计）。
  // 短 1 小时保证任何时刻窗口内至少有一次打卡落
  // 点，同时仍避免每条消息多一次写。
  if (now - Number(user.updated_at || 0) < 82800) {
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

    invalidateUserRow(env, user.user_id);
  } catch (error) {
    console.error(
      '刷新访客活跃时间失败：',
      error?.message || error
    );
  }
}

// 两阶段 claim（at-least-once）：先占位 pending，处理
// 成功标 done；失败置 failed 释放占位并累计 attempts——
// 未满 3 次等 Telegram 重推后立即重办，满 3 次标 done
// 判死信（见 processWebhookUpdate）。失败不删行：删行会
// 把 attempts 一并清零，死信计数永远到不了 3。重推撞见
// 10 分钟内的 pending 视为在途重复；更久的 pending 视为
// 上次进程已死，接管重办（attempts 沿用）；failed 不论
// 新旧一律立即重办。存量行（旧版只有时间戳）迁移后
// status 默认 'done'，与旧「占过即已处理」语义一致。
const UPDATE_CLAIM_STALE_SECONDS = 600;

async function claimUpdateStart(updateId, env) {
  if (
    updateId === null ||
    updateId === undefined
  ) {
    return { mode: 'skip', attempts: 0 };
  }

  const id = String(updateId);
  const now = Math.floor(Date.now() / 1000);

  const existing = await env.TG_BOT_DB.prepare(
    'SELECT status, attempts, processed_at ' +
    'FROM processed_updates WHERE update_id = ?'
  ).bind(id).first();

  if (!existing) {
    const inserted = await env.TG_BOT_DB.prepare(`
      INSERT OR IGNORE INTO processed_updates (
        update_id,
        processed_at,
        status,
        attempts
      ) VALUES (?, ?, 'pending', 0)
    `).bind(id, now).run();

    if (Number(inserted?.meta?.changes || 0) > 0) {
      return { mode: 'process', attempts: 0 };
    }

    // 并发下被别的实例抢先占位：按在途重复处理。
    return { mode: 'inflight', attempts: 0 };
  }

  const attempts = Number(existing.attempts || 0);

  if (existing.status === 'done') {
    return { mode: 'duplicate', attempts };
  }

  if (existing.status === 'failed') {
    // 原子认领：带上读到的原状态与原时间戳作条件，
    // 并发重推/双路处理只有一路能改成功
    // （changes = 1），另一路按在途重复处理——与
    // 插入路径 INSERT OR IGNORE 的认领口径一致。
    // 旧写法先读后无条件写，两路会同时拿到 process
    // 并发处理同一更新（第十轮审计）。
    const claimed = await env.TG_BOT_DB.prepare(
      "UPDATE processed_updates SET status = 'pending', " +
      'processed_at = ? WHERE update_id = ? ' +
      "AND status = 'failed' AND processed_at = ?"
    ).bind(now, id, Number(existing.processed_at || 0)).run();

    if (Number(claimed?.meta?.changes || 0) > 0) {
      return { mode: 'process', attempts };
    }

    return { mode: 'inflight', attempts };
  }

  if (
    now - Number(existing.processed_at || 0) <=
    UPDATE_CLAIM_STALE_SECONDS
  ) {
    return { mode: 'inflight', attempts };
  }

  // 接管：刷新占位时间，attempts 沿用。同样按读到的
  // 原状态与原时间戳原子认领：被判陈旧的上一进程若
  // 其实还活着（或另一路也在接管），只有一路改得动，
  // 另一路按在途重复处理。
  const claimed = await env.TG_BOT_DB.prepare(
    'UPDATE processed_updates SET processed_at = ? ' +
    'WHERE update_id = ? ' +
    "AND status = 'pending' AND processed_at = ?"
  ).bind(now, id, Number(existing.processed_at || 0)).run();

  if (Number(claimed?.meta?.changes || 0) > 0) {
    return { mode: 'process', attempts };
  }

  return { mode: 'inflight', attempts };
}

async function claimUpdateDone(updateId, env) {
  if (
    updateId === null ||
    updateId === undefined
  ) {
    return;
  }

  await env.TG_BOT_DB.prepare(
    "UPDATE processed_updates SET status = 'done' " +
    'WHERE update_id = ?'
  ).bind(String(updateId)).run();
}

// 返回 true 表示 attempts 已达 3 次、行已标 done 判死信；
// false 表示行已置 failed 释放占位，等重推立即重办。
async function claimUpdateFailed(
  updateId,
  env,
  prevAttempts
) {
  const id = String(updateId);
  const attempts = Number(prevAttempts || 0) + 1;

  if (attempts >= 3) {
    await env.TG_BOT_DB.prepare(
      "UPDATE processed_updates SET status = 'done', " +
      'attempts = ? WHERE update_id = ?'
    ).bind(attempts, id).run();

    return true;
  }

  await env.TG_BOT_DB.prepare(
    "UPDATE processed_updates SET status = 'failed', " +
    'attempts = ? WHERE update_id = ?'
  ).bind(attempts, id).run();

  return false;
}

// 限流延迟（RateLimitDeferred）不是处理失败：把占位置为
// failed 释放（attempts 不累计），回 500 等 Telegram 在限
// 流窗口过后重推，消息不进死信计数。
async function claimUpdateRelease(updateId, env) {
  if (
    updateId === null ||
    updateId === undefined
  ) {
    return;
  }

  await env.TG_BOT_DB.prepare(
    "UPDATE processed_updates SET status = 'failed' " +
    'WHERE update_id = ?'
  ).bind(String(updateId)).run();
}

// 更新处理记账（失败计数 / 限流释放）的落账兜底：同步
// 先重试一次，仍失败则挂 waitUntil 后台补记。记账没
// 落下时占位行还停在 claim 时的 pending，重推撞见会
// 被当在途重复回 200 吞掉——更新既不重试也不进死
// 信、静默丢失（第十轮审计）；补记赶在重推之前落账，
// 行转 failed 即可被立即重办。返回值：记账函数的结
// 果；同步两次都失败时返回 undefined（后台补记的结果
// 调用方看不到，按未落账处理）。
async function bookkeepingWithRetry(label, fn, ctx) {
  try {
    return await fn();
  } catch (firstError) {
    console.error(
      `${label}失败，重试一次：`,
      firstError?.message || firstError
    );
  }

  try {
    return await fn();
  } catch (secondError) {
    console.error(
      `${label}重试仍失败，转后台补记：`,
      secondError?.message || secondError
    );
  }

  if (ctx?.waitUntil) {
    ctx.waitUntil(
      (async () => {
        try {
          await fn();
        } catch (bgError) {
          console.error(
            `${label}后台补记仍失败：`,
            bgError?.message || bgError
          );
        }
      })()
    );
  }

  return undefined;
}

// 限流提示：每小时至多一条（config 时间戳节流），免得限流
// 期间每条重推都刷一条告警。
async function alertAdminsRateLimited(env) {
  try {
    const last = Number(
      (await dbConfigGet(
        'alertat:ratelimit',
        env
      )) || 0
    );

    if (Date.now() - last < 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(
      'alertat:ratelimit',
      String(Date.now()),
      env
    );

    await notifyPrimaryAdmins(
      env,
      '⏳ 机器人正被 Telegram 限流，部分消息将延迟送达，' +
      '重推成功后无需处理。'
    );
  } catch (error) {
    console.error(
      '发送限流提示失败：',
      error?.message || error
    );
  }
}

// 死信告警的上下文摘要：从 update 本体提取来源、发送者、
// 聊天与内容种类，管理员收到告警能定位是谁的什么消息。
// 拿不到的字段整项省略；整体 try 包裹——告警路径自身
// 绝不能成为新的失败源。
function summarizeUpdateForAlert(update) {
  try {
    const lines = [];

    const kindOf = (m) => {
      if (!m) return '';

      if (m.text) return '文本';
      if (m.photo) return '图片';
      if (m.video) return '视频';
      if (m.video_note) return '圆视频';
      if (m.voice) return '语音';
      if (m.audio) return '音频';
      if (m.document) return '文件';
      if (m.sticker) return '贴纸';
      if (m.animation) return '动图';
      if (m.poll) return '投票';
      if (m.location) return '位置';
      if (m.venue) return '地点';
      if (m.contact) return '联系人名片';
      if (m.game) return '游戏';
      if (m.invoice) return '发票';
      if (m.dice) return '骰子动画';
      if (m.caption) return '带说明的媒体';

      return '其他';
    };

    const senderOf = (user) => {
      if (!user || user.id == null) return '';

      const name = [user.first_name, user.last_name]
        .filter(Boolean)
        .join(' ')
        .trim();

      return (
        '发送者：' +
        (name ? `${escapeHtml(name)}，` : '') +
        `ID ${user.id}`
      );
    };

    const pushMessage = (label, m) => {
      lines.push(`来源：${label}`);

      const sender = senderOf(m?.from);

      if (sender) lines.push(sender);

      if (m?.chat?.id != null) {
        lines.push(`聊天 ID：${m.chat.id}`);
      }

      const kind = kindOf(m);

      if (kind) lines.push(`内容：${kind}`);
    };

    if (update?.message) {
      pushMessage(
        update.message.chat?.type === 'private'
          ? '私聊消息'
          : '管理群话题消息',
        update.message
      );
    } else if (update?.edited_message) {
      pushMessage('编辑消息', update.edited_message);
    } else if (update?.message_reaction) {
      lines.push('来源：表情反应');

      const sender = senderOf(
        update.message_reaction.user
      );

      if (sender) lines.push(sender);

      if (update.message_reaction.chat?.id != null) {
        lines.push(
          `聊天 ID：${update.message_reaction.chat.id}`
        );
      }
    } else if (update?.callback_query) {
      lines.push('来源：按钮回调');

      const sender = senderOf(update.callback_query.from);

      if (sender) lines.push(sender);

      if (
        update.callback_query.message?.chat?.id != null
      ) {
        lines.push(
          `聊天 ID：${update.callback_query.message.chat.id}`
        );
      }
    } else if (
      update?.my_chat_member ||
      update?.chat_member
    ) {
      const cm =
        update.my_chat_member || update.chat_member;

      lines.push('来源：成员变动');

      if (cm?.chat?.id != null) {
        lines.push(`聊天 ID：${cm.chat.id}`);
      }
    }

    return lines;
  } catch (_) {
    return [];
  }
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

// 原子条件写：值仍是调用方读到的那份才写入，返回是否写成功。
// 给「读-改-写」类计数提供 CAS 基础，防并发丢更新。
async function dbConfigPutIfValue(
  key,
  oldValue,
  newValue,
  env
) {
  const result = await env.TG_BOT_DB.prepare(
    'UPDATE config SET value = ? ' +
    'WHERE key = ? AND value = ?'
  )
    .bind(String(newValue), key, String(oldValue))
    .run();

  return !result?.meta || result.meta.changes > 0;
}

// 原子条件删：值仍是调用方读到的那份才删，返回是否真的删掉。
// 用来防「读到旧值→期间被改写→无条件删误删新值」一类竞态。
async function dbConfigDeleteIfValue(key, value, env) {
  const result = await env.TG_BOT_DB.prepare(
    'DELETE FROM config WHERE key = ? AND value = ?'
  )
    .bind(key, String(value))
    .run();

  return !result?.meta || result.meta.changes > 0;
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
/*                                访客数据库操作                                 */
/* -------------------------------------------------------------------------- */

function normalizeUser(user) {
  if (!user) return null;

  return {
    ...user,
    is_blocked: Number(user.is_blocked) === 1,
    is_trusted: Number(user.is_trusted) === 1,
    relay_exempt:
      Number(user.relay_exempt) === 1,
    topic_creating:
      Number(user.topic_creating) === 1,
    user_info: user.user_info_json
      ? safeJsonParse(user.user_info_json, null)
      : null
  };
}

// 请求级访客行缓存（第十轮审计·性能）：稳态一条私聊
// 消息原本要约 31 条 D1、同一访客行被重读约 6 次
// （入口、闸门、等待话题、中继、回执各读一遍）。
// fetch 入口给 env 浅拷贝挂一张 Map（见 fetch），
// dbUserGet 命中直接用缓存行；一切 users 表写入点
// 在写后调 invalidateUserRow / invalidateAllUserRows
// 失效，缓存与库行不会脱节。只缓存查到的行：不存
// 在的行不缓存，建行路径（dbUserGetOrCreate 插入后
// 紧接着回读）必须读到新行。normalizeUser 每次现
// 做、返回对象互不共享，调用方改返回值不污染缓存。
function userRowCache(env) {
  const cache = env?.__userRowCache;

  return cache instanceof Map ? cache : null;
}

function invalidateUserRow(env, userId) {
  userRowCache(env)?.delete(String(userId));
}

function invalidateAllUserRows(env) {
  userRowCache(env)?.clear();
}

async function dbUserGet(userId, env) {
  const id = String(userId);
  const cache = userRowCache(env);

  if (cache?.has(id)) {
    return normalizeUser(cache.get(id));
  }

  const row = await env.TG_BOT_DB.prepare(
    'SELECT * FROM users WHERE user_id = ?'
  ).bind(id).first();

  if (cache && row) {
    cache.set(id, row);
  }

  return normalizeUser(row);
}

// 从 Telegram user 对象派生列表搜索字段：姓名拼接与
// 用户名都小写化存储，搜索时 pattern 同样小写化，两边
// 口径一致（不再对 user_info_json 原文做 LIKE）。
function deriveUserSearchFields(userInfo) {
  if (!userInfo || typeof userInfo !== 'object') {
    return { name: '', username: '' };
  }

  const name = String(
    userInfo.name ||
    [userInfo.first_name, userInfo.last_name]
      .filter(Boolean)
      .join(' ') ||
    ''
  )
    .trim()
    .toLowerCase();

  // 用户名以 username_raw 为准（资料卡落库的真名）；
  // 没有时回退 username，但只接受像真名的（原始 from
  // 对象的 username 本就是真名；资料卡的 username 是
  // '@…' 展示串、甚至可能是「无用户名」占位，不能当
  // 真名存）。
  let username = String(userInfo.username_raw || '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase();

  if (!username) {
    const candidate = String(userInfo.username || '')
      .replace(/^@+/, '')
      .trim();

    if (/^[A-Za-z0-9_]+$/.test(candidate)) {
      username = candidate.toLowerCase();
    }
  }

  return { name, username };
}

async function dbUserGetOrCreate(userId, env) {
  const normalizedId = String(userId);
  const now = Math.floor(Date.now() / 1000);

  await env.TG_BOT_DB.prepare(`
    INSERT OR IGNORE INTO users (
      user_id,
      user_state,
      is_blocked,
      block_count,
      topic_creating,
      created_at,
      updated_at
    ) VALUES (?, ?, 0, 0, 0, ?, ?)
  `).bind(
    normalizedId,
    USER_STATE.NEW,
    now,
    now
  ).run();

  return dbUserGet(normalizedId, env);
}

// 首次接触即落名：建行只写 ID，姓名原先只有建话题发
// 资料卡（createInfoCard）与刷新资料卡两处才写——没
// 通过验证的访客永远走不到那一步，列表里恒显「（无
// 名字记录）」、按名也搜不到。这里在私聊入口与拉黑
// 记账建行/读行后补一手：解析出的名字为空才写（口
// 径同 parseUserInfoForList：name 或 first+last 拼
// 接；存量哨兵 '{}' 解析后同样为空、照常补真名），
// 已有资料者不覆盖、每访客至多写一次。写入走
// dbUserUpdate，搜索字段随之同写派生。落名失败静默
// 降级：它是锦上添花，不能拖累消息主流程。
async function captureVisitorNameIfMissing(
  user,
  from,
  firstMessageDate,
  env
) {
  try {
    if (!user || !from) return;

    if (
      String(from.id || '') !==
      String(user.user_id || '')
    ) {
      return;
    }

    const info = user.user_info || {};

    const parsedName = String(
      info.name ||
      [info.first_name, info.last_name]
        .filter(Boolean)
        .join(' ') ||
      ''
    ).trim();

    if (parsedName) return;

    const payload = buildUserInfoPayload(
      from,
      firstMessageDate || null
    );

    await dbUserUpdate(
      user.user_id,
      {
        user_info: {
          name: payload.displayName,
          username: payload.usernameDisplay,
          username_raw: payload.usernameRaw,
          first_message_date:
            firstMessageDate || null
        }
      },
      env
    );
  } catch (error) {
    console.error(
      '首次接触落名失败：',
      error?.message || error
    );
  }
}

async function dbUserUpdate(
  userId,
  data,
  env,
  options = {}
) {
  if (
    !data ||
    Object.keys(data).length === 0
  ) {
    return;
  }

  const payload = { ...data };

  // 活跃戳（updated_at）只由访客本人活动路径盖：它同时
  // 是活跃排序/统计与双 TTL 的不活跃时钟，管理操作
  // （备注/信任/封禁/重置）、资料卡与话题绑定记账、
  // 槽位记账这类与访客活跃无关的写入一律传
  // { touchActivity: false }，不得把长期不活跃的访客
  // 顶成「刚刚活跃」、更不得整体重置其 TTL 时钟——
  // 与回填代码「不动 updated_at」的既有意图对齐
  // （第十轮审计）。
  if (options.touchActivity !== false) {
    payload.updated_at = Math.floor(Date.now() / 1000);
  }

  if (payload.user_info !== undefined) {
    payload.user_info_json =
      payload.user_info === null
        ? null
        : JSON.stringify(payload.user_info);

    // 搜索字段与资料同写：姓名/用户名落成独立小写列，
    // 列表搜索查列不查 JSON 原文（键名误命中、转义对
    // 不上的毛病都出在原文 LIKE 上）。
    const derived =
      deriveUserSearchFields(payload.user_info);

    payload.search_name = derived.name;
    payload.search_username = derived.username;

    delete payload.user_info;
  } else if (payload.user_info_json !== undefined) {
    const derived = deriveUserSearchFields(
      safeJsonParse(payload.user_info_json, null)
    );

    payload.search_name = derived.name;
    payload.search_username = derived.username;
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

  invalidateUserRow(env, userId);
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

  invalidateUserRow(env, userId);

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

function messageDataDeleteStatement(
  userId,
  messageId,
  env
) {
  return env.TG_BOT_DB.prepare(
    'DELETE FROM messages ' +
    'WHERE user_id = ? AND message_id = ?'
  ).bind(String(userId), String(messageId));
}

async function dbMessageDataDelete(
  userId,
  messageId,
  env
) {
  await messageDataDeleteStatement(
    userId,
    messageId,
    env
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

function parseAuthorizedAdmins(raw) {
  const list = safeJsonParse(raw, []);

  if (!Array.isArray(list)) {
    return [];
  }

  return list
    .map((value) => String(value).trim())
    .filter((value) => /^\d+$/.test(value));
}

async function getAuthorizedAdmins(env) {
  return parseAuthorizedAdmins(
    await getConfig('authorized_admins', env, '[]')
  );
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

// 已编译正则缓存：关键词/自动回复规则在每条消息上都要
// 匹配，此前逐条消息重新编译全部规则。mergeRegexFlags
// 已禁 g/y，test() 无状态，缓存实例可安全共享。
const regexRuleCache = new Map();

function buildRegexRule(
  pattern,
  defaultFlags = 'i'
) {
  const cacheKey =
    String(defaultFlags) + '\n' + String(pattern || '');

  if (regexRuleCache.has(cacheKey)) {
    return regexRuleCache.get(cacheKey);
  }

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

  const compiled = new RegExp(source, flags);

  if (regexRuleCache.size >= 300) {
    regexRuleCache.clear();
  }

  regexRuleCache.set(cacheKey, compiled);

  return compiled;
}

function validateRegexPattern(pattern) {
  buildRegexRule(pattern);
}

// 名单类配置（屏蔽关键词 / 自动回复）的严格解析
// （第十轮审计）：safeJsonParse 把坏 JSON 静默吞成
// 空名单——名单一旦写坏，关键词屏蔽与自动回复就
// 无声全关、管理员毫无察觉。这里把「解析失败 /
// 形状不是数组」与「本来就是空名单」区分开：坏值
// 仍按空名单执行（编不出规则），但由读取口留痕
// 并节流告警主管理员，不再无声失效。
function parseJsonArrayOrNull(raw) {
  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function alertAdminsCorruptConfigList(
  env,
  key,
  label
) {
  try {
    const last = Number(
      (await dbConfigGet(
        `alertat:listcorrupt:${key}`,
        env
      )) || 0
    );

    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(
      `alertat:listcorrupt:${key}`,
      String(Date.now()),
      env
    );

    await notifyPrimaryAdmins(
      env,
      `⚠️ 配置损坏：${label}（${key}）的内容无法` +
      '解析，相关功能已暂时失效。请在网页管理台' +
      '重新保存该名单以修复。'
    );
  } catch (error) {
    console.error(
      '发送名单损坏告警失败：',
      error?.message || error
    );
  }
}

function parseAutoReplyRules(raw) {
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

async function getAutoReplyRules(env) {
  const raw = await getConfig(
    'keyword_responses',
    env,
    '[]'
  );

  if (parseJsonArrayOrNull(raw) === null) {
    console.error(
      '自动回复名单配置损坏，按空名单处理'
    );

    await alertAdminsCorruptConfigList(
      env,
      'keyword_responses',
      '自动回复名单'
    );

    return [];
  }

  return parseAutoReplyRules(raw);
}

function parseBlockKeywords(raw) {
  const keywords = safeJsonParse(raw, []);

  return Array.isArray(keywords)
    ? keywords.map(String)
    : [];
}

async function getBlockKeywords(env) {
  const raw = await getConfig(
    'block_keywords',
    env,
    '[]'
  );

  if (parseJsonArrayOrNull(raw) === null) {
    console.error(
      '屏蔽关键词名单配置损坏，按空名单处理'
    );

    await alertAdminsCorruptConfigList(
      env,
      'block_keywords',
      '屏蔽关键词名单'
    );

    return [];
  }

  return parseBlockKeywords(raw);
}

function parseBlockThreshold(raw) {
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

async function getBlockThreshold(env) {
  return parseBlockThreshold(
    await getConfig('block_threshold', env, '5')
  );
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
  // 八个开关与两句过滤拒绝文案一次 IN 查询读回（此前逐个 getConfig 是 8 次往返，
  // 且在每条访客消息的热路径上）。读失败时全部按默认开启
  // 处理，与转发热路径「读失败不丢消息」的口径一致。
  const keys = [
    'enable_image_forwarding',
    'enable_link_forwarding',
    'enable_text_forwarding',
    'enable_audio_forwarding',
    'enable_sticker_forwarding',
    'enable_user_forwarding',
    'enable_group_forwarding',
    'enable_channel_forwarding',
    'filter_send_text',
    'filter_forward_text'
  ];

  const stored = {};

  try {
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
      'WHERE key IN (' +
      keys.map(() => '?').join(', ') +
      ')'
    )
      .bind(...keys)
      .all();

    for (const row of result?.results || []) {
      stored[String(row.key)] = row.value;
    }
  } catch (error) {
    console.error(
      '读取类型过滤配置失败（按默认开启处理）：',
      error?.message || error
    );
  }

  return buildFilterConfig(stored);
}

function buildFilterConfig(stored) {
  const pick = (key) =>
    stored[key] !== undefined
      ? stored[key]
      : (DEFAULTS[key] !== undefined
          ? DEFAULTS[key]
          : 'true');

  // 过滤拒绝文案与 textConfig 同口径：未存、存空都
  // 回退默认值（带外写空不能让拒绝提示变成空句）。
  const pickText = (key) => {
    const v = stored[key];

    return v === undefined || v === ''
      ? DEFAULTS[key]
      : v;
  };

  return {
    media: toBoolText(pick('enable_image_forwarding')),
    link: toBoolText(pick('enable_link_forwarding')),
    text: toBoolText(pick('enable_text_forwarding')),
    audio_voice: toBoolText(
      pick('enable_audio_forwarding')
    ),
    sticker_gif: toBoolText(
      pick('enable_sticker_forwarding')
    ),
    user_forward: toBoolText(
      pick('enable_user_forwarding')
    ),
    group_forward: toBoolText(
      pick('enable_group_forwarding')
    ),
    channel_forward: toBoolText(
      pick('enable_channel_forwarding')
    ),
    send_text: pickText('filter_send_text'),
    forward_text: pickText('filter_forward_text')
  };
}

async function checkForwardFilters(message, env) {
  const filters = await getFilterConfig(env);
  const kind = detectMessageKind(message);
  const forwardType = getForwardType(message);

  if (kind === 'media' && !filters.media) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.send_text,
        { type: '图片、视频或文件' }
      )
    };
  }

  if (
    kind === 'audio_voice' &&
    !filters.audio_voice
  ) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.send_text,
        { type: '语音或音频' }
      )
    };
  }

  if (
    kind === 'sticker_gif' &&
    !filters.sticker_gif
  ) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.send_text,
        { type: '贴纸或 GIF' }
      )
    };
  }

  if (kind === 'text' && !filters.text) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.send_text,
        { type: '文本' }
      )
    };
  }

  if (hasLinks(message) && !filters.link) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.send_text,
        { type: '链接' }
      )
    };
  }

  if (
    forwardType === 'user' &&
    !filters.user_forward
  ) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.forward_text,
        { source: '访客' }
      )
    };
  }

  if (
    forwardType === 'group' &&
    !filters.group_forward
  ) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.forward_text,
        { source: '群组' }
      )
    };
  }

  if (
    forwardType === 'channel' &&
    !filters.channel_forward
  ) {
    return {
      ok: false,
      reason: fillTextTemplate(
        filters.forward_text,
        { source: '频道' }
      )
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*                             访客资料卡与话题                                  */
/* -------------------------------------------------------------------------- */

function buildUserInfoPayload(
  from,
  firstMessageDate = null,
  adminNote = '',
  titleStyle = 'note_first',
  displayTz = DEFAULT_DISPLAY_TZ
) {
  const userId = String(from.id);
  const firstName = from.first_name || '';
  const lastName = from.last_name || '';

  const displayName = (
    `${firstName}` +
    `${lastName ? ` ${lastName}` : ''}`
  ).trim() || '未知访客';

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

  // 按码点截断：普通 slice 按 UTF-16 码元切，可能把 emoji
  // 从代理对中间切开、留下孤代理字符。
  const trimByCodePoints = (text, max) => {
    const chars = Array.from(text);

    return chars.length > max
      ? chars.slice(0, max).join('')
      : text;
  };

  const noteTitle =
    Array.from(noteTitleLine).length > 40
      ? `${trimByCodePoints(noteTitleLine, 40)}…`
      : noteTitleLine;

  // 带 ID 的样式先拼正文、再给尾部「 (ID)」留位截断：
  // 整体一刀切会把长名字访客的 ID 切掉（甚至切出半个括号），
  // 话题就失去了最可靠的身份锚点。
  const idSuffix = ` (${userId})`;

  const topicBody =
    titleStyle === 'no_note'
      ? `${displayName}`
      : titleStyle === 'name_first'
        ? noteTitle
          ? `${displayName}｜${noteTitle}`
          : `${displayName}`
        : noteTitle
          ? `${noteTitle}｜${displayName}`
          : `${displayName}`;

  const topicName =
    titleStyle === 'no_id'
      ? trimByCodePoints(topicBody, 128)
      : trimByCodePoints(
          topicBody,
          128 - Array.from(idSuffix).length
        ) + idSuffix;

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
        formatTimestamp(firstMessageDate, displayTz)
      )}</code>`
    : '';

  const noteText = adminNote
    ? `\n<b>备注:</b> ${escapeHtml(adminNote)}`
    : '';

  const infoCard = `
👤 <b>访客资料卡</b>
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
  usernameRaw = '',
  isTrusted = false,
  isExempt = false
) {
  const rows = [
    [
      {
        text: isBlocked
          ? '✅ 解除屏蔽'
          : '🚫 屏蔽访客',
        callback_data:
          `${isBlocked ? 'unblock' : 'block'}:` +
          `${userId}`
      }
    ],
    [
      {
        text: '🔄 刷新资料卡',
        callback_data:
          `refresh_card:${userId}`
      }
    ]
  ];

  // 信任与放行已合并为一个开关：存量里任一标记为真
  // 都按「已信任」呈现，卡上只留信任一个按钮
  // （写入时两标记同动，见 trust 回调与列表 trust 动作）。
  const trustOn = isTrusted || isExempt;

  rows.push([
    {
      text: trustOn
        ? '↩️ 取消信任'
        : '🤝 设为信任',
      callback_data:
        `${trustOn ? 'untrust' : 'trust'}:` +
        `${userId}`
    }
  ]);

  const profileUrl =
    getProfileUrl(usernameRaw);

  /*
   * 只有访客具有有效公开用户名时，
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
    user.admin_note || '',
    await getConfig('topic_title_style', env, 'note_first'),
    await getDisplayTimeZone(env)
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
          payload.usernameRaw,
          user.is_trusted,
          user.relay_exempt
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
    env,
    { touchActivity: false }
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
            user.user_info?.name || '未知访客',
          username:
            user.user_info?.username_raw || ''
        },
        null,
        user.admin_note || '',
        await getConfig(
          'topic_title_style',
          env,
          'note_first'
        ),
        await getDisplayTimeZone(env)
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
    user.admin_note || '',
    await getConfig('topic_title_style', env, 'note_first'),
    await getDisplayTimeZone(env)
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
        payload.usernameRaw,
        user.is_trusted,
        user.relay_exempt
      )
    }
  );

  // 卡片已经发出：写回失败先原地重试写库，不要让外层
  // 兜底重发一张新卡（孤儿卡没有记录、永远收不回来）。
  let writeError = null;

  for (let w = 0; w < 3; w += 1) {
    try {
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
        env,
        { touchActivity: false }
      );

      writeError = null;

      break;
    } catch (error) {
      writeError = error;

      if (w < 2) {
        await sleep(300);
      }
    }
  }

  if (writeError) {
    throw writeError;
  }

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
    // 每轮重试先重读记录（见循环开头）：上一轮若已写回
    // info_card_message_id（写回成功、错出在更后面），
    // 直接视为成功、不再重发新卡。残余窗口：sendMessage
    // 在 Telegram 侧已执行、但响应在网络层丢失时，本端
    // 没拿到消息号、记录无从写回，重读也查不到——无从
    // 查询「刚才那次发送到底落没落」，属平台级不可全防，
    // 接受为已知残余风险（最多多出一张无记录的孤儿卡，
    // 其按钮仍可正常使用）。
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
          `创建资料卡失败（${attempt}/3），访客 ${userId}：`,
          error?.message || error
        );

        if (attempt < 3) {
          await sleep(attempt * 500);
        }
      }
    }

    console.error(
      `访客 ${userId} 的资料卡创建失败：`,
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
    `访客 ${normalizedUserId}`;

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
    env,
    { touchActivity: false }
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
      env,
      { touchActivity: false }
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
        `旧资料卡不存在或无法删除，访客 ${normalizedUserId}：`,
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

  invalidateUserRow(env, userId);

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
      '访客话题正在创建，请稍后重试'
    );
  }

  try {
    const payload = buildUserInfoPayload(
      message.from,
      message.date,
      '',
      await getConfig('topic_title_style', env, 'note_first'),
      await getDisplayTimeZone(env)
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
  ).trim() || '未知访客';

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
  counterpartId,
  includeQuote = true
) {
  const replyParameters = {
    message_id: Number(counterpartId),
    allow_sending_without_reply: true
  };

  // includeQuote=false 时剥掉 quote：编辑回退的锚点是被
  // 编辑消息自己的副本，与源消息自带的 quote 不是同一
  // 条消息，带上会语义错位（中继路径默认带 quote 不变）。
  const quote = includeQuote
    ? message?.quote
    : null;

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
    // 网络类错误没有 errorCode：请求结果未知（可能已送达），
    // 不再降级重发，避免同一条消息出现两份。
    if (!firstError?.errorCode) {
      throw firstError;
    }

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
    } catch (secondError) {
      if (!secondError?.errorCode) {
        throw secondError;
      }

      return telegramApi(
        token,
        'copyMessage',
        params
      );
    }
  }
}

// 特殊消息类型名映射（集中定义）：这些类型机器人没有
// 专门处理，本体复制失败时改在话题里落占位卡。
const SPECIAL_MESSAGE_TYPE_NAMES = [
  ['poll', '投票'],
  ['location', '位置'],
  ['venue', '地点'],
  ['game', '游戏'],
  ['invoice', '发票'],
  ['contact', '联系人名片'],
  ['dice', '骰子动画']
];

// 命中返回类型名：先看源消息类型字段，再看失败错误是
// 否指向受保护内容（来源聊天禁止转发 / 保存）。普通类
// 型的一般失败不在此列，仍走原转发失败提醒。
function unsupportedTypeName(message, error) {
  for (const [
    field,
    name
  ] of SPECIAL_MESSAGE_TYPE_NAMES) {
    if (message?.[field]) {
      return name;
    }
  }

  const text = String(
    error?.message || error || ''
  ).toLowerCase();

  if (
    text.includes('protected') ||
    text.includes('forwards_restricted') ||
    text.includes('forwards restricted')
  ) {
    return '受保护内容';
  }

  return null;
}

const UNSUPPORTED_NOTICE_MIN_MS = 10 * 60 * 1000;

// 无法转达时给访客一句交代，免得访客以为已送达、管理员
// 那边却只有占位卡：10 分钟节流，独立键 unsupported:
// <uid>，与转发失败提醒的 copyfail: 节流互不影响。
async function notifyVisitorUnsupported(message, env) {
  try {
    const userId = String(message.from.id);
    const throttleKey = `unsupported:${userId}`;
    const last = Number(
      (await dbConfigGet(throttleKey, env)) || 0
    );

    if (
      Date.now() - last <
      UNSUPPORTED_NOTICE_MIN_MS
    ) {
      return;
    }

    await dbConfigPut(
      throttleKey,
      String(Date.now()),
      env
    );

    await telegramApi(env.BOT_TOKEN, 'sendMessage', {
      chat_id: message.chat.id,
      text: await textConfig('unsupported_notice_text', env),
      reply_markup: SYS_TAG_MARKUP
    });
  } catch (_) {
    /* 提示失败不影响主流程 */
  }
}

// 占位卡的内容摘要：本体复制失败不等于内容不可见——
// update 里本来就带着投票问题与选项、位置经纬度、名片
// 姓名电话等明文字段，用文字转述给管理员，免得只剩一
// 个类型标签、两边认知对不上。纯文本拼装（不依赖
// parse_mode），字段缺失整项跳过；测验题绝不输出正确
// 答案（那等于泄题），只标注「测验题」。
const ZERO_DECIMAL_CURRENCIES = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'PYG', 'UGX', 'ISK',
  'XAF', 'XOF', 'XPF'
]);

function truncateForSummary(text, max) {
  const chars = [...String(text ?? '')];

  if (chars.length <= max) {
    return chars.join('');
  }

  return chars.slice(0, max).join('') + '…';
}

function buildUnsupportedSummary(message) {
  try {
    const lines = [];

    if (message?.poll) {
      const poll = message.poll;

      if (poll.question) {
        lines.push(
          `问题：${truncateForSummary(poll.question, 300)}`
        );
      }

      const options = Array.isArray(poll.options)
        ? poll.options
        : [];

      for (const option of options.slice(0, 10)) {
        if (option?.text) {
          lines.push(
            `· ${truncateForSummary(option.text, 100)}`
          );
        }
      }

      const marks = [];

      if (
        poll.type === 'quiz' ||
        poll.correct_option_id != null
      ) {
        marks.push('测验题');
      }

      if (poll.allows_multiple_answers) {
        marks.push('可多选');
      }

      if (marks.length) {
        lines.push(`（${marks.join('、')}）`);
      }
    } else if (message?.location) {
      const loc = message.location;

      if (loc.latitude != null && loc.longitude != null) {
        lines.push(
          `经纬度：${loc.latitude}, ${loc.longitude}`
        );
        lines.push(
          '地图：https://www.google.com/maps?q=' +
          `${loc.latitude},${loc.longitude}`
        );
      }

      if (loc.live_period) {
        const seconds = Number(loc.live_period);

        lines.push(
          '实时位置，约 ' +
          (seconds >= 60
            ? `${Math.round(seconds / 60)} 分钟`
            : `${seconds} 秒`)
        );
      }
    } else if (message?.venue) {
      const venue = message.venue;

      if (venue.title) {
        lines.push(
          `地点：${truncateForSummary(venue.title, 300)}`
        );
      }

      if (venue.address) {
        lines.push(
          `地址：${truncateForSummary(venue.address, 300)}`
        );
      }

      if (
        venue.location?.latitude != null &&
        venue.location?.longitude != null
      ) {
        lines.push(
          `经纬度：${venue.location.latitude}, ` +
          `${venue.location.longitude}`
        );
      }
    } else if (message?.contact) {
      const contact = message.contact;
      const name = [
        contact.first_name,
        contact.last_name
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (name) {
        lines.push(`姓名：${truncateForSummary(name, 300)}`);
      }

      if (contact.phone_number) {
        lines.push(`电话：${contact.phone_number}`);
      }
    } else if (message?.game) {
      const title =
        message.game.title || message.game_short_name;

      if (title) {
        lines.push(
          `游戏：${truncateForSummary(title, 300)}`
        );
      }
    } else if (message?.invoice) {
      const invoice = message.invoice;

      if (invoice.title) {
        lines.push(
          `项目：${truncateForSummary(invoice.title, 300)}`
        );
      }

      if (invoice.description) {
        lines.push(
          `说明：${truncateForSummary(invoice.description, 500)}`
        );
      }

      if (invoice.total_amount != null) {
        const amount = Number(invoice.total_amount);
        const currency = String(invoice.currency || '');

        if (
          ZERO_DECIMAL_CURRENCIES.has(
            currency.toUpperCase()
          )
        ) {
          lines.push(
            `金额：${amount} ${currency}（最小单位）`
          );
        } else {
          const major = amount / 100;

          lines.push(
            '金额：' +
            (Number.isInteger(major)
              ? String(major)
              : major.toFixed(2)) +
            (currency ? ` ${currency}` : '')
          );
        }
      }
    } else if (message?.dice) {
      lines.push(
        `${message.dice.emoji || '🎲'} 点数：` +
        `${message.dice.value ?? ''}`
      );
    }

    const summary = lines.join('\n');
    const chars = [...summary];

    if (chars.length > 1200) {
      return chars.slice(0, 1200).join('') + '…';
    }

    return summary;
  } catch (_) {
    return '';
  }
}

// 本体复制失败且属于特殊类型 / 受保护内容时，在话题里
// 落一张占位卡代替原失败提醒：管理员至少知道访客发来
// 过什么，回复占位卡照样能把话带回访客私聊。
// 与意向行的衔接：复制前落的 p: 行此刻仍是 'intent'，
// 这里用占位卡编号走同一条 fillRelayPair 回填（源行先
// 行），不留 'intent' 残行；回填失败照样抛
// PairPersistError 走重推，重推时 p: 已是数字、按已送
// 达收尾，不会重复落卡。占位卡自身的发送失败则返回
// false，调用方按原路抛错、走原转发失败提醒兜底。
async function relayUnsupportedPlaceholder(
  message,
  user,
  topicId,
  env,
  error
) {
  const typeName = unsupportedTypeName(message, error);

  if (!typeName) {
    return false;
  }

  const userId = String(message.from.id);

  let sent = null;

  try {
    sent = await telegramApi(env.BOT_TOKEN, 'sendMessage', {
      chat_id: env.ADMIN_GROUP_ID,
      message_thread_id: Number(topicId),
      text:
        `📩 访客发来一条『${typeName}』，` +
        '机器人无法转发本体。' +
        (buildUnsupportedSummary(message)
          ? `\n${buildUnsupportedSummary(message)}`
          : ''),
      disable_notification: Boolean(
        user.is_blocked
      ),
      reply_markup: SYS_TAG_MARKUP
    });
  } catch (sendError) {
    console.error(
      '发送特殊类型占位卡失败：',
      sendError?.message || sendError
    );

    return false;
  }

  if (!sent?.message_id) {
    return false;
  }

  await fillRelayPair(
    userId,
    message.message_id,
    sent.message_id,
    'p',
    env
  );

  // 与正常送达一致的收尾：消息已（以占位卡形式）送达
  // 话题，成功回执使命完成，顺手撤回。
  await clearSlotMessage(
    env,
    userId,
    'receipt_msg_id'
  );

  await notifyVisitorUnsupported(message, env);

  return true;
}

async function relayUserMessageToTopic(
  message,
  user,
  env
) {
  const userId = String(message.from.id);

  // 幂等意向行（源消息键 p:<uid>:<私聊消息id>）：更新
  // 重推时先看这一行——已墓碑（管理员 /delete 删过话题
  // 副本）静默收尾，绝不让被删内容借重推复活；已回填
  // 数字说明上次复制已达话题，只补配对与回执收尾、
  // 不再复制；'intent' 或无行才走下面的复制流程（复制
  // 前先落 'intent'，崩在复制当口时重推按未复制重走，
  // 残余重复窗口只剩「复制已达 Telegram 但回执未回」
  // 的网络含糊区）。
  const pairKey = `p:${userId}:${message.message_id}`;
  const existingPair = await readRelayPair(pairKey, env);

  if (existingPair?.text === 'gone') {
    return;
  }

  if (/^\d+$/.test(String(existingPair?.text || ''))) {
    await fillRelayPair(
      userId,
      message.message_id,
      Number(existingPair.text),
      'p',
      env
    );

    // 与正常路径一致的收尾：首条消息已送达话题，
    // 成功回执使命完成，顺手撤回。
    await clearSlotMessage(
      env,
      userId,
      'receipt_msg_id'
    );

    return;
  }

  if (!existingPair) {
    await writeRelayPairRow(
      pairKey,
      'intent',
      Math.floor(Date.now() / 1000),
      env
    );
  }

  // 获取最新访客状态，防止并发请求使用过期数据。
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
          Boolean(freshUser.is_blocked)
      },
      replyParameters
    );

    copiedMessageId =
      copyResult?.message_id || null;
  } catch (error) {
    if (isTopicClosedError(error)) {
      // 话题只是被手动关闭：重开原话题后重投一次，
      // 不把「关闭」当「失效」去新建一个话题顶替。
      // 重开或重投失败时异常自然上抛，由调用方走
      // 转发失败通知。
      await telegramApi(
        env.BOT_TOKEN,
        'reopenForumTopic',
        {
          chat_id: env.ADMIN_GROUP_ID,
          message_thread_id: Number(topicId)
        }
      );

      let reopenRetry = null;

      try {
        reopenRetry =
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
                Boolean(freshUser.is_blocked)
            },
            replyParameters
          );
      } catch (retryError) {
        if (
          await relayUnsupportedPlaceholder(
            message,
            freshUser,
            topicId,
            env,
            retryError
          )
        ) {
          return;
        }

        throw retryError;
      }

      copiedMessageId =
        reopenRetry?.message_id || null;
    } else if (!isTopicInvalidError(error)) {
      // 特殊类型 / 受保护内容：落占位卡收尾，不上抛、
      // 不走原转发失败提醒。
      if (
        await relayUnsupportedPlaceholder(
          message,
          freshUser,
          topicId,
          env,
          error
        )
      ) {
        return;
      }

      throw error;
    } else {
      console.error(
        '访客话题已失效，准备重建：',
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

      let retryCopyResult = null;

      try {
        retryCopyResult =
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
              Boolean(newestUser.is_blocked)
          },
          replyParameters
        );
      } catch (retryError) {
        if (
          await relayUnsupportedPlaceholder(
            message,
            newestUser,
            newTopicId,
            env,
            retryError
          )
        ) {
          return;
        }

        throw retryError;
      }

      copiedMessageId =
        retryCopyResult?.message_id ||
        null;

      topicId = newTopicId;
    }
  }

  if (copiedMessageId) {
    await fillRelayPair(
      userId,
      message.message_id,
      copiedMessageId,
      'p',
      env
    );
  }

  if (copiedMessageId) {
    // 首条正经消息已送达话题，成功回执/状态通知使命完成，顺手撤回。
    await clearSlotMessage(
      env,
      userId,
      'receipt_msg_id'
    );
    await clearTrackedStartMessage(env, userId);
    await clearRestoredPauseCard(env, userId);
  }

}

async function relayAdminMessageToUser(
  message,
  userId,
  env
) {
  // 幂等意向行（源消息键 t:<话题消息id>）：更新重推时
  // 先看这一行——已墓碑（该话题消息已被 /delete 处理）
  // 静默收尾；已回填 <uid>:<私聊消息id> 说明上次复制
  // 已达访客私聊，只补配对、不再复制；'intent' 或无行
  // 才走下面的复制流程（复制前先落 'intent'）。
  const pairKey = `t:${message.message_id}`;
  const existingPair = await readRelayPair(pairKey, env);

  if (existingPair?.text === 'gone') {
    return null;
  }

  const existingMatch = String(
    existingPair?.text || ''
  ).match(/^(\d+):(\d+)$/);

  if (
    existingMatch &&
    existingMatch[1] === String(userId)
  ) {
    await fillRelayPair(
      userId,
      Number(existingMatch[2]),
      message.message_id,
      't',
      env
    );

    return {
      message_id: Number(existingMatch[2])
    };
  }

  if (!existingPair) {
    await writeRelayPairRow(
      pairKey,
      'intent',
      Math.floor(Date.now() / 1000),
      env
    );
  }

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
    await fillRelayPair(
      userId,
      copyResult.message_id,
      message.message_id,
      't',
      env
    );
  }

  return copyResult;
}

/* -------------------------------------------------------------------------- */
/*                      消息反应同步（改版新增）                               */
/* -------------------------------------------------------------------------- */

const REACTION_MAP_USER = 'rxmap';

// 已编辑标记（原生一致式）：编辑同步成功后，直接在被改
// 的副本下方附一颗「✍🏼已编辑」内联按钮——与 Telegram
// 普通聊天的编辑一样静默，不再另发独立提示行。按钮纯
// 作标记，hint:info 回调只空应答（分支在管理员校验前）。
const EDIT_MARK_BUTTON_TEXT = '✍🏼已编辑';
const EDIT_MARK_MARKUP = {
  inline_keyboard: [
    [
      {
        text: EDIT_MARK_BUTTON_TEXT,
        callback_data: 'hint:info'
      }
    ]
  ]
};

// 系统提示标签：系统自动发出的消息若本身不带内联
// 按钮，统一附一颗「系统提示」标签钮，让访客/管理员
// 一眼分清这是系统自动回复而非真人打字。按钮纯作
// 标记，与已编辑标记共用 hint:info 回调（只空应答）。
const SYS_TAG_BUTTON_TEXT = '系统提示';
const SYS_TAG_MARKUP = {
  inline_keyboard: [
    [
      {
        text: SYS_TAG_BUTTON_TEXT,
        callback_data: 'hint:info'
      }
    ]
  ]
};

// 配对持久化失败标记：复制已成功但配对没落库（或复制前
// 读/写意向行失败）时抛出。两个中继调用方不得把它按
// 「转发失败」吞掉——必须让整条更新走失败重推，靠意向
// 行在重推时补齐配对、跳过复制，避免对侧出现两份副本。
function pairPersistError(cause) {
  const error = new Error(
    '保存消息配对失败：' +
    (cause?.message || cause || '')
  );

  error.name = 'PairPersistError';

  return error;
}

async function readRelayPair(pairKey, env) {
  try {
    return await dbMessageDataGet(
      REACTION_MAP_USER,
      pairKey,
      env
    );
  } catch (error) {
    throw pairPersistError(error);
  }
}

async function writeRelayPairRow(
  pairKey,
  value,
  date,
  env
) {
  try {
    await dbMessageDataPut(
      REACTION_MAP_USER,
      pairKey,
      { text: String(value), date },
      env
    );
  } catch (error) {
    throw pairPersistError(error);
  }
}

// 复制成功后的配对回填：先写源方向一行（重推时靠它判定
// 已复制、跳过复制），再补反方向一行。两行都是幂等
// upsert，重推时整段重跑即可补齐缺行；任一写失败抛
// PairPersistError 让整条更新走失败重推。sourceKey 是
// 源消息所在侧的键前缀：访客→话题为 'p'，话题→访客
// 为 't'。
async function fillRelayPair(
  userId,
  privateMessageId,
  topicMessageId,
  sourceKey,
  env
) {
  const now =
    Math.floor(Date.now() / 1000);

  const pKey = `p:${userId}:${privateMessageId}`;
  const tKey = `t:${topicMessageId}`;
  const pValue = String(topicMessageId);
  const tValue = `${userId}:${privateMessageId}`;

  if (sourceKey === 't') {
    await writeRelayPairRow(tKey, tValue, now, env);
    await writeRelayPairRow(pKey, pValue, now, env);
  } else {
    await writeRelayPairRow(pKey, pValue, now, env);
    await writeRelayPairRow(tKey, tValue, now, env);
  }
}

// 已编辑标记为写死特性（-v151b14 起）：编辑同步成功即
// 无条件附标记，不再有方向开关与门控函数；三键的存量
// 配置行由清扫链 sweepRetiredMarkConfigKeys 删净。

// 存量迁移：旧模型把独立提示行的消息号记在 rxmap 的
// hint:p:<uid>:<mid> / hint:t:<topicMid> 键上。新模型
// 不再发提示行；某配对下一次编辑同步成功时，顺手把
// 那条旧提示删掉并清记账（至多一次性 +1 子请求/配
// 对），之后不再产生任何提示记账。删除失败按错误分
// 级：终局错误（消息早已被手动删掉等明确拒绝）照样
// 清记账——留着只会让每次编辑都重复尝试删除一个不
// 存在的消息号；瞬时错误（限流、网络抖动）不清记
// 账，留待该配对下一次编辑时重试，免得一次抖动就
// 把旧提示行永久孤儿化。
async function cleanupLegacyEditHint(
  env,
  { chatId, hintKey }
) {
  const oldHint = await dbMessageDataGet(
    REACTION_MAP_USER,
    hintKey,
    env
  );

  if (!oldHint?.text) {
    return;
  }

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
      '删除存量编辑提示失败：',
      error?.message || error
    );

    if (isTransientTelegramError(error)) {
      return;
    }
  }

  await dbMessageDataDelete(
    REACTION_MAP_USER,
    hintKey,
    env
  );
}

async function tombstoneTopicMessage(
  topicMessageId,
  env
) {
  // 管理员用 /delete 删掉话题侧消息后调用：把该消息的同步
  // 映射标记为 gone 并清掉路由行与提示，之后对它的编辑/反应
  // 一律静默丢弃，防止被删内容借回退消息重新出现。
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

        // 两行墓碑一次 batch 写完：分开写时第二写失败
        // 会留下半边墓碑，
        // 已删消息的编辑会走回退路径借回退消息「复活」。
        await env.TG_BOT_DB.batch([
          messageDataPutStatement(
            REACTION_MAP_USER,
            `t:${topicMessageId}`,
            { text: 'gone', date: now },
            env
          ),

          messageDataPutStatement(
            REACTION_MAP_USER,
            `p:${userId}:${privateMessageId}`,
            { text: 'gone', date: now },
            env
          )
        ]);

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

  // 剧透遮罩随媒体一并带过去：editMessageMedia 缺省无剧透，
  // 不带就会把原本遮住的图片/视频直接显露。
  const spoiler = source.has_spoiler
    ? { has_spoiler: true }
    : {};

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
      ...extra,
      ...spoiler
    };
  }

  if (source.video) {
    return {
      type: 'video',
      media: source.video.file_id,
      ...extra,
      ...spoiler
    };
  }

  if (source.animation) {
    return {
      type: 'animation',
      media: source.animation.file_id,
      ...extra,
      ...spoiler
    };
  }

  if (source.document) {
    return {
      type: 'document',
      media: source.document.file_id,
      ...extra,
      ...spoiler
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

// 带标记的编辑调用：首选把「✍🏼已编辑」按钮随编辑本
// 体一次带过去（零额外子请求）。若 Telegram 以明确的
// 终局错误（带 errorCode、非瞬时——如个别消息类型不
// 许挂按钮栏）拒掉带标记的调用，则无标记重发一次保
// 住编辑本体，再单独补挂一次标记；补挂失败静默吞
// 掉——编辑同步的结果不受标记成败影响，也绝不回退
// 发提示行。瞬时错误（网络 / 429 / 5xx）与「未修改」
// 不重试，原样抛给调用方走既有口径。
async function callEditWithMark(
  env,
  method,
  params,
  markEdited
) {
  if (!markEdited) {
    return telegramApi(env.BOT_TOKEN, method, params);
  }

  try {
    return await telegramApi(env.BOT_TOKEN, method, {
      ...params,
      reply_markup: EDIT_MARK_MARKUP
    });
  } catch (error) {
    if (
      isNotModifiedError(error) ||
      isTransientTelegramError(error) ||
      !Number(error?.errorCode || 0)
    ) {
      throw error;
    }

    const result = await telegramApi(
      env.BOT_TOKEN,
      method,
      params
    );

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'editMessageReplyMarkup',
        {
          chat_id: params.chat_id,
          message_id: params.message_id,
          reply_markup: EDIT_MARK_MARKUP
        }
      );
    } catch (markError) {
      if (!isNotModifiedError(markError)) {
        console.warn(
          '附已编辑标记失败（已忽略）：',
          markError?.message || markError
        );
      }
    }

    return result;
  }
}

// 可同步编辑的内容形状：有文本、或有说明文字、或是可
// 替换媒体（photo/video/animation/document/audio）——
// 与 tryEditCounterpartMessage 能处理的三条路径同集。
// 三者皆无的消息（如清单 checklist 的勾选编辑、无说
// 明的付费媒体编辑）原地同步无从下手：这类编辑绝不
// 许落方案 B 发占位回退（第十轮审计·中18），否则话
// 题/私聊里会多出一条占位文案 +「✍🏼已编辑」的假提
// 示、而对侧副本状态纹丝不动，双侧就此分叉。
function hasSyncableEditedContent(source) {
  return Boolean(
    source.text ||
    source.caption !== undefined ||
    buildEditedMedia(source)
  );
}

async function tryEditCounterpartMessage(
  env,
  targetChatId,
  targetMessageId,
  source,
  markEdited
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

      await callEditWithMark(
        env,
        'editMessageText',
        params,
        markEdited
      );

      return true;
    }

    const media = buildEditedMedia(source);

    if (media) {
      try {
        await callEditWithMark(
          env,
          'editMessageMedia',
          {
            chat_id: chatId,
            message_id: messageId,
            media
          },
          markEdited
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

      await callEditWithMark(
        env,
        'editMessageCaption',
        params,
        markEdited
      );

      return true;
    }

    return false;
  } catch (error) {
    if (isNotModifiedError(error)) {
      return true;
    }

    console.warn(
      '原地编辑对应消息失败，改用回退消息：',
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

  if (!chat) {
    return;
  }

  if (
    (await getConfig(
      'reaction_sync_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  // 匿名管理员（以群/频道身份）的反应没有普通 user：
  // user 是 GroupAnonymousBot（1087968824）或带
  // actor_chat。在管理群里按管理员侧处理。
  const isAnonymousAdminReaction =
    Boolean(reaction?.actor_chat) ||
    Number(reactor?.id || 0) === 1087968824;

  if (!reactor && !isAnonymousAdminReaction) {
    return;
  }

  // 忽略机器人账号的反应：镜像动作本身会产生反应更新，
  // 不过滤会来回打转；其他机器人的反应也不转发。
  // （匿名管理员的 GroupAnonymousBot 除外，见上。）
  if (reactor?.is_bot && !isAnonymousAdminReaction) {
    return;
  }

  const emojis =
    extractEmojiReactions(
      reaction.new_reaction
    );

  // 新反应里只有付费 emoji（⭐）时机器人没法镜像：
  // 付费反应是叠加在普通反应之上的，整体跳过，
  // 不要把之前镜像好的普通反应误清掉。（自定义 emoji
  // 与普通 emoji 同槽替换，仍按镜像普通子集的老口径。）
  const rawNewReactions = Array.isArray(
    reaction.new_reaction
  )
    ? reaction.new_reaction
    : [];

  if (
    rawNewReactions.length &&
    !emojis.length &&
    rawNewReactions.every(
      (item) => item?.type === 'paid'
    )
  ) {
    return;
  }

  if (chat.type === 'private') {
    const userId = String(chat.id);

    if (!reactor || String(reactor.id) !== userId) {
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

    const reactorUser = await dbUserGet(userId, env);

    if (
      !reactorUser ||
      Number(reactorUser.is_blocked || 0) === 1 ||
      reactorUser.user_state !== USER_STATE.VERIFIED
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
    if (!isAnonymousAdminReaction) {
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
    const sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      params
    );

    return sent?.message_id || 0;
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
      return messageId;
    }

    if (
      errorText.includes(
        'message to edit not found'
      ) ||
      errorText.includes(
        "message can't be edited"
      )
    ) {
      const sent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        params
      );

      return sent?.message_id || 0;
    }

    throw error;
  }

  return messageId;
}

// 主菜单追踪记录的保鲜期：超过后记录里的消息号已过
// Telegram 的 48 小时删除窗口，读时作废、清扫时整行删除。
const MENU_TRACK_TTL_MS = 48 * 60 * 60 * 1000;

async function showMainMenu(
  chatId,
  env,
  messageId = 0,
  triggerMessageId = 0,
  origin = ''
) {
  const updateCache =
    await readUpdateCache(env);

  const updateState =
    describeUpdateState(
      updateCache,
      await getDisplayTimeZone(env)
    );

  const versionLine =
    updateState.status === 'update' &&
    updateCache?.url
      ? `当前版本：${BOT_VERSION}｜🆕 <a href="${escapeHtml(updateCache.url)}">有新版本 ${escapeHtml(updateCache.tag)}</a>`
      : `当前版本：${BOT_VERSION}`;

  const pauseState = await getPauseState(env);

  const pauseLine = pauseState
    ? `\n⏸ <b>服务熔断中</b>，${describePauseRemaining(pauseState)}\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`
    : '';

  const text = `
⚙️ <b>机器人主菜单</b>
${versionLine}${pauseLine}
  `.trim();

  const keyboard = [];

  const menuButtons = {
    panel:
      (await getConfig('menu_btn_panel', env, 'true')) ===
      'true',
    list:
      (await getConfig('menu_btn_list', env, 'true')) ===
      'true',
    guide:
      (await getConfig('menu_btn_guide', env, 'true')) ===
      'true',
    updchk:
      (await getConfig('menu_btn_updchk', env, 'true')) ===
      'true',
    pause:
      (await getConfig('menu_btn_pause', env, 'true')) ===
      'true'
  };

  const listOrigin = getPublicOrigin(
    origin,
    env
  );

  if (listOrigin) {
    if (menuButtons.panel) keyboard.push([
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

    if (menuButtons.list) keyboard.push([
      {
        text: '📋 访客列表',
        web_app: {
          url: await buildUserListUrl(
            listOrigin,
            chatId,
            env
          )
        }
      }
    ]);

    if (menuButtons.guide) keyboard.push([
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

  if (menuButtons.updchk) keyboard.push([
    {
      text: '🔄 检查更新',
      callback_data: 'updchk:check'
    }
  ]);

  if (menuButtons.pause && pauseState) {
    keyboard.push([
      {
        text: '▶️ 恢复服务',
        callback_data: 'pause:resume'
      }
    ]);
  } else if (menuButtons.pause) {
    keyboard.push([
      {
        text: '⏸ 服务熔断',
        callback_data: 'pause:menu'
      }
    ]);
  }

  // 五个按钮全部关掉时键盘为空：整条菜单只剩正文，
  // 成了一条无按钮的系统消息——按系统提示口径附标
  // 签钮（第十轮审计·低：此前无钮也无牌）；有按钮
  // 时菜单自带按钮、不附，与十类豁免同口径。
  const reply_markup = keyboard.length
    ? { inline_keyboard: keyboard }
    : SYS_TAG_MARKUP;

  const menuMessageId = await renderMenu(env, {
    chatId,
    messageId,
    text,
    reply_markup
  });

  // 主菜单只保留最新一对：删除推迟一轮——新发菜单送达后，
  // 删掉的是上一条主菜单与触发它的那条 /start 命令消息，
  // 最新的一条命令消息始终留在聊天里，点一下就能重发刷新菜单
  // （网页链接 10 分钟过期，靠它快速拿新链接）；原地编辑形态只更新追踪。
  try {
    if (menuMessageId) {
      const trackKey = `mainmenu:${chatId}`;

      let prevMenuId = 0;
      let prevCmdId = 0;
      let trackTs = 0;

      const rawTrack = await dbConfigGet(trackKey, env);

      if (rawTrack) {
        let parsedTrack = null;

        try {
          parsedTrack = JSON.parse(rawTrack);
        } catch (_) {
          parsedTrack = null;
        }

        if (typeof parsedTrack === 'number') {
          // 旧格式：纯数字只记了菜单编号。注意
          // JSON.parse('4242') 不抛错、直接返回数字，
          // 必须在这里单独接住（放进 catch 永远走不到）。
          prevMenuId = parsedTrack || 0;
        } else if (parsedTrack) {
          prevMenuId =
            parseInt(parsedTrack?.m || '0', 10) || 0;

          prevCmdId =
            parseInt(parsedTrack?.c || '0', 10) || 0;

          trackTs = Number(parsedTrack?.t) || 0;

          // 追踪超过保鲜期：里面的消息号已过 Telegram
          // 删除窗口、删不动了，直接作废，跳过删除尝试。
          if (
            trackTs &&
            Date.now() - trackTs > MENU_TRACK_TTL_MS
          ) {
            prevMenuId = 0;
            prevCmdId = 0;
          }
        }
      }

      if (!messageId) {
        if (prevMenuId && prevMenuId !== menuMessageId) {
          await quietDeleteMessage(env, chatId, prevMenuId);
        }

        if (prevCmdId && prevCmdId !== triggerMessageId) {
          await quietDeleteMessage(env, chatId, prevCmdId);
        }

        await dbConfigPut(
          trackKey,
          JSON.stringify({
            m: menuMessageId,
            c: triggerMessageId || 0,
            t: Date.now()
          }),
          env
        );
      } else {
        await dbConfigPut(
          trackKey,
          JSON.stringify({
            m: menuMessageId,
            c: prevCmdId,
            // 原地编辑不换消息号：时间戳保持消息号的
            // 「出生时刻」，不要按渲染时刻刷新——否则
            // 靠按钮导航的管理员命令号永远不过期、
            // 记录也永远清不掉。旧记录没戳时补一个。
            t: trackTs || Date.now()
          }),
          env
        );
      }
    }
  } catch (_) {
    // 追踪失败不影响菜单本身
  }
}

/* -------------------------------------------------------------------------- */
/*                               验证处理                                       */
/* -------------------------------------------------------------------------- */

async function handleStart(
  chatId,
  env,
  origin = ''
) {
  // 只发验证提示本身：提示之前原有一条领衔欢迎语，
  // 内容与提示重叠、徒增一条消息，已整条摘除，其
  // 专属槽位 welcome_msg_id 一并退役。welcome_msg
  // 配置本身已改定义为验证成功问候（验证成功回执的
  // 文案来源，见 welcomeMsgText），不在此处发送。
  const mode =
    await getEffectiveVerifyMode(env);

  if (mode === 'turnstile') {
    await sendTurnstilePrompt(
      chatId,
      env,
      origin
    );
  } else if (mode === 'unconfigured') {
    await sendVerifyUnconfiguredPrompt(
      chatId,
      env
    );
  } else if (mode === 'sequence') {
    await sendSequencePrompt(
      chatId,
      env,
      true
    );
  } else {
    const verificationQuestion =
      await getConfig('verif_q', env);

    if (!(await promptThrottled(env, chatId))) {
      const promptSent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: verificationQuestion,
          reply_markup: SYS_TAG_MARKUP
        }
      );

      await trackSlotMessage(
        env,
        chatId,
        'verify_prompt_msg_id',
        promptSent?.message_id
      );

      await markPromptSent(env, chatId);
    }
  }

  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.PENDING
    },
    env
  );
}

// 问答验证防爆破：连续答错达上限后锁定一段时间。
// 问答是静态共享答案，没有次数限制时可被在线穷举。

// 问答答错计数（CAS 版）：基于读到的原值条件写入，写冲突
// 就重读重试，避免并发答错互相覆盖、把有效猜测次数放大。
// 返回本次计数（达到上限时已顺带写入锁定）；并发中已被
// 其他请求锁定时返回 -1，调用方按锁定中静默处理。
async function recordQuizWrongAttempt(
  lockKey,
  initialRaw,
  initialState,
  maxAttempts,
  lockMin,
  env
) {
  let raw = initialRaw;
  let state = initialState;

  for (let casTry = 0; casTry < 5; casTry += 1) {
    if (state && Number(state.until || 0) > Date.now()) {
      return -1;
    }

    const attempts = Number(state?.n || 0) + 1;
    const locked = attempts >= maxAttempts;
    const nextValue = JSON.stringify(
      locked
        ? {
            n: 0,
            until: Date.now() + lockMin * 60 * 1000
          }
        : { n: attempts, until: 0 }
    );

    let wrote = false;

    if (raw === null || raw === undefined) {
      wrote = await dbConfigClaim(lockKey, nextValue, env);
    } else {
      wrote = await dbConfigPutIfValue(
        lockKey,
        raw,
        nextValue,
        env
      );
    }

    if (wrote) {
      return attempts;
    }

    raw = await dbConfigGet(lockKey, env);
    state = null;

    if (raw) {
      try {
        state = JSON.parse(raw);
      } catch {
        state = null;
      }
    }
  }

  // 多次冲突后兜底（fail-closed）：绝不无条件覆盖——
  // 并发刚落下的锁定行形状是 {n:0, until:未来}，旧兜底
  // 以它算出 attempts=1 并整行覆写，等于把防爆破锁
  // 定亲手解开、计数清零（第十轮审计）。先按最后读
  // 到的状态复查锁定：已锁定按锁定中处理（-1）；未
  // 锁定也只许对读到的原值条件写，写不进（或原值已
  // 消失）就放弃本次计数、按锁定中处理——宁可漏记
  // 一次答错，也不解锁他人刚落下的锁定。
  if (state && Number(state.until || 0) > Date.now()) {
    return -1;
  }

  if (raw === null || raw === undefined) {
    return -1;
  }

  const attempts = Number(state?.n || 0) + 1;
  const locked = attempts >= maxAttempts;

  const wrote = await dbConfigPutIfValue(
    lockKey,
    raw,
    JSON.stringify(
      locked
        ? {
            n: 0,
            until: Date.now() + lockMin * 60 * 1000
          }
        : { n: attempts, until: 0 }
    ),
    env
  );

  return wrote ? attempts : -1;
}

async function handleVerification(
  chatId,
  answer,
  env
) {
  const lockKey = `quizlock:${chatId}`;
  const lockRaw = await dbConfigGet(lockKey, env);

  let lockState = null;

  try {
    lockState = lockRaw ? JSON.parse(lockRaw) : null;
  } catch (_) {
    lockState = null;
  }

  // 锁定中：静默拒绝（不回复、不写库），刷屏也烧不了额度。
  if (
    lockState &&
    Number(lockState.until || 0) > Date.now()
  ) {
    return false;
  }

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
    // 参数只在答错需要计数时才读：锁定中的垃圾答案在上方已静默
    // 返回，不再为它们多付两次配置读取。
    const quizMaxAttempts = await clampedIntConfig(
      'quiz_max_attempts',
      env,
      5,
      1,
      20
    );

    const quizLockMin = await clampedIntConfig(
      'quiz_lock_min',
      env,
      30,
      1,
      1440
    );

    const attempts = await recordQuizWrongAttempt(
      lockKey,
      lockRaw,
      lockState,
      quizMaxAttempts,
      quizLockMin,
      env
    );

    if (attempts === -1) {
      return false;
    }

    if (attempts >= quizMaxAttempts) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: await quizLockText(env, quizLockMin),
            reply_markup: SYS_TAG_MARKUP
        }
      );

      return false;
    }

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: await textConfig('quiz_wrong_text', env),
        reply_markup: SYS_TAG_MARKUP
      }
    );

    return false;
  }

  // 答对后清掉计数与锁定。
  await dbConfigDelete(lockKey, env);

  // 先更新状态，再通知访客，避免访客快速发送消息时状态未保存。
  await dbUserUpdate(
    chatId,
    {
      user_state: USER_STATE.VERIFIED
    },
    env
  );

  await cleanupAfterVerified(env, chatId);

  await sendVerifySuccessReceipt(env, chatId);

  return true;
}

/* -------------------------------------------------------------------------- */
/*                            顺序点击验证（新增）                              */
/* -------------------------------------------------------------------------- */

// 顺序点击：机器人发一条带 3×3 按钮盘的消息，访客按正文给出的
// 顺序点完全部目标 emoji 即通过。题目与进度存 config 行 seq:<uid>
// （{ t: 目标序列, p: 已完成步数, e: 过期毫秒戳 }）；盘面每次渲染
// 都用同类干扰项重抽并洗牌；点错与静态问答共用同一套答错计数与
// 锁定（quizlock:<uid>、recordQuizWrongAttempt、
// quiz_max_attempts / quiz_lock_min 配置）。
const SEQ_TTL_MS = 60000;

// 类别表：每类 12 个互不相同、单码点（无变体选择符 / 组合序列）
// 的 emoji，保证类内足够抽 9 个不重复按钮。
const SEQ_EMOJI_CATEGORIES = [
  // 水果
  ['🍎', '🍌', '🍇', '🍊', '🍓', '🍉', '🍑', '🍒', '🍍', '🥝', '🍐', '🍋'],
  // 动物
  ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐸', '🐵', '🐯', '🦁', '🐷', '🐮'],
  // 食物
  ['🍔', '🍕', '🍟', '🌮', '🍩', '🍦', '🍰', '🍿', '🧀', '🥐', '🍗', '🍜'],
  // 车辆
  ['🚗', '🚕', '🚙', '🚌', '🚓', '🚑', '🚒', '🚚', '🚛', '🚲', '🚀', '🚁'],
  // 球类
  ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🏒', '🥊'],
  // 表情
  ['😀', '😁', '😂', '🤣', '😊', '😍', '😎', '😐', '😴', '😜', '🤔', '🙂']
];

function shuffleCopy(list) {
  const arr = [...list];

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }

  return arr;
}

function seqCategoryOf(emoji) {
  return (
    SEQ_EMOJI_CATEGORIES.find((cat) =>
      cat.includes(emoji)
    ) || SEQ_EMOJI_CATEGORIES[0]
  );
}

// 随机抽一个类别、4 或 5 个不重复的目标 emoji。
function newSeqTargets() {
  const cat =
    SEQ_EMOJI_CATEGORIES[
      Math.floor(
        Math.random() * SEQ_EMOJI_CATEGORIES.length
      )
    ];
  const pool = shuffleCopy(cat);
  const count = 4 + Math.floor(Math.random() * 2);

  return pool.slice(0, count);
}

// 渲染第 p 步：正文列出完整序列（已完成标 ✅）与进度 x/N；
// 盘面 = 剩余目标 + 同类干扰（不含任何目标）补足 9 个、洗牌。
// 按钮 callback_data 带当前步数 p：点对后 p 前进，
// 旧盘面按钮随之过期，连点与重放不会重复计数。
function renderSeqChallenge(state) {
  const targets = state.t;
  const done = state.p;
  const total = targets.length;
  const category = seqCategoryOf(targets[0]);
  const remaining = targets.slice(done);
  const distractors = shuffleCopy(
    category.filter((e) => !targets.includes(e))
  ).slice(0, 9 - remaining.length);
  const board = shuffleCopy([
    ...remaining,
    ...distractors
  ]);

  const seqText = targets
    .map((e, i) => (i < done ? '✅' : e))
    .join(' → ');
  const text =
    '🧩 顺序点击验证\n' +
    `请按顺序点击：${seqText}\n` +
    `进度 ${done}/${total}，请在 60 秒内点完。`;

  const keyboard = [];

  for (let r = 0; r < 3; r += 1) {
    keyboard.push(
      board.slice(r * 3, r * 3 + 3).map((e) => ({
        text: e,
        callback_data: `seq:${done}:${e}`
      }))
    );
  }

  return {
    text,
    reply_markup: { inline_keyboard: keyboard }
  };
}

// 解析顺序点击题目状态行：形状不对一律视为无题。
// 回调路径要拿原始串做 CAS，解析与读取分开。
function parseSeqState(raw) {
  if (!raw) {
    return null;
  }

  let state = null;

  try {
    state = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !state ||
    !Array.isArray(state.t) ||
    state.t.length === 0 ||
    !Number.isInteger(state.p) ||
    state.p < 0 ||
    state.p >= state.t.length ||
    !Number(state.e)
  ) {
    return null;
  }

  return state;
}

async function readSeqState(userId, env) {
  const raw = await dbConfigGet(
    `seq:${userId}`,
    env
  );

  return parseSeqState(raw);
}

// seq 状态行 CAS 写：值仍是读到的那份才写。已被并发
// 改动 → 返回 false，调用方静默收尾（对方那一路已
// 处理）；与问答计数同口径，CAS 失败而值未变时兜底
// 无条件写一次（个别存储层对条件写返回怪异时，
// 正常点击不至于失效）。
async function casSeqWrite(key, baseRaw, newRaw, env) {
  if (
    await dbConfigPutIfValue(key, baseRaw, newRaw, env)
  ) {
    return true;
  }

  const current = await dbConfigGet(key, env);

  if (current !== baseRaw) {
    return false;
  }

  await dbConfigPut(key, newRaw, env);

  return true;
}

// seq 状态行 CAS 占用（完成支）：值仍是读到的那份
// 才删；抢到的一方才跑验证成功副作用，防同一步
// 并发双发成功回执。失败回退口径同 casSeqWrite。
async function claimSeqRow(key, baseRaw, env) {
  if (
    await dbConfigDeleteIfValue(key, baseRaw, env)
  ) {
    return true;
  }

  const current = await dbConfigGet(key, env);

  if (current !== baseRaw) {
    return false;
  }

  await dbConfigDelete(key, env);

  return true;
}

// 与问答共用的锁定状态读取（quizlock:<uid>）。
async function readQuizLock(userId, env) {
  const raw = await dbConfigGet(
    `quizlock:${userId}`,
    env
  );

  let state = null;

  try {
    state = raw ? JSON.parse(raw) : null;
  } catch {
    state = null;
  }

  const locked =
    !!state &&
    Number(state.until || 0) > Date.now();

  return { raw, state, locked };
}

// 发送顺序点击题目。入口分两种：/start 链
// （viaStart=true）与待验证文字兜底（viaStart=false）。
// 出题前先看有没有活题：未过期未完成的题目直接沿用，
// 任何入口都不重发——题目由回调驱动续命，顶掉进度只会
// 让访客困惑（节流窗口 180 秒长于题目 60 秒，曾出现
// 两种错位：题过期后 /start 被节流静默不出新题；文字
// 兜底在节流过后以新题覆盖已点进度）。
// 锁定中不出新题：问答锁定期间 /start 只是重发静态题面
// 文本、作答被静默拒绝；顺序点击的题目即服务端状态，
// 无法只发题面，故锁定中只发与问答同文案的锁定提示
// （登记进槽位，解锁后访客重发 /start 即被新题替换），
// 不建 seq 行；锁定提示的节流与登记口径不变，时长报
// 剩余而非整段（见锁定分支）。
// 节流只约束文字兜底：/start 是访客被回调文案明确
// 指引的恢复动作，题死后必须立刻能拿到新题，不受
// 3 分钟节流限制；出题后照常登记 promptat。
async function sendSequencePrompt(
  chatId,
  env,
  viaStart = false
) {
  const existing = await readSeqState(chatId, env);

  if (existing && Number(existing.e) > Date.now()) {
    return;
  }

  const lock = await readQuizLock(chatId, env);

  if (lock.locked) {
    if (await promptThrottled(env, chatId)) {
      return;
    }

    const quizLockMin = await clampedIntConfig(
      'quiz_lock_min',
      env,
      30,
      1,
      1440
    );

    // 报剩余时长：until 是锁定时写下的到期戳，现成
    // 可算；缺失/已过期等异常形状回退配置全长。
    const untilMs = Number(lock.state?.until || 0);

    const remainMin =
      untilMs > Date.now()
        ? Math.max(
            1,
            Math.ceil((untilMs - Date.now()) / 60000)
          )
        : quizLockMin;

    const sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: await quizLockText(env, remainMin),
          reply_markup: SYS_TAG_MARKUP
      }
    );

    await trackSlotMessage(
      env,
      chatId,
      'verify_prompt_msg_id',
      sent?.message_id
    );

    await markPromptSent(env, chatId);

    return;
  }

  if (!viaStart && (await promptThrottled(env, chatId))) {
    return;
  }

  const state = {
    t: newSeqTargets(),
    p: 0,
    e: Date.now() + SEQ_TTL_MS
  };

  await dbConfigPut(
    `seq:${chatId}`,
    JSON.stringify(state),
    env
  );

  const view = renderSeqChallenge(state);

  const sent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: view.text,
      reply_markup: view.reply_markup
    }
  );

  await trackSlotMessage(
    env,
    chatId,
    'verify_prompt_msg_id',
    sent?.message_id
  );

  await markPromptSent(env, chatId);
}

// 把题目视图呈现到当前消息上：优先原地编辑；消息已不可编辑
// （被访客删掉等）时另发一条新题并更新槽位，状态行沿用。
// 返回是否呈现成功；编辑与补发双双失败也只返回 false、
// 不抛异常（调用方已先写好状态，抛出会让回调无应答）。
async function presentSeqView(
  userId,
  messageId,
  view,
  env
) {
  if (messageId) {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        {
          chat_id: userId,
          message_id: Number(messageId),
          text: view.text,
          reply_markup: view.reply_markup
        }
      );

      return true;
    } catch {
      /* 落到下方另发新题 */
    }
  }

  // 补发也包 try：编辑与补发双双失败时只记日志、返回
  // false，绝不让异常逃出回调处理——状态已经推进，
  // 访客可等题过期后 /start 恢复（回调层另有兜底应答）。
  try {
    const sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: view.text,
        reply_markup: view.reply_markup
      }
    );

    await trackSlotMessage(
      env,
      userId,
      'verify_prompt_msg_id',
      sent?.message_id
    );

    return true;
  } catch (error) {
    console.error(
      '呈现顺序点击题目失败：',
      error?.message || error
    );

    return false;
  }
}

async function handleSequenceCallback(
  callbackQuery,
  env
) {
  const senderId =
    String(callbackQuery.from.id);
  const data = String(callbackQuery.data || '');
  const parts = data.split(':');
  const step = Number(parts[1]);
  const emoji = parts.slice(2).join(':');
  const messageId =
    callbackQuery.message?.message_id;

  // 统一应答出口：每条回调只应答一次。整体包一层
  // try/catch（见函数尾）：盘面呈现等环节异常时也要
  // 补上应答，否则访客端按钮一直转圈到超时。
  let answered = false;

  const ans = async (text = '', showAlert = false) => {
    if (answered) {
      return;
    }

    answered = true;

    await answerCallback(
      callbackQuery.id,
      env,
      text,
      showAlert
    );
  };

  try {
    const user = await dbUserGet(senderId, env);

    // 无档案或已封禁：静默确认，不给任何反馈。
    if (!user || user.is_blocked) {
      await ans();
      return;
    }

    if (
      user.user_state === USER_STATE.VERIFIED
    ) {
      await ans('✅ 已通过验证。', true);

      return;
    }

    // 锁定中静默：与问答锁定期间提交答案的口径一致
    // （不回复内容、不计数），且锁定触发时 seq 行已删，
    // 必须先于「无题目」分支判断，否则会误报过期。
    const lock = await readQuizLock(senderId, env);

    if (lock.locked) {
      await ans();
      return;
    }

    const seqKey = `seq:${senderId}`;

    // 验证方式已被管理员切走：在途题目立即作废——按
    // 旧题答完不能绕过新方式（与通行证、重置的换代
    // 作废口径一致）。
    if (
      (await getEffectiveVerifyMode(env)) !== 'sequence'
    ) {
      await dbConfigDelete(seqKey, env);

      await ans();

      return;
    }

    // 必须点的是当前登记的那条题目消息：旧盘面的删除
    // 是尽力而为、可能残留，点到旧盘面一律静默，不拿
    // 新题状态去判旧答案（不奖不罚不计数）。
    const promptMsgId = Number(
      user.verify_prompt_msg_id || 0
    );

    if (
      !promptMsgId ||
      Number(messageId || 0) !== promptMsgId
    ) {
      await ans();

      return;
    }

    // 读状态时保留原始串：后续写回走 CAS（casSeqWrite
    // / claimSeqRow），同一步并发回调只有一路能推进。
    const raw = await dbConfigGet(seqKey, env);
    const state = parseSeqState(raw);

    if (!state || Number(state.e) <= Date.now()) {
      if (state) {
        await dbConfigDelete(seqKey, env);
      }

      await ans(
        '⌛ 这道题已过期，重新发送 /start 换一道。',
        true
      );

      return;
    }

    // 步数对不上 = 旧盘面的过期点击（已完成的那一步被连点
    // 或重放）：静默确认，不奖不罚。
    if (step !== state.p) {
      await ans();
      return;
    }

    if (emoji === state.t[state.p]) {
      const next = { ...state, p: state.p + 1 };

      if (next.p >= state.t.length) {
        // 全部点完：先 CAS 占用题目行，抢到的一方才跑
        // 验证成功副作用（与问答成功同路径——清计数、
        // 置已验证、统一收尾、发成功回执并登记回执
        // 槽位），防同一步并发双发成功回执。
        const claimed = await claimSeqRow(
          seqKey,
          raw,
          env
        );

        if (!claimed) {
          await ans();

          return;
        }

        await dbConfigDelete(
          `quizlock:${senderId}`,
          env
        );

        await dbUserUpdate(
          senderId,
          { user_state: USER_STATE.VERIFIED },
          env
        );

        await cleanupAfterVerified(env, senderId);

        await sendVerifySuccessReceipt(env, senderId);

        await ans('🎉 验证通过！');

        return;
      }

      const wrote = await casSeqWrite(
        seqKey,
        raw,
        JSON.stringify(next),
        env
      );

      if (!wrote) {
        await ans();

        return;
      }

      await presentSeqView(
        senderId,
        messageId,
        renderSeqChallenge(next),
        env
      );

      await ans(`✅ ${next.p}/${state.t.length}`);

      return;
    }

    // 点错：与问答共用答错计数（CAS）与锁定。
    const quizMaxAttempts =
      await clampedIntConfig(
        'quiz_max_attempts',
        env,
        5,
        1,
        20
      );

    const quizLockMin = await clampedIntConfig(
      'quiz_lock_min',
      env,
      30,
      1,
      1440
    );

    const attempts = await recordQuizWrongAttempt(
      `quizlock:${senderId}`,
      lock.raw,
      lock.state,
      quizMaxAttempts,
      quizLockMin,
      env
    );

    if (attempts === -1) {
      await ans();
      return;
    }

    const lockText =
      await quizLockText(env, quizLockMin);

    if (attempts >= quizMaxAttempts) {
      await dbConfigDelete(seqKey, env);

      // 题目消息原地改成锁定提示（无键盘）；编辑失败则另发
      // 一条并登记槽位，保证访客眼前留有一条锁定说明。
      let edited = false;

      if (messageId) {
        try {
          await telegramApi(
            env.BOT_TOKEN,
            'editMessageText',
            {
              chat_id: senderId,
              message_id: Number(messageId),
              text: lockText,
              reply_markup: SYS_TAG_MARKUP
            }
          );

          edited = true;
        } catch {
          edited = false;
        }
      }

      if (!edited) {
        const sent = await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: senderId,
            text: lockText,
            reply_markup: SYS_TAG_MARKUP
          }
        );

        await trackSlotMessage(
          env,
          senderId,
          'verify_prompt_msg_id',
          sent?.message_id
        );
      }

      await ans(lockText, true);

      return;
    }

    // 未锁定：整题重开（新类别、新目标、新盘面、新 60 秒），
    // 编辑当前消息呈现；点错提示复用问答的 quiz_wrong_text，
    // 并带上剩余机会。状态写走 CAS：并发已改（对方那一路
    // 已推进或已完成）时不覆盖、不重复呈现。
    const fresh = {
      t: newSeqTargets(),
      p: 0,
      e: Date.now() + SEQ_TTL_MS
    };

    const wrote = await casSeqWrite(
      seqKey,
      raw,
      JSON.stringify(fresh),
      env
    );

    if (!wrote) {
      await ans();

      return;
    }

    await presentSeqView(
      senderId,
      messageId,
      renderSeqChallenge(fresh),
      env
    );

    const wrongText = await textConfig(
      'quiz_wrong_text',
      env
    );

    await ans(
      `${wrongText}（还可尝试 ${
        quizMaxAttempts - attempts
      } 次）`.slice(0, 190),
      true
    );
  } catch (error) {
    console.error(
      '顺序点击回调处理失败：',
      error?.message || error
    );

    if (!answered) {
      await ans('⚠️ 处理失败，请重新发送 /start。', true);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                    Turnstile 小程序验证（改版新增）                          */
/* -------------------------------------------------------------------------- */

// 读侧整数配置：与写侧 validateScalarConfig 共用同一套范围口径。
// 写入口有校验，但配置也可能被带外写入坏值（负数/超大），
// 读取时一律钳回 [min, max]，坏值最多退化为边界行为、不会整类停摆。
// 一次读回整张 config 表（面板加载等批量场景用）：
// 配置表只有几十行，一次全表读替代几十次逐键点读，
// 避免串行往返叠加延迟、逼近单请求子请求上限。
async function getAllConfigMap(env) {
  const map = {};

  try {
    // 只读静态设置键（不含冒号）：pass:/ephem:/copyfail: 等
    // 按访客生成的动态键不在面板取值范围内，历史访客越多
    // 全表读越大，这里从源头排除。
    const result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
      'WHERE key NOT LIKE ?'
    )
      .bind('%:%')
      .all();

    for (const row of result?.results || []) {
      map[String(row.key)] = row.value;
    }
  } catch (error) {
    console.error('读取全部配置失败：', error?.message || error);
  }

  return map;
}

// 文案配置读取：被带外写成空串时回退默认值（getConfig 只对缺值回退）。
// 五句可配文案的写侧都强制非空，读到空串必是带外坏值，
// 直接拿去发消息会被 Telegram 以空文本拒绝、或让提醒静默消失。
async function textConfig(key, env) {
  const value = await getConfig(key, env);

  if (value === '') {
    return DEFAULTS[key] ?? value;
  }

  return value;
}

// 文案模板占位符填充：{name} 逐个字面替换；管理员
// 自定义文案里没写某个占位符时就不替换、按原文发
// 送，不报错（占位符口径写在管理台各字段的说明里）。
function fillTextTemplate(template, values) {
  let out = String(template ?? '');

  for (const [name, value] of Object.entries(values || {})) {
    out = out.split(`{${name}}`).join(String(value));
  }

  return out;
}

// 嵌入引用时剥掉对方文案自带的领头 emoji：一小段
// 消息只留一个领头 emoji 的口径下，被嵌入的文案
// （如过滤模板的输出）若自带领头 emoji，拼进带
// 前缀的句式就会双 emoji。只剥开头的第一个 emoji
// （含变体选择符 / 肤色 / ZWJ 组合）及其后的空格；
// 没有领头 emoji 时原样返回。
function stripLeadingEmoji(text) {
  return String(text ?? '').replace(
    /^\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic}(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)*\s*/u,
    ''
  );
}

// 问答 / 顺序点击共用的锁定提示：三处发送点（问答答
// 错锁定、顺序点击锁定中再进入、顺序点击点错锁定）
// 共用同一句可配文案 quiz_lock_text，{minutes} 填本
// 次锁定的分钟数。
async function quizLockText(env, minutes) {
  return fillTextTemplate(
    await textConfig('quiz_lock_text', env),
    { minutes }
  );
}

// 旧定义时代 welcome_msg 的默认领衔句：-v161b8 起
// welcome_msg 改定义为「验证成功问候」（验证成功回执
// 的文案来源），库里若还存着旧默认领衔句（长句是旧
// 版默认原文；短句是更早的默认、也是线上实际存量），
// 视为未设置——绝不能把它们当成功问候发出。
const LEGACY_WELCOME_MSGS = new Set([
  '在发消息之前，先完成人机验证，验证完成之后请等待3秒钟之后再发送消息以防发生失败！',
  '在发消息之前，先完成人机验证'
]);

// 欢迎消息（验证成功问候）的读取口：存量恰为任一旧
// 默认领衔句（原样或仅首尾空白有别）、或 trim 后为
// 空时，一律回退新默认值；其余存量（管理员自定义的
// 问候文案）原样使用。
async function welcomeMsgText(env) {
  const value = await getConfig('welcome_msg', env);

  if (!value.trim() || LEGACY_WELCOME_MSGS.has(value.trim())) {
    return DEFAULTS.welcome_msg;
  }

  return value;
}

async function clampedIntConfig(key, env, def, min, max) {
  const n = Number(await getConfig(key, env, String(def)));

  if (!Number.isFinite(n)) {
    return def;
  }

  return Math.min(max, Math.max(min, Math.trunc(n)));
}

async function verifyLinkTtlMs(env) {
  const min = await clampedIntConfig(
    'verify_link_min',
    env,
    10,
    1,
    120
  );

  return min * 60 * 1000;
}

async function passLinkTtlMs(env) {
  const min = await clampedIntConfig(
    'pass_ttl_min',
    env,
    30,
    1,
    1440
  );

  return min * 60 * 1000;
}

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

  // 顺序点击不依赖 Turnstile 密钥，独立成档。
  if (mode === 'sequence') {
    return 'sequence';
  }

  if (mode === 'quiz') {
    return 'quiz';
  }

  if (
    mode === 'turnstile' &&
    isTurnstileConfigured(env)
  ) {
    return 'turnstile';
  }

  // turnstile 未配密钥不再回退静态问答：默认问答的答案
  // 公开可抄，静默降级等于没有验证。返回 unconfigured，
  // 由消费点 fail-closed（访客看未配置提示、管理员收告警）；
  // 管理员显式选的 quiz 在上面已原样返回，不受影响。
  return 'unconfigured';
}

const VERIFY_UNCONFIGURED_TEXT =
  '⚠️ 验证服务尚未配置完成，请联系管理员。';

// 验证未配置告警：私聊全体主管理员，config 时间戳节流
// 每天至多一条（读-改-写非原子，并发下偶尔多发一条可接受）。
async function alertAdminsVerifyUnconfigured(env) {
  try {
    const last = Number(
      (await dbConfigGet(
        'alertat:unconfigured',
        env
      )) || 0
    );

    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(
      'alertat:unconfigured',
      String(Date.now()),
      env
    );

    for (const adminId of getPrimaryAdminIds(env)) {
      await telegramApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: adminId,
        text:
          '⚠️ 验证服务未配置：当前验证方式选的是 ' +
          'Turnstile，但 TURNSTILE 密钥未配齐，' +
          '访客暂时无法完成验证。请补齐密钥，' +
          '或在网页管理台把验证方式改成静态问答 / 顺序点击。',
          reply_markup: SYS_TAG_MARKUP
      });
    }
  } catch (error) {
    console.error(
      '发送验证未配置告警失败：',
      error?.message || error
    );
  }
}

// 访客侧未配置提示：先触发管理员告警（自带每日节流），
// 再按验证提示的槽位与 3 分钟节流发提示——验证通过后
// 这条提示由 cleanupAfterVerified 随槽位一并撤回。
async function sendVerifyUnconfiguredPrompt(
  chatId,
  env
) {
  await alertAdminsVerifyUnconfigured(env);

  if (await promptThrottled(env, chatId)) {
    return;
  }

  const sent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: VERIFY_UNCONFIGURED_TEXT,
      reply_markup: SYS_TAG_MARKUP
    }
  );

  await trackSlotMessage(
    env,
    chatId,
    'verify_prompt_msg_id',
    sent?.message_id
  );

  await markPromptSent(env, chatId);
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

// 链接签名密钥：优先用独立的 LINK_SECRET，未配置时回退
// WEBHOOK_SECRET（保持旧行为）。两者解耦后，webhook 校验值
// 泄露不再连带击穿全部签名链接（验证/通行证/三页）。
function linkSecret(env) {
  return env.LINK_SECRET || env.WEBHOOK_SECRET;
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
    Date.now() + (await verifyLinkTtlMs(env));

  const signature =
    await hmacSha256Hex(
      linkSecret(env),
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

  if (!Number.isFinite(exp) || exp <= now) {
    return false;
  }

  const expected =
    await hmacSha256Hex(
      linkSecret(env),
      testMode
        ? `tsverify-test:${uid}:${exp}`
        : `tsverify:${uid}:${exp}`
    );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return false;
  }

  // 上界只防离谱的远期伪造值，用写侧上限做固定宽限：
  // 管理员调短有效期不会追溯作废已发出的链接（真实有效期由 exp 本身决定）。
  return exp <= now + 120 * 60 * 1000 + 60 * 1000;
}


async function buildPassUrl(origin, userId, nonce, exp, env) {
  const signature = await hmacSha256Hex(
    linkSecret(env),
    `pass:${userId}:${exp}:${nonce}`
  );

  const params = new URLSearchParams({
    u: String(userId),
    e: String(exp),
    n: String(nonce),
    s: signature
  });

  return `${origin}/pass?${params.toString()}`;
}

async function checkPassSignature(userId, expRaw, nonce, signature, env) {
  const uid = String(userId || '');

  if (!/^\d{1,20}$/.test(uid)) {
    return false;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (!Number.isFinite(exp) || exp <= now) {
    return false;
  }

  const expected = await hmacSha256Hex(
    linkSecret(env),
    `pass:${uid}:${exp}:${String(nonce || '')}`
  );

  if (
    !timingSafeEqualString(
      expected,
      String(signature || '')
    )
  ) {
    return false;
  }

  // 同 verify：固定宽限（写侧上限 1440 分钟），调短不追溯作废存量通行证；
  // 通行证的真实有效期另由库内记录的到期时间兜底。
  return exp <= now + 1440 * 60 * 1000 + 60 * 1000;
}

async function passRecordGet(userId, env) {
  const raw = await dbConfigGet(`pass:${userId}`, env);

  if (!raw) {
    return null;
  }

  try {
    const rec = JSON.parse(raw);
    return rec && rec.n ? rec : null;
  } catch {
    return null;
  }
}

// 静默删一条机器人自己的消息：已被访客删掉、超期删不动等一律忽略。
async function quietDeleteMessage(env, chatId, messageId) {
  if (!messageId) {
    return;
  }

  try {
    await telegramApi(env.BOT_TOKEN, 'deleteMessage', {
      chat_id: chatId,
      message_id: Number(messageId)
    });
  } catch {
    /* 删除失败不打扰主流程 */
  }
}

// 记账槽位：column 为 verify_prompt_msg_id / receipt_msg_id。
// 写入新 ID 前先删掉槽里的旧消息，保证同类消息只留最新一条。
async function trackSlotMessage(env, userId, column, messageId) {
  if (!messageId) {
    return;
  }

  const user = await dbUserGetOrCreate(userId, env);
  const oldId = Number(user?.[column] || 0);
  const newId = Number(messageId);

  if (oldId && oldId !== newId) {
    await quietDeleteMessage(env, userId, oldId);
  }

  if (oldId !== newId) {
    await dbUserUpdate(
      userId,
      { [column]: newId },
      env,
      { touchActivity: false }
    );
  }
}

// 撤回槽位里的消息并清空记录（没有记录时什么都不做）。
async function clearSlotMessage(env, userId, column) {
  const user = await dbUserGetOrCreate(userId, env);
  const oldId = Number(user?.[column] || 0);

  if (!oldId) {
    return;
  }

  await dbUserUpdate(
    userId,
    { [column]: null },
    env,
    { touchActivity: false }
  );

  await quietDeleteMessage(env, userId, oldId);
}

// 验证成功回执（🎉）的统一发送口：发欢迎消息
// （welcome_msg，-v161b8 起改定义为验证成功问候）
// 并把回执编号记进 receipt_msg_id 槽位。记账（trackSlotMessage）
// 失败时原地重试至多 3 次（间隔 300ms，照资料卡写回重试的
// 先例）；仍记不上就把刚发出的这条回执反手删掉——宁可这
// 一次没有回执，也不能留下一个没登记、永远删不掉的孤儿
// 回执。全程不抛：发送或记账出任何问题只记日志，返回
// 回执编号或 null，五条验证成功路径共用本口。
async function sendVerifySuccessReceipt(env, userId) {
  let sent = null;

  try {
    sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: userId,
        text: await welcomeMsgText(env),
        reply_markup: SYS_TAG_MARKUP
      }
    );
  } catch (error) {
    console.error(
      '发送验证成功回执失败：',
      error?.message || error
    );

    return null;
  }

  const receiptId = sent?.message_id;

  if (!receiptId) {
    return null;
  }

  let trackError = null;

  for (let w = 0; w < 3; w += 1) {
    try {
      await trackSlotMessage(
        env,
        userId,
        'receipt_msg_id',
        receiptId
      );

      return receiptId;
    } catch (error) {
      trackError = error;

      if (w < 2) {
        await sleep(300);
      }
    }
  }

  console.error(
    '登记验证成功回执多次失败，已撤回该回执避免留下孤儿：',
    trackError?.message || trackError
  );

  await quietDeleteMessage(env, userId, receiptId);

  return null;
}

// 作废某访客的未用通行证：删记录并删掉证消息。
// 删人、重置验证、验证成功联动都走这里，保证「重新来过」收得干净。
async function voidUserPass(env, userId) {
  const rec = await passRecordGet(userId, env);

  await dbConfigDelete(`pass:${userId}`, env);

  if (rec?.m) {
    await quietDeleteMessage(env, userId, rec.m);
  }
}

// 撤回记账中的访客 /start 并清记账行：/start 在入口
// 处已即时删除，本函数是即时删除失败时的兜底，由验
// 证成功收尾（cleanupAfterVerified）与已验证访客首
// 条真实消息的回执清理点共用。已验证访客再发 /start 时不会再有
// 验证成功事件来消费这本账，故由回执清理连带撤回，
// 口径与验证成功时一致（只记最新一条）。
async function clearTrackedStartMessage(env, userId) {
  const startMsgId = Number(
    (await dbConfigGet(`startmsg:${userId}`, env)) || 0
  );

  if (startMsgId) {
    await quietDeleteMessage(env, userId, startMsgId);
  }

  await dbConfigDelete(`startmsg:${userId}`, env);
}

// 撤回翻牌后的「✅ 服务已恢复」卡并清转记行：熔断恢复
// 时 flipPauseCards 把翻牌成功的卡转记到
// pauserestored:<uid>，访客下一次发消息时在两处回执
// 清理点连带撤回，与验证成功回执同一口径——使命都是
// 「通知访客状态已变更」，访客重新开口即视为已看到。
// 访客再也不发消息时卡留存，与回执同一已知口径，
// 不另做定时清理。
async function clearRestoredPauseCard(env, userId) {
  const restoredMsgId = Number(
    (await dbConfigGet(`pauserestored:${userId}`, env)) || 0
  );

  // 无转记行直接返回：本函数挂在已验证访客每条消息的
  // 入口上，无行时连删行都省掉，避免每条消息多一次写库。
  if (!restoredMsgId) {
    return;
  }

  await quietDeleteMessage(env, userId, restoredMsgId);

  await dbConfigDelete(`pauserestored:${userId}`, env);
}

// 删档/删人时连带处理熔断三类卡：与通行证（voidUserPass）
// 同口径——先按追踪行删掉访客私聊里的卡本体，再删行。
// 只删行会把「请稍后再试」/警告/「✅ 服务已恢复」永久
// 留在对方私聊里：追踪一灭，恢复翻牌与访客下条消息的
// 撤回都再也找不到它们。删卡走 quietDeleteMessage 静
// 默尽力，不计入网页清空等场景的实删/失败计数（与
// voidUserPass 在删人路径里的做法一致）。pausewarn 行
// 按 parsePauseWarnValue 取编号，claim 占位没有卡本体、
// 只删行。翻牌队列若正持有同一行，删行后它续跑时读不
// 到该行、或对已删卡收到终局错误，都会按既有结算口径
// 收尾，不受影响。
async function deletePauseCardsForUser(env, userId) {
  const pausemsgId = Number(
    (await dbConfigGet(`pausemsg:${userId}`, env)) || 0
  );

  if (pausemsgId) {
    await quietDeleteMessage(env, userId, pausemsgId);
  }

  await dbConfigDelete(`pausemsg:${userId}`, env);

  const warn = parsePauseWarnValue(
    await dbConfigGet(`pausewarn:${userId}`, env)
  );

  if (warn.messageId) {
    await quietDeleteMessage(env, userId, warn.messageId);
  }

  await dbConfigDelete(`pausewarn:${userId}`, env);

  const restoredMsgId = Number(
    (await dbConfigGet(`pauserestored:${userId}`, env)) || 0
  );

  if (restoredMsgId) {
    await quietDeleteMessage(env, userId, restoredMsgId);
  }

  await dbConfigDelete(`pauserestored:${userId}`, env);
}

// 任意入口验证通过后的联动清理：撤回验证提示；
// 若还有未使用的通行证，一并删消息并作废（人已通过，证留着只是风险）；
// 访客那条 /start 的使命也到此结束，一并撤回，
// 私聊里只留成功回执（回执仍按原口径留到第一条正文转发后再删）。
async function cleanupAfterVerified(env, userId) {
  await clearSlotMessage(
    env,
    userId,
    'verify_prompt_msg_id'
  );

  await voidUserPass(env, userId);

  await dbConfigDelete(`promptat:${userId}`, env);

  await clearTrackedStartMessage(env, userId);

  // 答错计数与在途题目一并清：五条验证成功路径
  // （问答/顺序点击/Turnstile/通行证/设信任）都经
  // 本函数收尾，在此一处收口，免得残留计数或旧题
  // 在访客日后被重置回待验证时继续生效。
  await dbConfigDelete(`quizlock:${userId}`, env);

  await dbConfigDelete(`seq:${userId}`, env);
}

// 过期通行证清扫：访客下次互动时顺手删掉过期通行证消息并清记录。
// 删除用「值仍是读到的那份」的原子条件删：期间被重发的新证不受影响。
async function sweepExpiredPass(env, userId) {
  const key = `pass:${userId}`;
  const raw = await dbConfigGet(key, env);

  if (!raw) {
    return;
  }

  let rec = null;

  try {
    rec = JSON.parse(raw);
  } catch {
    return;
  }

  if (!rec?.n || Number(rec.e) > Date.now()) {
    return;
  }

  const deleted = await dbConfigDeleteIfValue(
    key,
    raw,
    env
  );

  if (deleted && rec.m) {
    await quietDeleteMessage(env, userId, rec.m);
  }
}

// 验证提示节流：同一访客 3 分钟内只发一次提示，
// 挡住待验证访客刷消息放大 Telegram 调用与 D1 写入。
const PROMPT_RESEND_MIN_MS = 180000;

async function promptThrottled(env, userId) {
  const last = Number(
    (await dbConfigGet(`promptat:${userId}`, env)) || 0
  );

  return Date.now() - last < PROMPT_RESEND_MIN_MS;
}

async function markPromptSent(env, userId) {
  await dbConfigPut(
    `promptat:${userId}`,
    String(Date.now()),
    env
  );
}

// 校验 Telegram Mini App initData 并返回打开者访客 ID：
// 链接可以被转发，只有打开者本人与通行证绑定访客一致才算数。
async function telegramInitDataUserId(initDataRaw, botToken) {
  try {
    const params = new URLSearchParams(String(initDataRaw || ''));
    const hash = params.get('hash');

    if (!hash) {
      return null;
    }

    params.delete('hash');

    const pairs = [];

    for (const [k, v] of params.entries()) {
      pairs.push(`${k}=${v}`);
    }

    pairs.sort();

    const enc = new TextEncoder();

    const webAppKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secret = await crypto.subtle.sign(
      'HMAC',
      webAppKey,
      enc.encode(String(botToken || ''))
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sig = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      enc.encode(pairs.join('\n'))
    );

    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (!timingSafeEqualString(hex, hash)) {
      return null;
    }

    const authDate = Number(params.get('auth_date') || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    // 新鲜窗 1 小时（原 24 小时，按安全复核收紧）：auth_date
    // 在 Mini App 打开瞬间定格，开着页面超过 1 小时才确认
    // 的合法访客会被误拒、需要重开页面——窗口取舍已确认。
    // 链接自身的签名 exp、通行证记录的 nonce/exp 仍共同把关。
    if (
      !authDate ||
      authDate > nowSec + 300 ||
      nowSec - authDate > 3600
    ) {
      return null;
    }

    const user = JSON.parse(params.get('user') || 'null');

    return user && user.id != null ? String(user.id) : null;
  } catch {
    return null;
  }
}

// initData 验签（带失败原因版，供 /api/app-auth）：与
// telegramInitDataUserId 同一官方算法、同一新鲜窗
// （auth_date 1 小时内、另留 300 秒时钟偏差）——主小
// 程序打开瞬间即回传验证，窗口足够。失败拆三类：
// bad_data（缺 hash / 结构坏 / 无 user）、bad_hash
// （签名对不上，含篡改）、expired（auth_date 太旧或
// 超前）。是否主管理员由调用方再判（not_admin）。
async function validateTelegramInitData(initDataRaw, botToken) {
  try {
    const params = new URLSearchParams(
      String(initDataRaw || '')
    );
    const hash = params.get('hash');

    if (!hash) {
      return { error: 'bad_data' };
    }

    params.delete('hash');

    const pairs = [];

    for (const [k, v] of params.entries()) {
      pairs.push(`${k}=${v}`);
    }

    pairs.sort();

    if (!pairs.length) {
      return { error: 'bad_data' };
    }

    const enc = new TextEncoder();

    const webAppKey = await crypto.subtle.importKey(
      'raw',
      enc.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secret = await crypto.subtle.sign(
      'HMAC',
      webAppKey,
      enc.encode(String(botToken || ''))
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const sig = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      enc.encode(pairs.join('\n'))
    );

    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (!timingSafeEqualString(hex, hash)) {
      return { error: 'bad_hash' };
    }

    const authDate = Number(params.get('auth_date') || 0);
    const nowSec = Math.floor(Date.now() / 1000);

    if (
      !authDate ||
      authDate > nowSec + 300 ||
      nowSec - authDate > 3600
    ) {
      return { error: 'expired' };
    }

    const user = JSON.parse(params.get('user') || 'null');

    if (!user || user.id == null) {
      return { error: 'bad_data' };
    }

    return { userId: String(user.id) };
  } catch {
    return { error: 'bad_data' };
  }
}

// /api/app-auth 粗粒度尝试限流：按来源 IP 的 SHA-256
// 摘要分桶的模块级计数（单 isolate 内有效、随 isolate
// 回收清零）。刻意不落 D1：未鉴权尝试若每次都读写数
// 据库，限流本身就成了写放大入口（第十一轮审计低
// 7）。窗口 10 分钟、每来源至多 60 次——正常打开小
// 程序只验签一次，余量远高于弱网重发所需。
const APP_AUTH_RATE_WINDOW_MS = 10 * 60 * 1000;
const APP_AUTH_RATE_MAX_ATTEMPTS = 60;
const appAuthAttemptBuckets = new Map();

async function appAuthRateLimited(request) {
  const ip =
    request.headers.get('CF-Connecting-IP') || '';

  if (!ip) {
    return false;
  }

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(ip)
  );

  const key = [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const now = Date.now();

  let bucket = appAuthAttemptBuckets.get(key);

  if (
    !bucket ||
    now - bucket.start >= APP_AUTH_RATE_WINDOW_MS
  ) {
    bucket = { start: now, count: 0 };
    appAuthAttemptBuckets.set(key, bucket);
  }

  bucket.count += 1;

  if (appAuthAttemptBuckets.size > 512) {
    for (const [k, v] of appAuthAttemptBuckets) {
      if (now - v.start >= APP_AUTH_RATE_WINDOW_MS) {
        appAuthAttemptBuckets.delete(k);
      }
    }
  }

  return bucket.count > APP_AUTH_RATE_MAX_ATTEMPTS;
}

function appAuthFailedResponse() {
  return Response.json(
    { ok: false, error: 'auth_failed' },
    { status: 403 }
  );
}

// POST /api/app-auth：主小程序唯一的登录入口。只认
// Telegram initData 验签——没有任何查询参数、备用口
// 令或链接签名旁路；验签通过且为主管理员（与管理台
// 同口径，协管员与访客一律拒）才签发 6 小时会话凭据。
async function handleAppAuth(request, env) {
  // 与同文件其余网页 POST 同口径的请求体上限（低
  // 7）：先过体积再读体，不让超大 JSON 白吃解析。
  if (
    Number(
      request.headers.get('content-length') || 0
    ) > 16384
  ) {
    return Response.json(
      { ok: false, error: 'too large' },
      { status: 413 }
    );
  }

  if (await appAuthRateLimited(request)) {
    return Response.json(
      { ok: false, error: 'auth_failed' },
      { status: 429 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'bad json' },
      { status: 400 }
    );
  }

  const initData = String(body?.initData || '');

  // 验签四路结论（数据坏 / 签名假 / 已过期 / 非管理
  // 员）对外一律同一状态码与同一文案，不给未鉴权者
  // 区分 initData 真伪、新鲜度与管理员资格的预言机
  // （低 8）；具体原因只记服务端日志。
  if (!initData) {
    console.warn('小程序验签失败：bad_data（缺 initData）');

    return appAuthFailedResponse();
  }

  const verdict = await validateTelegramInitData(
    initData,
    env.BOT_TOKEN
  );

  if (verdict.error) {
    console.warn('小程序验签失败：', verdict.error);

    return appAuthFailedResponse();
  }

  if (!isPrimaryAdmin(verdict.userId, env)) {
    console.warn('小程序验签失败：not_admin');

    return appAuthFailedResponse();
  }

  const session = await mintAppSession(verdict.userId, env);

  // exp 与 e 同值（会话到期毫秒），供外壳按到期时
  // 刻排续期定时器与到期看门狗（第十一轮修复批 B
  // 中 1）。
  return Response.json({ ok: true, ...session, exp: session.e });
}

// GET /app：主小程序外壳（BotFather 里填的地址就是
// 它）。外壳本身不带任何凭据即可打开，真正的门是页
// 面起来后把 Telegram initData 回传 /api/app-auth 验
// 签换会话凭据；没有 initData（普通浏览器直开）只显
// 示「请在 Telegram 中打开」提示。三页以 iframe 承
// 载、凭据走查询串——与签名链接打开三页时完全一致
// 的传参方式，页面脚本零感知。内嵌脚本刻意不用任何
// 反斜杠转义序列（外层是模板字面量，转义会被煮熟）。
function buildAppShellPage() {
  return `<!doctype html>
<html lang=\"zh-CN\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>机器人管理</title>
<script src=\"https://telegram.org/js/telegram-web-app.js\" onerror=\"window.__tgSdkFailed=1\"></script>
<style>
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: #0f141a; }
body { display: flex; flex-direction: column; font-family: sans-serif; color: #e8eef4; }
#apptabs { display: flex; gap: 8px; padding: 10px 12px; background: #17212b; }
#apptabs button { flex: 1 1 0; height: 40px; border: 0; border-radius: 8px; background: #232f3d; color: #aebccb; font-size: 15px; cursor: pointer; }
#apptabs button.on { background: #2b5278; color: #fff; }
#appmsg { padding: 26px 20px; font-size: 15px; line-height: 1.7; color: #aebccb; text-align: center; }
#appframe { flex: 1 1 auto; width: 100%; border: 0; display: none; background: #0f141a; opacity: 1; transition: opacity .28s ease; }
#appbar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #6e2a2a; color: #ffd9d9; font-size: 14px; line-height: 1.5; }
#appbar[hidden] { display: none; }
#appbar span { flex: 1 1 auto; }
#appbar button { flex: 0 0 auto; height: 32px; padding: 0 14px; border: 0; border-radius: 8px; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; }
#appretry { padding: 26px 20px; font-size: 15px; line-height: 1.7; color: #aebccb; text-align: center; }
#appretry[hidden] { display: none; }
#appretry button { margin-top: 14px; height: 40px; padding: 0 22px; border: 0; border-radius: 8px; background: #2b5278; color: #fff; font-size: 15px; cursor: pointer; }
#appconfirm { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #57451a; color: #ffe9b0; font-size: 14px; line-height: 1.5; }
#appconfirm[hidden] { display: none; }
#appconfirm span { flex: 1 1 auto; }
#appconfirm button { flex: 0 0 auto; height: 32px; padding: 0 14px; border: 0; border-radius: 8px; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; }
</style>
</head>
<body>
<div id=\"apptabs\">
<button type=\"button\" data-tab=\"/users\">访客列表</button>
<button type=\"button\" data-tab=\"/panel\">管理台</button>
<button type=\"button\" data-tab=\"/guide\">新手引导</button>
</div>
<div id=\"appmsg\">正在验证身份…</div>
<div id=\"appbar\" hidden><span id=\"appbartext\"></span><button type=\"button\" id=\"appbarbtn\">重试</button></div>
<div id=\"appretry\" hidden><div id=\"appretrytext\"></div><button type=\"button\" id=\"appretrybtn\">重试</button></div>
<div id=\"appconfirm\" hidden><span id=\"appconfirmtext\"></span><button type=\"button\" id=\"appconfirmgo\">切换</button><button type=\"button\" id=\"appconfirmstay\">留下</button></div>
<iframe id=\"appframe\" title=\"app\"></iframe>
<script>
var creds = null;
var credsExp = 0;
var curTab = '/users';
var bootState = 'boot';
var msgEl = document.getElementById('appmsg');
var frame = document.getElementById('appframe');
var barEl = document.getElementById('appbar');
var barTextEl = document.getElementById('appbartext');
var barBtn = document.getElementById('appbarbtn');
var retryEl = document.getElementById('appretry');
var retryTextEl = document.getElementById('appretrytext');
var retryBtn = document.getElementById('appretrybtn');
var tabsEl = document.getElementById('apptabs');
var confirmEl = document.getElementById('appconfirm');
var confirmTextEl = document.getElementById('appconfirmtext');
var confirmGoBtn = document.getElementById('appconfirmgo');
var confirmStayBtn = document.getElementById('appconfirmstay');
var tabBtns = document.querySelectorAll('#apptabs button');
var ERR_TEXT = {
  bad_data: '没能读到 Telegram 传来的身份信息，请关掉小程序后重新打开。',
  bad_hash: '身份校验没通过，请关掉小程序后重新打开。',
  expired: '这次打开已经过期，请关掉小程序后重新打开。',
  not_admin: '只有主管理员能打开这个小程序。',
  auth_failed: '身份验证失败，请关掉小程序后重新打开。',
  'bad json': '请求格式错误，请关掉小程序后重新打开。'
};
// 页签切换平滑过渡（-v163b6）：切换仍是换 src 重
// 载（加载语义不变，与此前一致），只给呈现加淡入
// 淡出：点页签先把 frame 透明度降到 0（frame 与页
// 面底色同为深色，不闪白），新页 load 后经 CSS 过
// 渡（opacity .28s）在原地淡入。连点页签以序号守
// 卫：只有最后一次切换的 load 或兜底计时能淡入，
// 迟到的 load 不会把旧页闪回来；showMsg 同样作废
// 在途切换。第十一轮修复批 B（低 12）：1600ms 兜
// 底不再无条件淡入——load 到了先同源检视 iframe
// 文档，正常页才淡入；命中会话失效/服务不可用文
// 案的错误页不装正常（见 inspectFrame）；超时未
// 到的只亮「加载较慢」错误条，等真 load 再检视。
var frameSeq = 0, frameTimer = 0;
var refreshTimer = 0, expireTimer = 0;
var authSeq = 0;
function frameShow(seq) {
  if (seq !== frameSeq) return;
  if (frameTimer) { clearTimeout(frameTimer); frameTimer = 0; }
  frame.style.opacity = '1';
}
function hideBar() { barEl.hidden = true; }
// 未保存草稿守卫（第十一轮修复批 C，中 5）：切页签
// 前同源询问当前 iframe 页面的 __hasUnsavedDraft
// （三页各自暴露同名口径，见各页脚本），脏时先弹
// 确认条让用户决定，不再无条件重载把草稿冲掉。
var pendingTabPath = null;
function frameDirty() {
  try {
    var w = frame.contentWindow;
    return !!(w && typeof w.__hasUnsavedDraft === 'function' && w.__hasUnsavedDraft());
  } catch (e) { return false; }
}
function hideConfirm() { confirmEl.hidden = true; pendingTabPath = null; }
function showConfirm(path) {
  pendingTabPath = path;
  confirmTextEl.textContent = '有未保存的修改，仍要切换？';
  confirmEl.hidden = false;
}
confirmGoBtn.onclick = function () { var p = pendingTabPath; hideConfirm(); if (p) loadTab(p); };
confirmStayBtn.onclick = function () { hideConfirm(); };
function requestTab(path) {
  if (creds && bootState === 'ready' && frameDirty()) { showConfirm(path); return; }
  hideConfirm();
  loadTab(path);
}
function showBar(text, fn) {
  barTextEl.textContent = text;
  barBtn.onclick = fn || null;
  barEl.hidden = false;
}
function hideRetry() { retryEl.hidden = true; }
function showRetry(text, btnLabel, fn) {
  frameSeq++;
  if (frameTimer) { clearTimeout(frameTimer); frameTimer = 0; }
  frame.style.display = 'none';
  msgEl.style.display = 'none';
  retryTextEl.textContent = text;
  retryBtn.textContent = btnLabel || '重试';
  retryBtn.onclick = fn || null;
  retryEl.hidden = false;
}
function showMsg(t) {
  frameSeq++;
  if (frameTimer) { clearTimeout(frameTimer); frameTimer = 0; }
  frame.style.display = 'none';
  retryEl.hidden = true;
  msgEl.style.display = 'block';
  msgEl.textContent = t;
}
// initData 取数（中 2）：首选官方脚本给的
// Telegram.WebApp.initData；脚本没加载出来或没给
// 数据时，自行解析 location.hash 里的 tgWebAppData
// 兜底（官方脚本本来就是从那里解析出 initData
// 的）。两路都空才算没数据，并区分「脚本没加载
// 出来」（可重试）与「不在 Telegram 里打开」。
function initDataFromHash() {
  var h = String(location.hash || '');
  if (h.charAt(0) === '#') h = h.slice(1);
  if (!h) return '';
  var parts = h.split('&');
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf('=');
    if (eq > 0 && parts[i].slice(0, eq) === 'tgWebAppData') {
      try { return decodeURIComponent(parts[i].slice(eq + 1)); } catch (e) { return ''; }
    }
  }
  return '';
}
function getInitData() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.initData) return { data: tg.initData, sdkFailed: false };
  var hd = initDataFromHash();
  if (hd) return { data: hd, sdkFailed: false };
  return { data: '', sdkFailed: !tg };
}
// 验签请求（批 A 契约 + 低 13）：带 12 秒超时，
// 不让请求挂死在「正在验证身份…」；结论按状态码
// 归因——200 成功 / 503 服务端暂不可用 / 429 尝
// 试过频 / 403、400 凭据失败 / 其余与网络异常归
// 暂时失败，不再笼统报「网络不畅」。
function doAuth(done) {
  var got = getInitData();
  if (!got.data) { done({ ok: false, kind: 'nodata', sdkFailed: got.sdkFailed }); return; }
  var settled = false;
  var timer = 0;
  var ctl = null;
  function finish(res) {
    if (settled) return;
    settled = true;
    if (timer) { clearTimeout(timer); timer = 0; }
    done(res);
  }
  try {
    if (window.AbortController) {
      ctl = new AbortController();
      timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 12000);
    }
  } catch (e) { ctl = null; }
  var opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ initData: got.data }) };
  if (ctl) opts.signal = ctl.signal;
  fetch('/api/app-auth', opts).then(function (r) {
    return r.json().then(function (d) { return { status: r.status, d: d }; }, function () { return { status: r.status, d: null }; });
  }).then(function (res) {
    var d = res.d;
    if (res.status === 200 && d && d.ok && d.u && d.s) {
      finish({ ok: true, creds: d, exp: Number(d.exp || d.e || 0) });
    } else if (res.status === 503) {
      finish({ ok: false, kind: 'unavailable' });
    } else if (res.status === 429) {
      finish({ ok: false, kind: 'rate' });
    } else if (res.status === 403 || res.status === 400) {
      finish({ ok: false, kind: 'cred', error: (d && d.error) || '' });
    } else {
      finish({ ok: false, kind: 'temp' });
    }
  }).catch(function () { finish({ ok: false, kind: 'temp' }); });
}
// 会话续期（中 1）：凭据到期前 10 分钟静默换新会
// 话并重载当前页签（地址换上新凭据）；换新失败
// 每分钟重试；到期看门狗再兜一次，仍不行才弹恢
// 复层。页面从后台回前台且已进入续期窗时立即补
// 一次，不等可能被系统节流的定时器。
function scheduleSessionTimers() {
  if (refreshTimer) { clearTimeout(refreshTimer); refreshTimer = 0; }
  if (expireTimer) { clearTimeout(expireTimer); expireTimer = 0; }
  if (!credsExp) return;
  var now = Date.now();
  var untilRefresh = credsExp - 600000 - now;
  if (untilRefresh < 30000) untilRefresh = 30000;
  refreshTimer = setTimeout(proactiveRefresh, Math.min(untilRefresh, 2147483647));
  expireTimer = setTimeout(expireWatchdog, Math.min(Math.max(credsExp - now, 0) + 2000, 2147483647));
}
function proactiveRefresh() {
  refreshSession(function (ok) {
    if (ok) {
      reloadAfterRefresh();
    } else {
      refreshTimer = setTimeout(proactiveRefresh, 60000);
    }
  });
}
// 续期成功后的重载也要过草稿守卫（批 C，中 5）：
// 当前页有未保存修改时不静默重载，弹恢复层让用
// 户决定（凭据已换新，只推迟重载）。
function reloadAfterRefresh() {
  if (bootState !== 'ready' || !retryEl.hidden) return;
  if (frameDirty()) {
    showRetry('会话已续期，但当前页有未保存的修改，没有自动刷新。点「刷新页面」重载页面（未保存的修改会丢失）。', '刷新页面', function () { loadTab(curTab); });
    return;
  }
  loadTab(curTab);
}
function expireWatchdog() {
  refreshSession(function (ok) {
    if (ok) {
      reloadAfterRefresh();
    } else {
      showRetry('会话已过期，自动续期没成功。点「重新进入」重新验证身份，或关闭小程序后重新打开。', '重新进入', bootApp);
    }
  });
}
function refreshSession(done) {
  var my = ++authSeq;
  doAuth(function (res) {
    if (my !== authSeq) { if (done) done(false); return; }
    if (res.ok) {
      creds = res.creds;
      credsExp = res.exp;
      scheduleSessionTimers();
      if (done) done(true);
    } else if (done) {
      done(false);
    }
  });
}
document.addEventListener('visibilitychange', function () {
  if (document.hidden || !creds) return;
  if (credsExp && credsExp - Date.now() < 600000) proactiveRefresh();
});
// iframe 加载结果检视（低 12 + 中 1）：外壳与三
// 页同源，可读 iframe 文档文本。正常页淡入；会
// 话失效页先静默换新会话重载本页签、换不动才弹
// 恢复层；服务不可用页亮错误条给重试，不把错误
// 页装成正常页淡入。
function inspectFrame(seq) {
  var t = '';
  try {
    var d = frame.contentDocument;
    if (d && d.body) t = String(d.body.textContent || '');
  } catch (e) { t = ''; }
  if (t && t.indexOf('链接无效或已过期') >= 0) {
    hideBar();
    refreshSession(function (ok) {
      if (seq !== frameSeq) return;
      if (ok) loadTab(curTab);
      else showRetry('会话已过期，自动续期没成功。点「重新进入」重新验证身份，或关闭小程序后重新打开。', '重新进入', bootApp);
    });
    return;
  }
  if (t && t.indexOf('服务暂时不可用') >= 0) {
    showBar('服务暂时不可用，请稍后重试。', function () { loadTab(curTab); });
    return;
  }
  hideBar();
  frameShow(seq);
}
function loadTab(path) {
  if (!creds) {
    if (bootState !== 'booting') bootApp();
    return;
  }
  if (credsExp && credsExp <= Date.now()) {
    refreshSession(function (ok) {
      if (ok) loadTab(path);
      else showRetry('会话已过期，自动续期没成功。点「重新进入」重新验证身份，或关闭小程序后重新打开。', '重新进入', bootApp);
    });
    return;
  }
  curTab = path;
  hideConfirm();
  hideRetry();
  for (var i = 0; i < tabBtns.length; i++) {
    tabBtns[i].className = tabBtns[i].getAttribute('data-tab') === path ? 'on' : '';
  }
  msgEl.style.display = 'none';
  frame.style.display = 'block';
  var seq = ++frameSeq;
  frame.style.opacity = '0';
  frame.onload = function () { inspectFrame(seq); };
  frame.src = path + '?u=' + encodeURIComponent(creds.u) + '&e=' + encodeURIComponent(creds.e) + '&s=' + encodeURIComponent(creds.s);
  if (frameTimer) clearTimeout(frameTimer);
  frameTimer = setTimeout(function () {
    if (seq !== frameSeq) return;
    showBar('页面加载较慢，可能网络不畅，点此重试。', function () { loadTab(curTab); });
  }, 1600);
}
for (var j = 0; j < tabBtns.length; j++) {
  tabBtns[j].addEventListener('click', function () {
    requestTab(this.getAttribute('data-tab'));
  });
}
// 主题衔接（低 14）：外壳底色与页签条跟随
// Telegram 主题参数，顶栏与背景色同步给客户端，
// 不再写死深色、与浅色主题割裂；三页内部设计不
// 动。主题切换时经 themeChanged 事件重取。
var themeHooked = false;
function applyTheme() {
  var tg = window.Telegram && window.Telegram.WebApp;
  if (!tg) return;
  var tp = tg.themeParams || {};
  var bg = tp.bg_color || '';
  var sec = tp.secondary_bg_color || '';
  if (bg) {
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    frame.style.background = bg;
  }
  if (sec) tabsEl.style.background = sec;
  if (tp.text_color) {
    msgEl.style.color = tp.text_color;
    retryEl.style.color = tp.text_color;
  }
  try { if (tg.setHeaderColor) tg.setHeaderColor(sec || bg || '#17212b'); } catch (e) {}
  try { if (tg.setBackgroundColor) tg.setBackgroundColor(bg || '#0f141a'); } catch (e) {}
  if (!themeHooked && tg.onEvent) {
    themeHooked = true;
    try { tg.onEvent('themeChanged', applyTheme); } catch (e) {}
  }
}
// boot（低 13）：失败按归因给明确错误 + 重试入
// 口（恢复层按钮、或错误态下点任意页签都会重走
// boot），不再一次性失败只能关掉小程序重开。
function bootApp() {
  if (bootState === 'booting') return;
  hideBar();
  hideRetry();
  var got = getInitData();
  if (!got.data) {
    bootState = 'error';
    if (got.sdkFailed) {
      showRetry('身份组件加载失败，请检查网络后重试。', '重试', bootApp);
    } else {
      showMsg('请在 Telegram 中打开本小程序：回到与机器人的聊天，点聊天列表或机器人资料页上的「打开」。');
    }
    return;
  }
  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    if (tg.ready) tg.ready();
    if (tg.expand) tg.expand();
  }
  bootState = 'booting';
  showMsg('正在验证身份…');
  var my = ++authSeq;
  doAuth(function (res) {
    if (my !== authSeq) return;
    if (res.ok) {
      creds = res.creds;
      credsExp = res.exp;
      bootState = 'ready';
      scheduleSessionTimers();
      loadTab(curTab);
    } else {
      bootState = 'error';
      if (res.kind === 'unavailable') {
        showRetry('服务暂时不可用，身份验证没完成，请稍后重试。', '重试', bootApp);
      } else if (res.kind === 'rate') {
        showRetry('验证尝试过于频繁，请稍后再试。', '重试', bootApp);
      } else if (res.kind === 'cred') {
        showRetry(ERR_TEXT[res.error] || '身份验证失败，请关掉小程序后重新打开。', '重新进入', bootApp);
      } else if (res.kind === 'nodata' && res.sdkFailed) {
        showRetry('身份组件加载失败，请检查网络后重试。', '重试', bootApp);
      } else {
        showRetry('网络不畅，身份验证没完成，请检查网络后重试。', '重试', bootApp);
      }
    }
  });
}
applyTheme();
bootApp();
</script>
<script>
// ===== WebView 保活（Telegram iOS WebView keepalive）=====
// 这是 Telegram iOS WebView 的保活构成，不是探针、也不是日志层：
// 外壳 window 上注册两条 passive 空转监听（touchmove / scroll，
// 处理函数 webviewKeepaliveNoop 本身什么都不做，注册在位才是
// 关键）；另有每 250ms 一次的跨框采样，读内容 iframe 的滚动
// 位置、高度与焦点元素（采样串字段 ifY / ifH / ifAe），只在
// 采样值变化时写入一个隐形节点（opacity:0、pointer-events
// none、带 aria-hidden）。
// 这套构成是真机逐级拆解实证的承重件：删掉任一监听或停掉
// 采样，iOS WebView 会在拖动等手势中失活（输入框焦点被夺
// 走）。勿删、勿改节奏与字段、勿「优化」。外围仅两点（b23
// 起）：页面隐藏（document.hidden）时跳过采样 tick；隐形
// 节点带 aria-hidden。
(function () {
  var webviewKeepaliveBarText = null;
  function webviewKeepaliveElementName(el) {
    if (!el) return 'null';
    var s = el.tagName || '?';
    if (el.id) s += '#' + el.id;
    return s;
  }
  function webviewKeepaliveSample() {
    var f = document.getElementById('appframe');
    if (!f) return 'if=no';
    try {
      var w = f.contentWindow;
      if (!w) return 'if=nowin';
      return 'ifY=' + Math.round(w.pageYOffset || 0) + ' ifH=' + w.innerHeight + ' ifAe=' + webviewKeepaliveElementName(w.document.activeElement);
    } catch (e) { return 'if=ERR'; }
  }
  function webviewKeepaliveNoop() {}
  var webviewKeepaliveBar = document.createElement('div');
  webviewKeepaliveBar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:rgba(10,16,22,.85);color:#9fe8a9;font:9px/1.35 monospace;padding:3px 6px;pointer-events:none;max-height:52px;overflow:hidden;opacity:0;';
  webviewKeepaliveBarText = document.createElement('div');
  webviewKeepaliveBarText.style.cssText = 'white-space:pre-wrap;word-break:break-all;';
  webviewKeepaliveBar.appendChild(webviewKeepaliveBarText);
  webviewKeepaliveBar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(webviewKeepaliveBar);
  window.addEventListener('touchmove', webviewKeepaliveNoop, { passive: true });
  window.addEventListener('scroll', webviewKeepaliveNoop, { passive: true });
  var webviewKeepaliveLastSample = '';
  setInterval(function () {
    if (document.hidden) return;
    var s = webviewKeepaliveSample();
    if (s !== webviewKeepaliveLastSample) { webviewKeepaliveLastSample = s; webviewKeepaliveBarText.textContent = s; }
  }, 250);
  webviewKeepaliveBarText.textContent = webviewKeepaliveSample();
})();
</script>
</body>
</html>`;
}

function handleAppShellPage() {
  return new Response(buildAppShellPage(), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    }
  });
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
          '无法打开测试验证页。',
          reply_markup: SYS_TAG_MARKUP
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
          '无法打开测试验证页。',
          reply_markup: SYS_TAG_MARKUP
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
        '不会修改任何访客的验证状态。' +
        '链接 ' +
        Math.round((await verifyLinkTtlMs(env)) / 60000) +
        ' 分钟内有效，' +
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
  if (await promptThrottled(env, chatId)) {
    return;
  }

  const base = getPublicOrigin(
    origin,
    env
  );

  if (!base) {
    // 无法确定验证页地址：fail-closed，不再回退静态问题
    // （回退问答等于把验证降级成公开答案）。发未配置提示
    // 并告警管理员；本函数入口已查过提示节流。
    await alertAdminsVerifyUnconfigured(env);

    const promptSent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: chatId,
        text: VERIFY_UNCONFIGURED_TEXT,
        reply_markup: SYS_TAG_MARKUP
      }
    );

    await trackSlotMessage(
      env,
      chatId,
      'verify_prompt_msg_id',
      promptSent?.message_id
    );

    await markPromptSent(env, chatId);

    return;
  }

  const url = await buildVerifyUrl(
    base,
    chatId,
    env
  );

  const promptSent = await telegramApi(
    env.BOT_TOKEN,
    'sendMessage',
    {
      chat_id: chatId,
      text: fillTextTemplate(
        await textConfig('verify_card_text', env),
        {
          minutes: Math.round(
            (await verifyLinkTtlMs(env)) / 60000
          )
        }
      ),
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

  await trackSlotMessage(
    env,
    chatId,
    'verify_prompt_msg_id',
    promptSent?.message_id
  );

  await markPromptSent(env, chatId);
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
          token: token,
          initData: (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || ''
        })
      });

      var data = {};

      try {
        data = await resp.json();
      } catch (ignored) {}

      if (resp.ok && data.ok) {
        if (payload.m === 'test') {
          setStatus('✅ 测试验证成功！这是测试模式，未修改任何访客的验证状态，可以关闭此页面。');
        } else {
          setStatus('✅ 验证成功！可以关闭此页面，回到 Telegram 继续发送消息。');
        }

        if (window.Telegram && Telegram.WebApp) {
          Telegram.WebApp.ready();
        }
      } else if (data.error === 'bad_initdata') {
        setStatus('❌ 验证信息已失效或无法确认身份：请关闭本页，回到与机器人的对话里重新点按钮打开；不要用浏览器直接打开，也不要使用别人转发的链接。');
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


function buildPassPage(params) {
  const payload = JSON.stringify({
    u: String(params.u),
    e: String(params.e),
    n: String(params.n),
    s: String(params.s)
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>验证通行证</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px 16px; background: #17212b; color: #fff; }
  main { max-width: 420px; margin: 0 auto; text-align: center; }
  h1 { font-size: 20px; margin: 8px 0 12px; }
  p { color: #a7b5c4; font-size: 14px; line-height: 1.6; }
  button { margin-top: 14px; padding: 12px 22px; font-size: 16px; border: 0; border-radius: 10px; background: #2b5278; color: #fff; cursor: pointer; }
  button:disabled { opacity: .55; cursor: default; }
  #status { min-height: 24px; color: #fff; margin-top: 14px; }
</style>
</head>
<body>
<main>
  <h1>🎫 验证通行证</h1>
  <p>管理员为你发放了一张一次性通行证。<br>点击下方按钮即可通过验证，回到对话就能直接发消息。</p>
  <button id="go">✅ 确认通过验证</button>
  <p id="status"></p>
</main>
<script>
  var payload = ${payload};
  var btn = document.getElementById('go');
  var st = document.getElementById('status');
  if (window.Telegram && Telegram.WebApp) { Telegram.WebApp.ready(); Telegram.WebApp.expand(); }
  btn.addEventListener('click', function () {
    var initData = (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData) || '';
    if (!initData) {
      st.textContent = '请从 Telegram 里打开这张通行证，不要用浏览器直接打开链接。';
      return;
    }
    btn.disabled = true;
    st.textContent = '正在确认…';
    var body = { u: payload.u, e: payload.e, n: payload.n, s: payload.s, initData: initData };
    fetch('/pass/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.ok) {
        st.textContent = '🎉 验证成功！回到对话即可直接发消息。';
        setTimeout(function () { if (window.Telegram && Telegram.WebApp) Telegram.WebApp.close(); }, 1200);
      } else {
        btn.disabled = false;
        var msgs = {
          bad_signature: '通行证无效或已过期，请联系管理员重新发放。',
          bad_initdata: '验证信息已失效或无法确认身份，请关闭本页，回到与机器人的对话里重新点开通行证。',
          used_or_invalid: '这张通行证已使用或已失效，请联系管理员重新发放。',
          blocked: '账号已被封禁，通行证无法使用，请联系管理员。'
        };
        st.textContent = msgs[d.error] || ('确认失败：' + (d.error || '未知错误'));
      }
    }).catch(function () {
      btn.disabled = false;
      st.textContent = '网络异常，请重试。';
    });
  });
</script>
</body>
</html>`;
}

async function handlePassPage(request, env) {
  const url = new URL(request.url);

  const u = url.searchParams.get('u') || '';
  const e = url.searchParams.get('e') || '';
  const n = url.searchParams.get('n') || '';
  const s = url.searchParams.get('s') || '';

  const valid = await checkPassSignature(u, e, n, s, env);
  const rec = valid ? await passRecordGet(u, env) : null;

  if (!valid || !rec || rec.n !== n || Number(rec.e) !== Number(e)) {
    return new Response(
      '通行证无效或已失效，请联系管理员重新发放。',
      {
        status: 403,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
  }

  return new Response(buildPassPage({ u, e, n, s }), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
    }
  });
}

// confirm 接口节流：签名与打开者身份都验过之后、调用
// 外部校验（siteverify）或读业务数据之前计数。挡的是
// 持本人链接者脚本化高频 POST——每次入站都会放大成
// 一次出站校验加若干 D1 读，还可能招致验证服务对密钥
// 的限流、连累正常访客。同一访客 10 分钟窗口内最多
// 20 次，正常重试远远够不到；确认成功后删键清零。
const CONFIRM_TRY_WINDOW_MS = 10 * 60 * 1000;
const CONFIRM_TRY_MAX = 20;

async function confirmTryAllowed(env, keyPrefix, userId) {
  const key = `${keyPrefix}:${userId}`;
  let raw = await dbConfigGet(key, env);

  // CAS 计数（与问答答错计数同模式）：读原始串 → 条件
  // 写，冲突就重读重试；裸读-加-写在并发下会互相覆盖、
  // 把实际上限放大成「上限 × 并发度」。
  for (let casTry = 0; casTry < 5; casTry += 1) {
    const now = Date.now();

    let rec = null;

    try {
      rec = safeJsonParse(raw, null);
    } catch {
      rec = null;
    }

    if (
      !rec ||
      typeof rec !== 'object' ||
      !Number(rec.w) ||
      now - Number(rec.w) >= CONFIRM_TRY_WINDOW_MS
    ) {
      rec = { n: 0, w: now };
    }

    rec.n = Number(rec.n || 0) + 1;

    const nextValue = JSON.stringify(rec);

    let wrote = false;

    if (raw === null || raw === undefined) {
      // 行不存在：原子占用创建（与问答计数
      // recordQuizWrongAttempt 的创建路径同原语）。
      wrote = await dbConfigClaim(key, nextValue, env);
    } else {
      wrote = await dbConfigPutIfValue(
        key,
        raw,
        nextValue,
        env
      );
    }

    if (wrote) {
      return rec.n <= CONFIRM_TRY_MAX;
    }

    raw = await dbConfigGet(key, env);
  }

  // 多次冲突后兜底：以最新读到的计数无条件写入
  // （尽力而为，与问答计数同口径）。
  const now = Date.now();

  let rec = null;

  try {
    rec = safeJsonParse(raw, null);
  } catch {
    rec = null;
  }

  if (
    !rec ||
    typeof rec !== 'object' ||
    !Number(rec.w) ||
    now - Number(rec.w) >= CONFIRM_TRY_WINDOW_MS
  ) {
    rec = { n: 0, w: now };
  }

  rec.n = Number(rec.n || 0) + 1;

  await dbConfigPut(key, JSON.stringify(rec), env);

  return rec.n <= CONFIRM_TRY_MAX;
}

async function handlePassConfirm(request, env) {
  const jsonResponse = (status, data) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });

  let body;

  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { ok: false, error: 'bad_json' });
  }

  const u = String(body?.u || '');
  const e = String(body?.e || '');
  const n = String(body?.n || '');
  const s = String(body?.s || '');

  const valid = await checkPassSignature(u, e, n, s, env);

  if (!valid) {
    return jsonResponse(403, { ok: false, error: 'bad_signature' });
  }

  const openerId = await telegramInitDataUserId(
    body?.initData,
    env.BOT_TOKEN
  );

  if (openerId !== u) {
    return jsonResponse(403, { ok: false, error: 'bad_initdata' });
  }

  if (
    !(await confirmTryAllowed(env, 'passconfirmtry', u))
  ) {
    return jsonResponse(429, {
      ok: false,
      error: 'too_many_attempts'
    });
  }

  const rec = await passRecordGet(u, env);

  if (!rec || rec.n !== n || Number(rec.e) !== Number(e)) {
    return jsonResponse(403, { ok: false, error: 'used_or_invalid' });
  }

  const user = await dbUserGetOrCreate(u, env);

  if (Number(user.is_blocked || 0) === 1) {
    return jsonResponse(403, { ok: false, error: 'blocked' });
  }

  // 先置已验证、再消费通行证（与验证确认路径同一顺序）：
  // 中途失败时证还在，访客可以重试，不会证没了人没过。
  const wasVerified =
    user.user_state === USER_STATE.VERIFIED;

  if (!wasVerified) {
    await dbUserUpdate(
      u,
      { user_state: USER_STATE.VERIFIED },
      env
    );
  }

  await dbConfigDelete(`pass:${u}`, env);

  if (rec.m) {
    await quietDeleteMessage(env, u, rec.m);
  }

  await cleanupAfterVerified(env, u);

  if (!wasVerified) {
    await sendVerifySuccessReceipt(env, u);
  }

  await dbConfigDelete(`passconfirmtry:${u}`, env);

  return jsonResponse(200, { ok: true });
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
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
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

  // 与通行证同一口径：链接不再是纯持有凭证——校验打开者
  // 身份（Mini App initData），必须与链接绑定的访客一致，
  // 转发出去的链接别人点开也用不了。
  const openerId = await telegramInitDataUserId(
    body?.initData,
    env.BOT_TOKEN
  );

  if (!openerId || openerId !== u) {
    return jsonResponse(403, {
      ok: false,
      error: 'bad_initdata'
    });
  }

  if (
    !(await confirmTryAllowed(env, 'confirmtry', u))
  ) {
    return jsonResponse(429, {
      ok: false,
      error: 'too_many_attempts'
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
        body: form,
        signal: AbortSignal.timeout(10000)
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

  // hostname 改 fail-closed：siteverify 没回 hostname
  // 直接拒（原先「有值才比对」等于给缺字段留后门）。
  // 比对对象是允许列表：PUBLIC_URL 的域名（配了才有）
  // 与本次请求的域名，多域名部署两边都认。
  const allowedHosts = new Set([
    new URL(request.url).hostname
  ]);

  const configuredOrigin = String(
    env.PUBLIC_URL || ''
  ).trim();

  if (configuredOrigin) {
    try {
      allowedHosts.add(
        new URL(configuredOrigin).hostname
      );
    } catch {}
  }

  if (
    !verifyResult.hostname ||
    !allowedHosts.has(verifyResult.hostname)
  ) {
    console.warn(
      'Turnstile hostname 不匹配：',
      verifyResult.hostname,
      [...allowedHosts].join(',')
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

    await dbConfigDelete(`confirmtry:${u}`, env);

    return jsonResponse(200, {
      ok: true,
      test: true
    });
  }

  const user =
    await dbUserGetOrCreate(u, env);

  if (Number(user.is_blocked || 0) === 1) {
    return jsonResponse(403, {
      ok: false,
      error: 'blocked'
    });
  }

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

    await cleanupAfterVerified(env, u);

    await sendVerifySuccessReceipt(env, u);
  }

  await dbConfigDelete(`confirmtry:${u}`, env);

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

// 封禁/解封的统一生效口径：/ban、/unban、资料卡、网页列表与
// 关键词自动封禁全部走这里，任何入口的效果完全一致。
// 封禁：写标记；先撤未销的解封通知；再发封禁通知并把编号记进
// bannotice:<uid>（已在册则不重发，保证永远只有一条）。
// 解封：写标记并清零命中计数；先撤封禁通知；再发解封通知并把
// 编号记进 unbannotice:<uid>（旧的先撤，保证永远只有一条），
// 该通知由访客的下一条新消息撤回（见 handlePrivateMessage）。
// 通知发送失败（对方已先拉黑机器人等）只记日志，不中断状态变更。
async function applyBlockState(userId, blocked, env) {
  const uid = String(userId);

  if (blocked) {
    await dbUserUpdate(
      uid,
      { is_blocked: true },
      env,
      { touchActivity: false }
    );

    const staleUnbanNotice =
      await dbConfigGet(`unbannotice:${uid}`, env);

    if (staleUnbanNotice) {
      await quietDeleteMessage(
        env,
        uid,
        staleUnbanNotice
      );

      await dbConfigDelete(
        `unbannotice:${uid}`,
        env
      );
    }

    const existingBanNotice =
      await dbConfigGet(`bannotice:${uid}`, env);

    if (!existingBanNotice) {
      try {
        const sent = await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: uid,
            text: await textConfig(
              'visitor_blocked_text',
              env
            ),
              reply_markup: SYS_TAG_MARKUP
          }
        );

        if (sent?.message_id) {
          await dbConfigPut(
            `bannotice:${uid}`,
            String(sent.message_id),
            env
          );
        }
      } catch (error) {
        console.error(
          '发送封禁通知失败：',
          error?.message || error
        );
      }
    }

    return;
  }

  await dbUserUpdate(
    uid,
    {
      is_blocked: false,
      block_count: 0
    },
    env,
    { touchActivity: false }
  );

  const staleBanNotice =
    await dbConfigGet(`bannotice:${uid}`, env);

  if (staleBanNotice) {
    await quietDeleteMessage(
      env,
      uid,
      staleBanNotice
    );

    await dbConfigDelete(
      `bannotice:${uid}`,
      env
    );
  }

  const staleUnbanNotice =
    await dbConfigGet(`unbannotice:${uid}`, env);

  if (staleUnbanNotice) {
    await quietDeleteMessage(
      env,
      uid,
      staleUnbanNotice
    );

    await dbConfigDelete(
      `unbannotice:${uid}`,
      env
    );
  }

  try {
    const sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: uid,
        text: await textConfig(
          'visitor_unblocked_text',
          env
        ),
          reply_markup: SYS_TAG_MARKUP
      }
    );

    if (sent?.message_id) {
      await dbConfigPut(
        `unbannotice:${uid}`,
        String(sent.message_id),
        env
      );
    }
  } catch (error) {
    console.error(
      '发送解禁通知失败：',
      error?.message || error
    );
  }
}

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
      text: fillTextTemplate(
        await textConfig('keyword_hit_text', env),
        {
          count: result.currentCount,
          threshold
        }
      ),
        reply_markup: SYS_TAG_MARKUP
    }
  );

  if (result.shouldAutoBlock) {
    // 自动封禁与其余封禁入口同口径，走统一生效函数：
    // 发在册的封禁通知，不再另发一条专属文案。
    await applyBlockState(userId, true, env);
  }

  console.log(
    `访客 ${userId} 命中关键词：`,
    hitKeyword
  );
}

/* -------------------------------------------------------------------------- */
/*                 转发失败通知与已验证访客限速（审计第四轮新增）                */
/* -------------------------------------------------------------------------- */

const RELAY_FAIL_NOTICE_MIN_MS = 10 * 60 * 1000;

function isRightsError(error) {
  const text = String(
    error?.message || error
  ).toLowerCase();

  return (
    text.includes('not enough rights') ||
    text.includes('administrator rights') ||
    text.includes('chat admin required') ||
    text.includes('bot is not a member') ||
    text.includes('bot was kicked')
  );
}

// 转发失败不再静默：节流后往访客话题里留一行提醒；
// 话题发不进去（群权限丢失等）时改走主管理员私聊兜底。
async function notifyRelayFailure(
  message,
  user,
  env,
  error
) {
  const userId = String(message.from.id);

  // 本函数由转发失败的 catch 调用：开关读再失败也不能覆盖原失败路径，
  // 读不到就按默认（开）处理。
  let failNoticeEnabled = true;

  try {
    failNoticeEnabled =
      (await getConfig(
        'relay_fail_notice_enabled',
        env,
        'true'
      )) === 'true';
  } catch (_) {
    failNoticeEnabled = true;
  }

  if (!failNoticeEnabled) {
    return;
  }

  try {
    const throttleKey = `copyfail:${userId}`;
    const last = Number(
      (await dbConfigGet(throttleKey, env)) || 0
    );

    if (
      Date.now() - last <
      RELAY_FAIL_NOTICE_MIN_MS
    ) {
      return;
    }

    await dbConfigPut(
      throttleKey,
      String(Date.now()),
      env
    );

    if (isRightsError(error)) {
      await notifyPrimaryAdmins(
        env,
        '⚠️ 机器人似乎已失去管理群的管理员权限，' +
        '访客消息无法转发进话题，请检查群权限。'
      );

      return;
    }

    const fresh = await dbUserGet(userId, env);
    const topicId =
      fresh?.topic_id || user?.topic_id;

    let delivered = false;

    if (topicId) {
      try {
        await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: env.ADMIN_GROUP_ID,
            message_thread_id: Number(topicId),
            text:
              '⚠️ 访客发来的一条消息未能转发到话题' +
              '（内容可能受保护限制或接口异常），' +
              '对方以为已发送成功，请留意。',
              reply_markup: SYS_TAG_MARKUP
          }
        );

        delivered = true;
      } catch (_) {
        delivered = false;
      }
    }

    if (!delivered) {
      await notifyPrimaryAdmins(
        env,
        `⚠️ 访客 ${userId} 的一条消息转发失败，` +
        '未能送达话题。'
      );
    }
  } catch (_) {
    /* 通知失败不影响主流程 */
  }
}

// 已验证访客转发限速（内存令牌桶，尽力而为）：
// 挡住刷屏把 D1 写入与 Telegram 调用成倍放大烧穿
// 免费额度；超速消息直接丢弃并节流提醒。
const relayBuckets = new Map();
const RELAY_LIMIT_NOTICE_MIN_MS = 10 * 60 * 1000;

function relayRateLimitAllow(userId, capacity, refillPerSec) {
  const now = Date.now();

  let bucket = relayBuckets.get(userId);

  if (!bucket) {
    if (relayBuckets.size >= 1000) {
      relayBuckets.delete(
        relayBuckets.keys().next().value
      );
    }

    bucket = {
      tokens: capacity,
      at: now,
      noticedAt: 0
    };

    relayBuckets.set(userId, bucket);
  }

  const elapsedSec = (now - bucket.at) / 1000;

  bucket.tokens = Math.min(
    capacity,
    bucket.tokens +
      elapsedSec * refillPerSec
  );

  bucket.at = now;

  if (bucket.tokens < 1) {
    return false;
  }

  bucket.tokens -= 1;

  return true;
}

async function notifyRelayRateLimited(user, env) {
  const userId = String(user?.user_id || '');
  const bucket = relayBuckets.get(userId);
  const now = Date.now();

  if (
    bucket &&
    now - bucket.noticedAt <
      RELAY_LIMIT_NOTICE_MIN_MS
  ) {
    return;
  }

  if (bucket) {
    bucket.noticedAt = now;
  }

  if (!user?.topic_id) {
    return;
  }

  try {
    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(user.topic_id),
        text:
          '⚠️ 该访客发送消息过于频繁，' +
          '超出部分已被限流丢弃。',
          reply_markup: SYS_TAG_MARKUP
      }
    );
  } catch (_) {
    /* 提醒失败不影响限速本身 */
  }
}

async function handlePrivateMessage(
  message,
  env,
  origin = '',
  ctx = null
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

  // 被屏蔽访客的新消息：先从其私聊里删掉这条消息再
  // 丢弃（与熔断期间删消息同手法），不转发、不回复、
  // 不发任何提示。收口放在全部命令分发之前，普通消息
  // 与 /start 等命令消息一并适用；管理员（含协管员）
  // 豁免。熔断闸门在 handleUpdate 更前面处理熔断期
  // 消息，两边互不干扰（重复删由 quiet 口径吞掉）。
  if (!isAdmin) {
    const earlyUser =
      await dbUserGet(userId, env);

    if (earlyUser?.is_blocked) {
      await quietDeleteMessage(
        env,
        chatId,
        message.message_id
      );

      return;
    }

    // 解封通知只保留到访客的下一条新消息：此刻先撤回
    // 并清键，再照常处理这条消息。仍被封禁者已在上方
    // 返回，且封禁生效时已连带清掉解封通知，不会走到
    // 这里误撤。
    const staleUnbanNotice =
      await dbConfigGet(`unbannotice:${userId}`, env);

    if (staleUnbanNotice) {
      await quietDeleteMessage(
        env,
        chatId,
        staleUnbanNotice
      );

      await dbConfigDelete(
        `unbannotice:${userId}`,
        env
      );
    }
  }

  if (commandText === '/start') {
    if (isPrimary) {
      await showMainMenu(chatId, env, 0, message.message_id || 0, origin);
      return;
    }

    // 访客的 /start 在机器人应答之前先删掉：这条命令
    // 消息不进转发配对，留在私聊里只会在日后整段清空
    // 时成为删不掉的尾巴。删除走 quiet 口径，失败不拦
    // 回复——失败时下方 startmsg 记账仍是兜底（验证成
    // 功/首条真实消息的清理点会再删一次）。管理员与协
    // 管员不删（其 /start 是主菜单入口）。/help 命令已
    // 删除（-v162b8），不再是 /start 的别名：手打 /help
    // 按普通消息路径处理，不进本分支。被封禁访客在函数入口的
    // 早检处已连消息一并删除、到不了这里。
    if (!isAdmin && commandText === '/start') {
      await quietDeleteMessage(
        env,
        chatId,
        message.message_id
      );
    }

    const user =
      await dbUserGetOrCreate(
        userId,
        env
      );

    if (!isAdmin) {
      await captureVisitorNameIfMissing(
        user,
        message.from,
        message.date,
        env
      );
    }

    // 被封禁的访客发 /start 一律静默：不重发欢迎消息
    // （「验证成功」云云与其实际状态相反、纯误导），
    // 也不走 handleStart 发验证提示。主管理员在上方
    // 已回菜单，不受影响。
    if (user.is_blocked) {
      return;
    }

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
            '✅ 已获协管员授权，可以在管理群访客话题中回复消息。',
            reply_markup: SYS_TAG_MARKUP
        }
      );

      return;
    }

    // 被信任的访客点 /start 也应直接放行（下面随即按已验证回应），
    // 而不是先收到一条验证提示、再等下一条普通消息才被闸门放行。
    if (
      user.is_trusted &&
      !user.is_blocked &&
      user.user_state !== USER_STATE.VERIFIED
    ) {
      await dbUserUpdate(
        userId,
        { user_state: USER_STATE.VERIFIED },
        env
      );

      user.user_state = USER_STATE.VERIFIED;

      await cleanupAfterVerified(env, chatId);
    }

    if (
      user.user_state ===
      USER_STATE.VERIFIED
    ) {
      // 已验证访客重发 /start 的回应已并入欢迎消息：
      // 不再另发写死的单独提示，改走与验证成功回执同一
      // 条发送口——文案取 welcomeMsgText（welcome_msg
      // 的当前有效值，管理台改了就跟随）、挂系统提示
      // 牌、记 receipt_msg_id 槽位；发送口内部的记账
      // 重试与「记不上就自删防孤儿」对本场景同样适用，
      // 一并复用。它不做任何状态迁移、也不清其他槽位
      // 或通行证，没有多余副作用可带入。发前先清旧回
      // 执槽位与旧口径一致：同类消息只留最新一条。
      await clearSlotMessage(
        env,
        chatId,
        'receipt_msg_id'
      );

      await sendVerifySuccessReceipt(env, chatId);
      // 与未验证分支同口径记下这条 /start（只记最新一条）：
      // 入口处已先删，这本账只作即时删除
      // 失败时的兜底——已验证访客不会再有「验证成功收
      // 尾」来撤它，改由首条真实消息的回执清理点连带
      // 再删（见 clearTrackedStartMessage）。
      if (commandText === '/start' && message.message_id) {
        await dbConfigPut(
          `startmsg:${userId}`,
          String(message.message_id),
          env
        );
      }

    } else {
      // 记下这条 /start 的编号（只记最新一条）：入口处已
      // 先删，这本账只作即时删除失败时的兜底——验证成
      // 功时由 cleanupAfterVerified 再删一次。
      // /help 命令已删除（-v162b8），没有别名入口需要记账。
      if (commandText === '/start' && message.message_id) {
        await dbConfigPut(
          `startmsg:${userId}`,
          String(message.message_id),
          env
        );
      }

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
        describeUpdateState(
          state,
          await getDisplayTimeZone(env)
        );

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
          disable_web_page_preview: true,
          reply_markup: SYS_TAG_MARKUP
        }
      );
    }

    return;
  }

  const pauseMatch = commandText.match(
    /^\/pause(?:\s+(\d+))?$/
  );

  if (commandText === '/panel') {
    if (isPrimary) {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: '🛠 网页管理台（链接 10 分钟内有效，过期重新发送 /panel）。',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🛠 打开网页管理台',
                  web_app: {
                    url: await buildPanelUrl(
                      origin,
                      userId,
                      env
                    )
                  }
                }
              ]
            ]
          }
        }
      );
    }

    return;
  }

  if (pauseMatch || commandText === '/resume') {
    if (isPrimary) {
      if (commandText === '/resume') {
        const state = await getPauseState(env);

        if (!state) {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text: 'ℹ️ 当前没有处于暂停状态。',
              reply_markup: SYS_TAG_MARKUP
            }
          );
        } else {
          await performResume(env, userId, ctx);

          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text:
                '▶️ 机器人已恢复服务，' +
                '访客消息恢复正常转发。',
                reply_markup: SYS_TAG_MARKUP
            }
          );
        }
      } else {
        const state = await getPauseState(env);
        const arg = pauseMatch[1];

        if (!arg && state) {
          await telegramApi(
            env.BOT_TOKEN,
            'sendMessage',
            {
              chat_id: chatId,
              text:
                `⏸ 服务熔断进行中，${describePauseRemaining(state)}。\n` +
                '重新计时发送 /pause 分钟数，' +
                '立即恢复发送 /resume。\n' +
                'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；若一直没人发消息，收不到通知是正常的——服务熔断其实已经结束，只是没通知。',
                reply_markup: SYS_TAG_MARKUP
            }
          );
        } else {
          const minutes = arg
            ? Number(arg)
            : PAUSE_DEFAULT_MINUTES;

          if (
            !Number.isInteger(minutes) ||
            minutes < 1 ||
            minutes > PAUSE_MAX_MINUTES
          ) {
            await telegramApi(
              env.BOT_TOKEN,
              'sendMessage',
              {
                chat_id: chatId,
                text:
                  '⚠️ 用法：/pause [分钟数]，' +
                  '例如 /pause 30；不带数字默认 60 分钟，' +
                  '最大 10080 分钟（7 天）。',
                  reply_markup: SYS_TAG_MARKUP
              }
            );
          } else {
            const fresh = await performPause(
              env,
              minutes,
              userId
            );

            const replyOn =
              (await getConfig(
                'pause_reply_enabled',
                env,
                'true'
              )) === 'true';

            await telegramApi(
              env.BOT_TOKEN,
              'sendMessage',
              {
                chat_id: chatId,
                text:
                  `⏸ 服务熔断已开启，${describePauseRemaining(fresh)}。\n` +
                  '暂停期间访客新发的消息会被删除（对已送达消息的编辑与反应同样拒收）' +
                  (replyOn
                    ? '，每位访客会收到一条回复提醒'
                    : '，且不会收到任何回复') +
                  '。恢复请发送 /resume。\n' +
                  'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；若一直没人发消息，收不到通知是正常的——服务熔断其实已经结束，只是没通知。',
                  reply_markup: SYS_TAG_MARKUP
              }
            );
          }
        }
      }
    }

    return;
  }

  const user =
    await dbUserGetOrCreate(
      userId,
      env
    );

  if (!isAdmin) {
    await captureVisitorNameIfMissing(
      user,
      message.from,
      message.date,
      env
    );
  }

  if (user.is_blocked) {
    return;
  }

  if (!isAdmin) {
    await sweepExpiredPass(env, userId);
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
    user.is_trusted &&
    !user.is_blocked &&
    user.user_state !== USER_STATE.VERIFIED
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

    await cleanupAfterVerified(env, userId);
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

    if (mode === 'unconfigured') {
      // 验证未配置：不把访客文字当问答答案处理，
      // 回未配置提示（内含管理员告警与节流）。
      await sendVerifyUnconfiguredPrompt(
        chatId,
        env
      );

      return;
    }

    if (mode === 'sequence') {
      // 顺序点击模式下文字不是答案：不进问答判题，
      // 走文字兜底口径唤起题目（sendSequencePrompt 内有
      // 活题保护、节流与锁定处理），与 Turnstile 分支同构。
      await sendSequencePrompt(
        chatId,
        env
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
            'ℹ️ 请使用文字回答验证问题。',
            reply_markup: SYS_TAG_MARKUP
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
          'ℹ️ 请使用 /start 命令开始验证。',
          reply_markup: SYS_TAG_MARKUP
      }
    );

    return;
  }

  if (isAdmin) {
    // 管理员（含主管理员与协管员）在私聊里发普通消息：
    // 私聊侧是访客通道，不把管理员的话转发进话题、
    // 更不为其自建话题；回复访客请去管理群的话题里。
    // 提示按 3 分钟节流（与验证提示同口径），避免连发刷屏。
    const lastHint = Number(
      (await dbConfigGet(
        `adminhint:${userId}`,
        env
      )) || 0
    );

    if (Date.now() - lastHint >= PROMPT_RESEND_MIN_MS) {
      await dbConfigPut(
        `adminhint:${userId}`,
        String(Date.now()),
        env
      );

      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text:
            'ℹ️ 私聊里请使用命令或菜单；' +
            '要回复访客，请到管理群的话题里发送。',
            reply_markup: SYS_TAG_MARKUP
        }
      );
    }

    return;
  }

  // 成功回执的使命在「已验证访客开始正常发消息」时就
  // 已经完成：不等转发成功，先在进入关键词/过滤/限流
  // 之前撤回。否则第一条消息若被关键词拦下、被类型
  // 过滤拒绝或被限流丢弃（都在转发之前返回），回执会
  // 永远等不到转发末尾的那次清理；转发中途抛错同理。
  // 用已加载的 user 行把关，没有在册回执就不多读一次；
  // 转发末尾原有的清理保留作兜底（届时槽位已空，是空转）。
  if (user.receipt_msg_id) {
    await clearSlotMessage(
      env,
      userId,
      'receipt_msg_id'
    );
    await clearTrackedStartMessage(env, userId);
  }

  // 「✅ 服务已恢复」卡的撤回不挂上面的回执守卫：老访客
  // 的回执槽位在首条消息后就已清空（常态为空），挂在守
  // 卫里等于对他们恒不撤回——恢复后的第一条消息无论随
  // 后被关键词拦下、被过滤拒绝还是被限流丢弃，都应先
  // 把 ✅ 撤掉，与回执同一存在理由。没有转记行时
  // clearRestoredPauseCard 只是一次点读、无行不写库；
  // 清理失败包 try，不拖累正文处理。
  try {
    await clearRestoredPauseCard(env, userId);
  } catch (error) {
    console.error(
      '撤回已恢复提示失败：',
      error?.message || error
    );
  }

  // 信任豁免连关键词一并覆盖：命中不拦截、不计数、
  // 不触发自动封禁，消息照常往下转发。计数与自动封禁
  // 的唯一收口是 handleBlockedKeyword，全文件只有本处
  // 与编辑中继两处会走到它，两处都在入口按信任短路。
  const hitKeyword = user.is_trusted
    ? null
    : await findBlockKeyword(text, env);

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
    user.relay_exempt
      ? { ok: true }
      : await checkForwardFilters(
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
          filterResult.reason,
          reply_markup: SYS_TAG_MARKUP
      }
    );

    return;
  }

  const autoReply =
    await matchAutoReply(text, env);

  if (autoReply) {
    // 自动回复只是前置招呼：发送失败不能拖垮后面的正式转发
    // （update 已被消费，异常逃出这条消息就永久丢了）。
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: chatId,
          text: autoReply,
          reply_markup: SYS_TAG_MARKUP
        }
      );
    } catch (error) {
      console.error(
        '发送自动回复失败（继续转发）：',
        error?.message || error
      );
    }
  }

  if (!user.relay_exempt) {
    // 这两读在转发容错之外：读失败绝不能让已消费的消息静默丢失，
    // 失败就用默认参数继续转发。
    let relayBurst = 30;
    let relayRefill = 5;

    try {
      relayBurst = await clampedIntConfig(
        'relay_burst',
        env,
        30,
        1,
        100
      );

      relayRefill = await clampedIntConfig(
        'relay_refill_per_sec',
        env,
        5,
        1,
        20
      );
    } catch (error) {
      console.error(
        '读取转发限流参数失败，按默认值继续：',
        error?.message || error
      );
    }

    if (
      !relayRateLimitAllow(
        userId,
        relayBurst,
        relayRefill
      )
    ) {
      await notifyRelayRateLimited(user, env);

      return;
    }
  }

  try {
    await relayUserMessageToTopic(
      message,
      user,
      env
    );
  } catch (error) {
    // 两类错误必须上抛走失败重推，不能按「转发失败」
    // 吞掉：限流延迟（稍后重推即可送达）与配对落库
    // 失败（复制其实已成功，重推靠意向行补配对）。
    if (
      error?.name === 'RateLimitDeferred' ||
      error?.name === 'PairPersistError'
    ) {
      throw error;
    }

    console.error(
      '转发访客消息失败：',
      error?.message || error
    );

    await notifyRelayFailure(
      message,
      user,
      env,
      error
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              管理员回复处理                                   */
/* -------------------------------------------------------------------------- */
function parseAdminCommand(text) {
  const value = String(text || '').trim();

  const match = value.match(
    /^\/([a-zA-Z_]+)(?:@(\w+))?(?:\s+([\s\S]+))?$/
  );

  if (!match) {
    return null;
  }

  return {
    command: match[1].toLowerCase(),
    suffix: match[2] || '',
    argument: match[3]?.trim() || ''
  };
}

// 本机器人用户名（getMe 拉一次后缓存进 config）：
// 用于识别「/命令@别的机器人」——那是发给别人的，
// 本机器人应完全忽略，而不是照常执行或吞掉。
async function getBotUsername(env) {
  const cached = await dbConfigGet(
    'sys:bot-username',
    env
  );

  if (cached) {
    return cached;
  }

  try {
    const me = await telegramApi(
      env.BOT_TOKEN,
      'getMe',
      {}
    );

    const name = String(me?.username || '');

    if (name) {
      await dbConfigPut(
        'sys:bot-username',
        name,
        env
      );
    }

    return name;
  } catch (_) {
    return '';
  }
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

// 话题内系统通知的统一发送口：调用方全是命令回执与
// 错误提示类自动消息（本身都不带按钮），故在此统一
// 附「系统提示」标签（SYS_TAG_MARKUP），一处覆盖全部。
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
      text,
      reply_markup: SYS_TAG_MARKUP
    }
  );
}

// 短暂通知：命令回执类提示看过即走，发出约 5 秒后自动删除，不在话题里留痕。
// 删除任务挂在 ctx.waitUntil 上（尽力而为）；时长可用 EPHEMERAL_NOTICE_MS 覆盖。
async function sendEphemeralTopicNotice(
  message,
  text,
  env,
  ctx
) {
  const sent =
    await sendTopicNotice(message, text, env);

  const noticeId = sent?.message_id;

  if (!noticeId) {
    return sent;
  }

  // 时长读在通知发出后、且调用方后面还接着命令撤回等步骤：
  // 读失败绝不能把整条链抛断，失败用默认 5 秒。
  let staySec = 5;

  try {
    staySec = await clampedIntConfig(
      'notice_stay_sec',
      env,
      5,
      1,
      120
    );
  } catch (_) {
    staySec = 5;
  }

  const delayMs =
    Number(env?.EPHEMERAL_NOTICE_MS) > 0
      ? Number(env.EPHEMERAL_NOTICE_MS)
      : staySec * 1000;

  // 落一条待删记账：定时删除挂在请求上下文上，
  // 万一上下文被回收没删成，数据库清扫会按记账
  // 补删（见 sweepEphemeralNotices）。
  const markerKey = `ephem:${noticeId}`;

  try {
    await dbConfigPut(
      markerKey,
      JSON.stringify({
        c: String(env.ADMIN_GROUP_ID),
        at: Date.now() + delayMs
      }),
      env
    );
  } catch (_) {
    /* 记账失败不影响短暂通知本身 */
  }

  const task = (async () => {
    await sleep(delayMs);

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      noticeId
    );

    await dbConfigDelete(markerKey, env);
  })();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
  } else {
    task.catch(() => {});
  }

  return sent;
}

async function handleAdminCommand(
  message,
  env,
  ctx = null
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
  'clear',
  'terminate',
  'card',
  'reverify',
  'note',
  'notedelete',
  'pause',
  'resume'
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

  if (
    parsed.command === 'pause' ||
    parsed.command === 'resume'
  ) {
    if (!isPrimaryAdmin(senderId, env)) {
      await sendTopicNotice(
        message,
        '⚠️ 服务熔断开关仅主管理员可操作。',
        env
      );

      return true;
    }

    if (parsed.command === 'resume') {
      const state = await getPauseState(env);

      if (!state) {
        await sendEphemeralTopicNotice(
          message,
          'ℹ️ 当前没有处于暂停状态。',
          env,
          ctx
        );
      } else {
        await performResume(env, senderId, ctx);

        await sendEphemeralTopicNotice(
          message,
          '▶️ 机器人已恢复服务。',
          env,
          ctx
        );
      }

      return true;
    }

    const state = await getPauseState(env);
    const arg = String(parsed.argument || '').trim();

    if (!arg && state) {
      await sendEphemeralTopicNotice(
        message,
        `⏸ 服务熔断进行中，${describePauseRemaining(state)}。\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`,
        env,
        ctx
      );

      return true;
    }

    const minutes = arg
      ? Number(arg)
      : PAUSE_DEFAULT_MINUTES;

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      await sendTopicNotice(
        message,
        '⚠️ 用法：/pause [分钟数]，例如 /pause 30；' +
          '不带数字默认 60 分钟。',
        env
      );

      return true;
    }

    const fresh = await performPause(
      env,
      minutes,
      senderId
    );

    await sendEphemeralTopicNotice(
      message,
      `⏸ 服务熔断已开启，${describePauseRemaining(fresh)}。\nℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。`,
      env,
      ctx
    );

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
          '⚠️ 这些命令只能在访客话题中使用。',
          reply_markup: SYS_TAG_MARKUP
      }
    );

    return true;
  }

  // 目标保护：带访客目标的命令不得作用于管理员账号
  // （与资料卡回调、网页操作的口径一致；此前命令路径缺此校验，
  // 协管员可用显式 ID 封禁主管理员或改绑话题）。
  if (
    [
      'reverify',
      'note',
      'notedelete',
      'ban',
      'unban',
      'card',
      'terminate'
    ].includes(parsed.command)
  ) {
    const guardTarget =
      parsed.command === 'note' ||
      parsed.command === 'notedelete'
        ? await resolveTopicUserId(message, env)
        : await resolveTopicUserId(
            message,
            env,
            parsed.argument
          );

    if (
      guardTarget &&
      (await isAdminUser(guardTarget, env))
    ) {
      await sendTopicNotice(
        message,
        '⚠️ 不能对管理员账号执行此操作。',
        env
      );

      return true;
    }
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
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/reverify 访客ID。',
        env
      );

      return true;
    }

    await dbUserUpdate(
      userId,
      {
        user_state: USER_STATE.PENDING,
        is_trusted: 0,
        relay_exempt: 0
      },
      env,
      { touchActivity: false }
    );

    await voidUserPass(env, userId);

    // 在途顺序点击题目一并作废（与作废通行证同口径）。
    await dbConfigDelete(`seq:${userId}`, env);

    await sendEphemeralTopicNotice(
      message,
      '🔄 已将该访客重置为待验证状态。\n' +
      '对方下次发送消息或 /start 时，' +
      '将重新进行人机验证。',
      env,
      ctx
    );

    return true;
  }

  if (
    parsed.command === 'note' ||
    parsed.command === 'notedelete'
  ) {
    // 备注命令只按话题定位访客，绝不把参数当作访客 ID
    // （备注内容可能以数字开头）。
    const userId =
      await resolveTopicUserId(
        message,
        env
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。',
        env
      );

      return 'keep';
    }

    const target =
      await dbUserGetOrCreate(userId, env);

    if (parsed.command === 'notedelete') {
      if (!target.admin_note) {
        await sendEphemeralTopicNotice(
          message,
          '📝 当前没有备注可删除。',
          env,
          ctx
        );

        return true;
      }

      await dbUserUpdate(
        userId,
        { admin_note: '' },
        env,
        { touchActivity: false }
      );

      await refreshCardAfterNoteChange(
        userId,
        env
      );

      await sendEphemeralTopicNotice(
        message,
        '🗑 备注已删除。',
        env,
        ctx
      );

      return true;
    }

    const noteText = parsed.argument;

    if (!noteText) {
      await sendEphemeralTopicNotice(
        message,
        target.admin_note
          ? `📝 当前备注：\n${target.admin_note}`
          : '📝 当前暂无备注。\n' +
            '用法：/note 备注内容',
        env,
        ctx
      );

      return true;
    }

    if (noteText.length > 500) {
      await sendTopicNotice(
        message,
        '⚠️ 备注太长（上限 500 字），未保存。',
        env
      );

      return 'keep';
    }

    await dbUserUpdate(
      userId,
      { admin_note: noteText },
      env,
      { touchActivity: false }
    );

    await refreshCardAfterNoteChange(
      userId,
      env
    );

    await sendEphemeralTopicNotice(
      message,
      '📝 备注已保存。',
      env,
      ctx
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
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/ban 访客ID。',
        env
      );

      return true;
    }

    await dbUserGetOrCreate(
      userId,
      env
    );

    await applyBlockState(userId, true, env);

    await sendEphemeralTopicNotice(
      message,
      `🚫 已封禁访客 ${userId}。`,
      env,
      ctx
    );

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
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/unban 访客ID。',
        env
      );

      return true;
    }

    await applyBlockState(userId, false, env);

    await sendEphemeralTopicNotice(
      message,
      `✅ 已解除访客 ${userId} 的封禁。`,
      env,
      ctx
    );

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
        `${error?.message || error}。`,
        env
      );
    }

    // 连带删除访客私聊中的原消息（存在配对时）：
    // 访客已自行删除（not found）视为已删、不提示；
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
            '⚠️ 话题侧已删除，但访客私聊中的' +
              `原消息删除失败：${reason}。`,
            env
          );
        }
      }
    }

    return true;
  }
  if (parsed.command === 'clear') {
    // 整段清空连访客私聊副本一并删除、不可恢复，
    // 与服务熔断同口径：仅主管理员可操作。
    if (!isPrimaryAdmin(senderId, env)) {
      await sendTopicNotice(
        message,
        '⛔ 整段对话清空仅主管理员可操作。',
        env
      );

      return true;
    }

    const userId =
      await resolveTopicUserId(
        message,
        env
      );

    if (!userId) {
      await sendTopicNotice(
        message,
        '❌ 找不到该话题对应的访客 ID。',
        env
      );

      return true;
    }

    await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id: Number(topicId),
        text:
          `确认清空与访客 ${userId} 的全部聊天记录？\n` +
          '将删除：话题内的全部转发副本、访客私聊中的全部聊天副本，以及全部消息配对记录。\n' +
          '⚠️ 私聊里 48 小时前的消息删不掉，执行后会报告条数。\n' +
          '话题本身和访客档案保留，对方之后仍可继续聊天。',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🧹 确认清空',
                callback_data:
                  `clear:yes:${userId}`
              },
              {
                text: '取消',
                callback_data:
                  `clear:no:${userId}`
              }
            ]
          ]
        }
      }
    );

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      message.message_id
    );

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
      '❌ 找不到当前话题对应的访客 ID。\n' +
      '映射丢失时可以使用：/card 访客ID',
      env
    );

    return true;
  }

  try {
    await dbUserGetOrCreate(userId, env);

    // 指定访客 ID 时，将当前话题重新绑定给该访客。
    if (parsed.argument) {
      // 解绑只清绑定：不盖活跃戳——被解绑的原访客并没
      // 有活跃过，盖戳会把他顶成刚刚活跃、并整体重置
      // 其双 TTL 时钟（第十轮审计，与 dbUserUpdate 的
      // touchActivity 口径一致）。
      await env.TG_BOT_DB.prepare(`
        UPDATE users
        SET
          topic_id = NULL,
          info_card_message_id = NULL,
          topic_creating = 0,
          topic_lock_at = NULL
        WHERE topic_id = ?
          AND user_id <> ?
      `).bind(
        topicId,
        String(userId)
      ).run();

      // 被解绑的是「别人」的行，受影响集合不确定，
      // 整表缓存一并失效（低频管理路径，代价可忽略）。
      invalidateAllUserRows(env);

      await dbUserUpdate(
        userId,
        {
          topic_id: topicId,
          topic_creating: false,
          topic_lock_at: null
        },
        env,
        { touchActivity: false }
      );
    }

    await recreateUserInfoCard(
      userId,
      topicId,
      env
    );

    await sendEphemeralTopicNotice(
      message,
      `✅ 访客 ${userId} 的资料卡已重新创建。`,
      env,
      ctx
    );
  } catch (error) {
    console.error(
      `重建访客 ${userId} 的资料卡失败：`,
      error?.stack ||
      error?.message ||
      error
    );

    await sendTopicNotice(
      message,
      `❌ 重新创建资料卡失败：` +
      `${error?.message || error}。`,
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
        '❌ 找不到该话题对应的访客 ID。\n' +
        '也可以使用：/terminate 访客ID。',
        env
      );

      return true;
    }

    // 删除对象以「目标访客记录里的话题」为准，不用当前
    // 消息所在的话题：在 A 的话题里执行 /terminate B 时，
    // 用当前话题会删掉 A 的话题、解绑 B，两边都错位。
    const targetUser =
      await dbUserGet(userId, env);
    const targetTopicId = targetUser?.topic_id
      ? String(targetUser.topic_id)
      : '';

    if (!targetTopicId) {
      await dbUserUpdate(
        userId,
        {
          topic_id: null,
          info_card_message_id: null,
          topic_creating: false,
          topic_lock_at: null
        },
        env,
        { touchActivity: false }
      );

      await sendTopicNotice(
        message,
        'ℹ️ 该访客没有话题可删除，已清除其话题绑定。',
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
            Number(targetTopicId)
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
        env,
        { touchActivity: false }
      );
    } catch (error) {
      await sendTopicNotice(
        message,
        `❌ 删除话题失败：` +
        `${error?.message || error}。`,
        env
      );
    }

    return true;
  }

  return false;
}

async function handleAdminReply(
  message,
  env,
  ctx = null
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

  // 以频道身份发帖等场景下消息可能没有 from：
  // 无从核验发送者身份，直接忽略（避免后面解引用抛错）。
  if (!message.from) {
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
  // 命令带了 @ 后缀且不是本机器人：是发给别的机器人的，
  // 完全忽略（不执行、不提示、不撤回、也不转发给访客）。
  const parsedForTarget =
    parseAdminCommand(message.text);

  if (parsedForTarget?.suffix) {
    const botUsername =
      await getBotUsername(env);

    if (
      botUsername &&
      parsedForTarget.suffix.toLowerCase() !==
        botUsername.toLowerCase()
    ) {
      return;
    }
  }

  const handled =
    await handleAdminCommand(
      message,
      env,
      ctx
    );

  if (handled) {
    // 命令已处理：把管理员发出的命令消息本身也撤回，
    // 话题里只留短暂显示的回执、不留命令原文。
    // （/clear 分支已先行删除，这里重复删会静默跳过。）
    // 例外：handled === 'keep' 表示处理未成功且命令原文
    // 本身是内容载体（如 /note 保存失败），保留原文，
    // 管理员还能照着改了重发。
    if (handled !== 'keep') {
      await quietDeleteMessage(
        env,
        env.ADMIN_GROUP_ID,
        message.message_id
      );
    }

    return;
  }

  // 形如命令但不在白名单里：多半是打错或已下线的命令，
  // 提示管理员并吞掉，不要转发给访客。
  const parsedUnknown =
    parseAdminCommand(message.text);

  if (parsedUnknown) {
    await sendEphemeralTopicNotice(
      message,
      `⚠️ 未识别的命令 /${parsedUnknown.command}，未转发给访客。`,
      env,
      ctx
    );

    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      message.message_id
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
          '❌ 找不到该话题对应的访客 ID，无法转发消息。',
          reply_markup: SYS_TAG_MARKUP
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

    // 改版：只写空正文的路由行，供管理员编辑事件定位目标访客，
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
    // 与访客侧同口径：限流延迟与配对落库失败上抛走
    // 失败重推（复制可能已成功，勿发误导的失败提示）。
    if (
      error?.name === 'RateLimitDeferred' ||
      error?.name === 'PairPersistError'
    ) {
      throw error;
    }

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
              '这条消息未能送达。',
              reply_markup: SYS_TAG_MARKUP
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
          `❌ 转发消息给访客 ${userId} 失败：` +
          `${error?.message || error}。`,
          reply_markup: SYS_TAG_MARKUP
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               编辑消息处理                                    */
/* -------------------------------------------------------------------------- */

// 回退消息的正文截断：转义后的文本按预算截断并避开切碎
// HTML 实体，保证整条消息不超过 Telegram 的 4096 字上限。
function capEscapedText(escaped, max) {
  const chars = [...String(escaped)];

  if (chars.length <= max) {
    return escaped;
  }

  let out = chars.slice(0, max).join('');
  const lastAmp = out.lastIndexOf('&');
  const lastSemi = out.lastIndexOf(';');

  if (lastAmp > lastSemi) {
    out = out.slice(0, lastAmp);
  }

  return out + '…（内容过长，已截断）';
}

// 编辑回退消息（方案 B）：原地同步失败或无配对时，把新
// 内容作为一条「回复对侧旧副本」的消息发过去——上下文
// 由回复引用自带，正文只留新内容，下方附与原地编辑成
// 功时同形的「✍🏼已编辑」标记；原副本保持不动。无配对
// 时没有副本可锚，照发不带锚。带锚发送被 Telegram 以
// 终局错误拒绝（副本已被手动删除等）时，降级为不带锚
// 重发一次，保住消息本身；瞬时错误（限流延迟、429、
// 5xx、无码网络错，与 isTransientTelegramError 同口
// 径）不降级——结果未知或本应延后重来，按既有口径上
// 抛给调用方。建锚时剥掉源消息自带的 quote：锚点是被
// 编辑消息自己的副本，与 quote 指向的不是同一条。
async function sendEditFallbackMessage(
  env,
  params,
  anchorMessageId,
  sourceMessage
) {
  const base = {
    ...params,
    reply_markup: EDIT_MARK_MARKUP
  };

  const anchor = Number(anchorMessageId);

  if (!anchor) {
    return telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      base
    );
  }

  try {
    return await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        ...base,
        reply_parameters:
          buildReplyParameters(
            sourceMessage,
            anchor,
            false
          )
      }
    );
  } catch (error) {
    if (isTransientTelegramError(error)) {
      throw error;
    }

    return telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      base
    );
  }
}

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

  // 信任豁免连关键词一并覆盖：把消息编辑成关键词
  // 内容也照常同步、不计数、不触发自动封禁（与新消息
  // 同一口径，两处执法点都在入口按信任短路）。
  const hitKeyword = user.is_trusted
    ? null
    : await findBlockKeyword(text, env);

  if (hitKeyword) {
    await handleBlockedKeyword(
      userId,
      String(editedMessage.chat.id),
      hitKeyword,
      env
    );

    return;
  }

  const filterResult = user.relay_exempt
    ? { ok: true }
    : await checkForwardFilters(
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
            `${stripLeadingEmoji(filterResult.reason)}`,
            reply_markup: SYS_TAG_MARKUP
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

  const newContent =
    editedMessage.text ||
    editedMessage.caption ||
    '[非文本或媒体内容]';

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `p:${userId}:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退消息。
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
        editedMessage,
        true
      );
  }

  if (editedInPlace) {
    const hintKey =
      `hint:p:${userId}:` +
      `${editedMessage.message_id}`;

    await cleanupLegacyEditHint(env, {
      chatId: env.ADMIN_GROUP_ID,
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

  // 类型门（第十轮审计·中18）：源消息无可同步内容
  // （清单勾选、无说明的付费媒体等）时静默跳过，
  // 不发占位回退假报「已编辑」。
  if (!hasSyncableEditedContent(editedMessage)) {
    return;
  }

  try {
    await maybeAutoRefreshUserCard(
      editedMessage,
      env
    );

    await sendEditFallbackMessage(
      env,
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: capEscapedText(
          escapeHtml(newContent),
          2600
        ),
        parse_mode: 'HTML'
      },
      pair?.text,
      editedMessage
    );
  } catch (error) {
    console.error(
      '处理访客编辑消息失败：',
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

  // 以频道/匿名身份编辑的消息可能没有 from：无从核验
  // 发送者身份，直接忽略（避免下面解引用抛错）。
  if (!editedMessage.from) {
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

  const pair = await dbMessageDataGet(
    REACTION_MAP_USER,
    `t:${editedMessage.message_id}`,
    env
  );

  // 对侧消息已被管理员删除：静默丢弃，不走回退消息。
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
          editedMessage,
          true
        );
    }
  }

  if (editedInPlace) {
    const hintKey =
      `hint:t:${editedMessage.message_id}`;

    await cleanupLegacyEditHint(env, {
      chatId: userId,
      hintKey
    });

    return;
  }

  // 类型门（第十轮审计·中18）：与访客侧同口径——
  // 源消息无可同步内容时静默跳过，不发占位回退。
  if (!hasSyncableEditedContent(editedMessage)) {
    return;
  }

  try {
    await sendEditFallbackMessage(
      env,
      {
        chat_id: userId,
        text: capEscapedText(
          escapeHtml(newText),
          2600
        ),
        parse_mode: 'HTML'
      },
      counterpartId,
      editedMessage
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
      '⚠️ 该按钮只能在管理群中使用。',
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
    'refresh_card',
    'trust',
    'untrust'
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
      '❌ 无效操作。',
      true
    );

    return;
  }

  if (await isAdminUser(targetUserId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 不能对管理员账号执行此操作。',
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
      '❌ 无效操作。',
      true
    );

    return;
  }

  if (
    action === 'trust' ||
    action === 'untrust'
  ) {
    // 信任 = 直接放行进门，仅主管理员可操作
    // （与 /clear、服务熔断的权限口径一致）。
    if (
      !isPrimaryAdmin(callbackQuery.from?.id, env)
    ) {
      await answerCallback(
        callbackQuery.id,
        env,
        '⛔ 信任设置仅主管理员可操作。',
        true
      );

      return;
    }

    if (action === 'untrust') {
      // 合并口径：取消信任连带取消放行，两标记同清。
      await dbUserUpdate(
        targetUserId,
        { is_trusted: 0, relay_exempt: 0 },
        env,
        { touchActivity: false }
      );
    } else {
      if (user.is_blocked) {
        await answerCallback(
          callbackQuery.id,
          env,
          '⚠️ 对方已被封禁，请先解封再设为信任。',
          true
        );

        return;
      }

      if (user.user_state === USER_STATE.VERIFIED) {
        // 已是已验证状态：只补信任标记，不再重复发成功提示、
        // 也不顶掉既有的验证回执槽。
        await dbUserUpdate(
          targetUserId,
          { is_trusted: 1, relay_exempt: 1 },
          env,
          { touchActivity: false }
        );
      } else {
        await dbUserUpdate(
          targetUserId,
          {
            is_trusted: 1,
            relay_exempt: 1,
            user_state: USER_STATE.VERIFIED
          },
          env,
          { touchActivity: false }
        );

        await cleanupAfterVerified(env, targetUserId);

        await sendVerifySuccessReceipt(env, targetUserId);
      }
    }

    user = await dbUserGetOrCreate(
      targetUserId,
      env
    );

    const usernameRaw2 =
      user.user_info?.username_raw || '';

    await telegramApi(
      env.BOT_TOKEN,
      'editMessageReplyMarkup',
      {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: getInfoCardButtons(
          targetUserId,
          user.is_blocked,
          usernameRaw2,
          user.is_trusted,
          user.relay_exempt
        )
      }
    );

    await answerCallback(
      callbackQuery.id,
      env,
      action === 'trust'
        ? '🤝 已设为信任，该访客已通过验证。'
        : '↩️ 已取消信任（当前验证状态不变）。'
    );

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
        `${error?.message || error}。`,
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
      // 与 /ban、/unban 及网页列表完全同口径（统一
      // 生效函数）：解封连带清零关键词命中计数，否则
      // 旧计数仍达阈值、再命中一次就立刻被再次封禁。
      await applyBlockState(
        targetUserId,
        action === 'block',
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
            usernameRaw,
            user.is_trusted,
            user.relay_exempt
          )
      }
    );

    let toast = '✅ 操作成功。';

    if (action === 'block') {
      toast = '🚫 已屏蔽该访客。';
    }

    if (action === 'unblock') {
      toast = '✅ 已解除屏蔽。';
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
  env,
  origin = '',
  ctx = null
) {
  if (!callbackQuery?.from?.id) {
    return;
  }

  const senderId =
    String(callbackQuery.from.id);

  const data =
    String(callbackQuery.data || '');

  // 顺序点击验证的按钮属于待验证访客，须在管理员校验
  // 之前分发；其余回调仍仅限管理员（见下方校验）。
  if (data.startsWith('seq:')) {
    await handleSequenceCallback(
      callbackQuery,
      env
    );

    return;
  }

  // 已编辑标记按钮纯作视觉标记：话题侧点击者是管理
  // 员、私聊侧是访客本人，后者过不了下面的管理员校验
  // ——与 seq: 同理须在此前分发；点击只空应答，不做任
  // 何核对或写操作。
  if (data === 'hint:info') {
    await answerCallback(callbackQuery.id, env);

    return;
  }

  const isAdmin =
    await isAdminUser(senderId, env);

  if (!isAdmin) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 无权执行该操作。',
      true
    );

    return;
  }

  if (data === 'menu:main') {
    await answerCallback(
      callbackQuery.id,
      env
    );

    await showMainMenu(
      String(callbackQuery.from.id),
      env,
      callbackQuery.message?.message_id || 0,
      0,
      origin
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

  if (data.startsWith('pause:')) {
    await handlePauseCallback(
      callbackQuery,
      env,
      origin,
      ctx
    );

    return;
  }

  if (data.startsWith('clear:')) {
    await handleClearCallback(
      callbackQuery,
      env,
      ctx
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

async function noteBotBlocked(
  userId,
  env,
  from = null
) {
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

  if (from) {
    await captureVisitorNameIfMissing(
      user,
      from,
      null,
      env
    );
  }

  if (user.is_blocked || !user.topic_id) {
    return;
  }

  if (
    (await getConfig(
      'block_notice_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  let sent = null;

  try {
    sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: await textConfig('block_notice_text', env),
        reply_markup: SYS_TAG_MARKUP
      }
    );
  } catch (error) {
    console.error(
      '发送拉黑提醒失败：',
      error?.message || error
    );
  }

  // 记下这条 🚫 提醒的编号：对方解除拉黑、发出 ✅ 提醒时把它一并删掉。
  if (sent?.message_id) {
    await dbConfigPut(
      `blocknotice:${userId}`,
      String(sent.message_id),
      env
    );

    // 竞态收尾：记账期间对方若已解除拉黑（解除侧先跑完、
    // 没读到这条记账），这条 🚫 已不是最新状态——
    // 自行删掉并清记账，免得话题里留下一条永远
    // 没人删的过期拉黑提醒（拉黑标记已被解除侧删走
    // 是判据：标记还在说明仍处于拉黑状态）。
    if (
      (await dbConfigGet(flagKey, env)) !== '1'
    ) {
      await quietDeleteMessage(
        env,
        env.ADMIN_GROUP_ID,
        sent.message_id
      );

      await dbConfigDelete(
        `blocknotice:${userId}`,
        env
      );
    }
  }
}

async function noteBotUnblocked(
  userId,
  env,
  from = null
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

  if (from) {
    await captureVisitorNameIfMissing(
      user,
      from,
      null,
      env
    );
  }

  if (user.is_blocked || !user.topic_id) {
    // 不发 ✅ 的场合记账也没有意义了，一并清掉：
    // 残留的旧消息号日后可能被当成删除指针误用。
    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );

    return;
  }

  // 先清旧 🚫：开关只管「发不发新提醒」，过时状态不能因为
  // 开关关着就永远挂在话题里（原先联动删除排在发送之后，关开关时被一并跳过）。
  const storedNotice = await dbConfigGet(
    `blocknotice:${userId}`,
    env
  );

  if (
    storedNotice &&
    (await dbConfigGet(flagKey, env)) !== '1'
  ) {
    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      storedNotice
    );

    await dbConfigDelete(
      `blocknotice:${userId}`,
      env
    );
  }

  if (
    (await getConfig(
      'block_notice_enabled',
      env,
      'true'
    )) !== 'true'
  ) {
    return;
  }

  let sent = null;

  try {
    sent = await telegramApi(
      env.BOT_TOKEN,
      'sendMessage',
      {
        chat_id: env.ADMIN_GROUP_ID,
        message_thread_id:
          Number(user.topic_id),
        text: await textConfig('unblock_notice_text', env),
        reply_markup: SYS_TAG_MARKUP
      }
    );
  } catch (error) {
    console.error(
      '发送解除拉黑提醒失败：',
      error?.message || error
    );
  }

  void sent;
}

async function handleMyChatMember(
  chatMember,
  env
) {
  // 机器人自身在管理群的权限变动（掉权自检）：必须赶在
  // 下面的私聊判断之前——群事件的 chat.type 不是
  // private，原逻辑会直接扔掉，掉权无人知晓；而看门狗、
  // 话题与置顶都依赖机器人是群管理员。
  if (
    chatMember &&
    env.ADMIN_GROUP_ID &&
    String(chatMember.chat?.id) ===
      String(env.ADMIN_GROUP_ID)
  ) {
    const botId =
      String(env.BOT_TOKEN || '').split(':')[0];
    const target = chatMember.new_chat_member;

    if (
      botId &&
      String(target?.user?.id || '') === botId
    ) {
      const wasAdmin = [
        'administrator',
        'creator'
      ].includes(chatMember.old_chat_member?.status);
      const isAdminNow =
        target?.status === 'administrator';

      if (wasAdmin && !isAdminNow) {
        await notifyPrimaryAdmins(
          env,
          '⚠️ 机器人已失去管理群管理员权限：成员看门狗' +
          '失效，话题与置顶等功能可能受限，请恢复管理员。'
        );
      } else if (!wasAdmin && isAdminNow) {
        // 权限恢复：清掉看门狗基线，下次成员事件重拍
        // （掉权期间的进出无法追溯，只能重新对齐）。
        await dbConfigDelete('memberbase', env);

        await notifyPrimaryAdmins(
          env,
          '✅ 机器人已恢复管理群管理员权限，成员看门狗' +
          '基线将在下一次成员变动时重新建立。'
        );
      }
    }
  }

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
    await noteBotBlocked(
      userId,
      env,
      chatMember.from
    );
  } else if (
    oldStatus === 'kicked' &&
    newStatus === 'member'
  ) {
    await noteBotUnblocked(
      userId,
      env,
      chatMember.from
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                       管理群成员看门狗（chat_member）                       */
/* -------------------------------------------------------------------------- */

// chat_member 的「在群」判定：restricted 还要看 is_member
// （被限制但仍留在群里才算在群）。
function chatMemberInGroup(member) {
  if (!member) {
    return false;
  }

  if (
    member.status === 'member' ||
    member.status === 'administrator' ||
    member.status === 'creator'
  ) {
    return true;
  }

  return (
    member.status === 'restricted' &&
    Boolean(member.is_member)
  );
}

function describeChatMemberUser(user) {
  const fullName = [
    user?.first_name,
    user?.last_name
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  const username = user?.username
    ? `（@${escapeHtml(user.username)}）`
    : '';

  return (
    `<b>${escapeHtml(fullName || '未知')}</b>` +
    `${username}，ID：` +
    `<code>${escapeHtml(String(user?.id || ''))}</code>`
  );
}

// 名单外账号「进入」管理群时，私聊告警全体主管理员。
// 访客的全部对话都在话题里、群成员都能看，代码拦不住
// 阅读、只能事后发现；预防靠群设置（新成员不可见历
// 史、仅管理员拉人，见内置指南「管理群成员纪律」）。
// 白名单 = 机器人自身（BOT_TOKEN 前缀即其 ID）+ 主管理
// 员（ADMIN_IDS）+ 协管员（authorized_admins）。
// 去重双保险：只认「不在群 → 在群」的跃迁，且首次告警
// 用 dbConfigClaim 原子占下 memberalert:<uid> 标记；
// 对方离群时清标记，再进群可再告警。
// 成员看门狗的豁免名单（member_allow_ids，JSON 数组
// 字符串，口径同协管员名单）：名单内账号进群不告警。
// 解析失败按空名单处理，绝不让名单本身成为故障源。
async function getMemberAllowIds(env) {
  try {
    return parseAuthorizedAdmins(
      await getConfig('member_allow_ids', env, '[]')
    );
  } catch (_) {
    return [];
  }
}

// 看门狗基线对账：memberbase = {count, adminIds, net,
// ts, lastAlerted?}——基线时刻的实际人数与管理员名单、
// 基线之后的净进出数。每次成员事件后用「实际人数 vs
// 基线 + 净变动」核对，补事件驱动看门狗的盲区（事件
// 丢失、机器人掉线期间的进出）。基线接口失败时整体跳
// 过，不阻断看门狗告警本身。
async function alertAdminsMemberBaseCorrupt(env) {
  try {
    const last = Number(
      (await dbConfigGet('alertat:memberbase', env)) || 0
    );

    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(
      'alertat:memberbase',
      String(Date.now()),
      env
    );

    await notifyPrimaryAdmins(
      env,
      '⚠️ 成员看门狗的基线记录损坏，已按当前成员' +
      '数重拍基线。此前的进出差异已无法对账，请' +
      '人工核查一遍管理群成员名单。'
    );
  } catch (error) {
    console.error(
      '发送看门狗基线损坏告警失败：',
      error?.message || error
    );
  }
}

async function loadMemberBase(env) {
  const base = safeJsonParse(
    await dbConfigGet('memberbase', env),
    null
  );

  if (
    !base ||
    typeof base !== 'object' ||
    !Number.isFinite(Number(base.count))
  ) {
    return null;
  }

  return base;
}

async function snapshotMemberBase(env, groupId) {
  const countRes = await telegramApi(
    env.BOT_TOKEN,
    'getChatMemberCount',
    { chat_id: groupId }
  );
  const adminsRes = await telegramApi(
    env.BOT_TOKEN,
    'getChatAdministrators',
    { chat_id: groupId }
  );

  const count = Number(countRes);

  if (!Number.isFinite(count)) {
    return null;
  }

  const adminIds = (
    Array.isArray(adminsRes) ? adminsRes : []
  )
    .map((entry) => String(entry?.user?.id || ''))
    .filter(Boolean);

  const base = {
    count,
    adminIds,
    net: 0,
    ts: Date.now()
  };

  await dbConfigPut(
    'memberbase',
    JSON.stringify(base),
    env
  );

  return base;
}

async function reconcileMemberBase(
  env,
  groupId,
  joined,
  left
) {
  try {
    let base = await loadMemberBase(env);
    let justTaken = false;

    if (!base) {
      // 区分「从未建过基线」与「基线值写坏」（第
      // 十轮审计）：后者若静默重拍，新基线会把未
      // 记录的进出直接吸进去、对账盲区无声扩大。
      // 重拍前留痕并节流告警，提醒人工核查。
      const rawBase = await dbConfigGet(
        'memberbase',
        env
      );

      if (rawBase) {
        console.error(
          '看门狗基线值损坏，重拍基线并告警'
        );

        await alertAdminsMemberBaseCorrupt(env);
      }

      base = await snapshotMemberBase(env, groupId);

      if (!base) {
        return;
      }

      // 基线人数是事件发生之后读到的，已包含本事件，
      // 这次不再叠加净变动。
      justTaken = true;
    }

    if (!justTaken) {
      const delta =
        (joined ? 1 : 0) - (left ? 1 : 0);

      if (delta !== 0) {
        base.net = (Number(base.net) || 0) + delta;
        base.ts = Date.now();

        await dbConfigPut(
          'memberbase',
          JSON.stringify(base),
          env
        );
      }
    }

    const actual = Number(
      await telegramApi(
        env.BOT_TOKEN,
        'getChatMemberCount',
        { chat_id: groupId }
      )
    );

    if (!Number.isFinite(actual)) {
      return;
    }

    const expected =
      Number(base.count) + (Number(base.net) || 0);

    if (
      actual !== expected &&
      Number(base.lastAlerted) !== actual
    ) {
      base.lastAlerted = actual;
      base.ts = Date.now();

      await dbConfigPut(
        'memberbase',
        JSON.stringify(base),
        env
      );

      await notifyPrimaryAdmins(
        env,
        '⚠️ 管理群成员数与记录不符（记录 ' +
          `${expected} 人、实际 ${actual} 人），` +
          '可能有未记录的进出，请人工核查。'
      );
    }
  } catch (error) {
    console.error(
      '看门狗基线对账失败：',
      error?.message || error
    );
  }
}

async function handleGroupChatMember(chatMember, env) {
  if (
    !chatMember ||
    String(chatMember.chat?.id) !==
      String(env.ADMIN_GROUP_ID)
  ) {
    return;
  }

  const newMember = chatMember.new_chat_member;
  const target = newMember?.user;
  const targetId =
    target?.id != null ? String(target.id) : '';

  // 基线对账先行（失败静默跳过）：进/出按 old/new 的
  // 在群状态判定，与下面告警口径一致。
  await reconcileMemberBase(
    env,
    String(env.ADMIN_GROUP_ID),
    chatMemberInGroup(newMember) &&
      !chatMemberInGroup(chatMember.old_chat_member),
    !chatMemberInGroup(newMember) &&
      chatMemberInGroup(chatMember.old_chat_member)
  );

  if (!targetId) {
    return;
  }

  const flagKey = `memberalert:${targetId}`;

  if (!chatMemberInGroup(newMember)) {
    // 离群 / 被踢出：清告警标记，下次再进群重新告警。
    if (
      newMember?.status === 'left' ||
      newMember?.status === 'kicked'
    ) {
      await dbConfigDelete(flagKey, env);
    }

    return;
  }

  // 已在群内的变更（升降职、限制调整、资料变更重推）
  // 不是「进入」，不告警。
  if (
    chatMemberInGroup(chatMember.old_chat_member)
  ) {
    return;
  }

  const botId = String(env.BOT_TOKEN || '').split(':')[0];

  if (targetId === botId) {
    return;
  }

  if (await isAdminUser(targetId, env)) {
    return;
  }

  if (
    (await getMemberAllowIds(env)).includes(targetId)
  ) {
    return;
  }

  const claimed = await dbConfigClaim(
    flagKey,
    '1',
    env
  );

  if (!claimed) {
    return;
  }

  const lines = [
    '⚠️ <b>管理群成员告警</b>',
    '',
    '名单外账号已进入管理群：' +
      describeChatMemberUser(target)
  ];

  if (target?.is_bot) {
    lines.push('⚠️ 对方是<b>机器人账号</b>。');
  }

  const actor = chatMember.from;

  if (chatMember.invite_link) {
    const linkLabel =
      chatMember.invite_link.name ||
      chatMember.invite_link.invite_link ||
      '';

    lines.push(
      '加入方式：邀请链接' +
        (linkLabel
          ? `「${escapeHtml(
              String(linkLabel).slice(0, 60)
            )}」`
          : '')
    );
  } else if (
    actor?.id != null &&
    String(actor.id) !== targetId
  ) {
    lines.push(
      `拉入者：${describeChatMemberUser(actor)}`
    );
  } else {
    lines.push('加入方式：自行加入（无邀请链接记录）');
  }

  lines.push(
    '',
    '访客的全部对话都在管理群的话题里，群成员都能看到。' +
      '如非有意拉入，请尽快把对方移出群，并检查邀请链接。'
  );

  await notifyPrimaryAdmins(env, lines.join('\n'));
}

// 整段对话清空：按 rxmap 配对收集一位访客在私聊与话题两侧的全部消息编号
// （含存量 hint 提示行记账指向的旧提示消息），供批量删除使用。配对值 'gone'（已单独删除的墓碑）跳过。
async function collectConversationMessageIds(
  userId,
  env
) {
  const pairRows = await env.TG_BOT_DB.prepare(
    'SELECT message_id, text FROM messages ' +
    'WHERE user_id = ? AND (message_id LIKE ? ' +
    'OR (message_id LIKE ? AND text LIKE ?))'
  ).bind(
    REACTION_MAP_USER,
    `p:${userId}:%`,
    't:%',
    `${userId}:%`
  ).all();

  const privateIds = new Set();
  const topicIds = new Set();
  const pairKeys = [];

  // 「组」：一对配对（私聊侧 + 话题侧）连同挂在它上面的
  // 存量提示行。清空按组推进——一组双边都删过，才删这一组
  // 的记录行；中途停下时没轮到的组整组保留，下次接着删。
  const units = [];
  const unitByPriv = new Map();
  const unitByTopic = new Map();

  const newUnit = () => {
    const unit = {
      priv: null,
      topic: null,
      privExtra: [],
      topicExtra: [],
      keys: []
    };

    units.push(unit);

    return unit;
  };

  for (const row of pairRows.results || []) {
    const mid = String(row.message_id || '');
    const text = String(row.text || '');

    // 配对行（含墓碑）的键先记下：清空收尾只删这份
    // 快照里的行，清空期间新到的消息不在快照内。
    pairKeys.push(mid);

    if (text === 'gone') {
      // 墓碑行没有可删的消息，只带走键：挂到已有的组上，
      // 没有组就自成一组（键-only）。
      let unit = null;

      if (mid.startsWith(`p:${userId}:`)) {
        unit = unitByPriv.get(
          Number(mid.slice(`p:${userId}:`.length))
        ) || null;
      } else if (mid.startsWith('t:')) {
        unit = unitByTopic.get(
          Number(mid.slice(2))
        ) || null;
      }

      if (!unit) {
        unit = newUnit();
      }

      unit.keys.push(mid);

      continue;
    }

    if (mid.startsWith(`p:${userId}:`)) {
      const priv = Number(
        mid.slice(`p:${userId}:`.length)
      );
      const topic = Number(text);

      if (priv) privateIds.add(priv);
      if (topic) topicIds.add(topic);

      let unit = priv
        ? unitByPriv.get(priv) || null
        : null;

      if (!unit) {
        unit = newUnit();

        if (priv) {
          unit.priv = priv;
          unitByPriv.set(priv, unit);
        }
      }

      unit.keys.push(mid);

      if (topic) {
        unit.topic = topic;
        unitByTopic.set(topic, unit);
      }
    } else if (mid.startsWith('t:')) {
      const topic = Number(mid.slice(2));
      const priv = Number(text.split(':')[1]);

      if (topic) topicIds.add(topic);
      if (priv) privateIds.add(priv);

      let unit = topic
        ? unitByTopic.get(topic) || null
        : null;

      if (!unit && priv) {
        unit = unitByPriv.get(priv) || null;
      }

      if (!unit) {
        unit = newUnit();

        if (topic) {
          unit.topic = topic;
          unitByTopic.set(topic, unit);
        }

        if (priv) {
          unit.priv = priv;
          unitByPriv.set(priv, unit);
        }
      }

      unit.keys.push(mid);
    }
  }

  const hintRows = await env.TG_BOT_DB.prepare(
    'SELECT message_id, text FROM messages ' +
    'WHERE user_id = ? AND message_id LIKE ?'
  ).bind(
    REACTION_MAP_USER,
    `hint:p:${userId}:%`
  ).all();

  const hintKeys = [];

  for (const row of hintRows.results || []) {
    const hkey = String(row.message_id || '');

    hintKeys.push(hkey);

    const hid = Number(row.text);

    if (hid) topicIds.add(hid);

    // hint:p:<uid>:<私聊消息号>，text 为话题侧提示消息号：
    // 挂到该私聊消息所属的组上（话题侧提示随组一起删）。
    const priv = Number(
      hkey.slice(`hint:p:${userId}:`.length)
    );

    let unit = priv
      ? unitByPriv.get(priv) || null
      : null;

    if (!unit) {
      unit = newUnit();

      if (priv) {
        unit.priv = priv;
        unitByPriv.set(priv, unit);
      }
    }

    unit.keys.push(hkey);

    if (hid) {
      unit.topicExtra.push(hid);

      if (!unitByTopic.has(hid)) {
        unitByTopic.set(hid, unit);
      }
    }
  }

  // hint:t: 改按 100 条分块 IN 查询：逐条点读在长对话
  // 下要串行上千次；顺手把键记进 hintKeys 供收尾删除。
  const topicIdList = [...topicIds];

  for (let i = 0; i < topicIdList.length; i += 100) {
    const chunk = topicIdList.slice(i, i + 100);
    const keys = chunk.map(
      (topicId) => `hint:t:${topicId}`
    );

    hintKeys.push(...keys);

    for (const [idx, topicId] of chunk.entries()) {
      const unit = unitByTopic.get(topicId);

      if (unit) {
        unit.keys.push(keys[idx]);
      }
    }

    const placeholders = keys
      .map(() => '?')
      .join(', ');

    const hintTRows = await env.TG_BOT_DB.prepare(
      'SELECT message_id, text FROM messages ' +
      'WHERE user_id = ? AND message_id IN (' +
      placeholders +
      ')'
    ).bind(REACTION_MAP_USER, ...keys).all();

    for (const row of hintTRows.results || []) {
      const hid = Number(row.text);

      if (hid) {
        privateIds.add(hid);

        // hint:t:<话题消息号> 的 text 为私聊侧提示消息号，
        // 挂回该话题消息所属的组。
        const topicId = Number(
          String(row.message_id || '').slice(
            'hint:t:'.length
          )
        );

        const unit = unitByTopic.get(topicId);

        if (unit) {
          unit.privExtra.push(hid);
        }
      }
    }
  }

  return {
    privateIds: [...privateIds],
    topicIds: [...topicIds],
    pairKeys,
    hintKeys,
    units
  };
}

// 批量删除并计数：整批失败时二分拆分（对半拆到单条才
// 定性），不再一失败就整批 100 条逐条删——批里只有一两
// 条删不掉时，逐条退化要烧上百次调用；二分只需对数级。
// 「消息不存在」按既有口径视为已删。
// 可选 budget（{ stats, limit }）：stats 是与 telegramApi
// 共享的尝试计数 { n }——按真实子请求计（含其内部重试，
// 不再是「每次逻辑调用计一次」的名义口径），预算耗尽
// 即停，返回 complete=false，供上层停在块边界分次推进。
async function deleteMessagesCounted(
  env,
  chatId,
  ids,
  budget = null
) {
  let ok = 0;
  let failed = 0;
  let covered = 0;
  // 逐条结果（第十轮审计）：'ok' 已删（「不存在」按
  // 既有口径同样视为已删）/ 'stuck' 终局失败、确认
  // 删不掉 / 'transient' 瞬时失败。清空按组结算靠
  // 它区分「可落墓碑跳过」与「留待下轮重试」；未覆
  // 盖（预算耗尽没轮到）的 id 不在表里。
  const outcomes = new Map();

  const del = async (chunk) => {
    if (!chunk.length) {
      return;
    }

    if (budget && budget.stats.n >= budget.limit) {
      return;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'deleteMessages',
        {
          chat_id: chatId,
          message_ids: chunk
        },
        0,
        budget ? budget.stats : null
      );

      ok += chunk.length;
      covered += chunk.length;

      for (const id of chunk) {
        outcomes.set(id, 'ok');
      }
    } catch (error) {
      if (chunk.length === 1) {
        covered += 1;

        if (
          /not found/i.test(
            String(error?.message || error)
          )
        ) {
          ok += 1;
          outcomes.set(chunk[0], 'ok');
        } else {
          failed += 1;
          outcomes.set(
            chunk[0],
            isTransientTelegramError(error)
              ? 'transient'
              : 'stuck'
          );
        }

        return;
      }

      const mid = Math.ceil(chunk.length / 2);

      await del(chunk.slice(0, mid));
      await del(chunk.slice(mid));
    }
  };

  for (let i = 0; i < ids.length; i += 100) {
    await del(ids.slice(i, i + 100));
  }

  return {
    ok,
    failed,
    complete: covered >= ids.length,
    outcomes
  };
}

// 清空执行体：删私聊副本（必做）+ 话题内副本（可选），
// 并删掉该访客的配对与提示记账行。
// 按「组」推进（每 50 组一块）：本组双边都删过，才删
// 本组的记录行（仍只删收集快照里的行——清空期间新到
// 的消息配对不在快照内，不受影响）。全部删除调用计入
// 同一份预算（40 次真实子请求，含删除调用的内部重试）：
// 大体量会话一轮删不完时停在
// 组边界，剩余组的记录原样保留，返回 partial/remaining，
// 管理员再执行一次 /clear 就能接着删（确认占用按确认
// 消息编号，新确认照常能占上，不会卡死）。落账按组
// 结算：已删净的组删键、留了删不掉副本的组落墓碑，
// 不再整块同进退（见循环内说明，第十轮审计）。
async function wipeConversationCopies(
  userId,
  env,
  includeTopicContents
) {
  const { units } =
    await collectConversationMessageIds(
      userId,
      env
    );

  // 熔断三类卡（「请稍后再试」/ 警告 /「✅ 服务已
  // 恢复」）：与删人路径 purgeManagedUser 同口径，在
  // 这里连本体带记账行一并删——此前只有网页版靠 purge
  // 兜到，话题 /clear 走不到，卡会留在访客私聊里。静
  // 默尽力、不计入下面的删除计数（同
  // deletePauseCardsForUser 既有口径）。pausenote: 是
  // 「本轮已通知」占用行，不在这里动：网页版随后
  // purge 删档时一并删；/clear 档案与占用都保留（删
  // 了占用、本轮会再补发一张卡）。
  await deletePauseCardsForUser(env, userId);

  // 机器人自发私聊消息的槽位组：欢迎回执
  // （receipt_msg_id）与验证卡（verify_prompt_msg_id）
  // 不在 rxmap 配对表里，上面的收集够不着——此前清
  // 空永远漏删它们，网页版清完还整行删档、编号永久
  // 丢失（主人真机复现）。把两槽位拼成一个「只有私
  // 聊侧」的组顶到最前面：与配对组共用同一份预算与
  // 计数口径（计入私聊 ok/failed），且顶在首位不会
  // 被配对量饿死。结算（删掉或确认删不掉）后把两槽
  // 位归零，防残留编号被后续流程误用；没结算（瞬时
  // 失败 / 预算耗尽没轮到）则槽位原样保留，下次清
  // 空按槽位接着删，partial/remaining 如实计入。
  const slotUser = await dbUserGet(userId, env);

  const slotIds = [
    ...new Set(
      [
        Number(slotUser?.receipt_msg_id || 0),
        Number(slotUser?.verify_prompt_msg_id || 0)
      ].filter((id) => id > 0)
    )
  ];

  let slotUnit = null;

  if (slotIds.length) {
    slotUnit = {
      priv: null,
      topic: null,
      privExtra: slotIds,
      topicExtra: [],
      keys: []
    };

    units.unshift(slotUnit);
  }

  let slotSettled = false;

  const budget = { stats: { n: 0 }, limit: 40 };

  let priv = { ok: 0, failed: 0 };
  let topic = { ok: 0, failed: 0 };
  let remaining = 0;

  for (let i = 0; i < units.length; i += 50) {
    const group = units.slice(i, i + 50);

    if (budget.stats.n >= budget.limit) {
      remaining += units.length - i;

      break;
    }

    const privIds = [
      ...new Set(
        group
          .flatMap((unit) => [
            unit.priv,
            ...unit.privExtra
          ])
          .filter(Boolean)
      )
    ];

    const topicIds = includeTopicContents
      ? [
          ...new Set(
            group
              .flatMap((unit) => [
                unit.topic,
                ...unit.topicExtra
              ])
              .filter(Boolean)
          )
        ]
      : [];

    const privPart = await deleteMessagesCounted(
      env,
      userId,
      privIds,
      budget
    );

    const topicPart = includeTopicContents
      ? await deleteMessagesCounted(
          env,
          env.ADMIN_GROUP_ID,
          topicIds,
          budget
        )
      : {
          ok: 0,
          failed: 0,
          complete: true,
          outcomes: new Map()
        };

    priv = {
      ok: priv.ok + privPart.ok,
      failed: priv.failed + privPart.failed
    };

    topic = {
      ok: topic.ok + topicPart.ok,
      failed: topic.failed + topicPart.failed
    };

    // 按组结算（第十轮审计）：旧实现整块同进退——
    // 块里一条确认删不掉的消息把二分预算烧穿时，
    // 整块 50 组的键都不落账，下一轮又从同一块重
    // 烧一遍、组数永远不降。现在逐组看逐条结果：
    // 双边每条都有着落（删掉 / 不存在 / 确认删不
    // 掉）的组当场落账——全删净的删键；留了删不
    // 掉副本的组把配对键改写成墓碑（与 /delete 同
    // 口径：之后对它的编辑 / 反应静默丢弃），提示
    // 键照常删。没轮到（预算耗尽）或撞瞬时失败的
    // 组整组保留、计入 remaining，下轮接着删。报
    // 告口径不变：ok / failed 仍按本次实际删除结
    // 果计，墓碑组里的删不掉条数照常计 failed。
    // 墓碑只在连话题版（/clear：话题与档案保留、
    // 残存副本的编辑需要墓碑拦截）才落：网页版随
    // 后 purgeManagedUser 整行删档，配对行按旧口
    // 径直接删键即可。
    const settledDeleteKeys = [];
    const settledTombstoneKeys = [];

    for (const unit of group) {
      const unitPrivIds = [
        unit.priv,
        ...unit.privExtra
      ].filter(Boolean);

      const unitTopicIds = includeTopicContents
        ? [unit.topic, ...unit.topicExtra].filter(Boolean)
        : [];

      const unitOutcomes = [
        ...unitPrivIds.map(
          (id) => privPart.outcomes.get(id)
        ),
        ...unitTopicIds.map(
          (id) => topicPart.outcomes.get(id)
        )
      ];

      const settled = unitOutcomes.every(
        (outcome) =>
          outcome === 'ok' || outcome === 'stuck'
      );

      if (unit === slotUnit) {
        slotSettled = settled;
      }

      if (!settled) {
        remaining += 1;

        continue;
      }

      if (
        includeTopicContents &&
        unitOutcomes.some(
          (outcome) => outcome === 'stuck'
        )
      ) {
        for (const key of unit.keys) {
          if (key.startsWith('hint:')) {
            settledDeleteKeys.push(key);
          } else {
            settledTombstoneKeys.push(key);
          }
        }
      } else {
        settledDeleteKeys.push(...unit.keys);
      }
    }

    for (
      let j = 0;
      j < settledDeleteKeys.length;
      j += 100
    ) {
      const chunk = settledDeleteKeys.slice(j, j + 100);

      await env.TG_BOT_DB.batch(
        chunk.map((key) =>
          messageDataDeleteStatement(
            REACTION_MAP_USER,
            key,
            env
          )
        )
      );
    }

    if (settledTombstoneKeys.length) {
      const nowSec = Math.floor(Date.now() / 1000);

      for (
        let j = 0;
        j < settledTombstoneKeys.length;
        j += 100
      ) {
        const chunk = settledTombstoneKeys.slice(
          j,
          j + 100
        );

        await env.TG_BOT_DB.batch(
          chunk.map((key) =>
            messageDataPutStatement(
              REACTION_MAP_USER,
              key,
              { text: 'gone', date: nowSec },
              env
            )
          )
        );
      }
    }
  }

  // 槽位组已结算才归零两槽位：回执/验证卡的编号从
  // 此作废，不会再被回执清理等后续流程当成活消息误
  // 删或误判；没结算的保留原值，下次清空接着删。
  if (slotUnit && slotSettled) {
    await dbUserUpdate(
      userId,
      {
        receipt_msg_id: null,
        verify_prompt_msg_id: null
      },
      env,
      { touchActivity: false }
    );
  }

  return {
    private: priv,
    topic,
    partial: remaining > 0,
    remaining
  };
}

// /clear 的确认按钮回调：clear:yes:<访客ID> / clear:no:<访客ID>。
async function handleClearCallback(
  callbackQuery,
  env,
  ctx = null
) {
  const data = String(callbackQuery.data || '');
  const parts = data.split(':');
  const action = parts[1];
  const userId = parts[2] || '';

  const clickerId = String(
    callbackQuery.from?.id || ''
  );

  if (!/^\d{1,20}$/.test(userId)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '❌ 参数错误。',
      true
    );

    return;
  }

  if (
    !userId ||
    !(await isAdminUser(clickerId, env))
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 无权操作。',
      true
    );

    return;
  }

  const msg = callbackQuery.message || {};
  const chatId = msg.chat?.id;
  const threadId = msg.message_thread_id;

  // 确认卡被改写后的每种形态（取消 / 正在清空 / 结
  // 果报告 / 失败提示）都是无按钮的系统消息：原地编
  // 辑按 -v160b7 口径捎带「系统提示」标签（第十轮审
  // 计·低：此前 editConfirm 改写时漏带，报告落地后
  // 无牌）。editMessageText 本就会摘掉原确认按钮，
  // 标签钮正好接位。
  const editConfirm = async (text) => {
    try {
      await telegramApi(
        env.BOT_TOKEN,
        'editMessageText',
        {
          chat_id: chatId,
          message_id: msg.message_id,
          text,
          reply_markup: SYS_TAG_MARKUP
        }
      );
    } catch {
      /* 确认消息已被删时忽略 */
    }
  };

  if (action === 'no') {
    await answerCallback(callbackQuery.id, env);

    await editConfirm('🚫 已取消清空，聊天记录未动。');

    return;
  }

  if (action !== 'yes') {
    return;
  }

  // 执行侧再验一次主管理员（发命令时验过，
  // 点确认的未必是同一人）。
  if (!isPrimaryAdmin(clickerId, env)) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 整段对话清空仅主管理员可操作。',
      true
    );

    return;
  }

  // 只读校验：访客记录已被删时不要先把空行建回来。
  const target =
    await dbUserGet(userId, env);

  if (!target) {
    await answerCallback(
      callbackQuery.id,
      env,
      'ℹ️ 访客记录已不存在。',
      true
    );

    return;
  }

  if (
    !target.topic_id ||
    String(target.topic_id) !== String(threadId)
  ) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 该话题已不属于这位访客。',
      true
    );

    return;
  }

  // 防重复执行：拿确认消息编号做原子占用——同一条
  // 确认被点两次（双击、并发回调）时只有第一个占得上，
  // 后来的直接拒绝，避免两遍清空互相覆盖计数报告、
  // 白烧调用。占用不释放：新一条 /clear 的确认编号
  // 不同，照常能占上、正常执行。
  const claimWon = await dbConfigClaim(
    `clearrun:${userId}`,
    `m:${msg.message_id || 0}`,
    env
  );

  if (!claimWon) {
    await answerCallback(
      callbackQuery.id,
      env,
      '⚠️ 这条确认已在执行或已执行过，请勿重复点击。',
      true
    );

    return;
  }

  await answerCallback(
    callbackQuery.id,
    env,
    '正在清空…'
  );

  // 清空执行体走后台：整段清空可能跑满 40 次子请求
  // 预算，同步挂在回调里会把这条更新的处理拖长。
  // 确认消息先同步改成「正在清空」，后台跑完再原地
  // 改成结果报告；claim 的完成以同步部分为准，执行
  // 本身已有 clearrun 占用防重复执行。无 ctx 的调用
  // 方（理论上不存在）退回同步执行。
  const runWipe = async () => {
    const wipe = await wipeConversationCopies(
      userId,
      env,
      true
    );

    if (wipe.partial) {
      const partLines = [
        `🧹 与访客 ${userId} 的聊天记录已删一部分：`,
        `· 话题内删除 ${wipe.topic.ok} 条` +
          (wipe.topic.failed
            ? `，${wipe.topic.failed} 条删除失败`
            : ''),
        `· 私聊删除 ${wipe.private.ok} 条` +
          (wipe.private.failed
            ? `，${wipe.private.failed} 条删不掉（多为超过 48 小时）`
            : ''),
        `本次调用预算已用完，还有约 ${wipe.remaining} 组消息未处理；` +
          '再次执行 /clear 可继续。',
        '话题与访客档案已保留。'
      ];

      await editConfirm(partLines.join('\n'));

      return;
    }

    const lines = [
      `🧹 已清空与访客 ${userId} 的聊天记录：`,
      `· 话题内删除 ${wipe.topic.ok} 条` +
        (wipe.topic.failed
          ? `，${wipe.topic.failed} 条删除失败`
          : ''),
      `· 私聊删除 ${wipe.private.ok} 条` +
        (wipe.private.failed
          ? `，${wipe.private.failed} 条删不掉（多为超过 48 小时）`
          : ''),
      '话题与访客档案已保留，对方之后仍可继续聊天。'
    ];

    await editConfirm(lines.join('\n'));
  };

  if (ctx?.waitUntil) {
    await editConfirm(
      '🧹 正在清空聊天记录，完成后这里会更新为结果报告。'
    );

    ctx.waitUntil(
      runWipe().catch(async (error) => {
        console.error(
          '后台执行整段清空失败：',
          error?.message || error
        );

        try {
          await editConfirm(
            '⚠️ 清空执行失败，请重新发送 /clear 重试。'
          );
        } catch (_) {
          /* 确认消息已不可编辑时忽略 */
        }
      })
    );

    return;
  }

  await runWipe();
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

  // 连带作废未用通行证（删记录并删证消息），防删档后凭旧证复活。
  await voidUserPass(env, userId);

  // 拉黑提醒记账一并清理：话题还在时先删那条 🚫，
  // 再删记账行，免得残留编号日后被误当删除指针。
  const staleBlockNotice =
    await dbConfigGet(
      `blocknotice:${userId}`,
      env
    );

  if (staleBlockNotice && user.topic_id) {
    await quietDeleteMessage(
      env,
      env.ADMIN_GROUP_ID,
      staleBlockNotice
    );
  }

  await dbConfigDelete(
    `blocknotice:${userId}`,
    env
  );

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

  invalidateUserRow(env, userId);

  await dbConfigDelete(
    `botblocked:${userId}`,
    env
  );

  await dbConfigDelete(
    `pausenote:${userId}`,
    env
  );

  // 熔断三类卡连本体一起删（见 deletePauseCardsForUser）。
  await deletePauseCardsForUser(env, userId);

  await dbConfigDelete(
    `promptat:${userId}`,
    env
  );

  await dbConfigDelete(
    `quizlock:${userId}`,
    env
  );

  await dbConfigDelete(
    `copyfail:${userId}`,
    env
  );

  await dbConfigDelete(
    `startmsg:${userId}`,
    env
  );

  await dbConfigDelete(
    `seq:${userId}`,
    env
  );

  await dbConfigDelete(
    `bannotice:${userId}`,
    env
  );

  await dbConfigDelete(
    `unbannotice:${userId}`,
    env
  );

  return topicDeleted;
}

/* -------------------------------------------------------------------------- */
/*                         自动检查更新（改版新增）                             */
/* -------------------------------------------------------------------------- */

const BOT_VERSION = 'v1.7.0';
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
              disable_web_page_preview: true,
              reply_markup: SYS_TAG_MARKUP
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

function describeUpdateState(cache, displayTz) {
  if (!cache || !cache.tag) {
    return {
      status: cache ? 'failed' : 'unknown',
      line: '最新版本：未知（尚无成功检查记录）'
    };
  }

  const timeText = cache.checkedAt
    ? formatTimestamp(
        Math.floor(cache.checkedAt / 1000),
        displayTz
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

async function handlePauseCallback(
  callbackQuery,
  env,
  origin = '',
  ctx = null
) {
  const senderId = String(callbackQuery.from.id);
  const callbackId = callbackQuery.id;
  const messageId =
    callbackQuery.message?.message_id || 0;
  const data = String(callbackQuery.data || '');

  if (!isPrimaryAdmin(senderId, env)) {
    await answerCallback(
      callbackId,
      env,
      '⚠️ 服务熔断开关仅主管理员可操作。',
      true
    );

    return;
  }

  if (data === 'pause:menu') {
    await answerCallback(callbackId, env);

    await renderMenu(env, {
      chatId: senderId,
      messageId,
      text:
        '⏸ <b>服务熔断</b>\n\n' +
        '选择暂停时长。暂停期间访客新发的消息' +
        '会被删除（对已送达消息的编辑与反应同样拒收，管理员不受影响），到期自动恢复，' +
        '也可随时在主菜单或用 /resume 提前恢复。\n' +
        'ℹ️ 到期不会立刻发通知：恢复通知会在到期后第一条消息到来时一并送达；没人发消息时收不到通知是正常的，服务熔断其实已经结束。',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '30 分钟',
              callback_data: 'pause:for:30'
            },
            {
              text: '60 分钟',
              callback_data: 'pause:for:60'
            }
          ],
          [
            {
              text: '4 小时',
              callback_data: 'pause:for:240'
            },
            {
              text: '24 小时',
              callback_data: 'pause:for:1440'
            }
          ],
          [
            {
              text: '↩️ 返回主菜单',
              callback_data: 'menu:main'
            }
          ]
        ]
      }
    });

    return;
  }

  if (data.startsWith('pause:for:')) {
    const minutes = Number(
      data.slice('pause:for:'.length)
    );

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      await answerCallback(
        callbackId,
        env,
        '❌ 时长无效。',
        true
      );

      return;
    }

    const state = await performPause(
      env,
      minutes,
      senderId
    );

    await answerCallback(
      callbackId,
      env,
      `⏸ 已暂停，${describePauseRemaining(state)}`
    );

    await showMainMenu(senderId, env, messageId, 0, origin);

    return;
  }

  if (data === 'pause:resume') {
    // 与命令路径对齐：没有进行中的熔断时短路，不执行
    // 恢复全流程，更不群发并未发生的「已恢复」通知
    // （熔断多半已惰性到期、状态早被清掉）。
    const state = await getPauseState(env);

    if (!state) {
      await answerCallback(
        callbackId,
        env,
        'ℹ️ 当前没有处于暂停状态。'
      );

      await showMainMenu(senderId, env, messageId, 0, origin);

      return;
    }

    await performResume(env, senderId, ctx);

    await answerCallback(
      callbackId,
      env,
      '▶️ 已恢复服务。'
    );

    await showMainMenu(senderId, env, messageId, 0, origin);

    return;
  }

  await answerCallback(callbackId, env);
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
      '⚠️ 仅主管理员可执行此操作。',
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
    describeUpdateState(
      state,
      await getDisplayTimeZone(env)
    );

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
/*                         网页版访客列表（改版新增）                           */
/* -------------------------------------------------------------------------- */

const USERLIST_LINK_TTL_MS = 10 * 60 * 1000;

// 主小程序会话（/app 外壳 + /api/app-auth 验签后签发）：
// 会话有效期 6 小时（每次打开小程序都重新验 initData
// 换新会话，长短不敏感，取数小时级即可）。会话签名带
// app. 前缀与链接签名分流——链接签名是纯 hex，不含 '.'
// 与 'p'，不可能撞前缀；checkUserListAuth 见前缀走会话
// 校验、其余走原链接校验，旧路径行为逐字不变。
const APP_SESSION_TTL_MS = 6 * 60 * 60 * 1000;
const APP_SESSION_SIG_PREFIX = 'app.';

// 签名链接按用途分权：访客列表（usrlist）/ 网页管理台（panel）/
// 新手引导（guide）三套签名互不通用——只读性质的引导链接
// 不再等于全权管理凭据，列表链接也改不了配置。
function panelScopeForPath(path) {
  if (path === '/panel') {
    return 'panel';
  }

  if (path === '/guide') {
    return 'guide';
  }

  return 'usrlist';
}

// 网页链接吊销代次（epoch）：按用途分开存放，管理台可
// 单独让某一类链接立即失效。epoch 掺入签名载荷——吊销
// 即代次 +1，旧链接的签名随即对不上、验签失败。验证
// 链接与通行证不掺 epoch，不受吊销影响。
const LINK_EPOCH_SCOPES = ['usrlist', 'panel', 'guide'];

// 鉴权存储不可用标记错误：epoch 读取遇 D1 异常时抛
// 出，由 fetch 的网页路由层据此回受控 503（API 给
// JSON、页面给友好错误页），不再直穿成未捕获 500
// （第十一轮审计中 4）。其余异常不带此标记、照旧上抛。
function authStoreUnavailableError(cause) {
  const error = new Error('auth store unavailable');

  error.code = 'AUTH_STORE_UNAVAILABLE';
  error.cause = cause;

  return error;
}

function authStoreUnavailableResponse(pathname) {
  if (String(pathname || '').startsWith('/api/')) {
    return Response.json(
      { ok: false, error: 'unavailable' },
      { status: 503 }
    );
  }

  return new Response(
    '<!doctype html><meta charset="utf-8">' +
    '<p style="font-family:sans-serif;padding:24px">' +
    '服务暂时不可用，请稍后重试。' +
    '</p>',
    {
      status: 503,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    }
  );
}

// epoch 行值解析：行不存在 = 0（合法初始态）；行在但
// 值不是非负整数字符串 = 数据损坏，返回 null（不可
// 信）。唯一写入方（吊销）只写 String(整数)，其余形
// 态一律按损坏处理（第十一轮审计低 6 的 fail-closed
// 口径，鉴权侧据 corrupt 集合拒绝）。
function parseLinkEpochValue(raw) {
  if (raw == null) {
    return 0;
  }

  const text = String(raw).trim();

  if (!/^\d{1,15}$/.test(text)) {
    return null;
  }

  const n = Number(text);

  return Number.isSafeInteger(n) ? n : null;
}

// epoch 状态按请求备忘（挂法同请求级访客行缓存）：
// 三个 scope 一条查询取齐（低 10），同一请求内后续
// 读取零成本；吊销写后由吊销 handler 清备忘防读到
// 吊销前的值。D1 读失败抛 AUTH_STORE_UNAVAILABLE。
function linkEpochCache(env) {
  const cache = env?.__linkEpochCache;

  return cache instanceof Map ? cache : null;
}

async function loadLinkEpochState(env) {
  const cache = linkEpochCache(env);

  if (cache?.has('state')) {
    return cache.get('state');
  }

  let result;

  try {
    result = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config WHERE key IN (?, ?, ?)'
    )
      .bind(
        ...LINK_EPOCH_SCOPES.map(
          (scope) => `linkepoch:${scope}`
        )
      )
      .all();
  } catch (error) {
    throw authStoreUnavailableError(error);
  }

  const epochs = new Map();
  const corrupt = new Set();
  const seen = new Set();

  for (const row of result?.results || []) {
    const scope = String(row.key || '').slice(
      'linkepoch:'.length
    );

    if (!LINK_EPOCH_SCOPES.includes(scope)) {
      continue;
    }

    seen.add(scope);

    const parsed = parseLinkEpochValue(row.value);

    if (parsed == null) {
      corrupt.add(scope);
      epochs.set(scope, 0);
    } else {
      epochs.set(scope, parsed);
    }
  }

  for (const scope of LINK_EPOCH_SCOPES) {
    if (!seen.has(scope)) {
      epochs.set(scope, 0);
    }
  }

  const state = { epochs, corrupt };

  if (cache) {
    cache.set('state', state);
  }

  return state;
}

// epoch 行损坏的节流告警（每 scope 每小时至多一条，
// config 时间戳节流，与既有 alertat 口径一致）：损坏
// 意味着吊销状态不可信、鉴权侧已按拒绝处理，告警是
// 给管理员留的修复线索。
async function alertLinkEpochCorrupt(env, scope) {
  try {
    const key = `alertat:linkepoch:${scope}`;

    const last = Number(
      (await dbConfigGet(key, env)) || 0
    );

    if (Date.now() - last < 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(key, String(Date.now()), env);

    await notifyPrimaryAdmins(
      env,
      '⚠️ 链接吊销代次数据损坏（' + scope +
      '）：相关网页入口已按鉴权失败处理，吊销状态' +
      '可能已失效。请检查配置项 linkepoch:' + scope +
      ' 并重新执行一次吊销以修复。'
    );
  } catch (error) {
    console.error(
      '发送 epoch 损坏告警失败：',
      error?.message || error
    );
  }
}

async function getLinkEpoch(env, scope) {
  const state = await loadLinkEpochState(env);

  return state.epochs.get(scope) ?? 0;
}

async function buildSignedPanelUrl(
  origin,
  adminId,
  env,
  path
) {
  const exp = Date.now() + USERLIST_LINK_TTL_MS;

  const scope = panelScopeForPath(path);
  const epoch = await getLinkEpoch(env, scope);

  const signature = await hmacSha256Hex(
    linkSecret(env),
    `${scope}:${adminId}:${exp}:${epoch}`
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

async function checkUserListAuth(
  uid,
  expRaw,
  signature,
  env,
  scope = 'usrlist'
) {
  const id = String(uid || '');

  if (!/^\d{1,20}$/.test(id)) {
    return null;
  }

  const exp = Number(expRaw);
  const now = Date.now();

  if (!Number.isFinite(exp) || exp <= now) {
    return null;
  }

  // 小程序会话凭据（签名带 app. 前缀）：自带有效期上
  // 限与三用途 epoch 绑定，细则见 checkAppSessionAuth；
  // 通过即按主管理员凭据放行（三页页面、GET 查询串与
  // POST body 三种传参最终都收口到本函数）。不带前缀
  // 的一律继续走下方原链接校验，逐字不变。
  if (
    String(signature || '').startsWith(
      APP_SESSION_SIG_PREFIX
    )
  ) {
    return (await checkAppSessionAuth(
      id,
      exp,
      String(signature),
      env
    ))
      ? id
      : null;
  }

  if (exp > now + USERLIST_LINK_TTL_MS + 60 * 1000) {
    return null;
  }

  const epochState = await loadLinkEpochState(env);

  // epoch 行损坏 = 吊销状态不可信：fail-closed 拒绝
  // 并留节流告警，不再把坏值归一成 0 放行旧凭据
  // （第十一轮审计低 6）。
  if (epochState.corrupt.has(scope)) {
    await alertLinkEpochCorrupt(env, scope);

    return null;
  }

  const epoch = epochState.epochs.get(scope) ?? 0;

  const expected = await hmacSha256Hex(
    linkSecret(env),
    `${scope}:${id}:${exp}:${epoch}`
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

// 小程序会话凭据校验：exp 须落在会话有效期窗口内；
// 凭据自带签发时三页全部用途的 epoch 三元组（明文携
// 带、被签名覆盖，改一字签名即对不上）——先在本地验
// 格式与 HMAC（零 D1，伪造凭据到此为止，第十一轮审
// 计低 9），通过后才读当前 epoch 做吊销核对：任一
// 用途在管理台被「吊销链接」都会连带让全部小程序会
// 话失效（吊销后重新打开小程序验签换新会话即可）。
// 签名与链接共用 linkSecret，载荷另带 app: 域分
// 隔，链接签名无法挪作会话签名（且会话签名带 app.
// 前缀先行分流）。
async function checkAppSessionAuth(id, exp, signature, env) {
  const now = Date.now();

  if (
    !Number.isFinite(exp) ||
    exp <= now ||
    exp > now + APP_SESSION_TTL_MS + 60 * 1000
  ) {
    return false;
  }

  const match =
    /^app\.(\d{1,15})\.(\d{1,15})\.(\d{1,15})\.([0-9a-f]{64})$/.exec(
      String(signature || '')
    );

  if (!match) {
    return false;
  }

  const carried = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3])
  ];

  const expected =
    APP_SESSION_SIG_PREFIX +
    carried.join('.') +
    '.' +
    (await hmacSha256Hex(
      linkSecret(env),
      `app:${id}:${exp}:${carried.join('.')}`
    ));

  if (!timingSafeEqualString(expected, String(signature))) {
    return false;
  }

  if (!isPrimaryAdmin(id, env)) {
    return false;
  }

  // 吊销核对段：三 scope 当前 epoch（一条批量查询、
  // 按请求备忘）；与签发值不符即已吊销，数据损坏同
  // 样拒（fail-closed）并留节流告警。
  const state = await loadLinkEpochState(env);

  for (let i = 0; i < LINK_EPOCH_SCOPES.length; i += 1) {
    const scope = LINK_EPOCH_SCOPES[i];

    if (state.corrupt.has(scope)) {
      await alertLinkEpochCorrupt(env, scope);

      return false;
    }

    if (state.epochs.get(scope) !== carried[i]) {
      return false;
    }
  }

  return true;
}

// 为已验明身份的主管理员签发小程序会话凭据：返回的
// { u, e, s } 与签名链接同名同位，三页与数据 API 既有
// 的传参方式（GET 查询串 / POST body）原样复用。签
// 名串自带 epoch 三元组（app.<e1>.<e2>.<e3>.<签名>），
// 校验侧先本地验签、后读库核对吊销（见
// checkAppSessionAuth）。
async function mintAppSession(adminId, env) {
  const exp = Date.now() + APP_SESSION_TTL_MS;

  const state = await loadLinkEpochState(env);

  const triple = LINK_EPOCH_SCOPES
    .map((scope) => state.epochs.get(scope) ?? 0)
    .join('.');

  const signature =
    APP_SESSION_SIG_PREFIX +
    triple +
    '.' +
    (await hmacSha256Hex(
      linkSecret(env),
      `app:${adminId}:${exp}:${triple}`
    ));

  return { u: String(adminId), e: exp, s: signature };
}

async function panelQueryAdminId(
  request,
  env,
  scope = 'usrlist'
) {
  const url = new URL(request.url);

  return checkUserListAuth(
    url.searchParams.get('u'),
    url.searchParams.get('e'),
    url.searchParams.get('s'),
    env,
    scope
  );
}

/* -------------------------------------------------------------------------- */
/*                   敏感动作一次性 nonce 与管理审计（新增）                    */
/* -------------------------------------------------------------------------- */

const NONCE_TTL_MS = 5 * 60 * 1000;
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const LIST_SENSITIVE_ACTIONS = new Set([
  'delete',
  'pass',
  'trust',
  'block',
  'reset',
  'note'
]);

// 动作语义参数的规范化：签发与消费两侧用同一份规则提取
// 绑定字段，原始 JSON 的键序、布尔写法差异不造成误判。
function nonceSemanticParams(action, params) {
  const p =
    params && typeof params === 'object' ? params : {};

  if (action === 'delete') {
    return { deleteTopic: p.deleteTopic === true };
  }

  if (action === 'trust') {
    return { trust: p.trust === true };
  }

  if (action === 'block') {
    return { block: p.block === true };
  }

  if (action === 'config_set') {
    return { value: String(p.value ?? '') };
  }

  if (action === 'config_toggle') {
    return { value: p.value === true };
  }

  if (action === 'config_pause') {
    const pauseAction = String(p.action || '');
    const semantic = { action: pauseAction };

    if (pauseAction === 'pause') {
      semantic.minutes = Number(p.minutes);
    }

    return semantic;
  }

  if (action === 'config_list') {
    const listOp = String(p.op || '');
    const semantic = { op: listOp };

    if (listOp === 'add') {
      // 条目内容按服务端落库口径（trim 后）绑定。
      if (p.value !== undefined) {
        semantic.value = String(p.value).trim();
      }

      if (p.pattern !== undefined) {
        semantic.pattern = String(p.pattern).trim();
      }

      if (p.response !== undefined) {
        semantic.response = String(p.response).trim();
      }
    }

    if (listOp === 'delete') {
      // 删除绑「被删条目本身」而非序号：签发与提交之间
      // 名单若有增删，序号指向的条目变了就对不上、拒绝。
      semantic.item = String(p.item ?? '');
    }

    return semantic;
  }

  if (action === 'reset') {
    return {};
  }

  if (action === 'note') {
    // 备注绑提交内容本身（按落库口径 trim 后）：换一份
    // 内容重放对不上。绑定只进参数哈希，审计不记正文。
    return { note: String(p.note ?? '').trim() };
  }

  return {};
}

async function nonceParamsHash(action, target, params) {
  const semantic = nonceSemanticParams(action, params);

  const parts = Object.keys(semantic)
    .sort()
    .map((k) => `${k}=${JSON.stringify(semantic[k])}`);

  return hmacSha256Hex(
    'action-nonce-v1',
    `${action}|${target}|${parts.join('&')}`
  );
}

async function mintActionNonce(
  env,
  { adminId, scope, action, target, params }
) {
  const nonce = randomId();

  const rec = {
    a: String(adminId),
    sc: scope,
    act: action,
    t: String(target),
    ph: await nonceParamsHash(
      action,
      String(target),
      params
    ),
    exp: Date.now() + NONCE_TTL_MS
  };

  await dbConfigPut(
    `nonce:${nonce}`,
    JSON.stringify(rec),
    env
  );

  return nonce;
}

// 消费：管理员 / 用途 / 动作 / 目标 / 参数哈希全一致且未
// 过期，才以「值未变才删」的原子条件删消费掉记录放行。
// 返回 'ok' 或拒因简码（missing / unknown / expired /
// mismatch / consumed）。
async function consumeActionNonce(
  env,
  { nonce, adminId, scope, action, target, params }
) {
  if (!nonce || typeof nonce !== 'string') {
    return 'missing';
  }

  const key = `nonce:${nonce}`;
  const raw = await dbConfigGet(key, env);

  if (!raw) {
    return 'unknown';
  }

  let rec;

  try {
    rec = JSON.parse(raw);
  } catch {
    return 'unknown';
  }

  if (!rec || Number(rec.exp) <= Date.now()) {
    await dbConfigDelete(key, env);

    return 'expired';
  }

  const ph = await nonceParamsHash(
    action,
    String(target),
    params
  );

  if (
    String(rec.a) !== String(adminId) ||
    rec.sc !== scope ||
    rec.act !== action ||
    String(rec.t) !== String(target) ||
    rec.ph !== ph
  ) {
    return 'mismatch';
  }

  const consumed = await dbConfigDeleteIfValue(
    key,
    raw,
    env
  );

  return consumed ? 'ok' : 'consumed';
}

// 管理审计只记元数据：谁、何时、对哪个目标、做了什么、
// 结果如何。绝不记备注全文、配置值与任何 token / 签名。
async function insertAdminAuditRow(
  env,
  adminId,
  action,
  target,
  result,
  detail = '',
  opts = {}
) {
  await env.TG_BOT_DB.prepare(
    'INSERT INTO admin_audit ' +
      '(ts, admin_id, action, target, result, detail, ' +
      'epoch, ip) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    Date.now(),
    String(adminId || ''),
    String(action || ''),
    String(target || ''),
    String(result || ''),
    String(detail || '').slice(0, 64),
    String(opts?.epoch ?? ''),
    String(opts?.ip ?? '')
  ).run();
}

// 普通审计：写失败只记账不阻断——审计是留痕，不能反过
// 来把业务拖死。失败置 audit_degraded 标记，管理台顶部
// 横幅提示「可能有操作未被记录」；下一次任意写成功清
// 除标记。
async function writeAdminAudit(
  env,
  adminId,
  action,
  target,
  result,
  detail = '',
  opts = {}
) {
  try {
    await insertAdminAuditRow(
      env,
      adminId,
      action,
      target,
      result,
      detail,
      opts
    );

    try {
      await dbConfigDelete('audit_degraded', env);
    } catch (_) {
      // 清标记失败不影响本次审计已落库。
    }
  } catch (error) {
    console.error(
      '写入管理审计失败：',
      error?.message || error
    );

    try {
      await dbConfigPut(
        'audit_degraded',
        String(Date.now()),
        env
      );
    } catch (_) {
      // 标记也写不进去时只能靠控制台日志兜底。
    }
  }
}

// 严格审计：写失败抛错。只用在最敏感动作执行前的
// intent 审计——宁可拒绝执行，也不让一次无痕的高危
// 操作溜过去。动作完成后的结果审计仍走普通 fail-open，
// 不把已完成的动作改判失败。
async function writeAdminAuditStrict(
  env,
  adminId,
  action,
  target,
  result,
  detail = '',
  opts = {}
) {
  await insertAdminAuditRow(
    env,
    adminId,
    action,
    target,
    result,
    detail,
    opts
  );

  try {
    await dbConfigDelete('audit_degraded', env);
  } catch (_) {
    // 清标记失败不影响本次审计已落库。
  }
}

// 审计归因上下文：epoch = 本次请求验签所用的当前 epoch
// （吊销之后旧 epoch 的操作一眼可辨），ip = 请求来源。
// 在网页链 handler 里组装一次、随每次审计写传入；拿不
// 到留空，不硬凑。
async function auditOpts(request, env, scope) {
  let epoch = '';

  try {
    epoch = String(
      await getLinkEpoch(env, scope || 'panel')
    );
  } catch (_) {
    epoch = '';
  }

  return {
    epoch,
    ip: request?.headers?.get('CF-Connecting-IP') || ''
  };
}

async function cleanupOldAuditRows(env) {
  await env.TG_BOT_DB.prepare(
    'DELETE FROM admin_audit WHERE ts < ?'
  )
    .bind(Date.now() - AUDIT_RETENTION_MS)
    .run();
}

// 没被消费的 nonce 记录在过期后顺手清掉，避免 config
// 表里积压一次性凭据垃圾（按快照值条件删，防误删新行）。
async function sweepExpiredNonces(env) {
  const result = await env.TG_BOT_DB.prepare(
    'SELECT key, value FROM config WHERE key LIKE ?'
  )
    .bind('nonce:%')
    .all();

  const now = Date.now();

  for (const row of result?.results || []) {
    let exp = 0;

    try {
      exp = Number(JSON.parse(row.value)?.exp) || 0;
    } catch {
      exp = 0;
    }

    if (!exp || exp <= now) {
      await dbConfigDeleteIfValue(
        String(row.key),
        String(row.value),
        env
      );
    }
  }
}

// 三页链接即将过期的固定横幅脚本：剩余时间由页面自己
// 读 URL 参数 e（exp，毫秒）算，≤120 秒才亮，每 30 秒
// 复查一次。机器人用户名只取 getMe 缓存（sys:bot-
// username，命令处理时写入）——页面渲染不现拉 getMe，
// 缓存为空就不附「去机器人」按钮、只显示纯文案，绝不
// 硬编码用户名。
function expiryBannerScript(botUsername) {
  const user = /^[A-Za-z0-9_]{3,}$/.test(
    botUsername || ''
  )
    ? botUsername
    : '';

  return `<script>
var BOTU = ${JSON.stringify(user)};
(function () {
  var exp = Number(
    new URLSearchParams(location.search).get('e') || 0
  );
  if (!exp) return;
  function tick() {
    var left = exp - Date.now();
    var bar = document.getElementById('expbar');
    if (left > 0 && left <= 120000) {
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'expbar';
        bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:60;background:#57452a;color:#ecd9ac;padding:10px 14px;font-size:14px;text-align:center;box-shadow:0 -2px 10px rgba(0,0,0,.35)';
        bar.textContent = '⏳ 本页链接即将过期，请回到与机器人的私聊发送 /start 换新链接。';
        if (BOTU) {
          var a = document.createElement('a');
          a.href = 'https://t.me/' + BOTU;
          a.textContent = '去机器人';
          a.style.cssText = 'color:#ffd479;margin-left:10px;text-decoration:underline';
          bar.appendChild(a);
        }
        document.body.appendChild(bar);
      }
    } else if (bar) {
      bar.remove();
    }
  }
  tick();
  setInterval(tick, 30000);
})();
</script>`;
}

async function signedPageResponse(
  request,
  env,
  builder,
  expiredText,
  scope = 'usrlist'
) {
  const adminId =
    await panelQueryAdminId(request, env, scope);

  if (!adminId) {
    // 带 app. 前缀凭据来的请求是小程序会话失效
    // （第十一轮修复批 B 中 1）：文案改指小程序的
    // 自救路径，不再让用户去找小程序里不存在的主
    // 菜单；链接模式文案逐字不变。
    let shownText = expiredText;

    try {
      const sParam0 =
        new URL(request.url).searchParams.get('s') || '';

      if (sParam0.startsWith(APP_SESSION_SIG_PREFIX)) {
        shownText =
          '会话已失效，请关闭小程序后重新打开，' +
          '或点小程序顶部的「重新进入」。';
      }
    } catch (_) {}

    return new Response(
      '<!doctype html><meta charset="utf-8">' +
      '<p style="font-family:sans-serif;padding:24px">' +
      shownText +
      '</p>',
      {
        status: 403,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff'
        }
      }
    );
  }

  const pageCtx = {
    botUsername: '',
    auditDegraded: false,
    appMode: false
  };

  // 小程序会话打开的页面不挂链接过期横幅：会话凭据
  // 6 小时、每次打开小程序都重新验签换新，没有「链
  // 接即将过期」的概念。识别只看验签已通过前提下的
  // 签名形态——带 app. 前缀者必为会话凭据（链接签名
  // 是纯 hex，不可能带前缀）；横幅脚本本体与链接路
  // 径零改动。
  try {
    const sParam =
      new URL(request.url).searchParams.get('s') || '';

    pageCtx.appMode = sParam.startsWith(
      APP_SESSION_SIG_PREFIX
    );
  } catch (_) {
    pageCtx.appMode = false;
  }

  try {
    const cached = String(
      (await dbConfigGet('sys:bot-username', env)) || ''
    );

    if (/^[A-Za-z0-9_]{3,}$/.test(cached)) {
      pageCtx.botUsername = cached;
    }
  } catch (_) {
    // 用户名缓存读不到就只显示纯文案横幅。
  }

  try {
    pageCtx.auditDegraded = Boolean(
      await dbConfigGet('audit_degraded', env)
    );
  } catch (_) {
    pageCtx.auditDegraded = false;
  }

  return new Response(await builder(pageCtx), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff'
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
    '链接无效或已过期，请回到机器人主菜单重新打开访客列表。'
  );
}

// 存量访客的搜索字段懒回填：每请求按 50 行一批推进，
// 直到没有待回填行或单请求推进满 10 批（500 行）为止；
// 新访客建档/刷新资料时已同写，不走这里。回填只写搜索
// 列、不动 updated_at，免得把列表排序搅乱。
async function backfillUserSearchFields(env) {
  try {
    for (let round = 0; round < 10; round += 1) {
      const result = await env.TG_BOT_DB.prepare(
        'SELECT user_id, user_info_json FROM users ' +
        'WHERE search_name IS NULL ' +
        'AND user_info_json IS NOT NULL LIMIT 50'
      ).all();

      const rows = result?.results || [];

      if (!rows.length) {
        return;
      }

      for (const row of rows) {
        const derived = deriveUserSearchFields(
          safeJsonParse(row.user_info_json, null)
        );

        await env.TG_BOT_DB.prepare(
          'UPDATE users SET search_name = ?, ' +
          'search_username = ? WHERE user_id = ?'
        )
          .bind(
            derived.name,
            derived.username,
            String(row.user_id)
          )
          .run();

        invalidateUserRow(env, row.user_id);
      }

      if (rows.length < 50) {
        return;
      }
    }
  } catch (error) {
    console.error(
      '回填访客搜索字段失败：',
      error?.message || error
    );
  }
}

// 回填类场景的错误分级：true 表示「稍后重试可能成功」
// 的瞬时失败。与 telegramApi 的错误构造对齐：限流延迟
// （name 为 RateLimitDeferred，尽管它带 errorCode=429）
// 是瞬时；网络类错误（fetch 失败、非 JSON 错误页）在
// telegramApi 里不带 errorCode，是瞬时；429 与 5xx 即使
// 在请求内重试耗尽后带码抛出，本质仍是限流/服务端抖
// 动，是瞬时；其余带 errorCode 的都是 Telegram 的明确
// 拒绝（400 chat not found、403 bot was blocked 等），
// 是终局。
function isTransientTelegramError(error) {
  if (error?.name === 'RateLimitDeferred') {
    return true;
  }

  const code = Number(error?.errorCode || 0);

  if (!code) {
    return true;
  }

  return code === 429 || code >= 500;
}

// 存量无名行懒回填：user_info_json 为 NULL 的行（首
// 次接触落名上线前建的老行等）在打开列表时逐批补
// 名：每请求至多 5 行，逐行 getChat 回读姓名、拼同
// 形状 user_info 写入（搜索字段同写、不动
// updated_at，与搜索回填同口径）。查不到人（已拉黑
// 机器人/账号注销/非真实访客 ID 等终局情形）写哨兵
// '{}' 占位，避免每次打开列表重复调用；限流、网络
// 抖动、5xx 等瞬时失败不写哨兵——行保持 NULL，下次
// 打开列表再试，免得一次抖动就把本可补上的名字永久
// 放弃。本人日后发来消息时，首次接触落名会按「名字
// 为空」口径把真名补上。
async function backfillMissingUserInfo(env) {
  try {
    // 轮转推进（第十轮审计）：旧实现无 ORDER BY、
    // 每请求固定取库中前 5 行——排前面的行若因瞬
    // 时失败反复留空，后排永远轮不到（回填饿死）。
    // 改按 user_id 数值序游标轮转：游标存 config
    // （backfill_cursor），每轮从游标之后取 5 行；
    // 取空说明已到尾，游标归零再取一轮；处理完把
    // 游标推进到本轮最后一行。被瞬时失败跳过的行
    // 在下一圈轮转时还会被访问，长期全覆盖。
    let cursor = Number(
      (await dbConfigGet('backfill_cursor', env)) || 0
    );

    if (!Number.isFinite(cursor) || cursor < 0) {
      cursor = 0;
    }

    const backfillPage = (after) =>
      env.TG_BOT_DB.prepare(
        'SELECT user_id FROM users ' +
        'WHERE user_info_json IS NULL ' +
        'AND CAST(user_id AS INTEGER) > ? ' +
        'ORDER BY CAST(user_id AS INTEGER) ASC ' +
        'LIMIT 5'
      )
        .bind(after)
        .all();

    let result = await backfillPage(cursor);

    let rows = result?.results || [];

    if (!rows.length && cursor > 0) {
      cursor = 0;

      result = await backfillPage(0);

      rows = result?.results || [];
    }

    for (const row of rows) {
      try {
        const userId = String(row.user_id);

        let info = null;

        // 只有终局情形（非真实 ID、查无此人等明确错误、
        // 接口明确返回空）才写哨兵；瞬时失败保持行原状。
        let terminalMiss =
          !/^\d+$/.test(userId) ||
          Number(userId) <= 0;

        if (!terminalMiss) {
          try {
            const chat = await telegramApi(
              env.BOT_TOKEN,
              'getChat',
              { chat_id: userId }
            );

            if (chat) {
              const payload =
                buildUserInfoPayload(chat, null);

              info = {
                name: payload.displayName,
                username: payload.usernameDisplay,
                username_raw: payload.usernameRaw,
                first_message_date: null
              };
            } else {
              terminalMiss = true;
            }
          } catch (error) {
            info = null;

            if (isTransientTelegramError(error)) {
              console.error(
                '回填访客姓名遇瞬时失败，留待下次重试：',
                userId,
                error?.message || error
              );

              continue;
            }

            terminalMiss = true;
          }
        }

        const derived = deriveUserSearchFields(
          info || {}
        );

        await env.TG_BOT_DB.prepare(
          'UPDATE users SET user_info_json = ?, ' +
          'search_name = ?, search_username = ? ' +
          'WHERE user_id = ?'
        )
          .bind(
            info ? JSON.stringify(info) : '{}',
            derived.name,
            derived.username,
            userId
          )
          .run();

        invalidateUserRow(env, userId);
      } catch (error) {
        console.error(
          '回填单行访客姓名失败：',
          error?.message || error
        );
      }
    }

    if (rows.length) {
      const lastId = Number(
        rows[rows.length - 1].user_id
      );

      if (Number.isFinite(lastId) && lastId > 0) {
        await dbConfigPut(
          'backfill_cursor',
          String(lastId),
          env
        );
      }
    }
  } catch (error) {
    console.error(
      '回填访客姓名失败：',
      error?.message || error
    );
  }
}

// 访客列表排序组合（两段式：字段 × 方向）的唯一口径：
// 新枚举 act_desc / act_asc / fst_desc / fst_asc；旧三档
// active / new / old 只在读时映射（请求参数、存量配置、
// 管理台回显三处共用本函数），写侧只存新枚举。无法识
// 别的值返回 null，调用方各自落默认。
function normalizeUserlistSort(v) {
  const s = String(v || '');

  if (
    ['act_desc', 'act_asc', 'fst_desc', 'fst_asc'].includes(s)
  ) {
    return s;
  }

  return (
    { active: 'act_desc', new: 'fst_desc', old: 'fst_asc' }[
      s
    ] || null
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

  await backfillUserSearchFields(env);

  await backfillMissingUserInfo(env);

  const url = new URL(request.url);

  // 排序两段式四组合（字段 × 方向）：act 最后活跃 /
  // fst 首次来访（首次建档时间，旧称「注册」），desc
  // 倒序 / asc 正序。旧三档值在请求参数与存量配置两处
  // 读时映射（见 normalizeUserlistSort），老链接与老设
  // 置不失效；请求未指定时用服务端存的默认组合。
  const sortConfig =
    normalizeUserlistSort(
      await getConfig('userlist_sort', env, 'act_desc')
    ) || 'act_desc';

  const sort =
    normalizeUserlistSort(
      String(url.searchParams.get('sort') || '')
    ) || sortConfig;

  const pageSizeDefault = await clampedIntConfig(
    'userlist_page_size',
    env,
    20,
    5,
    100
  );

  let limit = Number(
    url.searchParams.get('limit')
  );

  if (!Number.isFinite(limit) || limit <= 0) {
    limit = pageSizeDefault;
  }

  limit = Math.min(100, Math.max(5, Math.trunc(limit)));

  // 状态筛选（旧前端的全量过滤语义迁到服务端）：verified /
  // pending 都要求未封禁——与旧口径一致，封禁者的展示状态
  // 恒为 blocked，不会同时落进这两档。
  const stateParam = String(
    url.searchParams.get('state') || 'all'
  );

  let stateSql = '';
  const stateBinds = [];

  if (stateParam === 'verified') {
    stateSql = 'user_state = ? AND is_blocked = 0';
    stateBinds.push(USER_STATE.VERIFIED);
  } else if (stateParam === 'pending') {
    stateSql = 'user_state = ? AND is_blocked = 0';
    stateBinds.push(USER_STATE.PENDING);
  } else if (stateParam === 'blocked') {
    stateSql = 'is_blocked = 1';
  } else if (stateParam === 'botblocked') {
    // 被屏蔽（访客拉黑了机器人）：与前三档不同维——
    // 它是横切标记，不落在 users 表列上，记账在
    // config 的 botblocked:<id>（与数据统计的被屏蔽
    // 总数同口径）。用 EXISTS 按键精确匹配，不用
    // LIKE 前缀扫（会误配相邻 ID）；对方解除拉黑
    // 时标记被清，人自动退出本筛选。谓词无绑定参
    // 数，total / 页号 / 游标三处共用同一 filterSql
    // 自动生效，搜索与排序照常叠加。
    stateSql = BOTBLOCKED_SQL;
  } else if (stateParam === 'fresh') {
    // 未开始（二级筛选）：与数据统计的未开始计数逐
    // 字同口径——user_state = NEW，不附加封禁条件；
    // 管理员/协管员的排除由 countUsersWhere 与取数
    // WHERE 的统一排除集合处理，两边数字恒等。
    stateSql = 'user_state = ?';
    stateBinds.push(USER_STATE.NEW);
  } else if (stateParam === 'trusted') {
    // 已信任（二级筛选）：与统计的已信任计数同口
    // 径——共享谓词 TRUSTED_SQL（is_trusted 与
    // relay_exempt 任一为真），排除集合统一处理。
    stateSql = TRUSTED_SQL;
  } else if (stateParam === 'topic') {
    // 有话题（二级筛选）：与统计的同口径谓词逐字
    // 一致（topic_id 非 NULL 且非空串）。
    stateSql = "topic_id IS NOT NULL AND topic_id != ''";
  } else if (stateParam === 'passes') {
    // 待用通行证（二级筛选）：有效证判定与统计共
    // 用 listOutstandingPassUserIds（记录 {n, e}、
    // n 在且 e 未到期），命中者以 user_id IN 列表
    // 进谓词——total / 页号 / 游标三处共用同一
    // filterSql 自动生效，搜索照常叠加。无人持证
    // 时用不存在的占位 ID 保谓词为空集。
    const passIds = await listOutstandingPassUserIds(env);
    const holders = passIds.length
      ? passIds
      : ['__no_pass_holder__'];

    stateSql =
      'user_id IN (' +
      holders.map(() => '?').join(',') +
      ')';

    stateBinds.push(...holders);
  }

  // 搜索：备注 / 姓名 / 用户名 / ID 子串匹配。姓名与用户
  // 名查独立小写列（search_name / search_username，建档
  // 与刷新资料时同写、存量懒回填），不再对 user_info_json
  // 原文做 LIKE——原文里的 JSON 键名会误命中、带转义的
  // 名字又对不上。pattern 同样小写化；LIKE 通配符先转
  // 义，搜 '%'、'_' 只按字面量找，全部参数绑定。
  const q = String(
    url.searchParams.get('q') || ''
  ).trim();

  let searchSql = '';
  const searchBinds = [];

  if (q) {
    const pattern =
      '%' +
      q
        .toLowerCase()
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_') +
      '%';

    // 单字符非数字查询只查 ID 列（第十轮审计）：
    // 四列前导通配 LIKE 每次搜索都是全表扫，逐字
    // 输入的第一下单字符查询结果本就不可用（命中
    // 大半个库的名字 / 备注），却照样付全额扫描。
    // 这里只保留 user_id 子串匹配；数字 ID 搜索
    // （含单个数字）在任何长度下口径不变、仍走四
    // 列；两字符起恢复四列子串，搜得到的范围除
    // 「单字符文本」外与旧口径一致。
    if (q.length === 1 && !/^\d$/.test(q)) {
      searchSql = "(user_id LIKE ? ESCAPE '\\')";

      searchBinds.push(pattern);
    } else {
      searchSql =
        "(admin_note LIKE ? ESCAPE '\\' OR " +
        "search_name LIKE ? ESCAPE '\\' OR " +
        "search_username LIKE ? ESCAPE '\\' OR " +
        "user_id LIKE ? ESCAPE '\\')";

      searchBinds.push(
        pattern,
        pattern,
        pattern,
        pattern
      );
    }
  }

  // 游标分页（keyset）：游标是不透明串，编码 {s 排序档,
  // k 上页末行排序键值, id 上页末行 user_id}；排序键 + 编号
  // 组成全序，翻页途中某行活跃时间变化也不会让没变键的
  // 行被跳过或重复（OFFSET 分页的老毛病）。排序档对不上
  // 或游标损坏时按第一页处理。
  const sortCol =
    sort.indexOf('fst') === 0 ? 'created_at' : 'updated_at';
  const sortDir = sort.slice(-3) === 'asc' ? 'ASC' : 'DESC';
  const cmp = sort.slice(-3) === 'asc' ? '>' : '<';

  let cursorSql = '';
  const cursorBinds = [];

  const cursorRaw = url.searchParams.get('cursor');

  if (cursorRaw) {
    const decoded = await decodeListCursor(cursorRaw, env);

    if (
      decoded &&
      decoded.s === sort &&
      decoded.id !== undefined &&
      Number.isFinite(Number(decoded.k))
    ) {
      cursorSql =
        `(${sortCol} ${cmp} ? OR ` +
        `(${sortCol} = ? AND user_id ${cmp} ?))`;

      cursorBinds.push(
        Number(decoded.k),
        Number(decoded.k),
        String(decoded.id)
      );
    }
  }

  // 页号取数模式（页码下拉直达）：带 page 参数时按
  // OFFSET 取该页，筛选/搜索/排序口径与游标模式完全
  // 一致，游标条件不叠加（同传 cursor 以 page 为准）。
  // 页号 1 起：<1 按 1 处理，超总页数在 total 算出后
  // 钳到最后一页；无 page 参数时本段与后续分支均不
  // 生效，游标模式行为逐字节不变。
  const pageParam = url.searchParams.get('page');
  const pageMode = pageParam !== null;
  let pageNo = 1;

  if (pageMode) {
    pageNo = Math.trunc(Number(pageParam));

    if (!Number.isFinite(pageNo) || pageNo < 1) {
      pageNo = 1;
    }
  }

  // 排除集合 = 主管理员 + 协管员（与 countUsersWhere 同
  // 口径）：他们是管理侧账号，不出现在访客列表里。
  const adminIds = [
    ...new Set([
      ...getPrimaryAdminIds(env),
      ...(await getAuthorizedAdmins(env))
    ])
  ];

  const filterSql = [stateSql, searchSql]
    .filter(Boolean)
    .join(' AND ');

  const filterBinds = [...stateBinds, ...searchBinds];

  // 精确总数（第十轮审计）：页号模式要靠它钳页
  // 号、必须算；游标模式只在第一页（无 cursor 参
  // 数）算一次，供页眉计数与页码下拉，翻页时不
  // 再每页付一次全表 COUNT——响应 total 回
  // null，前端沿用上次的精确值（筛选 / 搜索 /
  // 排序一变都会回到第一页重算，不会跨语境陈旧）。
  const total =
    pageMode || !cursorRaw
      ? await countUsersWhere(
          env,
          filterSql,
          filterBinds
        )
      : null;

  if (pageMode) {
    const totalPages =
      total > 0 ? Math.ceil(total / limit) : 1;

    if (pageNo > totalPages) {
      pageNo = totalPages;
    }
  }

  const where = [];
  const binds = [];

  if (adminIds.length) {
    where.push(
      'user_id NOT IN (' +
        adminIds.map(() => '?').join(',') +
        ')'
    );

    binds.push(...adminIds);
  }

  if (filterSql) {
    where.push(filterSql);
    binds.push(...filterBinds);
  }

  if (cursorSql && !pageMode) {
    where.push(cursorSql);
    binds.push(...cursorBinds);
  }

  // 多取一行判「还有下一页」，不靠总数推算。
  const result = await env.TG_BOT_DB.prepare(
    'SELECT user_id, user_state, is_blocked, ' +
      'is_trusted, relay_exempt, topic_id, ' +
      'created_at, updated_at, ' +
      'user_info_json, admin_note FROM users ' +
      (where.length
        ? 'WHERE ' + where.join(' AND ') + ' '
        : '') +
      `ORDER BY ${sortCol} ${sortDir}, user_id ${sortDir} ` +
      (pageMode ? 'LIMIT ? OFFSET ?' : 'LIMIT ?')
  )
    .bind(
      ...binds,
      limit + 1,
      ...(pageMode ? [(pageNo - 1) * limit] : [])
    )
    .all();

  const fetched = result?.results || [];
  const hasMore = fetched.length > limit;
  const rows = hasMore
    ? fetched.slice(0, limit)
    : fetched;

  // 本页待验证访客的通行证状态：一次 IN 查询批量取，
  // 不再逐人点读（有效口径不变：记录里的 e 大于当前
  // 时刻才算证还在）。
  const passExpById = new Map();

  const pendingKeys = rows
    .filter(
      (user) =>
        !user.is_blocked &&
        user.user_state === USER_STATE.PENDING
    )
    .map((user) => `pass:${user.user_id}`);

  if (pendingKeys.length) {
    const passResult = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config WHERE key IN (' +
        pendingKeys.map(() => '?').join(',') +
        ')'
    )
      .bind(...pendingKeys)
      .all();

    for (const row of passResult?.results || []) {
      try {
        const rec = JSON.parse(row.value);

        if (rec && rec.n && Number(rec.e) > Date.now()) {
          passExpById.set(
            String(row.key).slice('pass:'.length),
            Number(rec.e)
          );
        }
      } catch {
        /* 坏记录按无证处理 */
      }
    }
  }

  const users = rows.map((user) => {
    const info = parseUserInfoForList(user);

    return {
      id: String(user.user_id),
      name: info.name,
      username: info.username,
      state: user.is_blocked
        ? 'blocked'
        : String(user.user_state || ''),
      topic: Boolean(user.topic_id),
      topic_id: user.topic_id
        ? String(user.topic_id)
        : '',
      created_at: user.created_at || 0,
      updated_at: user.updated_at || 0,
      note: user.admin_note || '',
      passExp:
        passExpById.get(String(user.user_id)) || 0,
      trusted: Boolean(user.is_trusted),
      exempt: Boolean(user.relay_exempt)
    };
  });

  let nextCursor = null;

  if (hasMore && rows.length) {
    const last = rows[rows.length - 1];

    nextCursor = await encodeListCursor(
      {
        s: sort,
        k: Number(last[sortCol]) || 0,
        id: String(last.user_id)
      },
      env
    );
  }

  const groupLinkId = String(
    env.ADMIN_GROUP_ID || ''
  ).replace(/^-100/, '');

  return Response.json({
    ok: true,
    group: groupLinkId,
    users,
    total,
    // 页号模式回显钳制后的实际页号；游标模式不带此
    // 字段，响应与旧版逐字节一致。
    ...(pageMode ? { page: pageNo } : {}),
    // 游标分页下没有「只看得到前 1000 人」的截断了：
    // 每一行都能翻页到达。字段保留兼容，恒 false；
    // total 是当前筛选口径下的精确总数（游标翻页
    // 时为 null，前端沿用第一页的精确值）。
    truncated: false,
    nextCursor,
    uiDefaults: {
      sort: sort,
      pageSize: pageSizeDefault
    }
  });
}

// 游标格式：<base64url 载荷>.<HMAC 签名>。签名复用链接
// 签名密钥：游标虽不是提权面（有链接本就能翻全量），但
// 篡改出的畸形游标会让翻页落进异常状态，签名后验不过
// 一律按第一页处理，与「游标损坏」同口径。
async function encodeListCursor(obj, env) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(obj)
  );

  let bin = '';

  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }

  const payload = btoa(bin)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const signature = await hmacSha256Hex(
    linkSecret(env),
    `list-cursor-v1|${payload}`
  );

  return `${payload}.${signature}`;
}

async function decodeListCursor(raw, env) {
  try {
    const text = String(raw || '');
    const dot = text.lastIndexOf('.');

    if (dot <= 0) {
      return null;
    }

    const payload = text.slice(0, dot);
    const signature = text.slice(dot + 1);

    const expected = await hmacSha256Hex(
      linkSecret(env),
      `list-cursor-v1|${payload}`
    );

    if (
      !timingSafeEqualString(signature, expected)
    ) {
      return null;
    }

    const b64 = payload
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);

    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }

    return JSON.parse(
      new TextDecoder().decode(bytes)
    );
  } catch {
    return null;
  }
}

async function countRows(env, sql, binds) {
  const row = await env.TG_BOT_DB.prepare(sql)
    .bind(...binds)
    .first();

  return Number(row?.n || 0);
}

// 「已信任」共享谓词（第十轮审计中 3 收口）：is_trusted
// 与 relay_exempt 任一为真即已信任——合并前的存量
// 「放行-only」行只置了 relay_exempt。数据统计、访客
// 列表 trusted 筛选与双 TTL 豁免全走这一口径（呈现层
// 资料卡 / 列表徽标本来就认两者）；信任写入仍同写两
// 列不变。
const TRUSTED_SQL = '(is_trusted = 1 OR relay_exempt = 1)';

function isTrustedRow(row) {
  return (
    Number(row?.is_trusted || 0) === 1 ||
    Number(row?.relay_exempt || 0) === 1
  );
}

// 被屏蔽（访客拉黑机器人）谓词：config 的
// botblocked:<id> 精确键 EXISTS（不用 LIKE 前缀扫）。
// 访客列表 botblocked 筛选与数据统计被屏蔽计数共用
// 同一串，两边数字恒等。
const BOTBLOCKED_SQL =
  "EXISTS (SELECT 1 FROM config WHERE key = 'botblocked:' || user_id AND value = '1')";

async function countUsersWhere(env, extraSql, binds, knownAdminIds) {
  // 排除集合 = 主管理员 + 协管员：协管员不是访客，
  // 不进列表总数（total/truncated）与各项统计口径。
  // knownAdminIds 由调用方整请求算一次后传入时直接
  // 用，免得批量计数时每个计数各读一遍协管员配置
  // （统计接口曾因此单请求重复读同一行 16 次）。
  const adminIds = knownAdminIds || [
    ...new Set([
      ...getPrimaryAdminIds(env),
      ...(await getAuthorizedAdmins(env))
    ])
  ];

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

// 待用通行证：pass:<uid> 记录还在即未消费（消费 /
// 作废都会删键）；记录值 {n, e}，e 为毫秒到期时刻，
// 未过期才算。过期记录要等访客下次互动才清扫，这里
// 按 e 现场过滤，口径与列表页的证状态徽标一致。判
// 定收口在 listOutstandingPassUserIds：数据统计的待
// 用通行证数与访客列表 state=passes 的持证人集合共
// 用它，两边数字恒等。
async function listOutstandingPassUserIds(env) {
  const result = await env.TG_BOT_DB.prepare(
    'SELECT key, value FROM config WHERE key LIKE ?'
  )
    .bind('pass:%')
    .all();

  const ids = [];

  for (const row of result?.results || []) {
    try {
      const rec = JSON.parse(row.value);

      if (rec && rec.n && Number(rec.e) > Date.now()) {
        ids.push(String(row.key).slice('pass:'.length));
      }
    } catch {
      /* 坏记录按无证处理 */
    }
  }

  return ids;
}

async function countOutstandingPasses(env) {
  return (await listOutstandingPassUserIds(env)).length;
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

  // 排除集合整请求只算一次：此前 16 个 users 计数各
  // 自经 countUsersWhere 读一遍协管员配置，单请求光
  // 同一行配置就重复读 16 次（第十轮审计中 14）。
  const adminIds = [
    ...new Set([
      ...getPrimaryAdminIds(env),
      ...(await getAuthorizedAdmins(env))
    ])
  ];

  const excludeSql = adminIds.length
    ? ' WHERE user_id NOT IN (' +
      adminIds.map(() => '?').join(',') +
      ')'
    : '';

  // users 侧 16 项计数合并为一条条件聚合：SUM(CASE
  // WHEN …) 逐项求和、同一排除集合一遍扫完（此前是
  // 16 条 COUNT 各扫一遍）。各谓词与访客列表对应
  // state 逐字同口径——verified / pending 带
  // is_blocked = 0（被封禁者只进已屏蔽，此前统计漏
  // 了这一条、数字恒大于名单）、fresh 不附加封禁条
  // 件、trusted 走共享谓词 TRUSTED_SQL；口径变更必
  // 须列表与统计两处同改。
  const aggRow = await env.TG_BOT_DB.prepare(
    'SELECT COUNT(*) AS total, ' +
      'SUM(CASE WHEN user_state = ? AND is_blocked = 0 THEN 1 ELSE 0 END) AS verified, ' +
      'SUM(CASE WHEN user_state = ? AND is_blocked = 0 THEN 1 ELSE 0 END) AS pending, ' +
      'SUM(CASE WHEN user_state = ? THEN 1 ELSE 0 END) AS fresh, ' +
      'SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) AS blocked, ' +
      'SUM(CASE WHEN ' +
      TRUSTED_SQL +
      ' THEN 1 ELSE 0 END) AS trusted, ' +
      "SUM(CASE WHEN topic_id IS NOT NULL AND topic_id != '' THEN 1 ELSE 0 END) AS withTopic, " +
      'SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new1, ' +
      'SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new7, ' +
      'SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new30, ' +
      'SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS act1, ' +
      'SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS act7, ' +
      'SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END) AS act30, ' +
      'SUM(CASE WHEN updated_at >= ? AND created_at >= ? THEN 1 ELSE 0 END) AS actNew1, ' +
      'SUM(CASE WHEN updated_at >= ? AND created_at >= ? THEN 1 ELSE 0 END) AS actNew7, ' +
      'SUM(CASE WHEN updated_at >= ? AND created_at >= ? THEN 1 ELSE 0 END) AS actNew30 ' +
      'FROM users' +
      excludeSql
  )
    .bind(
      USER_STATE.VERIFIED,
      USER_STATE.PENDING,
      USER_STATE.NEW,
      since1,
      since7,
      since30,
      since1,
      since7,
      since30,
      since1,
      since1,
      since7,
      since7,
      since30,
      since30,
      ...adminIds
    )
    .first();

  const agg = aggRow || {};
  const total = Number(agg.total || 0);
  const verified = Number(agg.verified || 0);
  const pending = Number(agg.pending || 0);
  const fresh = Number(agg.fresh || 0);
  const blocked = Number(agg.blocked || 0);
  const trusted = Number(agg.trusted || 0);
  const withTopic = Number(agg.withTopic || 0);
  const new1 = Number(agg.new1 || 0);
  const new7 = Number(agg.new7 || 0);
  const new30 = Number(agg.new30 || 0);
  const act1 = Number(agg.act1 || 0);
  const act7 = Number(agg.act7 || 0);
  const act30 = Number(agg.act30 || 0);
  const actNew1 = Number(agg.actNew1 || 0);
  const actNew7 = Number(agg.actNew7 || 0);
  const actNew30 = Number(agg.actNew30 || 0);

  // 被屏蔽与待用通行证都以 users 行为域计数：与访客
  // 列表对应 state 的 total 共用 countUsersWhere 与
  // 同一谓词、同一排除集合。此前被屏蔽数的是 config
  // 原始行、通行证数的是收口函数的原始长度——标记
  // 残留而 users 行已删、或持证 / 被拉黑者后来成为
  // 管理员时，统计都会比名单多（第十轮审计中 2）。
  const botBlocked = await countUsersWhere(
    env,
    BOTBLOCKED_SQL,
    [],
    adminIds
  );

  const passIds = await listOutstandingPassUserIds(env);
  const passHolders = passIds.length
    ? passIds
    : ['__no_pass_holder__'];

  const passes = await countUsersWhere(
    env,
    'user_id IN (' +
      passHolders.map(() => '?').join(',') +
      ')',
    passHolders,
    adminIds
  );

  // 消息量三窗合并为一条条件聚合（入 / 出各一），窗
  // 口谓词与旧三条 COUNT 逐字一致。
  const msgAgg = async (whereSql, whereBinds) =>
    env.TG_BOT_DB.prepare(
      'SELECT ' +
        'SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS d1, ' +
        'SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS d7, ' +
        'SUM(CASE WHEN date >= ? THEN 1 ELSE 0 END) AS d30 ' +
        'FROM messages WHERE ' +
        whereSql
    )
      .bind(since1, since7, since30, ...whereBinds)
      .first();

  const inRow =
    (await msgAgg('user_id = ? AND message_id LIKE ?', [
      REACTION_MAP_USER,
      't:%'
    ])) || {};

  const outRow =
    (await msgAgg('message_id LIKE ?', ['admin:%'])) || {};

  const in1 = Number(inRow.d1 || 0);
  const in7 = Number(inRow.d7 || 0);
  const in30 = Number(inRow.d30 || 0);
  const out1 = Number(outRow.d1 || 0);
  const out7 = Number(outRow.d7 || 0);
  const out30 = Number(outRow.d30 || 0);

  return Response.json({
    ok: true,
    users: {
      total,
      verified,
      pending,
      fresh,
      blocked,
      botBlocked,
      trusted,
      withTopic,
      passes
    },
    growth: { d1: new1, d7: new7, d30: new30 },
    active: { d1: act1, d7: act7, d30: act30 },
    activeNew: {
      d1: actNew1,
      d7: actNew7,
      d30: actNew30
    },
    activeOld: {
      d1: act1 - actNew1,
      d7: act7 - actNew7,
      d30: act30 - actNew30
    },
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
    '链接无效或已过期，请回到机器人主菜单重新打开网页管理台。',
    'panel'
  );
}

async function handleGuidePage(request, env) {
  return signedPageResponse(
    request,
    env,
    buildGuidePage,
    '链接无效或已过期，请回到机器人主菜单重新打开新手引导。',
    'guide'
  );
}

function buildGuidePage(pageCtx = {}) {
  return `<!doctype html>
<html lang=\"zh-CN\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>新手引导</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-padding-top: 190px; overflow-y: scroll; scrollbar-gutter: stable; }
  /* 章节跳转动画由脚本逐帧驱动，不用 CSS scroll-behavior 以免双重平滑互相干扰 */
  body { font-family: -apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0f1a24; color: #dbe6f2; padding-top: 190px; padding-bottom: 30px; }
  header { position: fixed; top: 0; left: 0; right: 0; background: #13222f; padding: 12px 14px 10px; border-bottom: 1px solid #22374a; z-index: 3; transform: translateZ(0); will-change: transform; }
  h1 { font-size: 19px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 3px; line-height: 1.55; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 9px; }
  .chip { color: #b8cbdd; text-decoration: none; font-size: 12.5px; border: 1px solid #2b3a47; padding: 5px 10px; border-radius: 999px; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
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
  <div class=\"sub\">双向聊天机器人使用手册 · 当前版本 ${BOT_VERSION}<br>看完这一页，就能上手和访客聊天了。</div>
  <div class=\"chips\">
    <a class=\"chip\" href=\"#g-intro\">项目说明</a>
    <a class=\"chip\" href=\"#g-start\">开始使用</a>
    <a class=\"chip\" href=\"#g-verify\">验证</a>
    <a class=\"chip\" href=\"#g-chat\">接待日常</a>
    <a class=\"chip\" href=\"#g-cmd\">命令速查</a>
    <a class=\"chip\" href=\"#g-panel\">网页管理台</a>
    <a class=\"chip\" href=\"#g-users\">访客列表</a>
    <a class=\"chip\" href=\"#g-members\">成员纪律</a>
    <a class=\"chip\" href=\"#g-update\">版本更新</a>
    <a class=\"chip\" href=\"#g-faq\">常见问题</a>
    <a class=\"chip\" href=\"#g-limits\">不支持清单</a>
  </div>
</header>
<main>

  <section id=\"g-intro\">
    <h2>🧭 项目说明</h2>
    <p>这是一个<b class=\"k\">双向聊天机器人</b>，给个人自用：访客在私聊里给机器人发消息，消息会自动转到管理员群里一个属于他本人的专属「话题」；你在话题里打字回复，机器人再把话带回访客的私聊。一人一个话题，谁和谁的话分得清清楚楚，不会串线。</p>
    <ul>
      <li>它是在开源项目 TGbot-D1（3.0.5）基础上增强的版本：真人验证与一次性通行证、引用转发、消息编辑与表情同步、拉黑提醒、管理员备注、服务熔断、网页管理台、访客列表与数据统计、自动检查更新，都包含在你现在用的这一版里。</li>
      <li><b class=\"k\">隐私口径：</b>机器人只负责「搬运」消息，<b class=\"k\">不保存聊天正文</b>。数据库里只留转发所需的配对记录，并只保留 90 天。</li>
      <li><b class=\"k\">费用：</b>它跑在 Cloudflare 的免费额度上，日常使用量完全免费，不用绑卡。</li>
    </ul>
  </section>

  <section id=\"g-start\">
    <h2>🚀 开始使用</h2>
    <ol>
      <li><b class=\"k\">打开主菜单：</b>在机器人私聊里发送 <code>/start</code>，网页管理台、访客列表和这本引导都在这里。菜单只留最新一份：再发一次 /start，上一次的 /start 和旧菜单会被自动删掉，不会在聊天里堆积（若隔了超过 48 小时才回来，旧菜单已过 Telegram 的删除期限、删不掉，会留在那里，手动删一下即可）；留下的这条 /start 点一下就能再发，网页链接过期时靠它刷新最方便。</li>
      <li><b class=\"k\">（可选）装上主小程序入口：</b>在 BotFather 里发送 <code>/mybots</code> → 选你的机器人 → Bot Settings → Main App，把地址填成 <code>https://<你的 Worker 域名>/app</code>（域名换成你自己 Worker 的）。填好之后，就能从聊天列表或机器人资料页点「打开」直接进入小程序：访客列表、管理台和这本引导是同一个小程序里的三个页签，点顶部页签切换。在小程序里切换页签时，如果当前页有还没保存的修改，会先弹确认，确认后才切换，不会悄悄丢掉。注意别把两种打开方式的有效期混为一谈：从主菜单打开的是 10 分钟有效的签名链接；小程序用的是独立会话（约 6 小时、到期前自动续期），万一提示失效，关掉小程序重新打开、或点小程序顶部的「重新进入」即可。</li>
      <li><b class=\"k\">先定验证方式：</b>进「网页管理台 → 基础配置」，选一种验证方式（推荐 Turnstile，访客点一下就通过），顺便把欢迎消息改成你想在访客验证成功时对他说的话（验证成功时发给他，就是「🎉 验证成功」那条）。</li>
      <li><b class=\"k\">把机器人发给访客：</b>访客打开私聊、完成验证之后给你发消息，你的群里就会自动多出一个以他名字命名的话题。</li>
      <li><b class=\"k\">在话题里直接回复：</b>不需要任何额外设置，在他的话题里打字、发图，就是发给他本人。</li>
    </ol>
    <div class=\"tip\">访客那边的视角：打开机器人 → 点「开始」→ 按提示完成一次验证 → 直接打字聊天。验证只做一次，之后不用再验。</div>
  </section>

  <section id=\"g-verify\">
    <h2>🛡 验证</h2>
    <p>验证是用来挡垃圾机器人和广告号的：没通过验证的人，发什么都不会转进群里。</p>
    <ul>
      <li><b class=\"k\">Turnstile 小程序验证（推荐）：</b>访客点验证卡下方的「🔐 点我完成人机验证」按钮，弹出一个小页面自动完成人机校验，几秒通过，体验最顺。验证链接绑定访客本人，必须在 Telegram 里点开，转发给别人或用浏览器打开都用不了。</li>
      <li><b class=\"k\">静态问答验证：</b>你出一道题，访客答对才放行；答案可以准备多个，用竖线 <code>|</code> 分隔，答中任意一个都算对。连着答错 5 次会被锁定 30 分钟（防有人对着答案穷举），锁定期间他发什么都不会有回应，过后自动解锁。次数和时长可以在管理台「基础配置」里改。注意：自带的示例题答案就写在机器人简介里、人人可查，正式用问答模式前，务必把问题和答案换成你自己的（答案还是默认值时，管理台会标红提醒）。</li>
            <li><b class=\"k\">顺序点击验证：</b>不用打开网页、也不用打字：机器人发一条带九宫格按钮的消息，访客按正文给出的顺序、在 60 秒内点完 4–5 个同类 emoji 即通过；每点对一个，盘面会重新洗牌；点错会换一整道新题，连错锁定与静态问答共用同一套次数与时长设置。</li>
<li><b class=\"k\">在哪里切换：</b>网页管理台 → 基础配置 → 验证方式。选了 Turnstile 后，问题和答案两项会自动隐藏；如果还没配好 Turnstile 密钥，验证不会自动降级成问答（默认答案公开可抄，降级等于没验证）：访客会看到「验证服务尚未配置完成」的提示，机器人也会私聊提醒你补齐密钥、或改选静态问答 / 顺序点击。</li>
      <li><b class=\"k\">让某人重新验证：</b>打开他的话题，发送 <code>/reverify</code>，他下一次发消息前要重新过一遍验证。</li>
      <li><b class=\"k\">自己先试一遍：</b>私聊发送 <code>/testverify</code> 会拿到一个测试验证链接，点开能看到访客眼中的验证页长什么样；测试模式只是看看样子，不会真的放行或记录任何人。</li>
      <li><b class=\"k\">🎫 一次性通行证（救济通道）：</b>个别访客怎么也过不了验证（比如网络连不上验证服务）时，在访客列表里他那一行点「🎫 通行证」，机器人会私聊发给他一条带通行证链接的消息（默认 30 分钟内有效，有效期可在管理台「基础配置」里改），他点开链接、在确认页点一下即通过验证。通行证链接必须本人点开才有效，转发给别人没用，用过即作废；不依赖 Turnstile 配置，没配密钥也能发。</li>
      <li><b class=\"k\">🤝 信任：</b>熟人可以免掉验证：在访客列表他那一行点「🤝 信任」，或在他话题的资料卡上点「设为信任」，他立即通过验证（会收到欢迎消息，就是验证成功时发的那句问候）。信任只有一个开关，开启后一并免验证、免转发限流、免类型过滤、免超时清理（删档版与温和版都免）；屏蔽关键词与关键词自动封禁也一并豁免——他发的话、改的话带着关键词也照常送达、不计数。点「取消信任」收回。注意：对他「重置验证」或在话题里发 /reverify 会连信任一起撤销；被封禁的人要先解封才能设信任；资料卡上的信任按钮只有主管理员能操作。</li>
      <li><b class=\"k\">验证消息会自己清理：</b>验证提示、通行证和「🎉 验证成功」（即欢迎消息）这类流程消息，用完后会被机器人自动删掉，不在访客对话里堆积：反复索要验证只留最新一条提示；访客自己发的那条 /start，机器人在应答时就顺手删掉，私聊里不留这条命令消息；通过验证时提示会一并清掉，成功提示在他发出第一条消息、刚进入处理时就清掉（那条消息就算被关键词、类型过滤或限流拦下也照清）；过期没用的通行证会在他下次来发消息时清扫。</li>
    </ul>
  </section>

  <section id=\"g-chat\">
    <h2>💬 接待日常</h2>
    <ul>
      <li><b class=\"k\">资料卡：</b>每个话题顶部都钉着访客的资料卡（名字、ID、状态、你的备注）。卡片不见了就在话题里发 <code>/card</code> 重新生成；卡片上的按钮可以直接屏蔽 / 解除屏蔽、设为信任、刷新。</li>
      <li><b class=\"k\">引用回复会跟着走：</b>你在话题里引用某条消息再回复，访客那边看到的也是引用着他原话的回复；访客引用着回复你时同理，连他框选一小段文字的「部分引用」都会原样带过去。</li>
      <li><b class=\"k\">改错字会同步：</b>直接编辑你已发送的消息，对方那边会同步改好，被改好的那条消息下方会出现一颗「✍🏼已编辑」标记按钮（点它不会有任何反应，只是标记）。Telegram 不给机器人提供官方的「已编辑」标记，这颗按钮就是补这个用的；它和普通聊天里的编辑一样安静——不会有新消息、不会弹窗提醒，没留意的话可能根本发现不了对方改过。访客编辑他的消息时，你这边也一样。这是写死的固定行为：两个方向的编辑都会自动附上标记，管理台里没有它的开关。只有原地改不动的极少数情况例外（比如转发配对已过期被清理、原地修改被拒绝）：这时机器人会以「回复旧副本」的形式补发一条只含新内容的消息，下方照样附「✍🏼已编辑」标记，原来的副本保留不动——这种时候才会多出一条新消息，顺着回复关系就能对上是哪条被改了。</li>
      <li><b class=\"k\">自动消息带「系统提示」牌：</b>机器人自动发出的提示消息（欢迎消息、验证提示、自动回复、熔断期间的回复、拉黑 / 解封通知这类），只要本身没有功能按钮，下方都会带一颗「系统提示」按钮，用来和真人发送的消息区分，点它不会有任何动作；验证按钮、通行证、资料卡、主菜单这些本来就带按钮的消息不再另加；主菜单有个例外：按钮被全部关掉后，菜单没了按钮，就会带上这颗牌子。消息被原地改写时牌子也在，靠改写出现的报告也会补上——比如熔断恢复后，「请稍后再试」会原地改成「✅ 服务已恢复」，下方的「系统提示」照样保留；/clear 的确认卡点下后会原地改写成进度与结果报告，下方同样带这颗牌子。</li>
      <li><b class=\"k\">删消息两边一起删：</b>在话题里回复选中要删的那条消息，再发 <code>/delete</code>，两边同时删除。注意：访客私聊那边的原消息只能删 48 小时以内的，超了删不掉时会在话题里留一行说明。</li>
      <li><b class=\"k\">整段对话清空：</b>在话题里发 <code>/clear</code> 并点确认，会把这个话题里的转发副本和访客私聊里的聊天副本成批删掉，欢迎消息、验证卡这类机器人单独记账的流程消息、还有熔断期间发出的回复卡也一并删掉（访客发的那条 /start 在机器人应答时就已删掉，不会留到清空时才发现删不掉），话题本身保留、之后还能接着聊；48 小时前的私聊消息删不掉，清完会在话题里报告删了多少、多少删不掉。这个操作只有主管理员能做，协管员发命令或点确认都会被拦下。</li>
      <li><b class=\"k\">表情回应会同步：</b>你给某条消息贴的 emoji，对方那边也会贴上（会显示成机器人贴的，因为 Telegram 只允许机器人以自己的名义贴）。</li>
      <li><b class=\"k\">拉黑有提醒：</b>访客把机器人拉黑时，他的话题里会出现 🚫 提醒；他取消拉黑时有 ✅ 提醒，不用你去猜他还在不在；发出 ✅ 提醒的同时，之前那条 🚫 提醒会被一并删掉，话题里只留最新状态。</li>
      <li><b class=\"k\">转发失败有提醒：</b>投票、位置、游戏这类本体转不过来的消息，会在话题里落一张占位卡、访客那边也会收到一句提示（见文末「不支持清单」）；其他复制失败会在话题里留一行 ⚠️ 提醒你留意；要是在群里手动关闭了某个话题，访客再发消息时机器人会先把话题重新打开再投递，不会另建新话题；访客短时间内发得太频繁时，超出部分会被限流丢弃，并在话题里提醒一次。</li>
      <li><b class=\"k\">命令回执不留痕：</b>你在话题里发出的命令消息，会在处理后立即被撤回；/note 的查看与保存、/notedelete、/reverify、/ban、/unban、/card 重建、话题里 /pause 与 /resume 的结果提示，还有打错命令时的「未识别的命令」提示，都是短暂显示，约 5 秒后自动删除，话题里不会堆积这类回执。例外：/note 保存失败（比如备注超长）时，命令原文会保留下来，方便你照着改短了重发。</li>
      <li><b class=\"k\">被轰炸时先开启服务熔断：</b>私聊发 <code>/pause 60</code> 暂停机器人 60 分钟（主菜单、网页管理台里也有开关），期间访客新发的消息会被机器人当场删除、不补送——消息发出去就消失，就是还在暂停的信号；对熔断前已送达消息的编辑和反应同样会被拒收、不再同步到话题副本（编辑能把旧消息整段换成新内容，放行等于绕过暂停发新消息）；开启服务熔断回复时，被拒的访客会收到一张警告，每位访客每轮暂停至多一张，恢复服务时警告会自动删除（关闭熔断回复时完全静默，警告也不发），被拒的编辑不会在恢复后补同步，记得提醒对方恢复后重新编辑或重发；这句警告可以在管理台「文案与呈现」里改成自己的说法；开启服务熔断回复时，每位访客会收到一条「请稍后再试」，恢复后记得提醒对方重发重要消息；恢复服务时，那条「请稍后再试」会自动改成「✅ 服务已恢复」，访客一看便知；这条恢复提示会在访客下一次发消息时自动撤回（暂停期间收到这条回复的人很多时，会在恢复后的头几条消息里分批改完）。到期自动恢复（恢复通知会在到期后第一条消息到来时一并送达，没人发消息时收不到通知是正常的），也可随时 <code>/resume</code> 提前恢复。</li>
    </ul>
  </section>

  <section id=\"g-cmd\">
    <h2>⌨️ 命令速查</h2>
    <p>命令菜单按身份显示：访客在私聊里点开菜单，只看得到 /start；管理员命令只出现在主管理员自己的私聊菜单里，话题命令只出现在接待群里，访客看不到。</p>
    <p>下面这些命令都在<b class=\"k\">访客的话题里</b>发送（在私聊里发没用）：</p>
    <div class=\"cmd\"><code>/ban</code><div>封禁这位访客：他再发来的消息会被当场删掉、不再转进来，他会收到一条「⚠️ 您已被管理员封禁，无法继续发送消息。」的通知。</div></div>
    <div class=\"cmd\"><code>/unban</code><div>解除封禁：他会收到一条「✅ 管理员已解除对您的封禁，现在可以继续发送消息。」，之后恢复正常转发。</div></div>
    <div class=\"cmd\"><code>/delete</code><div>先回复选中一条消息、再发这条命令：双向删除那条消息。</div></div>
    <div class=\"cmd\"><code>/terminate</code><div>结束会话并删掉整个话题（删了找不回来，谨慎用）。</div></div>
    <div class=\"cmd\"><code>/clear</code><div>清空和这位访客的整段聊天记录：话题里的转发副本和访客私聊里的副本一起删（会先弹确认按钮），私聊里的欢迎消息、验证卡与熔断回复卡也一并删掉，话题和访客档案保留；私聊里 48 小时前的消息删不掉，清完会报告条数。</div></div>
    <div class=\"cmd\"><code>/card</code><div>重新生成这个话题的资料卡。</div></div>
    <div class=\"cmd\"><code>/reverify</code><div>让这位访客重新做一次验证。</div></div>
    <div class=\"cmd\"><code>/note 内容</code><div>给这位访客存一条只有管理员看得到的备注（如「老客户，注意时效」）；只发 /note 是查看，/notedelete 是删除。备注除了显示在资料卡上，还会同步到话题名最前面（格式「备注｜名字 (ID)」），在群的话题列表里一眼就能看到。</div></div>
    <p style=\"margin-top:10px\">在<b class=\"k\">私聊</b>里用的命令：</p>
    <div class=\"cmd\"><code>/start</code><div>打开主菜单。</div></div>
    <div class=\"cmd\"><code>/testverify</code><div>拿一条验证页的测试链接，自己先体验一遍。</div></div>
    <div class=\"cmd\"><code>/version</code><div>查看当前版本，以及有没有新版本。</div></div>
    <div class=\"cmd\"><code>/panel</code><div>直接打开网页管理台（只有主管理员可用）。主菜单里关掉了管理台按钮时，也可以用这个命令临时打开。</div></div>
    <div class=\"cmd\"><code>/pause 60</code><div>开启服务熔断，暂停机器人 60 分钟（不写数字 = 60 分钟，话题里也能发）：期间访客新发的消息会被删除、不送达（对已送达消息的编辑与反应同样拒收，开启熔断回复时被拒会发一张警告、恢复时自动删除），到期自动恢复。</div></div>
    <div class=\"cmd\"><code>/resume</code><div>立即恢复机器人服务（话题里也能发）。</div></div>
  </section>

  <section id=\"g-panel\">
    <h2>🛠 网页管理台</h2>
    <p>从主菜单打开，<b class=\"k\">只有主管理员能进</b>。所有设置都集中在这里，改完点对应的「保存」立即生效：</p>
    <ul>
      <li><b class=\"k\">基础配置：</b>欢迎消息、验证方式与题目、已验证超时清理（两种）。删档版填一个天数（比如 90），长期没动静的访客会被自动清除并释放位置；填 0 表示永不自动清。注意：被清掉的人下次再来会新建一个话题，老话题会留着当存档。另有温和版「改回待验证」：同样在基础配置里填天数，到期只把人改回待验证，档案、备注与话题都留着，对方回来重新验证后还在原话题继续聊；两种可以同时开，一般温和版的天数设得更小。这一区还管参数与开关：转发限流的强度、通行证与验证链接的有效期、问答锁定的次数与时长、命令回执停留几秒（数字都带安全范围，填超了不保存），以及功能开关：反应同步、转发失败提醒、拉黑提醒，用不上哪个就关掉。（编辑标记不在开关之列：编辑同步成功就自动在被改消息下方附上「✍🏼已编辑」标记，两个方向都一样。）</li>
      <li><b class=\"k\">类型过滤：</b>不想转发的消息类型（贴纸、语音、视频等）在这里关掉，对方发了也不会过到对面去。</li>
      <li><b class=\"k\">屏蔽关键词：</b>访客的话里出现关键词会被拦下并记一次数，次数达到你设的阈值就自动封禁他，口径与手动封禁完全一致（新消息即删、同样发送封禁通知）。已信任的访客不在此列：对他们不拦截、不计数、不自动封禁。不会写正则表达式也没关系，直接填普通词句就行。</li>
      <li><b class=\"k\">自动回复：</b>访客的话包含某个词时，机器人自动回一句你预设的话（比如包含「价格」就自动回价目说明）。</li>
      <li><b class=\"k\">协管员：</b>把帮你接待的人的 Telegram 数字 ID 填进来（多个用逗号隔开）。协管员能在话题里回复、用命令、贴表情，但进不了网页管理台，也看不到访客列表；这一区还有一份「成员看门狗豁免名单」，把合法的其他机器人或账号 ID 填进去，它们进管理群时就不会触发成员告警。</li>
      <li><b class=\"k\">服务熔断：</b>被消息轰炸时在这里一键暂停机器人（或用 /pause 命令），可设定暂停时长、到期自动恢复；还能设置暂停期间给访客的回复语句，或关掉回复保持完全静默。</li>
      <li><b class=\"k\">文案与呈现：</b>机器人对访客说的话大多能改成你自己的口气：管理台可配文案共 19 项，欢迎消息在「基础配置」、熔断期间回复在「服务熔断」，其余都在这一区——答错提示与锁定提示、人机验证卡正文、通行证送达、熔断恢复、熔断编辑警告、拉黑 / 解封提醒、发给访客的封禁 / 解封通知、关键词命中与类型过滤的拒绝提示（类型过滤分发送类与转发类两条模板）、特殊类型无法转达提示；话题名的样式（备注在前还是名字在前、带不带 ID）、主菜单上显示哪些按钮、访客列表默认排序与每页条数、时间显示的时区（默认 Asia/Singapore），也都在这里。</li>
      <li><b class=\"k\">安全与审计：</b>网页链接万一泄露（截图、转发、浏览器历史都可能漏出去），可以在这里一键让访客列表 / 网页管理台 / 新手引导某一页的已发链接全部失效，再重新发送 /start 换新链接；谁在什么时候做过删除、发通行证、改配置这类敏感操作，这里也留有一份审计记录可查（保留 90 天）。吊销只影响网页链接，验证链接与一次性通行证不受影响；若怀疑签名密钥泄露，仅吊销不够，需要到 Cloudflare 换掉 LINK_SECRET（未设置时为 WEBHOOK_SECRET）并用新值重跑一次 setWebhook，旧签名才会全部作废。</li>
    </ul>
    <div class=\"tip\">${pageCtx.appMode ? '你现在是在小程序里打开管理台：登录会话有效 6 小时，外壳会在到期前自动换新；万一页面提示失效，关掉小程序重新打开、或点小程序顶部的「重新进入」即可。' : '管理台的网页链接 10 分钟过期；剩不到 2 分钟时，页面顶部会先亮一条横幅提醒；打开时、或者开着页面闲置超时后保存时，都会提示过期，重新发送 /start、在新主菜单上重新打开就行。'}</div>
  </section>

  <section id=\"g-users\">
    <h2>📋 访客列表与数据统计</h2>
    <ul>
      <li><b class=\"k\">两个标签页：</b>「访客列表」和「数据统计」，默认打开列表页，点顶部标签切换。</li>
      <li><b class=\"k\">找人：</b>页面右下角有一组浮动按钮：点放大镜会展开搜索框，可以按名字、用户名、数字 ID、甚至你写的备注来搜，搜索词生效时收起的按钮上会亮蓝点提醒；列表往下翻一段后，组里还会出现一个回顶按钮。这组按钮可以长按拖动摆放：按住任意一颗拖动、松手吸附到屏幕左侧或右侧，觉得挡住列表就把它挪开；展开搜索时它回到输入法上方（靠左时搜索框改为向右展开），收起回到放它的位置，拖回右下角原位会恢复自动避让分页条；关掉页面再打开则回到原位。页眉下方的「全部 / 已验证 / 待验证 / 已屏蔽 / 被屏蔽」是快速筛选（「被屏蔽」列的是拉黑了机器人的人）；筛选下方的一行按钮管排序——左半选按最后活跃还是首次来访（第一次与机器人互动的时间）排，右半选倒序还是正序。在列表上左右滑动，也能在五个筛选和「数据统计」之间切换。翻页除了点上一页 / 下一页，分页条上的页码下拉可以直接跳到任意一页。</li>
      <li><b class=\"k\">位置会记住：</b>每个筛选与搜索组合下翻到的页码和滚动位置都会被记住，切去别处再切回来，会自动回到离开时的位置（内容是重新拉取的新数据）；手动更换排序会清掉全部位置记忆，各视图都从第一页重新开始。</li>
      <li><b class=\"k\">对某个人操作：</b>每行有「重置验证」（让他重新验证）、「话题」（一键跳到话题群里和他的对话）、「删除」（“仅删除记录”只删机器人这边的档案，话题和聊天记录都不动；“连话题、私聊一起清空”会连群里的话题、和访客与机器人私聊里的聊天副本一起清掉，私聊里的欢迎消息、验证卡与熔断回复卡也一并删掉，私聊里 48 小时前的消息删不掉，清完会报告条数）、「🎫 通行证」（给还没通过验证的人发一张一次性通行证，他点开确认即可通过）和「备注」（写一句只有管理员看得到的话，会同步显示到他的资料卡上）。发完通行证后，他那一行会出现「🎫 已发证 · 剩 N 分钟」徽标，按钮变成「🎫 重新发放」，他用证通过后徽标自动消失。行里还有「🤝 信任」（只有一个信任开关：免验证、免转发限流、免类型过滤、免超时清理，见「验证」一节；关键词封禁对他同样无效）和「🚫 屏蔽 / ✅ 解封」（与 /ban、/unban 同一套封禁：屏蔽后他再发来的新消息会被立即删掉；解封时他会收到一条解除通知）；设为信任的人行上会挂「🤝 已信任」徽标，屏蔽中的人挂「已屏蔽」徽标。</li>
      <li><b class=\"k\">统计页：</b>总览一排九个数字，排在前面的是和列表筛选对应的五个：访客总数、已验证、待验证、已屏蔽、被屏蔽，后面是未开始、已信任、建有专属话题的人数和没用掉的通行证数；再往下是过去 24 小时、7 天、30 天分别新增了多少人、多少人活跃（活跃还分新客和老客）、收发了多少条消息。这九个数字都能点：前五个点开会直接切到访客列表并选中对应筛选；后四个在列表里没有单独的筛选，点开会整页推入一个只属于这批人的名单页——顶部是返回箭头、人群名和紧跟在名字后面的人数，名单上方有和访客列表同一条排序栏（按最后活跃或首次来访、正序或倒序），两边共用一份排序设置：在这边改了排序，回到访客列表也是这个顺序，反过来也一样；点返回箭头回到统计页。提醒一句：消息量是按转发记录数的，系统只留最近 90 天，所以统计最多往前看 90 天。</li>
    </ul>
  </section>

  <section id=\"g-members\">
    <h2>🛡 管理群成员纪律</h2>
    <ul>
      <li><b class=\"k\">群里能看，就等于能看全部对话：</b>每位访客的对话都在管理群的话题里，任何群成员都能翻看全部话题与资料卡（姓名、用户名、ID、你写的备注）。机器人能拦住非管理员在话题里发言、发命令，<b class=\"k\">拦不住阅读</b>——所以管理群的成员必须严格只限主管理员与协管员本人，不要把任何其他人拉进这个群。</li>
      <li><b class=\"k\">看门狗只负责事后发现：</b>名单外账号（不是机器人自己、主管理员、协管员，也不在豁免名单里）进入管理群时，机器人会私聊告警全体主管理员：是谁、被谁拉入、经哪个邀请链接。但告警响起时对方可能已经看到话题历史了——它负责发现，不负责预防。</li>
      <li><b class=\"k\">还会对账和自检：</b>机器人会给群成员数留一份基线，之后每次成员变动都核对一次：实际人数对不上（比如机器人掉线期间有人进出）会提醒你人工核查；机器人自己被取消管理员权限时也会立刻告警（这时看门狗已经停摆），恢复管理员后会通知你并重新建立基线。</li>
      <li><b class=\"k\">预防靠群设置，建群后先做两件：</b>① 把「新成员可查看历史消息」关掉（群资料 → 编辑 → 聊天历史记录可见性，不同客户端叫法略有差异），新人进群就看不到旧话题；② 只让管理员能拉人：成员权限里关掉普通成员的「添加成员」，不用的邀请链接及时撤销。</li>
      <li><b class=\"k\">收到告警怎么办：</b>先确认是不是自己或协管员有意拉的人；不是的话立刻把对方移出群，再检查并重置邀请链接。</li>
    </ul>
  </section>

  <section id=\"g-update\">
    <h2>🔄 版本与更新</h2>
    <ul>
      <li>主菜单顶部、标题下面有一行当前版本号；有新版本时，那一行会变成可以点开的链接，机器人也会私聊通知主管理员一次（只通知一次，不刷屏）。</li>
      <li>想手动确认时，点主菜单的「🔄 检查更新」；查太勤会被限速（5 分钟最多查一次），这是故意的，防止白白消耗额度。</li>
      <li>升级不丢东西：访客、配置、备注都存在数据库里，按项目仓库里的部署教程、换上新版文件重新部署即可。</li>
    </ul>
  </section>

  <section id=\"g-faq\">
    <h2>❓ 常见问题</h2>
    <p class=\"q\">关掉某个话题，是不是就把这个访客停掉了？</p>
    <p>不是。关话题只对普通群成员生效，机器人和管理员照样能在里面发消息。想真正停掉一个访客，在他的话题里发 /ban；想连话题一起清掉，发 /terminate。</p>
    <p class=\"q\">输入 / 时，/note 这些新命令不出现在候选里？</p>
    <p>那是 Telegram App 自己缓存了旧的命令名单，彻底关掉 App 再重开就会刷新；等不及也可以把命令手打全，一样有效。</p>
    <p class=\"q\">编辑过的消息为什么没有官方的「已编辑」小字？</p>
    <p>Telegram 不允许机器人给消息加官方编辑标记，所以机器人改用一颗附在被改消息下方的「✍🏼已编辑」按钮代替（按钮只有机器人能挂，访客自己发的消息带不了）。和普通聊天的编辑一样，改动是静默的：不会有新消息提醒，留意消息下方的这颗标记才能看出它被改过。</p>
    <p class=\"q\">贴的表情为什么显示成机器人贴的？</p>
    <p>Telegram 只允许机器人以自己的名义贴表情，同步到对方那边自然显示机器人名字，这个改不了。</p>
    <p class=\"q\">访客说验证一直过不了，怎么办？</p>
    <p>先让他换个网络或重启 App 再试。还是不行，就给他发一张一次性通行证：打开访客列表，在他那一行点「🎫 通行证」，机器人会私聊发给他一张 30 分钟有效的通行证，他点开确认就能通过，不用再折腾验证。你也可以发 /testverify 自己点一遍，看看验证页是否正常，或者在管理台临时把验证方式切成静态问答或顺序点击，让他先通过。</p>
    <p class=\"q\">网页打开提示「链接无效或已过期」？</p>
    <p>${pageCtx.appMode ? '你现在是在小程序里打开的：小程序的登录会话有效 6 小时，外壳会在到期前自动换新会话；万一页面提示失效，关掉小程序重新打开、或点小程序顶部的「重新进入」即可恢复；' : '管理台、访客列表和这本引导的链接都是 10 分钟有效的签名链接：打开时报错、或者页面开久了点保存提示「链接已过期」，都是它到期了。重新发送 /start，在新主菜单上重新打开即可；'}保存失败的那次修改不会生效，记得重新填一遍。</p>
  </section>

  <section id=\"g-limits\">
    <h2>🚧 已知不支持清单</h2>
    <p>下面这些消息类型，Telegram 没有给机器人留「原样转发本体」的路。访客发来、本体复制失败时，话题里会落一张<b class=\"k\">占位卡</b>：写明类型，并尽量附上内容摘要（投票的问题与选项、位置的经纬度、名片的姓名电话等），访客那边也会收到一句「⚠️ 这类消息机器人暂时无法转达，已提醒管理员。」（10 分钟内只提示一次）。占位卡和普通转发消息一样建了配对：你在话题里<b class=\"k\">回复占位卡，回复照样能转到访客私聊</b>；用 /delete 删占位卡，也会连带处理那条原消息。</p>
    <ul>
      <li><b class=\"k\">投票：</b>投票本体转不过来，占位卡会带上问题与选项的文字（测验题不会带正确答案），但投不了票、也看不到投票结果。需要表决时，让访客用文字把想法发过来。</li>
      <li><b class=\"k\">实时位置：</b>位置本体转不过来；实时位置的后续移动走的是「编辑消息」，机器人不处理位置类编辑，位置不会跟着更新。一次性位置同样只有占位卡。</li>
      <li><b class=\"k\">游戏、发票：</b>本体转不过来，里面的交互（开始游戏、付款）也用不了，只有占位卡。</li>
      <li><b class=\"k\">联系人名片、骰子动画等特殊类型：</b>复制失败时同样落占位卡；能正常复制的（骰子动画通常可以）一切照旧，不会出现占位卡。</li>
      <li><b class=\"k\">受保护内容：</b>来源聊天开了「禁止转发 / 保存」时，消息无法被复制，占位卡会标明是『受保护内容』。</li>
    </ul>
    <p>另外一句：机器人里的时间显示（资料卡、更新检查时间等）按管理台「文案与呈现」里的<b class=\"k\">时间显示时区</b>渲染，默认 Asia/Singapore；访客列表页的「最近活跃」按打开页面那台设备的浏览器时区显示，与这个设置无关。</p>

</main>
<script>
  // 未保存草稿口径（第十一轮修复批 C，中 5）：本页
  // 没有可编辑字段，恒干净；暴露同名查询口径与另
  // 外两页统一，外壳切页签前的询问在此恒放行。
  window.__hasUnsavedDraft = function () { return false; };
  var gPad = 0;
  function gFixPad() {
    var hd = document.getElementById('ghead');
    if (!hd) return;
    var h = hd.offsetHeight;
    var v = h + 10;
    if (v !== gPad) {
      gPad = v;
      document.documentElement.style.scrollPaddingTop = v + 'px';
      document.body.style.paddingTop = h + 'px';
    }
  }
  var gPadTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(gPadTimer);
    gPadTimer = setTimeout(gFixPad, 120);
  });
  gFixPad();
  var gAnim = 0;
  function gStopAnim() {
    if (gAnim) { cancelAnimationFrame(gAnim); gAnim = 0; }
  }
  window.addEventListener('wheel', gStopAnim, { passive: true });
  window.addEventListener('touchstart', gStopAnim, { passive: true });
  function gScrollTo(target) {
    var pad = parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0;
    var startY = window.pageYOffset || 0;
    var startX = window.pageXOffset || 0;
    var endY = startY + target.getBoundingClientRect().top - pad;
    var dist = endY - startY;
    if (!dist && !startX) return;
    gStopAnim();
    var dur = Math.min(600, Math.max(220, Math.round(Math.abs(dist) * 0.35)));
    var t0 = 0;
    function gStep(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - p, 3);
      window.scrollTo(Math.round(startX * (1 - e)), Math.round(startY + dist * e));
      gAnim = p < 1 ? requestAnimationFrame(gStep) : 0;
    }
    gAnim = requestAnimationFrame(gStep);
  }
  var gChips = document.querySelectorAll('.chip');
  for (var i = 0; i < gChips.length; i++) {
    gChips[i].addEventListener('click', function (ev) {
      var id = this.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var target = document.querySelector(id);
      if (!target) return;
      ev.preventDefault();
      gScrollTo(target);
      try { history.replaceState(null, '', id); } catch (e) {}
    });
  }
  var gSecs = document.querySelectorAll('section[id]');
  function gSpy() {
    var line = (window.pageYOffset || 0) + (parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0) + 4;
    var atBottom = (window.pageYOffset || 0) + window.innerHeight >= document.documentElement.scrollHeight - 2;
    var cur = null;
    for (var i = 0; i < gSecs.length; i++) {
      if (gSecs[i].offsetTop <= line) cur = gSecs[i];
      else break;
    }
    if (atBottom && gSecs.length) cur = gSecs[gSecs.length - 1];
    for (var j = 0; j < gChips.length; j++) {
      gChips[j].classList.toggle('on', !!cur && gChips[j].getAttribute('href') === '#' + cur.id);
    }
  }
  var gSpyTick = false;
  window.addEventListener('scroll', function () {
    if (gSpyTick) return;
    gSpyTick = true;
    requestAnimationFrame(function () { gSpyTick = false; gSpy(); });
  }, { passive: true });
  gSpy();
</script>
${pageCtx.appMode ? '' : expiryBannerScript(pageCtx.botUsername)}
</body>
</html>`;
}

function buildPanelPage(pageCtx = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>网页管理台</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; padding-top: 104px; }
  html { scroll-padding-top: 114px; overflow-y: scroll; scrollbar-gutter: stable; }
  header { position: fixed; top: 0; left: 0; right: 0; background: #17212b; padding: 12px 14px; z-index: 2; transform: translateZ(0); will-change: transform; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip { padding: 5px 12px; border-radius: 999px; border: 1px solid #2b3a47; color: #9db2c5; font-size: 13px; text-decoration: none; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  main { padding: 12px 12px 34px; }
  section { background: #17212b; border-radius: 12px; padding: 13px 14px; margin-bottom: 12px; }
  h2 { font-size: 15px; margin: 0 0 10px; }
  label { display: block; color: #9db2c5; font-size: 12.5px; margin: 12px 0 5px; }
  label:first-of-type { margin-top: 2px; }
  textarea, input[type=text], input[type=number], select { width: 100%; box-sizing: border-box; padding: 9px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 16px; }
  textarea { resize: vertical; line-height: 1.5; }
  .hint { color: #5f7488; font-size: 12px; margin-top: 5px; line-height: 1.5; }
  .save { margin-top: 8px; padding: 7px 18px; border-radius: 8px; border: 0; background: #2b5278; color: #fff; font-size: 14px; cursor: pointer; }
  .save:disabled { opacity: .5; }
  .danger { background: #5c2222; color: #ffb4b4; }
  .swrow { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #22303d; }
  .swrow:last-child { border-bottom: 0; }
  .swrow span { font-size: 14.5px; }
  .swrow input { width: 22px; height: 22px; accent-color: #2b5278; }
  input.chk { width: 22px; height: 22px; accent-color: #2b5278; margin: 2px 0 4px; }
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
<header id="phead">
  <h1>🛠 网页管理台</h1>
  <div class="chips">
    <a class="chip" href="#sec-base">基础配置</a>
    <a class="chip" href="#sec-filter">类型过滤</a>
    <a class="chip" href="#sec-keyword">屏蔽关键词</a>
    <a class="chip" href="#sec-reply">自动回复</a>
    <a class="chip" href="#sec-admin">协管员</a>
    <a class="chip" href="#sec-pause">服务熔断</a>
    <a class="chip" href="#sec-style">文案与呈现</a>
    <a class="chip" href="#sec-security">安全与审计</a>
  </div>
</header>
<main id="main">${pageCtx.auditDegraded ? '<div style="background:#5c2222;color:#ffb4b4;border-radius:8px;padding:10px 12px;margin-bottom:12px">审计日志写入异常，以下操作可能未被记录</div>' : ''}
  <div class="empty" id="loading">加载中…</div>

  <section id="sec-base" hidden>
    <h2>📝 基础配置</h2>
    <label>欢迎消息</label>
    <textarea id="f_welcome" rows="4"></textarea>
    <button class="save" data-k="welcome_msg" data-t="f_welcome">保存</button>
    <div class="hint">访客验证成功时发给他的问候（就是「🎉 验证成功」那条）：带「系统提示」牌，他发出第一条消息时自动撤回。</div>
    <label>验证方式</label>
    <select id="f_verifymode">
      <option value="turnstile">Turnstile 小程序验证</option>
      <option value="quiz">静态问答验证</option>
      <option value="sequence">顺序点击验证</option>
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
    <div class="hint">超过该天数无活跃的已验证/待验证访客会被自动清除（含其话题映射，旧话题保留为无主存档）。</div>
    <button class="save" data-k="verified_ttl_days" data-t="f_ttl">保存</button>
    <label>已验证改回待验证（天，0 = 关闭）</label>
    <input type="number" id="f_rvttl" min="0" max="3650" step="1">
    <div class="hint">温和版：超过该天数无活跃的已验证访客只改回待验证，档案、备注与话题都保留，对方回来重新验证后还在原话题里聊。被封禁 / 信任的访客不改。可与上面的删档清理同时开：一般把这个天数设得更小（先改回待验证）；删档天数从最后一次活动算起继续计时，满了照样删档。</div>
    <button class="save" data-k="reverify_ttl_days" data-t="f_rvttl">保存</button>
    <h2>⚙️ 参数与开关</h2>
    <div class="hint">说明：把问答「连错锁定次数」调小后，之前已答错多次的访客会按新次数提前锁定；已经在锁定期内的访客按落锁时的时长走完。验证链接与通行证的有效期调短，不影响已经发出去的（按发出时的时长到期）。</div>
    <label>转发限流：突发条数（1～100）</label>
    <input type="number" id="t_burst" min="1" max="100" step="1">
    <button class="save" data-k="relay_burst" data-t="t_burst">保存</button>
    <label>转发限流：每秒回填条数（1～20）</label>
    <input type="number" id="t_refill" min="1" max="20" step="1">
    <button class="save" data-k="relay_refill_per_sec" data-t="t_refill">保存</button>
    <label>通行证有效期（分钟，1～1440）</label>
    <input type="number" id="t_passmin" min="1" max="1440" step="1">
    <button class="save" data-k="pass_ttl_min" data-t="t_passmin">保存</button>
    <label>验证链接有效期（分钟，1～120）</label>
    <input type="number" id="t_vlinkmin" min="1" max="120" step="1">
    <button class="save" data-k="verify_link_min" data-t="t_vlinkmin">保存</button>
    <label>问答验证：连续答错几次锁定（1～20）</label>
    <input type="number" id="t_quizmax" min="1" max="20" step="1">
    <button class="save" data-k="quiz_max_attempts" data-t="t_quizmax">保存</button>
    <label>问答验证：锁定分钟（1～1440）</label>
    <input type="number" id="t_quizlock" min="1" max="1440" step="1">
    <button class="save" data-k="quiz_lock_min" data-t="t_quizlock">保存</button>
    <label>命令回执停留秒数（1～120）</label>
    <input type="number" id="t_stay" min="1" max="120" step="1">
    <button class="save" data-k="notice_stay_sec" data-t="t_stay">保存</button>
    <label>表情反应双向同步</label>
    <select id="t_reaction"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="reaction_sync_enabled" data-t="t_reaction">保存</button>
    <label>转发失败提醒（话题 ⚠️ 与管理员告警）</label>
    <select id="t_relayfail"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="relay_fail_notice_enabled" data-t="t_relayfail">保存</button>
    <label>拉黑 / 解封提醒</label>
    <select id="t_blocknotice"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="block_notice_enabled" data-t="t_blocknotice">保存</button>
    <div class="hint">数字参数都带安全范围，超出范围会报错不保存；开关关掉后对应功能整体停用，随时可以再打开。</div>
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
    <label>成员看门狗豁免 ID 列表（英文逗号分隔）</label>
    <textarea id="f_allowids" rows="2"></textarea>
    <div class="hint">名单内的账号进入管理群不触发成员告警（例如你自己的小号）；他们没有协管员的操作权限，只是进群不报警。</div>
    <button class="save" data-k="member_allow_ids" data-t="f_allowids">保存</button>
  </section>
  <section id="sec-pause" hidden>
    <h2>⏸ 服务熔断</h2>
    <div class="hint" id="pause_status">读取中…</div>
    <label>暂停时长（分钟，1～10080）</label>
    <input type="number" id="f_pause_min" min="1" max="10080" step="1" value="60">
    <button class="save danger" id="pause_start">⏸ 暂停机器人</button>
    <button class="save" id="pause_resume">▶️ 恢复服务</button>
    <label>服务熔断期间回复访客</label>
    <select id="f_pausereplymode">
      <option value="true">开启：每位访客每轮暂停最多收到一条</option>
      <option value="false">关闭：完全静默</option>
    </select>
    <button class="save" data-k="pause_reply_enabled" data-t="f_pausereplymode">保存</button>
    <div id="w_pausereply">
    <label>回复语句</label>
    <textarea id="f_pausereply" rows="2"></textarea>
    <button class="save" data-k="pause_reply_text" data-t="f_pausereply">保存</button>
    </div>
    <div class="hint">暂停期间访客新发的消息会被删除、不转发，恢复后不会补送，请提醒对方重发重要内容；对已送达消息的编辑与表情反应也会被拒收、不再同步，上面开启回复时，被拒的访客每轮至多收到一张警告（文案在「文案与呈现」里改），恢复服务时警告自动删除；关闭回复时完全静默，警告也不发。已被封禁的访客不会收到回复。暂停到期会自动恢复，也可随时恢复；到期时不会立刻发通知，恢复通知会在到期后第一条消息到来时一并送达，没人发消息时收不到通知是正常的。</div>
  </section>
  <section id="sec-style" hidden>
    <h2>🎨 文案与呈现</h2>
    <label>问答答错提示（未到锁定次数时）</label>
    <textarea id="s_vwrong" rows="2"></textarea>
    <button class="save" data-k="quiz_wrong_text" data-t="s_vwrong">保存</button>
    <label>问答 / 顺序点击锁定提示（答错次数过多、验证被锁定时发出）</label>
    <textarea id="s_qlock" rows="2"></textarea>
    <div class="hint">{minutes} 会替换成锁定的分钟数；不写占位符就按原文发送。</div>
    <button class="save" data-k="quiz_lock_text" data-t="s_qlock">保存</button>
    <label>人机验证卡正文（Turnstile 模式验证卡上的说明文字）</label>
    <textarea id="s_vcard" rows="2"></textarea>
    <div class="hint">{minutes} 会替换成验证链接的有效分钟数；不写占位符就按原文发送。</div>
    <button class="save" data-k="verify_card_text" data-t="s_vcard">保存</button>
    <label>通行证送达文案（发证时私聊发给访客的消息）</label>
    <textarea id="s_pass" rows="2"></textarea>
    <div class="hint">{minutes} 会替换成通行证的有效分钟数；不写占位符就按原文发送。</div>
    <button class="save" data-k="pass_deliver_text" data-t="s_pass">保存</button>
    <label>服务恢复提示（熔断恢复时，原暂停消息翻成这句）</label>
    <textarea id="s_restored" rows="2"></textarea>
    <button class="save" data-k="pause_restored_text" data-t="s_restored">保存</button>
    <label>熔断编辑 / 反应警告（熔断期间访客编辑或贴反应被拒收时发出，恢复时自动删除；「服务熔断期间回复访客」关闭时不发）</label>
    <textarea id="s_pausewarn" rows="2"></textarea>
    <button class="save" data-k="pause_warn_text" data-t="s_pausewarn">保存</button>
    <label>拉黑提醒（发到访客的话题里）</label>
    <textarea id="s_block" rows="2"></textarea>
    <button class="save" data-k="block_notice_text" data-t="s_block">保存</button>
    <label>解封提醒（发到访客的话题里）</label>
    <textarea id="s_unblock" rows="2"></textarea>
    <button class="save" data-k="unblock_notice_text" data-t="s_unblock">保存</button>
    <label>封禁通知（发给被封禁的访客）</label>
    <textarea id="s_vblocked" rows="2"></textarea>
    <button class="save" data-k="visitor_blocked_text" data-t="s_vblocked">保存</button>
    <label>解封通知（发给被解封的访客）</label>
    <textarea id="s_vunblocked" rows="2"></textarea>
    <button class="save" data-k="visitor_unblocked_text" data-t="s_vunblocked">保存</button>
    <label>关键词命中提示（访客消息命中屏蔽关键词时发出）</label>
    <textarea id="s_kwhit" rows="2"></textarea>
    <div class="hint">{count} 会替换成当前命中次数、{threshold} 替换成自动封禁的阈值；不写占位符就按原文发送。</div>
    <button class="save" data-k="keyword_hit_text" data-t="s_kwhit">保存</button>
    <label>类型过滤拒绝提示 · 发送类（发给访客）</label>
    <textarea id="s_fsend" rows="2"></textarea>
    <div class="hint">{type} 会替换成被拦下的类型：图片、视频或文件 / 语音或音频 / 贴纸或 GIF / 文本 / 链接；不写占位符就按原文发送。</div>
    <button class="save" data-k="filter_send_text" data-t="s_fsend">保存</button>
    <label>类型过滤拒绝提示 · 转发类（发给访客）</label>
    <textarea id="s_ffwd" rows="2"></textarea>
    <div class="hint">{source} 会替换成转发来源：访客 / 群组 / 频道；不写占位符就按原文发送。</div>
    <button class="save" data-k="filter_forward_text" data-t="s_ffwd">保存</button>
    <label>特殊类型无法转达提示（发给访客）</label>
    <textarea id="s_unsup" rows="2"></textarea>
    <button class="save" data-k="unsupported_notice_text" data-t="s_unsup">保存</button>
    <label>话题名样式</label>
    <select id="s_title">
      <option value="note_first">备注｜名字 (ID)（现行）</option>
      <option value="name_first">名字｜备注 (ID)</option>
      <option value="no_id">备注｜名字（不带 ID，同名访客将无法区分）</option>
      <option value="no_note">名字 (ID)（备注不上标题）</option>
    </select>
    <div class="hint">只影响之后新建或刷新的话题名；已有话题在下次刷新资料卡或改备注时跟随新样式。</div>
    <button class="save" data-k="topic_title_style" data-t="s_title">保存</button>
    <label>主菜单按钮：网页管理台</label>
    <select id="m_panel"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_panel" data-t="m_panel">保存</button>
    <div class="hint">⚠️ 关掉管理台按钮后，主菜单里不再有任何网页入口；可用私聊命令 /panel 临时打开（或先留一个未过期的管理台页面再关）。</div>
    <label>主菜单按钮：访客列表</label>
    <select id="m_list"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_list" data-t="m_list">保存</button>
    <label>主菜单按钮：新手引导</label>
    <select id="m_guide"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_guide" data-t="m_guide">保存</button>
    <label>主菜单按钮：检查更新</label>
    <select id="m_updchk"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_updchk" data-t="m_updchk">保存</button>
    <label>主菜单按钮：服务熔断 / 恢复服务</label>
    <select id="m_pause"><option value="true">开启</option><option value="false">关闭</option></select>
    <button class="save" data-k="menu_btn_pause" data-t="m_pause">保存</button>
    <div class="hint">其余按钮关掉只是不再显示，对应功能仍可通过命令等方式使用（管理台按钮例外，见上方警示）。</div>
    <label>访客列表默认排序</label>
    <select id="s_sort">
      <option value="act_desc">最后活跃 · 倒序</option>
      <option value="act_asc">最后活跃 · 正序</option>
      <option value="fst_desc">首次来访 · 倒序</option>
      <option value="fst_asc">首次来访 · 正序</option>
    </select>
    <button class="save" data-k="userlist_sort" data-t="s_sort">保存</button>
    <label>访客列表每页条数（5～100）</label>
    <input type="number" id="s_pagesize" min="5" max="100" step="1">
    <button class="save" data-k="userlist_page_size" data-t="s_pagesize">保存</button>
    <label>时间显示时区（IANA 时区名）</label>
    <input type="text" id="s_tz">
    <div class="hint">影响资料卡的首次消息时间、主菜单更新检查时间等机器人内的时间显示；访客列表页的「最近活跃」按打开页面那台设备的浏览器时区显示，不受这里影响。</div>
    <button class="save" data-k="display_tz" data-t="s_tz">保存</button>
  </section>

  <section id="sec-security" hidden>
    <h2>🔐 安全与审计</h2>
    <label>网页链接立即吊销</label>
    <div class="hint">怀疑某一类网页链接已经泄露时，可单独让它立即失效：失效的只是那一类页面链接，不影响另外两类页面，也不影响机器人里正在进行的验证与一次性通行证链接。</div>
    <button class="save danger" id="revoke_usrlist">吊销访客列表链接</button>
    <button class="save danger" id="revoke_guide">吊销新手引导链接</button>
    <button class="save danger" id="revoke_panel">吊销管理台链接（本页也会失效）</button>
    <div class="hint">吊销只让已发出的对应网页链接失效；验证链接与一次性通行证不受影响。若怀疑签名密钥泄露，仅吊销不够：请到 Cloudflare 把 LINK_SECRET（未设置 LINK_SECRET 时为 WEBHOOK_SECRET）换成新值，并用新值重跑一次 setWebhook，之后所有旧签名（含验证与通行证链接）全部作废。</div>
    <label>管理操作审计（每页 100 条，保留 90 天）</label>
    <div class="hint">删除访客、发通行证、改信任与屏蔽、改配置、吊销链接的成功与失败都会记在这里。只记谁在何时对谁做了什么，不记备注内容与配置值。</div>
    <input type="text" id="audit_f_admin" placeholder="按管理员 ID 筛选（可空）">
    <input type="text" id="audit_f_action" placeholder="按动作筛选，如 delete / config_set（可空）">
    <input type="text" id="audit_f_target" placeholder="按目标筛选，子串匹配（可空）">
    <button class="save" id="audit_load">刷新审计记录</button>
    <div id="audit_list"><div class="empty">点上面的按钮加载</div></div>
    <button class="save" id="audit_next" style="display:none">下一页</button>
  </section>
</main>
<div id="toast"></div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var APPMODE = !!(AUTH.s && AUTH.s.indexOf('app.') === 0);
var FILTER_DEFS = [
  ['enable_image_forwarding', '图片/视频/文件'],
  ['enable_link_forwarding', '链接'],
  ['enable_text_forwarding', '文本'],
  ['enable_audio_forwarding', '音频/语音'],
  ['enable_sticker_forwarding', '贴纸/GIF'],
  ['enable_user_forwarding', '访客转发'],
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

var ERROR_TEXT = { unauthorized: APPMODE ? '会话已失效，请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '链接已过期，重新发送 /start 换新菜单', 'too large': '内容太长', 'bad json': '请求格式错误', 'bad userId': '参数错误', nonce_invalid: '操作凭据已失效，请重试' };
function translateError(d) {
  if (d && d.error && ERROR_TEXT[d.error]) d.error = ERROR_TEXT[d.error];
  return d;
}
function post(path, extra) {
  var b = { u: AUTH.u, e: AUTH.e, s: AUTH.s };
  for (var k in extra) b[k] = extra[k];
  return fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(b)
  }).then(function (r) { return r.json(); }).then(translateError);
}

// 改配置属敏感动作：先向服务端领一张绑 {键, 值} 的一次性
// 凭据（5 分钟内有效、用后即焚），再带着凭据提交保存。
function saveConfig(key, value) {
  return post('/api/nonce', { scope: 'panel', action: 'config_set', target: key, params: { value: String(value) } }).then(function (m) {
    if (!m || !m.ok || !m.nonce) return { ok: false, error: (m && m.error) || '凭据签发失败' };
    return post('/api/config/set', { key: key, value: value, nonce: m.nonce });
  }).then(function (d) {
    if (d && d.ok) panelMarkSaved(key, value);
    return d;
  });
}

// 开关切换、熔断、名单增删与保存配置共用同一套一次性凭
// 证：先领绑 {动作, 目标, 语义参数} 的凭据，再带着提交。
function mintThen(path, action, target, params, payload) {
  return post('/api/nonce', { scope: 'panel', action: action, target: target, params: params }).then(function (m) {
    if (!m || !m.ok || !m.nonce) return { ok: false, error: (m && m.error) || '凭据签发失败' };
    var b = {};
    for (var k in payload) b[k] = payload[k];
    b.nonce = m.nonce;
    return post(path, b);
  });
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
      mintThen('/api/config/list', 'config_list', 'block_keywords', { op: 'delete', item: kw }, { key: 'block_keywords', op: 'delete', index: i }).then(function (d) {
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
      mintThen('/api/config/list', 'config_list', 'keyword_responses', { op: 'delete', item: String(r.id || '') }, { key: 'keyword_responses', op: 'delete', index: i }).then(function (d) {
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
      mintThen('/api/config/toggle', 'config_toggle', def[0], { value: want }, { key: def[0], value: want }).then(function (d) {
        if (d.ok) toast(def[1] + (want ? ' 已开启' : ' 已关闭'));
        else { c.checked = !want; toast('修改失败：' + (d.error || '')); }
      }).catch(function () { c.checked = !want; toast('修改失败'); });
    };
    row.appendChild(c);
    box.appendChild(row);
  });
}

// 未保存草稿口径（第十一轮修复批 C，中 5）：外壳
// 切页签前同源询问本页的 __hasUnsavedDraft。基线
// 在配置填充完成后由 panelSnapshot 拍下（填充前
// 分区未解隐、字段不可编辑，不会漏记），逐字段
// 保存成功后由 panelMarkSaved 把该字段基线更新
// 为已保存值；查询时逐字段现值与基线比对，改回
// 原值即不算脏。开关类即时保存字段（不在 .save
// 逐字段保存之列）没有草稿概念，不在此口径内。
var panelBase = null;
function panelFieldVal(el) { return el.type === 'checkbox' ? String(el.checked) : String(el.value); }
function panelSnapshot() {
  panelBase = {};
  var btns = document.querySelectorAll('.save[data-k]');
  for (var i = 0; i < btns.length; i++) {
    var el = document.getElementById(btns[i].getAttribute('data-t'));
    if (el) panelBase[el.id] = panelFieldVal(el);
  }
}
function panelMarkSaved(key, value) {
  if (!panelBase) return;
  var btns = document.querySelectorAll('.save[data-k]');
  for (var i = 0; i < btns.length; i++) {
    if (btns[i].getAttribute('data-k') !== key) continue;
    var el = document.getElementById(btns[i].getAttribute('data-t'));
    if (el) panelBase[el.id] = String(value);
  }
}
window.__hasUnsavedDraft = function () {
  if (!panelBase) return false;
  var btns = document.querySelectorAll('.save[data-k]');
  for (var i = 0; i < btns.length; i++) {
    var el = document.getElementById(btns[i].getAttribute('data-t'));
    if (!el || !(el.id in panelBase)) continue;
    if (panelFieldVal(el) !== panelBase[el.id]) return true;
  }
  return false;
};
var saveBtns = document.querySelectorAll('.save[data-k]');
for (var i = 0; i < saveBtns.length; i++) {
  saveBtns[i].onclick = function () {
    var btn = this;
    var key = btn.getAttribute('data-k');
    var el = document.getElementById(btn.getAttribute('data-t'));
    if (key === 'menu_btn_panel' && el.value === 'false') {
      if (!confirm('关掉后主菜单里将不再有管理台入口。之后可私聊发送 /panel 临时打开管理台（链接 10 分钟内有效），确认关闭？')) return;
    }
    btn.disabled = true;
    saveConfig(key, el.type === 'checkbox' ? String(el.checked) : el.value).then(function (d) {
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
  mintThen('/api/config/list', 'config_list', 'block_keywords', { op: 'add', value: v }, { key: 'block_keywords', op: 'add', value: v }).then(function (d) {
    if (d.ok) { KW = d.keywords; el.value = ''; toast('已添加'); renderKw(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('rp_add').onclick = function () {
  var p = document.getElementById('rp_pattern');
  var r = document.getElementById('rp_response');
  mintThen('/api/config/list', 'config_list', 'keyword_responses', { op: 'add', pattern: p.value, response: r.value }, { key: 'keyword_responses', op: 'add', pattern: p.value, response: r.value }).then(function (d) {
    if (d.ok) { RP = d.autoReplies; p.value = ''; r.value = ''; toast('规则已添加'); renderRp(); }
    else toast('添加失败：' + (d.error || ''));
  });
};

document.getElementById('admins_clear').onclick = function () {
  saveConfig('authorized_admins', '').then(function (d) {
    if (d.ok) { document.getElementById('f_admins').value = ''; toast('协管员已清空'); }
    else toast('清空失败：' + (d.error || ''));
  });
};

function renderPauseStatus(st) {
  var el = document.getElementById('pause_status');
  if (!el) return;
  if (st && st.active) {
    el.textContent = '当前状态：⏸ 已暂停，' + (st.remaining_text || '') + '。';
  } else {
    el.textContent = '当前状态：▶️ 正常服务中。';
  }
}
document.getElementById('pause_start').onclick = function () {
  var m = Number(document.getElementById('f_pause_min').value);
  if (!Number.isInteger(m) || m < 1 || m > 10080) { toast('暂停时长必须是 1～10080 的整数分钟'); return; }
  mintThen('/api/config/pause', 'config_pause', 'pause', { action: 'pause', minutes: m }, { action: 'pause', minutes: m }).then(function (d) {
    if (d.ok) { renderPauseStatus(d.pause_state); toast('已暂停机器人'); }
    else toast('暂停失败：' + (d.error || ''));
  });
};
document.getElementById('pause_resume').onclick = function () {
  mintThen('/api/config/pause', 'config_pause', 'resume', { action: 'resume' }, { action: 'resume' }).then(function (d) {
    if (d.ok) { renderPauseStatus(d.pause_state); toast('已恢复服务'); }
    else toast('恢复失败：' + (d.error || ''));
  });
};

function applyPauseReply() {
  var on = document.getElementById('f_pausereplymode').value === 'true';
  document.getElementById('w_pausereply').style.display = on ? '' : 'none';
}
document.getElementById('f_pausereplymode').addEventListener('change', applyPauseReply);

var vmodeReady = true;
var vmodeAnswerIsDefault = false;
function refreshVmodeHint() {
  var el = document.getElementById('vmode_hint');
  if (!el) return;
  var mode = document.getElementById('f_verifymode').value;
  var msg = '';
  if (mode === 'turnstile' && !vmodeReady) {
    msg = '⚠️ 未生效：尚未配置 Turnstile 密钥，访客将无法完成验证（不再自动回退问答）。请补齐密钥，或改选其他验证方式。';
  } else if (mode === 'quiz' && vmodeAnswerIsDefault) {
    msg = '⚠️ 当前验证答案还是默认值：默认问题与答案都是公开的，照抄即可通过，等于没有验证。请在下方把验证答案改掉。';
  }
  el.textContent = msg;
  el.style.color = msg ? '#ff8a8a' : '';
}
function applyVmode() {
  var quiz = document.getElementById('f_verifymode').value === 'quiz';
  document.getElementById('w_verifq').style.display = quiz ? '' : 'none';
  document.getElementById('w_verifa').style.display = quiz ? '' : 'none';
  refreshVmodeHint();
}
document.getElementById('f_verifymode').addEventListener('change', applyVmode);

// 数字框滚轮调值时只调数值、不滚页面：聚焦中的数字框收到滚轮时
// 拦下默认行为（部分 WebView 会数值与页面一起滚），按步长改值并钳到 min/max。
var numInputs = document.querySelectorAll('input[type="number"]');
for (var ni = 0; ni < numInputs.length; ni++) {
  numInputs[ni].addEventListener('wheel', function (ev) {
    if (ev.ctrlKey || !ev.deltaY) return;
    if (document.activeElement !== this) return;
    ev.preventDefault();
    var step = parseFloat(this.step) || 1;
    var cur = parseFloat(this.value);
    if (isNaN(cur)) cur = parseFloat(this.min) || 0;
    var steps = ev.deltaMode === 2 ? 5 : 1;
    var next = cur + (ev.deltaY < 0 ? step * steps : -step * steps);
    var mn = parseFloat(this.min);
    var mx = parseFloat(this.max);
    if (!isNaN(mn) && next < mn) next = mn;
    if (!isNaN(mx) && next > mx) next = mx;
    if (String(next) !== this.value) {
      this.value = String(next);
      this.dispatchEvent(new Event('input', { bubbles: true }));
      this.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { passive: false });
}

fetch('/api/config?' + qs.toString())
  .then(function (r) { return r.json(); })
  .then(function (d) {
    // 填充守卫：任一字段元素缺失只跳过该项，不再中断整条填充链
    // （否则末尾的分区解隐与各渲染都执行不到、整页瘫痪）。
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
    function setText(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
    function setChk(id, on) { var el = document.getElementById(id); if (el) el.checked = !!on; }
    if (!d.ok) {
      document.getElementById('loading').className = 'loadfail';
      setText('loading', APPMODE ? '加载失败：会话已失效，请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '加载失败：无权访问或链接已过期，请回主菜单重新打开。');
      return;
    }
    document.getElementById('loading').hidden = true;
    setVal('f_welcome', d.welcome_msg || '');
    setVal('f_verifq', d.verif_q || '');
    setVal('f_verifa', d.verif_a || '');
    setVal('f_verifymode', d.verify_mode || 'turnstile');
    applyVmode();
    vmodeReady = !!d.turnstileReady;
    vmodeAnswerIsDefault = String(d.verif_a || '').trim() === '3';
    refreshVmodeHint();
    setVal('f_ttl', d.verified_ttl_days);
    setVal('f_rvttl', d.reverify_ttl_days);
    setVal('f_threshold', d.block_threshold);
    setVal('f_admins', (d.authorizedAdmins || []).join(', '));
    setVal('f_allowids', (d.memberAllowIds || []).join(', '));
    setVal('f_pausereply', d.pause_reply_text || '请稍后再试');
    setVal('f_pausereplymode', d.pause_reply_enabled ? 'true' : 'false');
    applyPauseReply();
    renderPauseStatus(d.pause_state);
    setVal('t_burst', d.relay_burst);
    setVal('t_refill', d.relay_refill_per_sec);
    setVal('t_passmin', d.pass_ttl_min);
    setVal('t_vlinkmin', d.verify_link_min);
    setVal('t_quizmax', d.quiz_max_attempts);
    setVal('t_quizlock', d.quiz_lock_min);
    setVal('t_stay', d.notice_stay_sec);
    setVal('t_reaction', d.reaction_sync_enabled ? 'true' : 'false');
    setVal('t_relayfail', d.relay_fail_notice_enabled ? 'true' : 'false');
    setVal('t_blocknotice', d.block_notice_enabled ? 'true' : 'false');
    setVal('s_vwrong', d.quiz_wrong_text || '');
    setVal('s_restored', d.pause_restored_text || '');
    setVal('s_pausewarn', d.pause_warn_text || '');
    setVal('s_block', d.block_notice_text || '');
    setVal('s_unblock', d.unblock_notice_text || '');
    setVal('s_qlock', d.quiz_lock_text || '');
    setVal('s_vcard', d.verify_card_text || '');
    setVal('s_pass', d.pass_deliver_text || '');
    setVal('s_vblocked', d.visitor_blocked_text || '');
    setVal('s_vunblocked', d.visitor_unblocked_text || '');
    setVal('s_kwhit', d.keyword_hit_text || '');
    setVal('s_fsend', d.filter_send_text || '');
    setVal('s_ffwd', d.filter_forward_text || '');
    setVal('s_unsup', d.unsupported_notice_text || '');
    setVal('s_title', d.topic_title_style || 'note_first');
    setVal('m_panel', d.menu_buttons && d.menu_buttons.panel ? 'true' : 'false');
    setVal('m_list', d.menu_buttons && d.menu_buttons.list ? 'true' : 'false');
    setVal('m_guide', d.menu_buttons && d.menu_buttons.guide ? 'true' : 'false');
    setVal('m_updchk', d.menu_buttons && d.menu_buttons.updchk ? 'true' : 'false');
    setVal('m_pause', d.menu_buttons && d.menu_buttons.pause ? 'true' : 'false');
    setVal('s_sort', d.userlist_sort || 'act_desc');
    setVal('s_pagesize', d.userlist_page_size);
    setVal('s_tz', d.display_tz || 'Asia/Singapore');
    KW = d.keywords || [];
    RP = d.autoReplies || [];
    renderFilters(d.filters || {});
    renderKw();
    renderRp();
    var secs = document.querySelectorAll('section');
    for (var j = 0; j < secs.length; j++) secs[j].hidden = false;
    pSpy();
    panelSnapshot();
  })
  .catch(function () {
    document.getElementById('loading').className = 'loadfail';
    document.getElementById('loading').textContent = APPMODE ? '加载失败，请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '加载失败，请回主菜单重新打开。';
  });
var pPad = 0;
function pFixPad() {
  var hd = document.getElementById('phead');
  if (!hd) return;
  var h = hd.offsetHeight;
  if (h && h !== pPad) {
    pPad = h;
    document.body.style.paddingTop = h + 'px';
    document.documentElement.style.scrollPaddingTop = (h + 10) + 'px';
  }
}
var pPadTimer = 0;
window.addEventListener('resize', function () {
  clearTimeout(pPadTimer);
  pPadTimer = setTimeout(pFixPad, 120);
});
pFixPad();
var pAnim = 0;
function pStopAnim() {
  if (pAnim) { cancelAnimationFrame(pAnim); pAnim = 0; }
}
window.addEventListener('wheel', pStopAnim, { passive: true });
window.addEventListener('touchstart', pStopAnim, { passive: true });
function pScrollToY(endY) {
  var startY = window.pageYOffset || 0;
  var startX = window.pageXOffset || 0;
  var dy = endY - startY;
  if (!dy && !startX) return;
  pStopAnim();
  var dist = Math.max(Math.abs(dy), Math.abs(startX));
  var dur = Math.min(600, Math.max(220, Math.round(dist * 0.35)));
  var t0 = 0;
  function pStep(ts) {
    if (!t0) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    window.scrollTo(Math.round(startX * (1 - e)), Math.round(startY + dy * e));
    pAnim = p < 1 ? requestAnimationFrame(pStep) : 0;
    if (p >= 1) pkbResume();
  }
  pAnim = requestAnimationFrame(pStep);
}
// 键盘避让（-v163b6）：本页是窗口滚动（与列表页
// 的内滚 #uscroll 不同），文本控件聚焦后此前没有
// 任何滚动照顾：键盘升起、布局视口收缩时，控件连
// 同它的保存按钮被压在键盘后面，原生聚焦滚动即
// 便发生也是瞬移硬切。本路径在本页内自带一份与
// 列表页备注避让同口径的实现：120ms 轮询逐拍实
// 测几何、每拍只做最小揭示（控件下沿连同其后最
// 近的保存按钮须落在可见带内、下沿留 12px，上
// 沿不被固定页眉压住）、2px 材料门；滚动写入走
// 280ms easeOutCubic 补间（PKB_DUR，与列表页
// NEKB 同值同缓动），与 chip 导航的 pAnim 补间
// 互斥（起步先停对方，chip 点击先停本看守）。程
// 序滚动只经 window.scrollTo 写入，不会触发
// wheel/touchstart 这两个真实输入事件，不存在
// 把自己的滚动误判成手动滚动的面；wheel/
// touchstart 一到先停补间让路（看守仍按拍校
// 正，与列表页一致）。失焦停表，键盘收起不回
// 滚。事件用 focusin/focusout 委托，静态与后加
// 的文本控件一并覆盖。
// 用户接管（-v163b7）：持续校正没有出口时，聚
// 焦中拖动页面会被看守逐拍拉回、键盘也不收
// （iOS 拖动不失焦）。本轮加接管判定：真实手
// 势开窗内（touchstart/wheel 开窗、touchend 留
// 动量尾巴、手动滚动事件续窗），非程序写入的
// 滚动位移逐事件累计，单次手势累计超过
// PKB_TAKEOVER_PX 即判定用户接管——主动失
// 焦（键盘随之收起）、停看守停补间，本次会
// 话不再校正。阈值 -v163b7 初版为 32px，
// -v163b8 按主人拍板降到与本页材料门同量级
// 的 2px：只要真实手动拖动产生实际位移就让
// 位，不再等累计一截；2px 以内只剩点按抖动
// 与亚像素噪声，不触发、纯点按不失焦。程序
// 写入逐次记位
// （pkbProgY/pkbProgAt），记位吻合的滚动不累
// 计，补间自身位移绝不误判；手势窗开启期间
// tick 不发起校正，不与手指抢位。失焦无数据
// 副作用：本页字段只经保存按钮落库，focusout
// 委托只停看守，文本框没有落库用的 blur/change
// 监听（change 落库的只有开关 checkbox，不在此
// 路径），接管失焦不存不弃、内容留待点回继续。
// 批 C 修正（中 3）：接管失焦只认触摸来源的手势
// 窗（pkbTouchUntil：touchstart 开窗、touchend
// 动量尾、窗内滚动续窗，时长与手势窗同口径）；
// wheel 开的窗只保留停补间让路与窗内不校正，不
// 再累计触发接管——桌面端滚轮/触控板滚动不再被
// 误判成「拖动让位」而失焦。触摸路径的阈值、累
// 计与锁定语义一字未动。
var PKB_DUR = 280;
var pkbTimer = 0, pkbEl = null;
var pkbAnim = 0, pkbFrom = 0, pkbTo = 0, pkbT0 = 0;
var PKB_TAKEOVER_PX = 2;
var pkbUsrAcc = 0, pkbLastY = 0, pkbHoldUntil = 0, pkbProgY = -1, pkbProgAt = 0;
var pkbTouchUntil = 0;
function pkbAnimStop() {
  if (pkbAnim) { cancelAnimationFrame(pkbAnim); pkbAnim = 0; }
}
window.addEventListener('wheel', pkbAnimStop, { passive: true });
window.addEventListener('touchstart', pkbAnimStop, { passive: true });
function pkbGesture(ev) {
  var now = Date.now();
  if (now > pkbHoldUntil) pkbUsrAcc = 0;
  pkbHoldUntil = now + (ev && ev.type === 'wheel' ? 600 : 5000);
  if (ev && ev.type === 'touchstart') pkbTouchUntil = now + 5000;
  pkbLastY = window.pageYOffset || 0;
}
function pkbGestureEnd() { pkbHoldUntil = Date.now() + 900; pkbTouchUntil = Date.now() + 900; }
window.addEventListener('touchstart', pkbGesture, { passive: true });
window.addEventListener('touchend', pkbGestureEnd, { passive: true });
window.addEventListener('touchcancel', pkbGestureEnd, { passive: true });
window.addEventListener('wheel', pkbGesture, { passive: true });
window.addEventListener('scroll', function () {
  var y = window.pageYOffset || 0;
  var dy = y - pkbLastY;
  pkbLastY = y;
  if (!pkbEl) { pkbUsrAcc = 0; return; }
  var now = Date.now();
  if (now - pkbProgAt < 600 && Math.abs(y - pkbProgY) <= 1) return;
  if (now > pkbHoldUntil) return;
  if (now <= pkbTouchUntil) {
    pkbUsrAcc += Math.abs(dy);
    if (pkbTouchUntil < now + 600) pkbTouchUntil = now + 600;
  }
  if (pkbHoldUntil < now + 600) pkbHoldUntil = now + 600;
  if (pkbUsrAcc > PKB_TAKEOVER_PX) pkbTakeover();
}, { passive: true });
function pkbTakeover() {
  var el = pkbEl;
  pkbStop();
  if (el && el.blur) el.blur();
}
function pkbStop() {
  if (pkbTimer) { clearInterval(pkbTimer); pkbTimer = 0; }
  pkbAnimStop();
  pkbEl = null;
}
function pkbIsText(el) {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number');
}
function pkbWatch(el) {
  pkbStop();
  pkbEl = el;
  pkbUsrAcc = 0; pkbHoldUntil = 0; pkbTouchUntil = 0;
  pkbLastY = window.pageYOffset || 0;
  pkbProgY = pkbLastY; pkbProgAt = Date.now();
  pkbTimer = setInterval(pkbTick, 120);
  pkbTick();
}
function pkbScrollTo(target) {
  var cur = window.pageYOffset || 0;
  if (pkbAnim && pkbTo === target) return;
  if (Math.abs(target - cur) <= 2) {
    pkbAnimStop();
    if (target !== cur) { window.scrollTo(window.pageXOffset || 0, target); pkbProgY = target; pkbProgAt = Date.now(); }
    return;
  }
  pStopAnim();
  pkbFrom = cur; pkbTo = target; pkbT0 = 0;
  if (!pkbAnim) pkbAnim = requestAnimationFrame(pkbStep);
}
function pkbStep(ts) {
  pkbAnim = 0;
  if (!pkbEl) return;
  if (!pkbT0) pkbT0 = ts;
  var p = Math.min(1, (ts - pkbT0) / PKB_DUR);
  var e = 1 - Math.pow(1 - p, 3);
  window.scrollTo(window.pageXOffset || 0, p >= 1 ? pkbTo : Math.round(pkbFrom + (pkbTo - pkbFrom) * e));
  pkbProgY = window.pageYOffset || 0; pkbProgAt = Date.now();
  if (p < 1) pkbAnim = requestAnimationFrame(pkbStep);
}
function pkbTick() {
  var el = pkbEl;
  if (!el || document.activeElement !== el) { pkbStop(); return; }
  if (Date.now() < pkbHoldUntil) return;
  var visH = window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight;
  var er = el.getBoundingClientRect();
  var bot = er.bottom;
  var sib = el.nextElementSibling;
  for (var i = 0; sib && i < 4; i++) {
    if (sib.classList && sib.classList.contains('save')) { bot = Math.max(bot, sib.getBoundingClientRect().bottom); break; }
    sib = sib.nextElementSibling;
  }
  var dy = 0;
  if (bot > visH - 12) dy = Math.ceil(bot - (visH - 12));
  else if (er.top < (pPad || 0) + 8) dy = Math.floor(er.top - ((pPad || 0) + 8));
  if (Math.abs(dy) <= 2) return;
  pkbScrollTo(Math.max(0, (window.pageYOffset || 0) + dy));
}
document.addEventListener('focusin', function (ev) { if (pkbIsText(ev.target)) pkbWatch(ev.target); });
document.addEventListener('focusout', function (ev) { if (pkbIsText(ev.target)) pkbStop(); });
// chip 导航后看守恢复（第十一轮修复批 C，低
// 11）：chip 点击先停看守再 pScrollToY 定位，字
// 段并未失焦、focusin 不会再来，看守原先无重启
// 路径、整场停摆。导航补间落点（pStep 完成时）
// 与被让路取消（chip 处理里 700ms 兜底计时，覆
// 盖 600ms 的最长补间时长）后各查一次：焦点仍
// 在适格文本控件上且看守未在跑，就重新 watch。
function pkbResume() {
  if (pkbEl) return;
  var ae = document.activeElement;
  if (pkbIsText(ae)) pkbWatch(ae);
}
var pChips = document.querySelectorAll('.chip');
for (var pi = 0; pi < pChips.length; pi++) {
  pChips[pi].addEventListener('click', function (ev) {
    var id = this.getAttribute('href');
    if (!id || id.charAt(0) !== '#') return;
    var target = document.querySelector(id);
    if (!target) return;
    ev.preventDefault();
    pkbStop();
    var pad = parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0;
    pScrollToY((window.pageYOffset || 0) + target.getBoundingClientRect().top - pad);
    setTimeout(pkbResume, 700);
    try { history.replaceState(null, '', id); } catch (e) {}
  });
}
var pSecs = document.querySelectorAll('section[id]');
function pSpy() {
  var line = (window.pageYOffset || 0) + (parseInt(window.getComputedStyle(document.documentElement).scrollPaddingTop, 10) || 0) + 4;
  var atBottom = (window.pageYOffset || 0) + window.innerHeight >= document.documentElement.scrollHeight - 2;
  var cur = null;
  for (var i = 0; i < pSecs.length; i++) {
    if (pSecs[i].offsetParent === null) continue;
    if (pSecs[i].offsetTop <= line) cur = pSecs[i];
    else break;
  }
  if (atBottom && pSecs.length) cur = pSecs[pSecs.length - 1];
  for (var j = 0; j < pChips.length; j++) {
    pChips[j].classList.toggle('on', !!cur && pChips[j].getAttribute('href') === '#' + cur.id);
  }
}
var pSpyTick = false;
window.addEventListener('scroll', function () {
  if (pSpyTick) return;
  pSpyTick = true;
  requestAnimationFrame(function () { pSpyTick = false; pSpy(); });
}, { passive: true });

function revokeLinks(scope, label) {
  var extra = scope === 'panel' ? '\\n' + (APPMODE ? '注意：本管理台页面与小程序会话也会立即失效，需关闭小程序后重新打开。' : '注意：本管理台页面也会立即失效，需回机器人主菜单重新打开。') + '' : '';
  if (!confirm('确认让所有「' + label + '」网页链接立即失效？' + extra)) return;
  post('/api/config/revoke-links', { scope: scope }).then(function (d) {
    if (d.ok) toast('已吊销：' + label + '的旧链接全部失效');
    else toast('吊销失败：' + (d.error || ''));
  }).catch(function () { toast('吊销失败'); });
}
document.getElementById('revoke_panel').onclick = function () { revokeLinks('panel', '网页管理台'); };
document.getElementById('revoke_usrlist').onclick = function () { revokeLinks('usrlist', '访客列表'); };
document.getElementById('revoke_guide').onclick = function () { revokeLinks('guide', '新手引导'); };

var AUDIT_ACTION = { config_set: '改配置', delete: '删除访客', pass: '发通行证', trust: '信任变更', block: '屏蔽变更', revoke_links: '吊销链接' };
var auditCursor = null;
function auditUrl(cursor) {
  var q = new URLSearchParams(qs.toString());
  var fa = document.getElementById('audit_f_admin').value.trim();
  var fc = document.getElementById('audit_f_action').value.trim();
  var ft = document.getElementById('audit_f_target').value.trim();
  if (fa) q.set('admin', fa);
  if (fc) q.set('action', fc);
  if (ft) q.set('target', ft);
  if (cursor) q.set('cursor', cursor);
  return '/api/audit?' + q.toString();
}
function renderAuditRows(box, rows) {
  rows.forEach(function (row) {
    var item = document.createElement('div');
    item.className = 'item';
    var tx = document.createElement('div');
    tx.className = 'tx';
    tx.textContent = (AUDIT_ACTION[row.action] || row.action) + ' · 目标 ' + (row.target || '-') + ' · ' + row.result + (row.detail ? '（' + row.detail + '）' : '');
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = (row.ts ? new Date(row.ts).toLocaleString('zh-CN', { hour12: false }) : '-') + ' · 管理员 ' + (row.admin_id || '-') + (row.ip ? ' · IP ' + row.ip : '') + (row.epoch ? ' · epoch ' + row.epoch : '');
    tx.appendChild(sub);
    item.appendChild(tx);
    box.appendChild(item);
  });
}
function showAuditPage(box, d, emptyText) {
  box.textContent = '';
  if (!d.rows.length) {
    var e = document.createElement('div');
    e.className = 'empty';
    e.textContent = emptyText;
    box.appendChild(e);
  } else {
    renderAuditRows(box, d.rows);
  }
  auditCursor = d.nextCursor || null;
  document.getElementById('audit_next').style.display = auditCursor ? '' : 'none';
}
function loadAudit() {
  var box = document.getElementById('audit_list');
  box.textContent = '加载中…';
  fetch(auditUrl(null)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) { box.textContent = '加载失败：' + (d.error || ''); return; }
    showAuditPage(box, d, '暂无记录');
  }).catch(function () { box.textContent = '加载失败'; });
}
document.getElementById('audit_load').onclick = loadAudit;
document.getElementById('audit_next').onclick = function () {
  if (!auditCursor) return;
  var box = document.getElementById('audit_list');
  fetch(auditUrl(auditCursor)).then(function (r) { return r.json(); }).then(function (d) {
    if (!d.ok) return;
    showAuditPage(box, d, '没有更多记录');
  }).catch(function () {});
};
</script>
${pageCtx.appMode ? '' : expiryBannerScript(pageCtx.botUsername)}
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
    if (
      raw !== 'turnstile' &&
      raw !== 'quiz' &&
      raw !== 'sequence'
    ) {
      return { error: '验证方式无效' };
    }

    return { value: raw };
  }

  if (key === 'reverify_ttl_days') {
    const days = Number(raw.trim());

    if (
      !Number.isInteger(days) ||
      days < 0 ||
      days > 3650
    ) {
      return {
        error:
          '改回待验证天数必须是 0 到 3650 之间的整数（0 表示关闭）'
      };
    }

    return { value: String(days) };
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

  const INT_RANGES = {
    relay_burst: [1, 100, '限流突发条数'],
    relay_refill_per_sec: [1, 20, '限流每秒回填'],
    pass_ttl_min: [1, 1440, '通行证有效分钟'],
    verify_link_min: [1, 120, '验证链接有效分钟'],
    quiz_max_attempts: [1, 20, '问答锁定答错次数'],
    quiz_lock_min: [1, 1440, '问答锁定分钟'],
    notice_stay_sec: [1, 120, '回执停留秒数'],
    userlist_page_size: [5, 100, '访客列表每页条数']
  };

  if (INT_RANGES[key]) {
    const [min, max, label] =
      INT_RANGES[key];

    const num = Number(raw.trim());

    if (
      !Number.isInteger(num) ||
      num < min ||
      num > max
    ) {
      return {
        error:
          `${label}必须是 ${min} 到 ${max} 之间的整数`
      };
    }

    return { value: String(num) };
  }

  const BOOL_KEYS = new Set([
    'reaction_sync_enabled',
    'relay_fail_notice_enabled',
    'block_notice_enabled',
    'menu_btn_panel',
    'menu_btn_list',
    'menu_btn_guide',
    'menu_btn_updchk',
    'menu_btn_pause'
  ]);

  if (BOOL_KEYS.has(key)) {
    if (raw !== 'true' && raw !== 'false') {
      return { error: '开关值无效' };
    }

    return { value: raw };
  }

  const TEXT_LIMITS = {
    quiz_wrong_text: 300,
    pause_restored_text: 300,
    pause_warn_text: 300,
    block_notice_text: 300,
    unblock_notice_text: 300,
    visitor_blocked_text: 300,
    visitor_unblocked_text: 300,
    keyword_hit_text: 300,
    quiz_lock_text: 300,
    unsupported_notice_text: 300,
    filter_send_text: 300,
    filter_forward_text: 300,
    verify_card_text: 500,
    pass_deliver_text: 500
  };

  if (TEXT_LIMITS[key]) {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > TEXT_LIMITS[key]) {
      return {
        error:
          `文案最多允许 ${TEXT_LIMITS[key]} 个字符`
      };
    }

    return { value: raw };
  }

  if (key === 'topic_title_style') {
    if (
      ![
        'note_first',
        'name_first',
        'no_id',
        'no_note'
      ].includes(raw)
    ) {
      return { error: '话题名样式无效' };
    }

    return { value: raw };
  }

  if (key === 'userlist_sort') {
    if (
      !['act_desc', 'act_asc', 'fst_desc', 'fst_asc'].includes(
        raw
      )
    ) {
      return { error: '列表排序方式无效' };
    }

    return { value: raw };
  }

  if (key === 'display_tz') {
    const value = raw.trim();

    if (!value) {
      return { error: '时区不能为空' };
    }

    if (value.length > 64) {
      return { error: '时区名过长' };
    }

    // 用 Intl 试建把关：非法 IANA 名直接拒绝保存，不让
    // 坏值落库后再靠读侧回退兜底（读侧回退只管带外写入）。
    try {
      new Intl.DateTimeFormat('zh-CN', {
        timeZone: value
      });
    } catch (_) {
      return {
        error:
          '时区无效：请填写 IANA 时区名（如 Asia/Singapore）'
      };
    }

    return { value };
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

  if (key === 'member_allow_ids') {
    if (raw.length > LIMITS.member_allow_ids) {
      return { error: '豁免名单内容过长' };
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

  if (key === 'pause_reply_enabled') {
    if (raw !== 'true' && raw !== 'false') {
      return { error: '开关值无效' };
    }

    return { value: raw };
  }

  if (key === 'pause_reply_text') {
    if (!raw.trim()) {
      return { error: '内容不能为空' };
    }

    if (raw.length > LIMITS.pause_reply_text) {
      return {
        error:
          `回复语句最多允许 ${LIMITS.pause_reply_text} 个字符`
      };
    }

    return { value: raw };
  }

  return { error: '不允许修改的配置项' };
}

async function readPanelPostBody(
  request,
  env,
  scope = 'usrlist'
) {
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
    env,
    scope
  );

  if (!adminId) {
    return {
      response: Response.json(
        { ok: false, error: 'unauthorized' },
        { status: 403 }
      )
    };
  }

  return { body, adminId };
}

async function handleConfigApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env, 'panel');

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  // 一次全表读后本地取值：本函数的几十个字段不再逐键查库。
  const cfgAll = await getAllConfigMap(env);

  const cfg = (key, def) => {
    const value = cfgAll[key];

    if (value !== undefined && value !== null) {
      return value;
    }

    return def !== undefined ? def : (DEFAULTS[key] ?? '');
  };

  // 文案类展示：图内值为空串时与运行时 textConfig 同
  // 口径回退默认值——带外写入的空串运行时并不生效，
  // 面板若照原样显示成空白会与实际发出的文案对不上。
  const cfgText = (key) => {
    const value = cfgAll[key];

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return DEFAULTS[key] ?? '';
    }

    return value;
  };

  // 欢迎消息（验证成功问候）的展示与发送侧 welcomeMsgText
  // 同一口径：存量为旧领衔句（长/短）或空白时回显当前默
  // 认值——那两句已废弃，不该再躺在管理台字段里冒充现
  // 行问候；真自定义原样回显。仅此一键在展示侧走解析，
  // 其余键的回显语义不变；保存路径不经此处。
  const cfgWelcome = () => {
    const value = cfgAll.welcome_msg;

    if (
      value === undefined ||
      value === null ||
      !String(value).trim() ||
      LEGACY_WELCOME_MSGS.has(String(value).trim())
    ) {
      return DEFAULTS.welcome_msg;
    }

    return value;
  };

  // 展示值与运行时同一口径（trunc + 范围钳制；两个 TTL
  // 还要求整数，非整数运行时按关闭处理，展示同步为 0），
  // 免得带外坏值在面板上显示成运行时根本不会用的数。
  const clampShow = (key, def, min, max) => {
    const n = Number(cfg(key, String(def)));

    if (!Number.isFinite(n)) {
      return def;
    }

    return Math.min(
      max,
      Math.max(min, Math.trunc(n))
    );
  };

  const ttlShow = (key) => {
    const n = Number(cfg(key, '0'));

    if (!Number.isInteger(n)) {
      return 0;
    }

    return Math.min(3650, Math.max(0, n));
  };

  // 以下五项的键都无冒号、已在全表图内：直接本地解析，
  // 不再逐个查库（解析与各 getter 共用同一份逻辑）。
  const filterStored = {};

  for (const key of [
    'enable_image_forwarding',
    'enable_link_forwarding',
    'enable_text_forwarding',
    'enable_audio_forwarding',
    'enable_sticker_forwarding',
    'enable_user_forwarding',
    'enable_group_forwarding',
    'enable_channel_forwarding'
  ]) {
    if (cfgAll[key] !== undefined) {
      filterStored[key] = cfgAll[key];
    }
  }

  const filters = buildFilterConfig(filterStored);
  const rules = parseAutoReplyRules(
    cfg('keyword_responses', '[]')
  );

  return Response.json({
    ok: true,
    welcome_msg: cfgWelcome(),
    verif_q: cfg('verif_q'),
    verif_a: cfg('verif_a'),
    verify_mode: cfg('verify_mode', 'turnstile'),
    turnstileReady: isTurnstileConfigured(env),
    pause_reply_enabled:
      (cfg('pause_reply_enabled', 'true')) === 'true',
    pause_reply_text: cfgText('pause_reply_text'),
    pause_state:
      await describePauseStateForPanel(env),
    verified_ttl_days: ttlShow('verified_ttl_days'),
    reverify_ttl_days: ttlShow('reverify_ttl_days'),
    block_threshold:
      parseBlockThreshold(cfg('block_threshold', '5')),
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
    keywords:
      parseBlockKeywords(cfg('block_keywords', '[]')),
    autoReplies: rules.map((rule) => ({
      id: String(rule.id || ''),
      keywords: String(rule.keywords || ''),
      response: String(rule.response || '')
    })),
    authorizedAdmins: parseAuthorizedAdmins(
      cfg('authorized_admins', '[]')
    ),
    memberAllowIds: parseAuthorizedAdmins(
      cfg('member_allow_ids', '[]')
    ),
    relay_burst: clampShow('relay_burst', 30, 1, 100),
    relay_refill_per_sec:
      clampShow('relay_refill_per_sec', 5, 1, 20),
    pass_ttl_min: clampShow('pass_ttl_min', 30, 1, 1440),
    verify_link_min:
      clampShow('verify_link_min', 10, 1, 120),
    quiz_max_attempts:
      clampShow('quiz_max_attempts', 5, 1, 20),
    quiz_lock_min: clampShow('quiz_lock_min', 30, 1, 1440),
    notice_stay_sec: clampShow('notice_stay_sec', 5, 1, 120),
    reaction_sync_enabled:
      (cfg('reaction_sync_enabled', 'true')) === 'true',
    relay_fail_notice_enabled:
      (cfg('relay_fail_notice_enabled', 'true')) === 'true',
    block_notice_enabled:
      (cfg('block_notice_enabled', 'true')) === 'true',
    quiz_wrong_text:
      cfgText('quiz_wrong_text'),
    pause_restored_text:
      cfgText('pause_restored_text'),
    pause_warn_text:
      cfgText('pause_warn_text'),
    block_notice_text:
      cfgText('block_notice_text'),
    unblock_notice_text:
      cfgText('unblock_notice_text'),
    visitor_blocked_text:
      cfgText('visitor_blocked_text'),
    visitor_unblocked_text:
      cfgText('visitor_unblocked_text'),
    keyword_hit_text:
      cfgText('keyword_hit_text'),
    verify_card_text:
      cfgText('verify_card_text'),
    pass_deliver_text:
      cfgText('pass_deliver_text'),
    quiz_lock_text:
      cfgText('quiz_lock_text'),
    filter_send_text:
      cfgText('filter_send_text'),
    filter_forward_text:
      cfgText('filter_forward_text'),
    unsupported_notice_text:
      cfgText('unsupported_notice_text'),
    topic_title_style:
      cfg('topic_title_style', 'note_first'),
    menu_buttons: {
      panel:
        (cfg('menu_btn_panel', 'true')) === 'true',
      list:
        (cfg('menu_btn_list', 'true')) === 'true',
      guide:
        (cfg('menu_btn_guide', 'true')) === 'true',
      updchk:
        (cfg('menu_btn_updchk', 'true')) === 'true',
      pause:
        (cfg('menu_btn_pause', 'true')) === 'true'
    },
    userlist_sort:
      normalizeUserlistSort(
        cfg('userlist_sort', 'act_desc')
      ) || 'act_desc',
    userlist_page_size:
      clampShow('userlist_page_size', 20, 5, 100),
    display_tz:
      cfg('display_tz', 'Asia/Singapore')
  });
}

async function handleConfigSet(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'panel');

  const { body, adminId } = parsed;
  const key = String(body?.key || '');
  const rawValue = Array.isArray(body?.value)
    ? body.value.map(String).join(',')
    : body?.value;

  const result = validateScalarConfig(key, rawValue);

  if (result.error) {
    // 校验失败也留痕（只记键名，不记提交值）。
    await writeAdminAudit(
      env,
      adminId,
      'config_set',
      key,
      'failed',
      'invalid', aOpts
    );

    return Response.json(
      { ok: false, error: result.error },
      { status: 400 }
    );
  }

  // 改配置是敏感动作：必须带管理台签发的一次性 nonce，
  // 且绑定的就是这一对 {键, 提交值}，换值重放一律拒绝。
  const nonceVerdict = await consumeActionNonce(env, {
    nonce: body?.nonce,
    adminId,
    scope: 'panel',
    action: 'config_set',
    target: key,
    params: { value: String(rawValue ?? '') }
  });

  if (nonceVerdict !== 'ok') {
    await writeAdminAudit(
      env,
      adminId,
      'config_set',
      key,
      'rejected',
      `nonce_${nonceVerdict}`, aOpts
    );

    return Response.json(
      { ok: false, error: 'nonce_invalid' },
      { status: 403 }
    );
  }

  // 最敏感的配置：先落 intent 审计，写不进去就拒绝
  // 执行。协管员名单决定谁能代管；看门狗豁免名单能让
  // 名单内账号进群时不触发告警——两者都不能无痕变更
  // （第十轮审计：豁免名单此前只走普通 fail-open 审
  // 计，与协管员名单的审计强度倒挂）。
  if (
    key === 'authorized_admins' ||
    key === 'member_allow_ids'
  ) {
    try {
      await writeAdminAuditStrict(
        env,
        parsed.adminId,
        'config_set',
        key,
        'intent',
        '',
        aOpts
      );
    } catch (_) {
      return Response.json(
        { ok: false, error: 'audit_unavailable' },
        { status: 503 }
      );
    }
  }

  await setConfig(key, result.value, env);

  await writeAdminAudit(
    env,
    adminId,
    'config_set',
    key,
    'ok', '', aOpts
  );

  return Response.json({ ok: true });
}

// 转发过滤的八个开关键：开关接口与 nonce 签发的目标校验
// 共用同一份名单。
const FILTER_TOGGLE_KEYS = new Set([
  'enable_image_forwarding',
  'enable_link_forwarding',
  'enable_text_forwarding',
  'enable_audio_forwarding',
  'enable_sticker_forwarding',
  'enable_user_forwarding',
  'enable_group_forwarding',
  'enable_channel_forwarding'
]);

async function handleConfigToggle(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'panel');

  const { body, adminId } = parsed;

  const key = String(body?.key || '');

  if (!FILTER_TOGGLE_KEYS.has(key)) {
    await writeAdminAudit(
      env,
      adminId,
      'config_toggle',
      key,
      'failed',
      'invalid', aOpts
    );

    return Response.json(
      { ok: false, error: '不允许的开关项' },
      { status: 400 }
    );
  }

  if (typeof body?.value !== 'boolean') {
    await writeAdminAudit(
      env,
      adminId,
      'config_toggle',
      key,
      'failed',
      'invalid', aOpts
    );

    return Response.json(
      { ok: false, error: '开关值无效' },
      { status: 400 }
    );
  }

  // 开关切换也是改状态的敏感动作：与改配置同一套一次性
  // nonce，绑 {键, 目标值}，复用 / 换值重放一律拒绝。
  const nonceVerdict = await consumeActionNonce(env, {
    nonce: body?.nonce,
    adminId,
    scope: 'panel',
    action: 'config_toggle',
    target: key,
    params: { value: body.value === true }
  });

  if (nonceVerdict !== 'ok') {
    await writeAdminAudit(
      env,
      adminId,
      'config_toggle',
      key,
      'rejected',
      `nonce_${nonceVerdict}`, aOpts
    );

    return Response.json(
      { ok: false, error: 'nonce_invalid' },
      { status: 403 }
    );
  }

  await setConfig(
    key,
    body.value ? 'true' : 'false',
    env
  );

  await writeAdminAudit(
    env,
    adminId,
    'config_toggle',
    key,
    'ok', '', aOpts
  );

  return Response.json({ ok: true });
}

async function handleConfigPause(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'panel');

  const { body, adminId } = parsed;
  const action = String(body?.action || '');

  // 熔断开关是改状态的敏感动作：与改配置同一套一次性
  // nonce，绑 {操作, 开启时含分钟数}；校验失败照留痕。
  const consumePauseNonce = async (params) => {
    const verdict = await consumeActionNonce(env, {
      nonce: body?.nonce,
      adminId,
      scope: 'panel',
      action: 'config_pause',
      target: action,
      params
    });

    if (verdict !== 'ok') {
      await writeAdminAudit(
        env,
        adminId,
        'config_pause',
        action,
        'rejected',
        `nonce_${verdict}`, aOpts
      );
    }

    return verdict === 'ok';
  };

  const nonceInvalidResponse = () =>
    Response.json(
      { ok: false, error: 'nonce_invalid' },
      { status: 403 }
    );

  if (action === 'pause') {
    const minutes = Number(body?.minutes);

    if (
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > PAUSE_MAX_MINUTES
    ) {
      await writeAdminAudit(
        env,
        adminId,
        'config_pause',
        action,
        'failed',
        'invalid', aOpts
      );

      return Response.json(
        {
          ok: false,
          error: '暂停时长必须是 1～10080 的整数分钟'
        },
        { status: 400 }
      );
    }

    if (
      !(await consumePauseNonce({
        action: 'pause',
        minutes
      }))
    ) {
      return nonceInvalidResponse();
    }

    const state = await performPause(env, minutes, adminId);

    await writeAdminAudit(
      env,
      adminId,
      'config_pause',
      action,
      'ok', '', aOpts
    );

    return Response.json({
      ok: true,
      pause_state: {
        active: true,
        until: state.until,
        remaining_text: describePauseRemaining(state)
      }
    });
  }

  if (action === 'resume') {
    if (
      !(await consumePauseNonce({ action: 'resume' }))
    ) {
      return nonceInvalidResponse();
    }

    // 与命令路径对齐：没有进行中的熔断时短路，不执行
    // 恢复全流程，更不群发并未发生的「已恢复」通知。
    const state = await getPauseState(env);

    if (!state) {
      await writeAdminAudit(
        env,
        adminId,
        'config_pause',
        action,
        'ok', '', aOpts
      );

      return Response.json({
        ok: true,
        pause_state: { active: false },
        note: '当前没有处于暂停状态。'
      });
    }

    await performResume(env, adminId);

    await writeAdminAudit(
      env,
      adminId,
      'config_pause',
      action,
      'ok', '', aOpts
    );

    return Response.json({
      ok: true,
      pause_state: { active: false }
    });
  }

  await writeAdminAudit(
    env,
    adminId,
    'config_pause',
    action,
    'failed',
    'invalid', aOpts
  );

  return Response.json(
    { ok: false, error: '未知操作' },
    { status: 400 }
  );
}

// 名单类配置（屏蔽关键词 / 自动回复规则）的 CAS 合并写
// （第十轮审计 #13）：旧实现是读全表→改→整表无条件写，
// 并发两路时后写者以旧快照覆盖先写者，一条屏蔽关键词
// 或规则无声丢失、双方却都报成功。改走与问答计数同口
// 径的 CAS 循环：基于读到的原始串条件写，冲突就重读、
// 按条目身份在最新名单上重放本次增删（不覆盖对方的新
// 增）；多次冲突耗尽返回 conflict，调用方明确报错，
// 绝不静默成功。
// mutate(list, retried) 三种返回：
//   { list }             —— 要写入的新名单；
//   { done: true, list } —— 目标状态已由并发操作（或本
//                           方先前一次已落库的写）达成，
//                           按成功收尾，list 为当前名单；
//   { error }            —— 业务拒绝（重复 / 超限 / 条
//                           目已不存在），原样回操作者。
async function casListUpdate(key, parseFn, mutate, env) {
  let attempted = false;

  for (let casTry = 0; casTry < 5; casTry += 1) {
    const raw = await dbConfigGet(key, env);
    const list = parseFn(raw ?? '[]');
    const outcome = mutate(list, attempted);

    if (outcome.error) {
      return { ok: false, error: outcome.error };
    }

    if (outcome.done) {
      return { ok: true, list: outcome.list };
    }

    const newRaw = JSON.stringify(outcome.list);
    let wrote = false;

    if (raw === null) {
      // 行还不存在：claim 占位写。claim 落下后仍可能被
      // 另一路从空名单算出的 claim 覆盖，故回读核对——
      // 值已不是本次写的就按冲突处理，带着最新名单重
      // 试合并，不让先写的那条无声消失。
      wrote = await dbConfigClaim(key, newRaw, env);

      if (wrote) {
        const verify = await dbConfigGet(key, env);

        if (verify === newRaw) {
          return { ok: true, list: outcome.list };
        }

        wrote = false;
      }
    } else {
      wrote = await dbConfigPutIfValue(
        key,
        raw,
        newRaw,
        env
      );
    }

    attempted = true;

    if (wrote) {
      return { ok: true, list: outcome.list };
    }
  }

  return { ok: false, conflict: true };
}

async function handleConfigList(request, env) {
  const parsed = await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'panel');

  const { body, adminId } = parsed;
  const key = String(body?.key || '');
  const op = String(body?.op || '');

  // 名单增删也是改状态的敏感动作：与改配置同一套一次性
  // nonce，绑 {名单, 操作, 条目内容}（删除绑被删条目本
  // 身，见 nonceSemanticParams 的 config_list 分支）。
  const consumeListNonce = async (params) => {
    const verdict = await consumeActionNonce(env, {
      nonce: body?.nonce,
      adminId,
      scope: 'panel',
      action: 'config_list',
      target: key,
      params
    });

    if (verdict !== 'ok') {
      await writeAdminAudit(
        env,
        adminId,
        'config_list',
        key,
        'rejected',
        `nonce_${verdict}`, aOpts
      );
    }

    return verdict === 'ok';
  };

  const listNonceInvalid = () =>
    Response.json(
      { ok: false, error: 'nonce_invalid' },
      { status: 403 }
    );

  // CAS 合并写的统一收尾：冲突留痕并明确报错（不许静
  // 默成功）、业务拒绝原样回错、成功落一条 ok 审计。
  const finishListCas = async (cas) => {
    if (cas.conflict) {
      await writeAdminAudit(
        env,
        adminId,
        'config_list',
        key,
        'failed',
        'cas_conflict', aOpts
      );

      return Response.json(
        {
          ok: false,
          error: '名单刚被其他操作修改，请刷新后重试'
        },
        { status: 409 }
      );
    }

    if (cas.error) {
      return Response.json(
        { ok: false, error: cas.error },
        { status: 400 }
      );
    }

    await writeAdminAudit(
      env,
      adminId,
      'config_list',
      key,
      'ok', '', aOpts
    );

    return null;
  };

  if (key === 'block_keywords') {
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

      if (
        !(await consumeListNonce({
          op: 'add',
          value
        }))
      ) {
        return listNonceInvalid();
      }

      // 落库走 CAS 合并：上限与重复都在最新名单上判
      // 定，并发新增不被本路覆盖（见 casListUpdate）。
      const cas = await casListUpdate(
        'block_keywords',
        parseBlockKeywords,
        (list, retried) => {
          if (list.includes(value)) {
            return retried
              ? { done: true, list }
              : { error: '该关键词已经存在' };
          }

          if (list.length >= 200) {
            return {
              error: '屏蔽关键词已达数量上限（200 条）'
            };
          }

          return { list: [...list, value] };
        },
        env
      );

      const casErr = await finishListCas(cas);

      if (casErr) {
        return casErr;
      }

      return Response.json({ ok: true, keywords: cas.list });
    }

    if (op === 'delete') {
      const keywords = await getBlockKeywords(env);
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

      // nonce 绑被删条目本身；落库时按条目身份在最新
      // 名单里定位删除——并发增删让序号漂移时，删的仍
      // 然是管理员点的那一条，不误删别的条目。
      const item = keywords[index];

      if (
        !(await consumeListNonce({
          op: 'delete',
          item
        }))
      ) {
        return listNonceInvalid();
      }

      const cas = await casListUpdate(
        'block_keywords',
        parseBlockKeywords,
        (list, retried) => {
          const at = list.indexOf(item);

          if (at < 0) {
            return retried
              ? { done: true, list }
              : { error: '该条目已被其他操作删除' };
          }

          const next = list.slice();

          next.splice(at, 1);

          return { list: next };
        },
        env
      );

      const casErr = await finishListCas(cas);

      if (casErr) {
        return casErr;
      }

      return Response.json({ ok: true, keywords: cas.list });
    }
  }

  if (key === 'keyword_responses') {
    const mapRules = (list) =>
      list.map((rule) => ({
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

      if (
        !(await consumeListNonce({
          op: 'add',
          pattern,
          response
        }))
      ) {
        return listNonceInvalid();
      }

      // 新规则的 id 先定死：CAS 重试时靠它认出「本方
      // 先前一次已落库的写」，不重复追加第二条。
      const newRule = {
        id: randomId(),
        keywords: pattern,
        response
      };

      const cas = await casListUpdate(
        'keyword_responses',
        parseAutoReplyRules,
        (list) => {
          if (
            list.some(
              (rule) => String(rule.id || '') === newRule.id
            )
          ) {
            return { done: true, list };
          }

          if (list.length >= 200) {
            return {
              error: '自动回复规则已达数量上限（200 条）'
            };
          }

          return { list: [...list, newRule] };
        },
        env
      );

      const casErr = await finishListCas(cas);

      if (casErr) {
        return casErr;
      }

      return Response.json({
        ok: true,
        autoReplies: mapRules(cas.list)
      });
    }

    if (op === 'delete') {
      const rules = await getAutoReplyRules(env);
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

      // 删除按规则 id 定位（与 nonce 绑定口径一致）：
      // 并发增删后序号漂移，删的仍是点的那一条。
      const item = String(rules[index].id || '');

      if (
        !(await consumeListNonce({
          op: 'delete',
          item
        }))
      ) {
        return listNonceInvalid();
      }

      const cas = await casListUpdate(
        'keyword_responses',
        parseAutoReplyRules,
        (list, retried) => {
          const at = list.findIndex(
            (rule) => String(rule.id || '') === item
          );

          if (at < 0) {
            return retried
              ? { done: true, list }
              : { error: '该条目已被其他操作删除' };
          }

          const next = list.slice();

          next.splice(at, 1);

          return { list: next };
        },
        env
      );

      const casErr = await finishListCas(cas);

      if (casErr) {
        return casErr;
      }

      return Response.json({
        ok: true,
        autoReplies: mapRules(cas.list)
      });
    }
  }

  return Response.json(
    { ok: false, error: '不支持的操作' },
    { status: 400 }
  );
}

async function handleNonceMint(request, env) {
  // 与其余网页 POST 同口径：先过体积上限再读体；用途由
  // 发起页面声明（列表页 usrlist / 管理台 panel），鉴权
  // 沿用该页自身的签名与 scope。
  if (
    Number(
      request.headers.get('content-length') || 0
    ) > 16384
  ) {
    return Response.json(
      { ok: false, error: 'too large' },
      { status: 413 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: 'bad json' },
      { status: 400 }
    );
  }

  const scope =
    body?.scope === 'panel' ? 'panel' : 'usrlist';

  const adminId = await checkUserListAuth(
    body?.u,
    body?.e,
    body?.s,
    env,
    scope
  );

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  const action = String(body?.action || '');
  const target = String(body?.target || '');

  if (scope === 'panel') {
    const panelNonceTargets = {
      config_set: (t) => !!t,
      config_toggle: (t) => FILTER_TOGGLE_KEYS.has(t),
      config_pause: (t) =>
        t === 'pause' || t === 'resume',
      config_list: (t) =>
        t === 'block_keywords' ||
        t === 'keyword_responses'
    };

    if (
      !panelNonceTargets[action] ||
      !panelNonceTargets[action](target)
    ) {
      return Response.json(
        { ok: false, error: 'bad action' },
        { status: 400 }
      );
    }
  } else if (
    !LIST_SENSITIVE_ACTIONS.has(action) ||
    !/^\d{1,20}$/.test(target)
  ) {
    return Response.json(
      { ok: false, error: 'bad action' },
      { status: 400 }
    );
  }

  const nonce = await mintActionNonce(env, {
    adminId,
    scope,
    action,
    target,
    params: body?.params
  });

  return Response.json({ ok: true, nonce });
}

async function handleRevokeLinks(request, env) {
  const parsed =
    await readPanelPostBody(request, env, 'panel');

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'panel');

  const scope = String(parsed.body?.scope || '');

  if (!['panel', 'usrlist', 'guide'].includes(scope)) {
    return Response.json(
      { ok: false, error: 'bad scope' },
      { status: 400 }
    );
  }

  const currentEpoch = await getLinkEpoch(env, scope);

  // 吊销是拿「无痕」换不来的动作：先落 intent 审计，
  // 写不进去就拒绝执行。
  try {
    await writeAdminAuditStrict(
      env,
      parsed.adminId,
      'revoke_links',
      scope,
      'intent',
      `epoch=${currentEpoch}`,
      aOpts
    );
  } catch (_) {
    return Response.json(
      { ok: false, error: 'audit_unavailable' },
      { status: 503 }
    );
  }

  const next = currentEpoch + 1;

  await dbConfigPut(
    `linkepoch:${scope}`,
    String(next),
    env
  );

  // epoch 已变：清掉本请求的 epoch 备忘，后续读取
  // 不会读到吊销前的值。
  linkEpochCache(env)?.clear();

  await writeAdminAudit(
    env,
    parsed.adminId,
    'revoke_links',
    scope,
    'ok',
    `epoch=${next}`, aOpts
  );

  return Response.json({ ok: true, scope, epoch: next });
}

async function handleAuditApi(request, env) {
  const adminId =
    await panelQueryAdminId(request, env, 'panel');

  if (!adminId) {
    return Response.json(
      { ok: false, error: 'unauthorized' },
      { status: 403 }
    );
  }

  // 读取顺手清扫 90 天前审计行：删除幂等且便宜，但按
  // config 时间戳节流到每小时至多一次，避免每次拉列表
  // 都发一发 DELETE 写库。
  try {
    let lastSweep = Number(
      (await dbConfigGet('audit_sweep_at', env)) || 0
    );

    // 坏值自愈（第十轮审计）：存量值若是非数字
    // （NaN）或未来时间，旧口径下
    // Date.now() - lastSweep 恒不达标、清扫永久停
    // 摆且值永不被改写。这里把不可信的值按从未清
    // 扫处理：本轮即清扫并改写为当前时间，之后恢
    // 复每小时节流。
    if (
      !Number.isFinite(lastSweep) ||
      lastSweep < 0 ||
      lastSweep > Date.now()
    ) {
      lastSweep = 0;
    }

    if (Date.now() - lastSweep >= 60 * 60 * 1000) {
      await dbConfigPut(
        'audit_sweep_at',
        String(Date.now()),
        env
      );

      await env.TG_BOT_DB.prepare(
        'DELETE FROM admin_audit WHERE ts < ?'
      )
        .bind(Date.now() - AUDIT_RETENTION_MS)
        .run();
    }
  } catch (error) {
    console.error(
      '清扫过期审计行失败：',
      error?.message || error
    );
  }

  const url = new URL(request.url);
  const limit = 100;
  const where = [];
  const binds = [];

  // keyset 分页：游标编码 {ts, rowid}（admin_audit 无显
  // 式主键，rowid 作同毫秒 tiebreaker），倒序翻页不重
  // 不漏；游标已签名，验不过按第一页处理。
  const cursorRaw =
    url.searchParams.get('cursor') || '';

  if (cursorRaw) {
    const decoded = await decodeListCursor(
      cursorRaw,
      env
    );

    if (
      decoded &&
      decoded.s === 'audit' &&
      decoded.id != null &&
      Number.isFinite(Number(decoded.k))
    ) {
      where.push(
        '(ts < ? OR (ts = ? AND rowid < ?))'
      );
      binds.push(
        Number(decoded.k),
        Number(decoded.k),
        Number(decoded.id)
      );
    }
  }

  const adminFilter = String(
    url.searchParams.get('admin') || ''
  ).trim();

  if (adminFilter) {
    where.push('admin_id = ?');
    binds.push(adminFilter);
  }

  const actionFilter = String(
    url.searchParams.get('action') || ''
  ).trim();

  if (actionFilter) {
    where.push('action = ?');
    binds.push(actionFilter);
  }

  const targetFilter = String(
    url.searchParams.get('target') || ''
  ).trim();

  if (targetFilter) {
    const pattern =
      '%' +
      targetFilter
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_') +
      '%';

    where.push("target LIKE ? ESCAPE '\\'");
    binds.push(pattern);
  }

  const result = await env.TG_BOT_DB.prepare(
    'SELECT rowid AS rowid, ts, admin_id, action, ' +
      'target, result, detail, epoch, ip ' +
      'FROM admin_audit' +
      (where.length
        ? ` WHERE ${where.join(' AND ')}`
        : '') +
      ' ORDER BY ts DESC, rowid DESC LIMIT ?'
  )
    .bind(...binds, limit + 1)
    .all();

  const rows = result?.results || [];
  let nextCursor = null;

  if (rows.length > limit) {
    rows.length = limit;

    const last = rows[rows.length - 1];

    nextCursor = await encodeListCursor(
      {
        s: 'audit',
        k: Number(last.ts) || 0,
        id: Number(last.rowid) || 0
      },
      env
    );
  }

  return Response.json({
    ok: true,
    rows,
    nextCursor
  });
}

async function handleUserListAction(request, env) {
  const parsed =
    await readPanelPostBody(request, env);

  if (parsed.response) {
    return parsed.response;
  }

  const aOpts = await auditOpts(request, env, 'usrlist');

  const body = parsed.body;
  const adminId = parsed.adminId;

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

  // 敏感动作（delete / pass / trust / block）执行前的一次性
  // nonce 关口：绑定（管理员、动作、目标、语义参数）全一致
  // 且未过期才消费放行；失败记审计并回拒，动作不执行。
  const guardNonce = async (act, params) => {
    const verdict = await consumeActionNonce(env, {
      nonce: body?.nonce,
      adminId,
      scope: 'usrlist',
      action: act,
      target: targetId,
      params
    });

    if (verdict !== 'ok') {
      await writeAdminAudit(
        env,
        adminId,
        act,
        targetId,
        'rejected',
        `nonce_${verdict}`, aOpts
      );

      return Response.json(
        { ok: false, error: 'nonce_invalid' },
        { status: 403 }
      );
    }

    return null;
  };

  if (action === 'reset') {
    // 重置是把已验证 / 已信任访客降级并作废其通行证，
    // 属安全状态变更：与 delete / pass / trust / block
    // 同规矩，先过一次性 nonce 再执行（第十轮审计）。
    const ng = await guardNonce('reset', {});

    if (ng) {
      return ng;
    }

    // 合并口径：重置连带清放行，与清信任一起回到未信任
    // 状态，避免留下「显示已信任但实际未信任」的残标。
    await dbUserUpdate(
      targetId,
      {
        user_state: USER_STATE.PENDING,
        is_trusted: 0,
        relay_exempt: 0
      },
      env,
      { touchActivity: false }
    );

    await voidUserPass(env, targetId);

    // 在途顺序点击题目一并作废（与作废通行证同口径）：
    // 重置后旧题点完不能再算数。
    await dbConfigDelete(`seq:${targetId}`, env);

    await writeAdminAudit(
      env,
      adminId,
      'reset',
      targetId,
      'ok',
      '', aOpts
    );

    return Response.json({ ok: true });
  }

  if (action === 'trust') {
    const target = await dbUserGet(targetId, env);

    if (!target) {
      await writeAdminAudit(
        env,
        adminId,
        'trust',
        targetId,
        'failed',
        'not_found', aOpts
      );

      return Response.json(
        { ok: false, error: '访客记录不存在' },
        { status: 400 }
      );
    }

    if (body?.trust === false) {
      const ng = await guardNonce('trust', { trust: false });

      if (ng) {
        return ng;
      }

      await dbUserUpdate(
        targetId,
        { is_trusted: 0, relay_exempt: 0 },
        env,
        { touchActivity: false }
      );

      await writeAdminAudit(
        env,
        adminId,
        'trust',
        targetId,
        'ok',
        'untrust', aOpts
      );

      return Response.json({ ok: true });
    }

    // 授予类参数 fail-closed：只有明确的 true 才授予，
    // 缺失或类型不对一律参数错误，绝不默认授予。
    if (body?.trust !== true) {
      await writeAdminAudit(
        env,
        adminId,
        'trust',
        targetId,
        'failed',
        'bad_param', aOpts
      );

      return Response.json(
        { ok: false, error: '参数错误' },
        { status: 400 }
      );
    }

    if (Number(target.is_blocked || 0) === 1) {
      await writeAdminAudit(
        env,
        adminId,
        'trust',
        targetId,
        'failed',
        'blocked', aOpts
      );

      return Response.json(
        {
          ok: false,
          error: '对方已被封禁，请先解封再设为信任'
        },
        { status: 400 }
      );
    }

    // 已经是已验证状态时只补标记：不再重复发成功提示、
    // 也不顶掉既有的验证回执槽。
    if (target.user_state === USER_STATE.VERIFIED) {
      const ng = await guardNonce('trust', { trust: true });

      if (ng) {
        return ng;
      }

      await dbUserUpdate(
        targetId,
        { is_trusted: 1, relay_exempt: 1 },
        env,
        { touchActivity: false }
      );

      await writeAdminAudit(
        env,
        adminId,
        'trust',
        targetId,
        'ok',
        'trust', aOpts
      );

      return Response.json({ ok: true });
    }

    const ng = await guardNonce('trust', { trust: true });

    if (ng) {
      return ng;
    }

    // 设置即生效：直接置为已验证并按验证成功收尾，
    // 再把成功提示发给访客（发不出也不影响已生效的设置）。
    await dbUserUpdate(
      targetId,
      {
        is_trusted: 1,
        relay_exempt: 1,
        user_state: USER_STATE.VERIFIED
      },
      env,
      { touchActivity: false }
    );

    await cleanupAfterVerified(env, targetId);

    await sendVerifySuccessReceipt(env, targetId);

    await writeAdminAudit(
      env,
      adminId,
      'trust',
      targetId,
      'ok',
      'trust', aOpts
    );

    return Response.json({ ok: true });
  }

  if (action === 'block') {
    // 与 /ban、/unban 及资料卡完全同口径（统一生效
    // 函数）：写标记并发在册的封禁/解封通知，不删话题。
    if (body?.block === false) {
      const ng = await guardNonce('block', { block: false });

      if (ng) {
        return ng;
      }

      // 解封连带清零关键词命中计数（防旧计数再命中
      // 一次即刻重封）。
      await applyBlockState(targetId, false, env);

      await writeAdminAudit(
        env,
        adminId,
        'block',
        targetId,
        'ok',
        'unblock', aOpts
      );

      return Response.json({ ok: true });
    }

    // 屏蔽参数 fail-closed：只有明确的 true 才屏蔽，
    // 缺失或类型不对一律参数错误。
    if (body?.block !== true) {
      await writeAdminAudit(
        env,
        adminId,
        'block',
        targetId,
        'failed',
        'bad_param', aOpts
      );

      return Response.json(
        { ok: false, error: '参数错误' },
        { status: 400 }
      );
    }

    const ng = await guardNonce('block', { block: true });

    if (ng) {
      return ng;
    }

    await applyBlockState(targetId, true, env);

    await writeAdminAudit(
      env,
      adminId,
      'block',
      targetId,
      'ok',
      'block', aOpts
    );

    return Response.json({ ok: true });
  }

  if (action === 'note') {
    const noteText = String(
      body?.note ?? ''
    ).trim();

    if (noteText.length > 500) {
      await writeAdminAudit(
        env,
        adminId,
        'note',
        targetId,
        'failed',
        'too_long', aOpts
      );

      return Response.json(
        {
          ok: false,
          error: '备注太长（上限 500 字）'
        },
        { status: 400 }
      );
    }

    // 改备注会连带改话题名与资料卡，且旧请求重放能覆盖
    // 刚改好的新备注：与其它敏感动作同规矩绑 nonce，
    // nonce 绑提交内容本身（见 nonceSemanticParams）。
    const ng = await guardNonce('note', { note: noteText });

    if (ng) {
      return ng;
    }

    await dbUserUpdate(
      targetId,
      { admin_note: noteText },
      env,
      { touchActivity: false }
    );

    await refreshCardAfterNoteChange(
      targetId,
      env
    );

    // 审计只记「谁对谁改过备注」，不记备注正文。
    await writeAdminAudit(
      env,
      adminId,
      'note',
      targetId,
      'ok',
      '', aOpts
    );

    return Response.json({ ok: true });
  }

  if (action === 'delete') {
    const withTopic = body?.deleteTopic === true;

    const ng = await guardNonce('delete', {
      deleteTopic: withTopic
    });

    if (ng) {
      return ng;
    }

    // 删除（含整段清空）先落 intent 审计：写不进去就
    // 拒绝执行，动作本身不可逆，不能无痕。
    try {
      await writeAdminAuditStrict(
        env,
        adminId,
        'delete',
        targetId,
        'intent',
        withTopic ? 'wipe' : 'record',
        aOpts
      );
    } catch (_) {
      return Response.json(
        { ok: false, error: 'audit_unavailable' },
        { status: 503 }
      );
    }

    let wipe = null;

    if (withTopic) {
      // 连话题版先清私聊副本（话题稍后整体删除，
      // 话题内副本随话题一并消失，不逐条删）。
      wipe = await wipeConversationCopies(
        targetId,
        env,
        false
      );
    }

    await purgeManagedUser(
      targetId,
      withTopic,
      env
    );

    await writeAdminAudit(
      env,
      adminId,
      'delete',
      targetId,
      'ok',
      withTopic ? 'wipe' : 'record', aOpts
    );

    return Response.json({ ok: true, wipe });
  }

  if (action === 'pass') {
    const target = await dbUserGetOrCreate(targetId, env);

    if (target.user_state === USER_STATE.VERIFIED) {
      await writeAdminAudit(
        env,
        adminId,
        'pass',
        targetId,
        'failed',
        'verified', aOpts
      );

      return Response.json(
        { ok: false, error: '对方已是已验证状态' },
        { status: 400 }
      );
    }

    if (Number(target.is_blocked || 0) === 1) {
      await writeAdminAudit(
        env,
        adminId,
        'pass',
        targetId,
        'failed',
        'blocked', aOpts
      );

      return Response.json(
        { ok: false, error: '对方已被封禁，请先解封再发放' },
        { status: 400 }
      );
    }

    const oldPass = await passRecordGet(targetId, env);

    const ng = await guardNonce('pass', {});

    if (ng) {
      return ng;
    }

    const exp = Date.now() + (await passLinkTtlMs(env));
    const nonce = randomId();

    // 先落记录再发送：发送环节出故障也不会出现「有链接、无记录」；
    // 旧证在新记录落库的这一刻即失效（与此前口径一致）。
    await dbConfigPut(
      `pass:${targetId}`,
      JSON.stringify({ n: nonce, e: exp }),
      env
    );

    const origin = new URL(request.url).origin;
    const passUrl = await buildPassUrl(
      origin,
      targetId,
      nonce,
      exp,
      env
    );

    let passSent = null;

    const passMins = Math.max(
      1,
      Math.round((exp - Date.now()) / 60000)
    );

    try {
      passSent = await telegramApi(env.BOT_TOKEN, 'sendMessage', {
        chat_id: targetId,
        text: fillTextTemplate(
          await textConfig('pass_deliver_text', env),
          { minutes: passMins }
        ),
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🎫 使用通行证通过验证',
                web_app: { url: passUrl }
              }
            ]
          ]
        }
      });
    } catch (error) {
      // 只删本次这张（认随机数），不误伤并发发放的另一张新证。
      const cur = await passRecordGet(targetId, env);

      if (cur && cur.n === nonce) {
        await dbConfigDelete(`pass:${targetId}`, env);
      }

      await writeAdminAudit(
        env,
        adminId,
        'pass',
        targetId,
        'failed',
        'send_failed', aOpts
      );

      return Response.json(
        {
          ok: false,
          error: '通行证发送失败：对方可能已拉黑机器人'
        },
        { status: 502 }
      );
    }

    // 回填消息 ID 前复检随机数：期间被另一张新证顶替时不覆盖对方的记录。
    const cur = await passRecordGet(targetId, env);

    if (cur && cur.n === nonce) {
      await dbConfigPut(
        `pass:${targetId}`,
        JSON.stringify({
          n: nonce,
          e: exp,
          m: passSent?.message_id || null
        }),
        env
      );
    }

    // 新证确认送达后，再删上一张证的消息。
    if (oldPass?.m) {
      await quietDeleteMessage(env, targetId, oldPass.m);
    }

    await writeAdminAudit(
      env,
      adminId,
      'pass',
      targetId,
      'ok', '', aOpts
    );

    return Response.json({ ok: true, passExp: exp });
  }

  return Response.json(
    { ok: false, error: 'unknown action' },
    { status: 400 }
  );
}

function buildUserListPage(pageCtx = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>访客列表</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; margin: 0; background: #0f141a; color: #e8edf2; height: 100%; overflow: hidden; display: flex; flex-direction: column; }
  html { height: 100%; overflow-x: hidden; overflow-x: clip; }
  header { background: #17212b; padding: 12px 14px 4px; flex: none; }
  h1 { font-size: 17px; margin: 0 0 10px; }
  #pgsel { -webkit-appearance: none; appearance: none; margin-top: 0; padding: 7px 30px 7px 14px; border-radius: 8px; border: 1px solid #2b3a47; background-color: #17212b; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239db2c5' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; color: #e8edf2; font-size: 16px; cursor: pointer; }
  .chips { display: flex; gap: 8px; flex-wrap: nowrap; background: #17212b; padding: 4px 12px 8px; flex: none; }
  .chip { flex: 1; padding: 8px 0; border-radius: 9px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 14px; cursor: pointer; text-align: center; transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
  .chip.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  .sortrow { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 8px 0 8px; }
  .sortgrp { display: flex; gap: 8px; }
  .sbtn { padding: 8px 14px; border-radius: 9px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 14px; cursor: pointer; text-align: center; transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
  .sbtn.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  .tabs { display: flex; gap: 8px; margin-top: 10px; }
  .tab { flex: 1; padding: 8px 0; border-radius: 9px; border: 1px solid #2b3a47; background: transparent; color: #9db2c5; font-size: 14px; cursor: pointer; transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
  .tab.on { background: #2b5278; color: #fff; border-color: #2b5278; }
  select { margin-top: 10px; padding: 6px; border-radius: 8px; background: #0f141a; color: #e8edf2; border: 1px solid #2b3a47; }
  #uscroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; scrollbar-gutter: stable; }
  main { padding: 0 12px 30px; }
  main { display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; }
  .card { background: #17212b; border-radius: 12px; padding: 11px 12px; margin-bottom: 9px; }
  .nm { font-weight: 600; font-size: 15px; }
  .sub { color: #9db2c5; font-size: 12.5px; margin-top: 2px; word-break: break-all; }
  .badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; margin-right: 5px; }
  .b-ok { background: #1d4d2b; color: #8be09a; }
  .b-pend { background: #5c4a17; color: #f2cd72; }
  .b-ban { background: #5c2222; color: #f28b8b; }
  .b-dim { background: #2b3a47; color: #9db2c5; }
  .b-pass { background: #173f5f; color: #8ecdf0; }
  .ops { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 8px; }
  .ops button, .cf button { height: 42px; padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; white-space: nowrap; cursor: pointer; }
  .cf button { flex: 0 0 auto; }
  .ops button { flex: 1 1 30%; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 4px; }
  @media (min-width: 640px) { .ops button { flex: 0 0 auto; padding: 6px 16px; } }
  .rst { background: #2b5278; color: #fff; }
  .ric { font-size: 17px; line-height: 1.1; }
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
  .ne textarea { width: 100%; box-sizing: border-box; min-height: 62px; padding: 8px 10px; border-radius: 8px; border: 1px solid #2b3a47; background: #0f141a; color: #e8edf2; font-size: 16px; }
  .ne .row { display: flex; gap: 8px; margin-top: 7px; }
  .ne button { padding: 6px 13px; border-radius: 8px; border: 0; font-size: 13.5px; cursor: pointer; }
  .ne .c { background: #2b3a47; color: #e8edf2; }
  .pager { display: flex; justify-content: space-between; align-items: center; padding: 6px 2px; }
  .pager button { padding: 7px 16px; border-radius: 8px; border: 1px solid #2b3a47; background: #17212b; color: #e8edf2; cursor: pointer; }
  .pager button:disabled { opacity: .4; }
  #toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%); background: #2b5278; color: #fff; padding: 9px 16px; border-radius: 10px; display: none; font-size: 14px; }
  #ufloat { position: fixed; right: 18px; bottom: 18px; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); z-index: 3; display: flex; flex-direction: column; align-items: flex-end; transform: translate3d(0,0,0); transition: opacity .15s ease; }
  #ufloat.dodgesmooth { transition: transform .2s ease, opacity .15s ease; }
  #ufloat.kbtransit { opacity: 0; }
  #ufloat.ufleft { align-items: flex-start; }
  #ufloat.ufleft #usbtn { right: auto; left: 0; }
  #ufloat.ufleft #uxbtn { left: auto; right: 0; }
  #ufloat.ufleft #uq { right: auto; left: 48px; padding: 0 2px 0 8px; }
  #ufloat.ufleft #usdot { right: auto; left: 9px; }
  #ufloat.ufdrag #toTop { transform: scale(1.07); }
  #ufloat.ufdrag #usearch { transform: scale(1.07); transition: width .32s ease, transform .15s ease; }
  #ufloat.ufhome #toTop, #ufloat.ufhome #usearch { box-shadow: 0 0 0 2px rgba(142,205,240,.9), 0 10px 28px rgba(0,0,0,.45); }
  .glassbtn { border: 1px solid rgba(255,255,255,.22); background: rgba(38,56,74,.55); background: linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,.06)), rgba(38,56,74,.55); -webkit-backdrop-filter: blur(18px) saturate(1.6); backdrop-filter: blur(18px) saturate(1.6); box-shadow: 0 10px 28px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.35), inset 0 -8px 16px rgba(255,255,255,.04); color: #fff; }
  #toTop { width: 48px; height: 48px; padding: 0; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .25s ease, visibility .25s ease, transform .15s ease; }
  #toTop.show { opacity: 1; visibility: visible; pointer-events: auto; }
  #ufloat.kbd #toTop { opacity: 0; visibility: hidden; pointer-events: none; }
  #toTop:active { transform: scale(.94); }
  #usearch { position: relative; width: 48px; height: 48px; margin-top: 10px; border-radius: 999px; overflow: hidden; transition: width .32s ease; }
  #usearch.open { width: 380px; width: min(84vw, 380px); }
  #uq { position: absolute; left: 0; top: 0; width: 284px; width: calc(min(84vw, 380px) - 96px); height: 48px; box-sizing: border-box; border: 0; background: transparent; color: #e8edf2; font-size: 16px; padding: 0 2px 0 16px; opacity: 0; pointer-events: none; transition: opacity .18s ease; -webkit-appearance: none; appearance: none; outline: none; }
  #uq::placeholder { color: #9db2c5; }
  #usearch.open #uq { opacity: 1; pointer-events: auto; transition: opacity .18s ease .14s; }
  .uicobtn { position: absolute; top: 0; width: 48px; height: 48px; padding: 0; border: 0; background: transparent; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; }
  #usbtn { right: 0; }
  #usbtn:active { transform: scale(.94); }
  #uxbtn { right: 48px; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity .15s ease, visibility .15s ease; }
  #usearch.open.hasq #uxbtn { opacity: 1; visibility: visible; pointer-events: auto; }
  #usdot { position: absolute; top: 9px; right: 9px; width: 8px; height: 8px; border-radius: 50%; background: #8ecdf0; display: none; }
  #usearch.dot:not(.open) #usdot { display: block; }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) { .glassbtn { background: rgba(38,56,74,.88); } }
  .empty { text-align: center; color: #9db2c5; padding: 34px 0; }
  #paneStats { padding-top: 10px; }
  #statsBox { margin-bottom: 14px; }
  .stitle { font-size: 15px; font-weight: 600; margin: 2px 0 4px; }
  .sgroup { color: #9db2c5; font-size: 12px; margin: 10px 0 6px; }
  .srow { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 8px; }
  .stile { background: #17212b; border-radius: 10px; padding: 8px 10px; }
  .stlink { position: relative; cursor: pointer; padding-right: 22px; }
  .stchev { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #5f7488; font-size: 16px; line-height: 1; }
  #l2head { background: #17212b; padding: 13px 14px; flex: none; display: none; align-items: center; gap: 10px; }
  #l2back { color: #9db2c5; font-size: 24px; line-height: 1; cursor: pointer; padding-right: 2px; }
  #l2title { font-size: 17px; font-weight: 700; flex: 1; }
  #l2cnt { color: #9db2c5; font-size: 13px; }
  .ss { color: #5f7488; font-size: 11px; margin-top: 2px; }
  .sv { font-size: 19px; font-weight: 700; }
  .sl { color: #9db2c5; font-size: 11.5px; margin-top: 1px; }
  .snote { color: #5f7488; font-size: 11.5px; margin-top: 9px; line-height: 1.5; }
  .sloading { color: #9db2c5; font-size: 13px; padding: 6px 0; }
  .loadingbox { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 40vh; gap: 12px; }
  .spinner { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #2b3a47; border-top-color: #8ecdf0; animation: spinRot .8s linear infinite; }
  @keyframes spinRot { to { transform: rotate(360deg); } }
  .loadingtxt { color: #9db2c5; font-size: 13px; }
  .listclip { overflow-x: hidden; overflow-x: clip; }
  @keyframes slideFromRight { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideFromLeft { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
  .in-r { animation: slideFromRight .32s ease; }
  .in-l { animation: slideFromLeft .32s ease; }
</style>
</head>
<body>
<header id="uhead">
  <h1>📋 访客列表 <span id="cnt" style="color:#9db2c5;font-size:13px"></span></h1>
  <div class="tabs">
    <button class="tab on" id="tabList">📋 访客列表</button>
    <button class="tab" id="tabStats">📊 数据统计</button>
  </div>
</header>
<div id=\"l2head\">
  <span id=\"l2back\">‹</span>
  <span id=\"l2title\"><span id=\"l2name\"></span> <span id=\"l2cnt\"></span></span>
</div>
<div class="chips" id="chips">
  <button class="chip on" data-f="all">全部</button>
  <button class="chip" data-f="verified">已验证</button>
  <button class="chip" data-f="pending">待验证</button>
  <button class="chip" data-f="blocked">已屏蔽</button>
  <button class="chip" data-f="botblocked">被屏蔽</button>
</div>
<div id="uscroll">
<main>
  <section id="paneList">
  <div class="sortrow" id="sortrow">
    <div class="sortgrp">
      <button class="sbtn on" data-sf="act">最后活跃</button>
      <button class="sbtn" data-sf="fst">首次来访</button>
    </div>
    <div class="sortgrp">
      <button class="sbtn on" data-sd="desc">倒序</button>
      <button class="sbtn" data-sd="asc">正序</button>
    </div>
  </div>
  <div class="listclip"><div id="list"><div class="loadingbox"><div class="spinner"></div><div class="loadingtxt">加载中…</div></div></div></div>
  <div class="pager">
    <button id="prev">← 上一页</button>
    <select id="pgsel" aria-label="选择页码"></select>
    <button id="next">下一页 →</button>
  </div>
  </section>
  <section id="paneStats" style="display:none">
    <div class="stitle">📊 数据统计</div>
    <div id="sgrid"><div class="loadingbox"><div class="spinner"></div><div class="loadingtxt">加载中…</div></div></div>
    <div class="snote">消息量按同步映射记录统计（仅保留最近 90 天）；新增与活跃为滚动窗口（过去 24 小时 / 7 天 / 30 天）。</div>
  </section>
</main>
</div>
<div id="toast"></div>
<div id="ufloat">
<button id="toTop" class="glassbtn" title="回到顶部" aria-label="回到顶部"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 15l7-7 7 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
<div id="usearch" class="glassbtn">
<input id="uq" type="text" inputmode="search" enterkeyhint="search" placeholder="搜索名字、用户名、ID、备注" autocomplete="off">
<button id="uxbtn" class="uicobtn" title="清除搜索" aria-label="清除搜索"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></button>
<button id="usbtn" class="uicobtn" title="搜索" aria-label="搜索"><svg width="21" height="21" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#fff" stroke-width="2.2"/><path d="M20 20l-3.8-3.8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg></button>
<span id="usdot"></span>
</div>
</div>
<script>
var qs = new URLSearchParams(location.search);
var AUTH = { u: qs.get('u'), e: qs.get('e'), s: qs.get('s') };
var APPMODE = !!(AUTH.s && AUTH.s.indexOf('app.') === 0);
var rows = [], filt = 'all', query = '', sortMode = '';
var listTotal = 0;
var GROUP_C = '';
var PAGE = 15;
var booted = false;
// sortTouched：用户在本页亲手点过排序（boot 领养
// uiDefaults 之前点过也算）。领养只在未点过时回
// 填服务端默认；点过的选择是排序的唯一事实源，
// 不许被领养无声覆写（第十轮审计·低3）。
var sortTouched = false;
var curCursor = '', cursorStack = [], nextCursor = null;
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

// 列表数据改由服务端游标分页 + 搜索 + 状态筛选：本页只
// 管按当前游标取一页回来渲染。
// 取数期间列表区直接清空、只留居中加载块（转圈＋「加载中…」），
// 分页与计数先以 visibility 藏起（占位不跳版），渲染或出错后
// 恢复——旧行不滞留、没有可点的残留。loadSeq 单调递增领号：
// 连点筛选/搜索时旧响应若后到，序号对不上直接丢弃（不渲染、
// 不动加载块），最新请求负责收尾。删空整页自动退页的递归取
// 数保持加载块，最终渲染后才收尾。
// 位置回拉：posMem 以「筛选|搜索词|排序组合」为键记游标栈、
// 当前游标与滚动位，只存页面内存；render 后 memSave 刷新当
// 前键的游标位置，滚动监听与切换键前的 memLeave 维护滚动位。
// 切回有记忆的视图时 enterKey 按记忆游标重新取新数据，渲染
// 后经 pendingScrollY 瞬时滚回原位（递归退页中间不消费它）。
var loadSeq = 0;
var posMem = {};
var pendingScrollY = null;
// 页码下拉直达：pageAnchor>0 表示当前页由页号模式锚定
// （值为页号），pageJumpNext 是跳页响应带回的 nextCursor
// （「下一页」据此接回游标模式）；progScrollUntil 是程序
// 滚动抑制窗口的截止时刻（搜索胶囊自动收缩豁免）。
var pageAnchor = 0;
var pageJumpNext = null;
var progScrollUntil = 0;
// 内层滚动容器（-v146b14）：列表页改容器滚动——窗
// 口永不滚动，页眉与筛选行都是普通流内块，彻底退
// 出键盘期 visualViewport 平移的射程（三轮探针实
// 测：窗口滚动时 fixed 页眉被 offsetTop 1:1 带走，
// 页内对抗——锁/镜像/冻结/glide/闭环钉——或被合
// 成器惩罚、或因读数相位与滞留过期，全部判死）。
// 本页一切滚动读/写（posMem、回顶判定、拖动监
// 视、平滑回顶、位置回拉）自此只认 uScr.scrollTop。
var uScr = document.getElementById('uscroll');
// 排序两段式（字段 × 方向）：sortMode 恒为四组合之一
// （act_desc / act_asc / fst_desc / fst_asc）。服务端回的
// uiDefaults 已是新枚举，sortNorm 再兼容旧三档值；按钮
// 选中态由 sortChrome 按当前组合重绘，翻页/切视图不重设。
var SORT_MODES = ['act_desc', 'act_asc', 'fst_desc', 'fst_asc'];
function sortNorm(v) {
  if (SORT_MODES.indexOf(v) >= 0) return v;
  return { active: 'act_desc', new: 'fst_desc', old: 'fst_asc' }[v] || 'act_desc';
}
function sortField() { return sortMode.indexOf('fst') === 0 ? 'fst' : 'act'; }
function sortDirn() { return sortMode.slice(-3) === 'asc' ? 'asc' : 'desc'; }
function sortChrome() {
  var bs = document.querySelectorAll('#sortrow .sbtn');
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i], on = false;
    if (b.dataset.sf) on = b.dataset.sf === sortField();
    if (b.dataset.sd) on = b.dataset.sd === sortDirn();
    b.className = 'sbtn' + (on ? ' on' : '');
  }
}
function posKey() { return filt + '|' + query + '|' + sortMode; }
function memSave() {
  var m = posMem[posKey()] || (posMem[posKey()] = { stack: [], cursor: '', scrollY: 0 });
  m.stack = cursorStack.slice();
  m.cursor = curCursor;
  m.page = pageAnchor;
  m.jnext = pageJumpNext;
}
function memLeave() {
  var m = posMem[posKey()];
  if (m) m.scrollY = uScr.scrollTop || 0;
}
function enterKey() {
  var m = posMem[posKey()];
  if (m) {
    cursorStack = m.stack.slice();
    curCursor = m.cursor;
    pageAnchor = m.page || 0;
    pageJumpNext = m.jnext || null;
    pendingScrollY = m.scrollY || 0;
    loadUsers();
    return true;
  }
  curCursor = '';
  cursorStack = [];
  pageAnchor = 0;
  pageJumpNext = null;
  pendingScrollY = null;
  loadUsers();
  return false;
}
// 回顶按钮显隐与位置记忆共用同一次节流滚动监听：仅当访客
// 列表视图激活且向下滚动超过 200px 时渐显；切到数据统计
// 页签时 showTab 也会重判一次（列表不在视图内强制隐藏）。
function uTopBtn() {
  var b = document.getElementById('toTop');
  if (!b) return;
  var listOn = document.getElementById('paneList').style.display !== 'none';
  b.classList.toggle('show', listOn && (uScr.scrollTop || 0) > 200);
}
var scrollTick = 0;
uScr.addEventListener('scroll', function () {
  // 浮动组避让须与滚动同节拍，不吃下面 120ms 节
  // 流，故置于节流门之前（仍是全页唯一 scroll 监
  // 听，其余三件事照旧节流）。-v150b5 起避让跟
  // 随改 rAF 逐帧驱动：iOS 内层滚动的 scroll 事
  // 件发得稀疏（惯性期常停下才补发），事件驱动
  // 的写入一格一格跳（真机判「瞬移」）；滚动期
  // 由 dodgeLoop 逐帧读分页条位置写浮动组、与内
  // 容同节拍。此处只置滚动标志、摘平滑过渡类、
  // 启循环（未跑时）。
  dodgeScrolling = true;
  dodgeScrollAt = Date.now();
  var flS = document.getElementById('ufloat');
  if (flS) flS.classList.remove('dodgesmooth');
  if (!dodgeRaf) dodgeLoop();
  neKbOnScroll();
  var now = Date.now();
  if (now - scrollTick < 120) return;
  scrollTick = now;
  // 搜索展开期间不记滚动位：预定位落地若有残余
  // 跳动，也不许污染 posMem 的位置记忆。
  if (!document.getElementById('usearch').classList.contains('open')) memLeave();
  uTopBtn();
  uSearchAutoHide();
}, { passive: true });
// 备注编辑键盘避让（-v163b4）：列表页是内滚架构
// （窗口不滚、#uscroll 内滚），iOS 原生「聚焦滚到
// 光标」只认窗口滚动、对内滚容器不作为；搜索胶囊
// 的键盘状态机又只服务 #usearch 展开态、只补偿浮
// 动组 transform，从不滚动内容——备注编辑器（.ne）
// 点开聚焦后无人把卡片滚进可见带，键盘升起、布局
// 视口收缩时编辑器下沿就留在键盘后面。本路径独立
// 于搜索状态机（不碰 stShift/stPair/kbDodge），但
// 沿用本页既有口径：120ms 轮询跟随几何（点开后约
// 520ms 几何才动、vv-resize 先行，单次滚动必然差
// 一截，故聚焦期间逐拍实测、分步校正到停稳）、
// 2px 材料门防抖、程序滚动先置 progScrollUntil
// 豁免（与位置回拉/平滑回顶同一口径，免得滚动监
// 听把这当手动滚动）。每拍只做最小揭示：编辑器
// 整体（含保存/取消行）须落在容器可见带内、下沿
// 留 12px 呼吸；已在带内不动。键盘收起后该位置
// 仍是合法滚动位，不回滚、不留错位；失焦或编辑
// 器关闭时 tick 自检自停，blur 监听再兜底停表。
var neKbTimer = 0, neKbTa = null, neKbEl = null;
// 平滑补间（-v163b5）：scrollTop 的写入改走 rAF
// 逐帧趋近，时长 280ms、easeOutCubic（与平滑回
// 顶 uScrollTop 同一缓动）。tick 仍按 120ms 拍实
// 测几何算绝对目标：已在向同一目标补间则不重启、
// 不排队；目标变了（键盘还在长高）就从当前位顺
// 势改向；材料门内的小差直接落位，终帧精确写目
// 标值。豁免在补间开始时按全程置位、逐帧再刷新，
// 覆盖整个动画期。用户手动滚动让路与平滑回顶同
// 一口径：wheel/touchstart 一到先取消进行中的补
// 间，不让动画跟手指对着干（看守本身仍按拍继续
// 校正，与 -v163b4 的持续照顾口径一致）；失焦或
// 编辑器关闭时 neKbStop 连补间一并停。
// 用户接管（-v163b7）：与管理台 pkb 同口径——
// 持续校正没有出口时，聚焦中拖动 #uscroll 会被
// 看守逐拍拉回、键盘也不收。本轮加接管判定：
// 真实手势开窗内、非程序写入的滚动位移逐事件
// 累计（经全页唯一 scroll 监听头部的
// neKbOnScroll 钩子接入，不新增 scroll 监听），
// 单次手势累计超过 NEKB_TAKEOVER_PX 即主动
// 失焦（键盘随之收起）、停看守停补间，本次
// 会话不再校正。阈值 -v163b7 初版为 32px，
// -v163b8 与 pkb 同步降到与本页材料门同量级
// 的 2px：真实手动拖动一产生实际位移就让
// 位；2px 以内不触发、纯点按不失焦。程序写
// 入逐次记位（neKbProgY/neKbProgAt）并有
// progScrollUntil 豁免，补间自身位移绝不误判；
// 手势窗内 tick 不发起校正。失焦无数据副作
// 用：备注的保存/取消都是显式按钮，blur 只停
// 看守，编辑器不关、草稿不丢，点回输入框即重
// 新聚焦、看守重启。
// 批 C 修正（中 3）：与管理台 pkb 同口径——接管
// 失焦只认触摸来源的手势窗（neKbTouchUntil），
// wheel 开的窗不再累计触发接管，桌面端滚轮滚动
// 不再误失焦；触摸路径语义一字未动。
var NEKB_DUR = 280;
var neKbAnim = 0, neKbFrom = 0, neKbTo = 0, neKbT0 = 0;
var NEKB_TAKEOVER_PX = 2;
var neKbUsrAcc = 0, neKbLastY = 0, neKbHoldUntil = 0, neKbProgY = -1, neKbProgAt = 0;
var neKbTouchUntil = 0;
function neKbAnimStop() {
  if (neKbAnim) { cancelAnimationFrame(neKbAnim); neKbAnim = 0; }
}
window.addEventListener('wheel', neKbAnimStop, { passive: true });
window.addEventListener('touchstart', neKbAnimStop, { passive: true });
function neKbGesture(ev) {
  var now = Date.now();
  if (now > neKbHoldUntil) neKbUsrAcc = 0;
  neKbHoldUntil = now + (ev && ev.type === 'wheel' ? 600 : 5000);
  if (ev && ev.type === 'touchstart') neKbTouchUntil = now + 5000;
  neKbLastY = uScr.scrollTop || 0;
}
function neKbGestureEnd() { neKbHoldUntil = Date.now() + 900; neKbTouchUntil = Date.now() + 900; }
window.addEventListener('touchstart', neKbGesture, { passive: true });
window.addEventListener('touchend', neKbGestureEnd, { passive: true });
window.addEventListener('touchcancel', neKbGestureEnd, { passive: true });
window.addEventListener('wheel', neKbGesture, { passive: true });
function neKbOnScroll() {
  var y = uScr.scrollTop || 0;
  var dy = y - neKbLastY;
  neKbLastY = y;
  if (!neKbTa) { neKbUsrAcc = 0; return; }
  var now = Date.now();
  if (now < progScrollUntil && now - neKbProgAt < 600 && Math.abs(y - neKbProgY) <= 1) return;
  if (now > neKbHoldUntil) return;
  if (now <= neKbTouchUntil) {
    neKbUsrAcc += Math.abs(dy);
    if (neKbTouchUntil < now + 600) neKbTouchUntil = now + 600;
  }
  if (neKbHoldUntil < now + 600) neKbHoldUntil = now + 600;
  if (neKbUsrAcc > NEKB_TAKEOVER_PX) neKbTakeover();
}
function neKbTakeover() {
  var ta = neKbTa;
  neKbStop();
  if (ta && ta.blur) ta.blur();
}
function neKbStop() {
  if (neKbTimer) { clearInterval(neKbTimer); neKbTimer = 0; }
  neKbAnimStop();
  neKbTa = null; neKbEl = null;
}
function neKbWatch(ta, ne) {
  neKbStop();
  neKbTa = ta; neKbEl = ne;
  neKbUsrAcc = 0; neKbHoldUntil = 0; neKbTouchUntil = 0;
  neKbLastY = uScr.scrollTop || 0;
  neKbProgY = neKbLastY; neKbProgAt = Date.now();
  neKbTimer = setInterval(neKbTick, 120);
  neKbTick();
}
function neKbScrollTo(target) {
  var cur = uScr.scrollTop || 0;
  if (neKbAnim && neKbTo === target) return;
  if (Math.abs(target - cur) <= 2) {
    neKbAnimStop();
    if (target !== cur) { progScrollUntil = Date.now() + 400; uScr.scrollTop = target; neKbProgY = target; neKbProgAt = Date.now(); }
    return;
  }
  neKbFrom = cur; neKbTo = target; neKbT0 = 0;
  progScrollUntil = Date.now() + NEKB_DUR + 200;
  if (!neKbAnim) neKbAnim = requestAnimationFrame(neKbStep);
}
function neKbStep(ts) {
  neKbAnim = 0;
  if (!neKbTa) return;
  if (!neKbT0) neKbT0 = ts;
  var p = Math.min(1, (ts - neKbT0) / NEKB_DUR);
  var e = 1 - Math.pow(1 - p, 3);
  progScrollUntil = Date.now() + 400;
  uScr.scrollTop = p >= 1 ? neKbTo : Math.round(neKbFrom + (neKbTo - neKbFrom) * e);
  neKbProgY = uScr.scrollTop || 0; neKbProgAt = Date.now();
  if (p < 1) neKbAnim = requestAnimationFrame(neKbStep);
}
function neKbTick() {
  var ta = neKbTa, ne = neKbEl;
  if (!ta || !ne || document.activeElement !== ta || !ne.classList.contains('open')) { neKbStop(); return; }
  if (Date.now() < neKbHoldUntil) return;
  var cr = uScr.getBoundingClientRect();
  var visH = window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight;
  var visBot = Math.min(cr.bottom, visH);
  var er = ne.getBoundingClientRect();
  var dy = 0;
  if (er.bottom > visBot - 12) dy = Math.ceil(er.bottom - (visBot - 12));
  else if (er.top < cr.top + 8) dy = Math.floor(er.top - (cr.top + 8));
  if (Math.abs(dy) <= 2) return;
  neKbScrollTo(Math.max(0, (uScr.scrollTop || 0) + dy));
}
// 未保存草稿口径（第十一轮修复批 C，中 5）：外壳
// 切页签前同源询问本页的 __hasUnsavedDraft。备注
// 编辑器打开且内容改过（与打开时存下的 data-orig
// 比对，两边都 trim，与保存口径一致）才算脏；搜
// 索词、筛选等页面状态不算草稿。
window.__hasUnsavedDraft = function () {
  var tas = document.querySelectorAll('.ne.open textarea');
  for (var i = 0; i < tas.length; i++) {
    var orig = tas[i].getAttribute('data-orig') || '';
    if (tas[i].value.trim() !== orig.trim()) return true;
  }
  return false;
};
var listLoading = false;
function showListLoading() {
  listLoading = true;
  progScrollUntil = Date.now() + 400;
  document.getElementById('list').innerHTML = '<div class="loadingbox"><div class="spinner"></div><div class="loadingtxt">加载中…</div></div>';
  var pg = document.querySelector('.pager');
  if (pg) pg.style.visibility = 'hidden';
  var cn = document.getElementById('cnt');
  if (cn) cn.style.visibility = 'hidden';
}
function showListDone() {
  listLoading = false;
  var pg = document.querySelector('.pager');
  if (pg) pg.style.visibility = '';
  var cn = document.getElementById('cnt');
  if (cn) cn.style.visibility = '';
  uFloatDodge(true);
  // 整页滑动中若新 pane 还停在入场位等数据，此刻
  // 补触发入场（与切换点后到者触发、只触发一次，
  // 标志在 viewRunBody 置位、此处消费）。
  if (viewAnim && viewEnterPending) {
    var vp = viewEnterPending;
    viewEnterPending = null;
    viewEnterStart(vp);
  }
}
function loadUsers() {
  var mySeq = ++loadSeq;
  showListLoading();
  var params = new URLSearchParams(qs.toString());
  params.set('state', filt);
  if (query) params.set('q', query);
  if (booted) {
    // 排序全站共用一个 sortMode 状态（-v161b1 方
    // 案一）：二级与一级同栏同选择，取数一律带当
    // 前值，不再为二级写死最后活跃·倒序。
    params.set('sort', sortMode);
    params.set('limit', PAGE);
  }
  // 未 boot 时一律不带 sort（第十轮审计·低3）：服
  // 务端按其配置默认序应答——正是 boot 时
  // uiDefaults 要回填的同一个值。此前二级兜底分
  // 支抢先写死 act_desc，与一级不带参的口径分裂，
  // 且领养时还会把配置默认顶掉、锁死整个会话。
  // boot 前点过的排序记在 sortTouched 里，领养以
  // 它为准（见下方响应处理）。
  if (curCursor) params.set('cursor', curCursor);
  if (pageAnchor > 0) params.set('page', pageAnchor);
  fetch('/api/users?' + params.toString())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (mySeq !== loadSeq) return;
      if (!d.ok) {
        document.getElementById('list').innerHTML = '<div class="empty">加载失败：' + (APPMODE ? '会话已失效，请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '无权访问或链接已过期，请回主菜单重新打开。') + '</div>';
        showListDone();
        return;
      }
      rows = d.users;
      // 游标翻页时服务端不再重算精确总数（回
      // null，第十轮审计）：沿用上次的精确值；
      // 第一页与页号模式恒带数字，照常刷新。
      if (typeof d.total === 'number') {
        listTotal = d.total;
      }
      nextCursor = d.nextCursor || null;
      if (pageAnchor > 0) {
        // 页号模式：以服务端回显的实际页号为准（超界钳到
        // 末页时本地页号随之修正），接回游标模式的凭据就是
        // 本次响应带回的 nextCursor。
        if (d.page) pageAnchor = d.page;
        pageJumpNext = nextCursor;
      }
      GROUP_C = d.group || '';
      if (!booted) {
        booted = true;
        var bootSort = '';
        if (d.uiDefaults) {
          if (d.uiDefaults.pageSize) PAGE = d.uiDefaults.pageSize;
          if (d.uiDefaults.sort) bootSort = sortNorm(d.uiDefaults.sort);
        }
        if (!sortTouched && bootSort) {
          sortMode = bootSort;
          sortChrome();
        }
        if (sortTouched && bootSort && bootSort !== sortMode) {
          // boot 前点过的排序与服务端默认序不同：本
          // 响应是按默认序取的数、与用户意图不符，
          // 不渲染，带当下 sortMode 立即重取一次
          // （审计·低3：此前点击会被领养无声覆写、
          // 等于没点）。
          loadUsers();
          return;
        }
      }
      if (!rows.length && (cursorStack.length || pageAnchor > 1)) {
        // 当前页被删空了：自动退回上一页。加载块保持不出，
        // 递归取数渲染后才收尾；滚动恢复也等最终渲染消费。
        // 锚定页按页号退一页；栈顶是跳页锚点标记时转页号
        // 模式退回锚定页；其余沿旧游标栈退页。
        if (pageAnchor > 1) {
          pageAnchor--;
        } else if (cursorStack.length && typeof cursorStack[cursorStack.length - 1] === 'string' && cursorStack[cursorStack.length - 1].indexOf('pg:') === 0) {
          pageAnchor = Number(cursorStack.pop().slice(3)) || 1;
          cursorStack = [];
          curCursor = '';
        } else {
          curCursor = cursorStack.pop();
        }
        loadUsers();
        return;
      }
      render();
      showListDone();
      if (pendingScrollY != null) {
        var ry = pendingScrollY;
        pendingScrollY = null;
        progScrollUntil = Date.now() + 400;
        requestAnimationFrame(function () { uScr.scrollTop = ry; });
      }
    })
    .catch(function () {
      if (mySeq !== loadSeq) return;
      document.getElementById('list').innerHTML = '<div class="empty">加载失败，' + (APPMODE ? '请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '请回主菜单重新打开。') + '</div>';
      showListDone();
    });
}

function resetAndLoad() {
  curCursor = '';
  cursorStack = [];
  pageAnchor = 0;
  pageJumpNext = null;
  loadUsers();
}

var ERROR_TEXT = { unauthorized: APPMODE ? '会话已失效，请关闭小程序后重新打开，或点小程序顶部的「重新进入」。' : '链接已过期，重新发送 /start 换新菜单', 'too large': '内容太长', 'bad json': '请求格式错误', 'bad userId': '参数错误', nonce_invalid: '操作凭据已失效，请重试' };
function translateError(d) {
  if (d && d.error && ERROR_TEXT[d.error]) d.error = ERROR_TEXT[d.error];
  return d;
}
var SENSITIVE_ACT = { delete: 1, pass: 1, trust: 1, block: 1, reset: 1, note: 1 };
function act(id, action, delTopic, note, extra) {
  var body = { u: AUTH.u, e: AUTH.e, s: AUTH.s, action: action, userId: id, deleteTopic: !!delTopic, note: note };
  if (extra) { for (var ek in extra) body[ek] = extra[ek]; }
  function send() {
    return fetch('/api/users/action', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); }).then(translateError);
  }
  if (!SENSITIVE_ACT[action]) return send();
  // 敏感动作先领一次性凭据：凭据绑 {动作, 目标, 语义参数}，
  // 5 分钟内有效、用后即焚，领不到就不执行动作。
  var params = {};
  if (action === 'delete') params = { deleteTopic: !!delTopic };
  if (action === 'trust') params = { trust: !!(extra && extra.trust) };
  if (action === 'block') params = { block: !!(extra && extra.block) };
  if (action === 'note') params = { note: note == null ? '' : String(note) };
  return fetch('/api/nonce', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ u: AUTH.u, e: AUTH.e, s: AUTH.s, scope: 'usrlist', action: action, target: id, params: params })
  }).then(function (r) { return r.json(); }).then(function (m) {
    if (!m || !m.ok || !m.nonce) return { ok: false, error: (m && m.error) || '凭据签发失败' };
    body.nonce = m.nonce;
    return send();
  });
}

function curPageNo() {
  if (pageAnchor > 0) return pageAnchor;
  // 栈底若是跳页锚点标记（'pg:N'），当前页号 = N + 其上
  // 叠着的游标页数（栈长）；普通游标栈沿旧口径 栈长+1。
  if (cursorStack.length && typeof cursorStack[0] === 'string' && cursorStack[0].indexOf('pg:') === 0) {
    return (Number(cursorStack[0].slice(3)) || 1) + cursorStack.length;
  }
  return cursorStack.length + 1;
}
function render() {
  memSave();
  var list = rows;
  document.getElementById('cnt').textContent = '共 ' + listTotal + ' 人';
  var l2c = document.getElementById('l2cnt');
  if (l2c) l2c.textContent = '共 ' + listTotal + ' 人';
  var pgSel = document.getElementById('pgsel');
  var totalPages = Math.max(1, Math.ceil((listTotal || 0) / PAGE));
  var curPg = curPageNo();
  if (curPg > totalPages) curPg = totalPages;
  pgSel.innerHTML = '';
  for (var pi = 1; pi <= totalPages; pi++) {
    var op = document.createElement('option');
    op.value = pi;
    op.textContent = '第 ' + pi + ' 页';
    pgSel.appendChild(op);
  }
  pgSel.value = curPg;
  document.getElementById('prev').disabled = pageAnchor > 0 ? pageAnchor <= 1 : !cursorStack.length;
  document.getElementById('next').disabled = pageAnchor > 0 ? !pageJumpNext : !nextCursor;
  var box = document.getElementById('list');
  box.textContent = '';
  if (!list.length) {
    var d = document.createElement('div');
    d.className = 'empty';
    d.textContent = '没有符合条件的访客';
    box.appendChild(d);
    uFloatDodge(true);
    return;
  }
  list.forEach(function (u) {
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
    if (u.passExp && u.passExp > Date.now()) {
      var bp = document.createElement('span');
      bp.className = 'badge b-pass';
      bp.textContent = '🎫 已发证 · 剩 ' + Math.max(1, Math.ceil((u.passExp - Date.now()) / 60000)) + ' 分钟';
      sub2.appendChild(bp);
    }
    if (u.trusted || u.exempt) {
      var bt = document.createElement('span');
      bt.className = 'badge b-pass';
      bt.textContent = '🤝 已信任';
      sub2.appendChild(bt);
    }
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
    ta.placeholder = '给这个访客写点备注（仅管理员可见）…';
    ne.appendChild(ta);
    ta.addEventListener('focus', function () { neKbWatch(ta, ne); });
    ta.addEventListener('blur', function () { neKbStop(); });
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
    rb.innerHTML = '<span class="ric">🔄</span>重置验证';
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
    nb.onclick = function () { ta.value = u.note || ''; ta.setAttribute('data-orig', u.note || ''); ne.className = 'ne open'; ta.focus(); neKbWatch(ta, ne); };
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
    if (u.state !== 'verified') {
      var pb = document.createElement('button');
      pb.className = 'ntb';
      var passLive = u.passExp && u.passExp > Date.now();
      pb.textContent = passLive ? '🎫 重新发放' : '🎫 通行证';
      pb.onclick = function () {
        pb.disabled = true;
        pb.textContent = '发送中…';
        act(u.id, 'pass', false).then(function (d) {
          if (d.ok) {
            u.passExp = d.passExp || u.passExp || 0;
            var pmins = d.passExp ? Math.max(1, Math.round((d.passExp - Date.now()) / 60000)) : 30;
            toast('✅ 通行证已发送，' + pmins + ' 分钟内有效');
            render();
          } else {
            pb.disabled = false;
            pb.textContent = passLive ? '🎫 重新发放' : '🎫 通行证';
            toast('操作失败：' + (d.error || ''));
          }
        });
      };
      ops.appendChild(pb);
    }
    var tOn = u.trusted || u.exempt;
    var tb = document.createElement('button');
    tb.className = 'ntb';
    tb.textContent = tOn ? '↩️ 取消信任' : '🤝 信任';
    tb.title = '🤝 信任：免验证、免限流与类型过滤、免超时清理（关键词封禁同样豁免）';
    tb.onclick = function () {
      tb.disabled = true;
      act(u.id, 'trust', false, undefined, { trust: !tOn }).then(function (d) {
        tb.disabled = false;
        if (d.ok) {
          u.trusted = !tOn;
          u.exempt = u.trusted;
          if (u.trusted) { u.state = 'verified'; u.passExp = 0; }
          toast(u.trusted ? '已设为信任，对方已通过验证' : '已取消信任');
          render();
        } else toast('操作失败：' + (d.error || ''));
      });
    };
    ops.appendChild(tb);
    var bOn = u.state === 'blocked';
    var bb = document.createElement('button');
    bb.className = 'ntb';
    bb.textContent = bOn ? '✅ 解封' : '🚫 屏蔽';
    bb.title = '屏蔽后对方发来的新消息会被立即删掉并丢弃，不再转发';
    bb.onclick = function () {
      bb.disabled = true;
      act(u.id, 'block', false, undefined, { block: !bOn }).then(function (d) {
        bb.disabled = false;
        if (d.ok) {
          if (!bOn) { u._st = u.state; u.state = 'blocked'; }
          else { u.state = u._st || (u.passExp ? 'pending_verification' : 'verified'); delete u._st; }
          toast(!bOn ? '已屏蔽该访客' : '已解除屏蔽');
          render();
        } else toast('操作失败：' + (d.error || ''));
      });
    };
    ops.appendChild(bb);
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
        if (d.ok) { toast('已删除记录'); loadUsers(); }
        else toast('操作失败：' + (d.error || ''));
      });
    }));
    cf.appendChild(mk('b', '连话题、私聊一起清空', function () {
      act(u.id, 'delete', true).then(function (d) {
        if (d.ok) { toast(d.wipe ? ('已清空：私聊删除 ' + d.wipe.private.ok + ' 条' + (d.wipe.private.failed ? '，' + d.wipe.private.failed + ' 条超过 48 小时删不掉' : '') + '，话题与记录已删除') : '已删除记录与话题'); loadUsers(); }
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
  uFloatDodge(true);
}

var qTimer = 0;
var uqEl = document.getElementById('uq');
function uSyncSearchChrome() {
  var box = document.getElementById('usearch');
  var has = !!uqEl.value.trim();
  box.classList.toggle('hasq', has);
  box.classList.toggle('dot', has && !box.classList.contains('open'));
}
function uExpandSearch() {
  var box = document.getElementById('usearch');
  if (kbTransit) kbTransitEnd();
  kbDodgeOff = true;
  box.classList.add('open');
  document.getElementById('ufloat').classList.add('kbd');
  uSyncSearchChrome();
  stW = window.innerWidth || 0;
  stLanded = false;
  stPair = 0;
  stFresh = (window.innerHeight - (window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight) <= 2) && document.activeElement !== uqEl;
  if (window.innerHeight <= (window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight) + 2) stFullIH = window.innerHeight;
  if (stVVH > 40 && stVVH < window.innerHeight - 40) stStage(stVVH);
  try { uqEl.focus({ preventScroll: true }); } catch (e) { uqEl.focus(); }
  ufDockForOpen();
  uDragWatchArm();
}
function uCollapseSearch() {
  var box = document.getElementById('usearch');
  if (!box.classList.contains('open')) return;
  kbCollapsing = true;
  kbWasStaged = stOn;
  if (stOn) stUnstage();
  stLanded = false;
  if (stPair !== 0) { stPair = 0; uFloatTransform(); }
  clearTimeout(stPairTimer);
  sqResetAll();
  if (stPendingBad) stLearnArm = true;
  stFresh = false;
  uDragWatchStop();
  kbTransitStart();
  box.classList.remove('open');
  if (!kbTransit) { document.getElementById('ufloat').classList.remove('kbd'); kbDodgeOff = false; uFloatDodge(true); }
  ufRestorePos();
  uqEl.blur();
  uSyncSearchChrome();
  kbCollapsing = false;
}
// 预定位：两轮探针实测——点开搜索约 520ms 内页
// 面几何不变；随后系统先经 vv-resize 报可视高
// vvH（742→368），约 25ms 后 window resize 落
// 地：窗口高塌缩到 vvH，并按塌缩前布局把位于旧
// 视口底部的聚焦输入框捞回塌缩后视口，文档被滚
// +Δ（Δ = 旧 ih − vvH − 7，与起始位置无关）；
// 收起时系统不做反向滚动，这一跳是单向棘轮。
// 故展开时先把浮动组钉到「塌缩后视口的底部」
// ——正是键盘到位后它本该在的位置，系统落地时
// 发现输入框已在视口内、调整量为零，页面纹丝
// 不动。不拦、不追、不冻。键盘高经 localStorage
// 学习；首开无记忆时 vv-resize 预警抢救定
// 位并纠偏落点；落地由 window resize 解
// 除预定位、恢复 bottom 锚（落点一致，无跳变）。
var stVVH = 0;
try { stVVH = parseInt(localStorage.getItem('usvvh') || '0', 10) || 0; } catch (e) {}
function stLearn(v) {
  // 下限与全站其他学习入口对齐（stFreshLand /
  // stPairSettle 均为 v > 40）：(0,40] 的瞬时值
  // （含 1px 挤压态的塌缩读数）不得写进 usvvh，
  // 免得学坏的高度让下次展开的预定位失效（第十
  // 轮审计·低7）。
  if (!(v > 40)) return;
  stVVH = v;
  try { localStorage.setItem('usvvh', String(v)); } catch (e) {}
}
var stOn = false, stLanded = false, stW = 0, stTarget = 0, stGap = 0;
var stFullIH = window.innerHeight || 0;
// 展开改淡入（-v150b9）：探针定版——学得键盘
// 高与落地值分毫不差（368＝368）、预定位落点
// 与最终位 diff＝0、全程零纠偏，几何与时序都
// 无误，干净展开却仍闪。定性：b5 的 480ms
// FLIP 滑动本身即闪源——#ufloat 是 backdrop-
// filter 大玻璃面，滑动逐帧重采样背板，374px
// 行程在录像里呈半透明拖影；又与键盘自身约
// 520ms 升起不同步，两层相对运动更显晃。本版
// 去滑动改淡入（opacity 是本页已验证的安全通
// 道，收起 transit 同理）：top 仍一步钉到
// targetTop（布局锚与 scroll-into-view 中性不
// 变、落点正确性与呈现解耦），呈现改由
// opacity 承担——staging 首次生效时浮动组自
// 0 以 .22s 淡入到 1，在键盘升起的约 520ms
// 窗口内完成、起点被键盘运动掩盖；淡入由定
// 时器驱动、不依赖 vv-resize 是否到达。重调
// （纠偏/抢救）只重钉 top、不再重淡，幅度个
// 位数像素且在淡入窗口内，不可见。300ms 后
// stFadeDone 清 inline 恢复常态；stUnstage 同
// 步清 opacity/过渡，收起侧 transit 的淡隐淡
// 现与回落形态不受残留影响。附带收益：展开
// 中途收起时 unstage 再无 transform 可 snap
// （探针第 2 次展开的脆弱点随 FLIP 一并消失）。
// -v151b7 载体换血（架构级）：240fps 外拍定罪
// 落地换锚丢层之后，b6 的淡隐掩护只是把丢帧
// 藏起来——锚切换本身仍在。本版釜底抽薪：
// bottom 锚终身不变，预定位改走 transform 补
// 偿（合成器矩阵更新、层不重建、不存在可丢
// 的 flush；WebKit 170280/146485 同类机制，
// backdrop-filter 在锚切换时再加重丢层）。展
// 开时以 stShift = max(0, innerHeight - vvH)
// 把浮动组提前顶到落地位（挡 scroll-into-
// view 平移的原理不变）；视口塌缩落地时锚自
// 身骑到目标位，stUnstage 把 stShift 归零，
// 屏幕位置全程不变，落地时刻的风格变更只剩
// 一个 transform 数值。#ufloat 的 transform
// 自此由单一写入点 uFloatTransform 统管：总
// 偏移 = -(stShift + kbDodgeY)，两分量各自
// 维护、永不写空（层常驻，CSS 基础规则已预
// 置 translate3d(0,0,0)）。rect 读数含全部
// transform 偏移，凡推算自然位置处一律加回
// 总偏移（stStage 的 gap 与 uFloatDodge 的
// 自然带各一处）。淡入整套不变（opacity 是
// 合成器属性、安全）。
var stFadeTimer = 0;
function stFadeDone() {
  var fl = document.getElementById('ufloat');
  if (fl) { fl.style.transition = ''; fl.style.opacity = ''; }
}
function stStage(vvH) {
  var fl = document.getElementById('ufloat');
  if (!fl) return;
  var rect = fl.getBoundingClientRect();
  var gap = window.innerHeight - (rect.bottom + stShift + kbDodgeY);
  stGap = gap;
  stTarget = vvH;
  stShift = Math.max(0, window.innerHeight - vvH);
  clearTimeout(stFadeTimer);
  kbDodgeApply(0);
  if (!stOn) {
    fl.style.transition = 'none';
    fl.style.opacity = '0';
    void fl.offsetHeight;
    fl.style.transition = 'opacity .22s ease';
    fl.style.opacity = '1';
  }
  stFadeTimer = setTimeout(stFadeDone, 300);
  stOn = true;
}
function stUnstage() {
  var fl = document.getElementById('ufloat');
  stShift = 0;
  stPair = 0;
  uFloatTransform();
  if (fl) { fl.style.transition = ''; fl.style.opacity = ''; }
  clearTimeout(stFadeTimer);
  stOn = false;
}
var stShift = 0;
// 拖动吸附分量（-v153p1 探针）：ufX/ufY 是浮动组相对
// 原位的摆放偏移，与 stShift/stPair/kbDodgeY 并列、仍
// 经唯一写入点推出；两者皆 0 时写入串与基线逐字相同。
// ufSide/ufBottom 是所存位置（bottom = 组下沿距视口底
// 的距离），ufHomeB/ufHomeR 为加载时实测的原位底距与
// 右距，ufDragOn 为拖动态（避让在此期间让位）。
var ufX = 0, ufY = 0;
var ufSide = 'right', ufBottom = -1, ufHomeB = 18, ufHomeR = 18, ufDragOn = false;
function uFloatTransform() {
  var fl = document.getElementById('ufloat');
  if (!fl) return;
  fl.style.transform = 'translate3d(' + (ufX ? ufX + 'px' : '0') + ',' + (-(stShift + stPair + kbDodgeY) + ufY) + 'px,0)';
}
function ufIsHome() {
  return ufSide === 'right' && (ufBottom < 0 || Math.abs(ufBottom - ufHomeB) < 1);
}
// 方案 A（-v151b9）：可信高度集 + 坏→好配对纠正。
// iOS 26 宿主侧故障（真机+研究双定案）：某些第三
// 方键盘（如微信输入法）在会话中切换进入时按基
// 础高度上报视口（vvH=417），其工具栏（42px）
// 画在上报框外、盖住页面底部；而新鲜展开时按完
// 整高度上报（vvH=375）、位置正确。覆盖条对页
// 面一切几何读数（ih/vvH/宿主 tgH）不可见，无从
// 直接测量——只能学：只信任新鲜展开（键盘关闭
// 态点开）落地的高度（usgood 可信集）；切换落地
// 停稳到曾被证坏的高度（uspair 有配对）时，按
// 差额以 stPair 分量把胶囊顶起。配对的学法：切
// 换落到未知高度先记 stPendingBad（不猜、不
// 顶），收起时武装，其后下一次新鲜落地若高度
// 不同，就记成一对（坏→好）；若相同，该高度新
// 鲜态本就干净、只补记可信集。防串扰：停稳到
// 别的高度（可信或已有配对）时清掉不相干的
// stPendingBad，免得把甲键盘的坏高度配到乙键
// 盘头上。对从未见过、又无配对的切换高度不做
// 任何猜测性顶起（防误伤正常新键盘）；不按
// UA/键盘名分支；不写死任何具体数值。存储读
// 写全程 try/catch，不可用时静默降级为不纠正。
// stPair 与 stShift/kbDodgeY 并列，仍经唯一写
// 入点 uFloatTransform 推出（总偏移三者之和）。
var stPair = 0, stPendingBad = 0, stLearnArm = false, stFresh = false, stPairTimer = 0;
var stGood = [], stPairs = {};
try { stGood = JSON.parse(localStorage.getItem('usgood') || '[]') || []; if (!Array.isArray(stGood)) stGood = []; } catch (e) {}
try { stPairs = JSON.parse(localStorage.getItem('uspair') || '{}') || {}; if (typeof stPairs !== 'object' || Array.isArray(stPairs)) stPairs = {}; } catch (e) {}
function stTrust(v) {
  var i = stGood.indexOf(v);
  if (i >= 0) stGood.splice(i, 1);
  stGood.push(v);
  while (stGood.length > 12) stGood.shift();
  try { localStorage.setItem('usgood', JSON.stringify(stGood)); } catch (e) {}
}
function stSetPair(bad, good) {
  stPairs[bad] = good;
  var ks = Object.keys(stPairs);
  while (ks.length > 8) { delete stPairs[ks[0]]; ks.shift(); }
  try { localStorage.setItem('uspair', JSON.stringify(stPairs)); } catch (e) {}
}
function stFreshLand() {
  if (!stFresh) return;
  stFresh = false;
  var arm = stLearnArm, bad = stPendingBad;
  stLearnArm = false; stPendingBad = 0;
  var v = window.visualViewport ? Math.round(window.visualViewport.height) : 0;
  if (!(v > 40)) return;
  stTrust(v);
  // -v151b10：新鲜落地即地面真值——本高度若挂着坏配对，
  // 当场删除并持久化自愈，免得日后切换落到它时被误顶。
  if (stPairs[v]) { delete stPairs[v]; try { localStorage.setItem('uspair', JSON.stringify(stPairs)); } catch (e) {} }
  if (arm && bad && bad !== v) { stSetPair(bad, v); }
}
function stPairArm() {
  clearTimeout(stPairTimer);
  stPairTimer = setTimeout(stPairSettle, 700);
}
function stPairSettle() {
  var box = document.getElementById('usearch');
  if (!box || !box.classList.contains('open')) return;
  if (!stLanded || stOn) return;
  if (!window.visualViewport) return;
  var v = Math.round(window.visualViewport.height);
  // -v151b10：开启判定改以 stFullIH（键盘关闭态记下的全高）
  // 为基准——本机布局随键盘同步收缩、开启态 ih 与 vvH 恒
  // 等，旧基准下三分支永不达；v > 40 下限另挡 ih=1 挤压态。
  if (!(v > 40 && stFullIH > 0 && v < stFullIH - 40)) { if (stPair !== 0) { stPair = 0; uFloatTransform(); } return; }
  if (stGood.indexOf(v) >= 0) { if (stPendingBad !== v) stPendingBad = 0; if (stPair !== 0) { stPair = 0; uFloatTransform(); } return; }
  var good = stPairs[v];
  if (good) {
    if (stPendingBad !== v) stPendingBad = 0;
    var lift = v - good;
    // 顶起量上限 160（第十轮审计·低7）：lift 的本
    // 义是坏高度多出的那截工具栏，实测配对差额
    // 42（417→375）；good 若被异常落地污染得过
    // 小，无上限的 lift 会把浮动组整体顶出屏外。
    // 160 约为实测差额的 4 倍——任何现实工具栏 /
    // 候选栏叠加都够不到，异常时顶到此为止、胶囊
    // 仍留在屏内。
    var np = lift > 2 ? Math.min(lift, 160) : 0;
    if (np !== stPair) { stPair = np; uFloatTransform(); }
    return;
  }
  if (stPair !== 0) { stPair = 0; uFloatTransform(); }
  stPendingBad = v;
}
// 键盘高度分叉探针日志层（历版真机验数用）已于 v1.5.1 干净版整层剥离；机制本体（transform 补偿、方案 A 配对纠正、1px 挤压看守）逐字不变。
// 收起 transit 淡隐换位（-v146b10）：b8 收起的可见毛病是
// 三件套叠加——.kbd 一摘、回顶钮就在半空（塌缩视口底部
// 线）先淡入，与胶囊一前一后动；视口恢复落地时浮动组
// 随 bottom 锚一次性跌落约 374px；胶囊宽度同时收缩。
// b9 曾以 top 过渡 glide 收起，动画横跨视口尺寸变化瞬
// 间、把页眉固定图层挤掉约一秒，已撤销——本版红线：
// 只许动画 opacity（回顶钮自身的 opacity 淡入淡出自
// v1.4.5 起天天运行、从未伤页眉，是安全通道）。键盘
// 开着时收起：浮动组先经 #ufloat 的 CSS opacity 过渡
// 150ms 淡出（.kbtransit），锚定解除、跌落、宽度收
// 缩、.kbd 摘除全部在不可见期间完成；视口恢复落地
// （b12 起改 120ms 轮询双量确认恢复，见下方 b12
// 注）后由 kbTransitEnd 摘淡隐类，浮动组以最终形
// 态在右下角淡入，用户只看到一次干净的淡隐淡现、没
// 有任何可见位移。桌面/无键盘收起不入 transit（窗口
// 高未塌缩），行为与 b8 逐字一致。淡出依赖 CSS 过
// 渡：展开淡入写在 inline 的 opacity 过渡会覆盖它，故
// 收起流程里 stUnstage（清 inline）必须先于入 transit
// ——uCollapseSearch 的调用顺序已保证，落地解除后
// inline 亦已清。
// b12 判据换血（收起侧探针实测）：blur/收起发生
// 时 ih 总是先行恢复满值（742）、vvH 仍停在塌缩
// 值（368），b10 的 ih 单量判据会误判「键盘没
// 开」拒发淡隐；且其后 vv 的恢复提交能在一帧内
// 完成（页眉 hd -187 跳回 0、胶囊 fl 378 跳回
// 616 同帧），650ms 定时器与 resize 的 ih 单量
// 结束都兜不住、全程可见——页眉与两按钮抽动的
// 实锤。故入 transit 改三选一：ih 塌缩、vvH 塌
// 缩、或本次收起前浮动组处于预定位（kbWasStaged，
// 由 uCollapseSearch 在 stUnstage 之前捕获 stOn
// 传入；本函数唯一调用方就是它）。结束改 120ms
// 轮询：至少隐满 350ms、且 ih 与 vvH 双量齐满
// 才 kbTransitEnd，1500ms 硬顶兜底；focus 与再
// 展开两条用户主动路径仍可提前结束（它们直调
// kbTransitEnd）。桌面/无键盘时三判据全假、不
// 入 transit，行为与 b8 一致。
var kbTransit = false, kbTransitPoll = 0, kbTransitAt = 0, kbCollapsing = false, kbWasStaged = false;
function kbTransitStart() {
  if (kbTransit) return;
  var staged = kbWasStaged;
  kbWasStaged = false;
  var vvNow = window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight;
  if (!(window.innerHeight < stFullIH - 40 || vvNow < stFullIH - 40 || staged)) return;
  kbTransit = true;
  kbTransitAt = Date.now();
  var fl = document.getElementById('ufloat');
  if (fl) fl.classList.add('kbtransit');
  clearInterval(kbTransitPoll);
  kbTransitPoll = setInterval(kbTransitPollTick, 120);
}
function kbTransitPollTick() {
  var el = Date.now() - kbTransitAt;
  if (el >= 1500) { kbTransitEnd(); return; }
  if (el < 350) return;
  if (window.innerHeight < stFullIH - 2) return;
  if (window.visualViewport && Math.round(window.visualViewport.height) < stFullIH - 2) return;
  kbTransitEnd();
}
function kbTransitEnd() {
  if (!kbTransit) return;
  clearInterval(kbTransitPoll);
  var fl = document.getElementById('ufloat');
  if (fl) { fl.classList.remove('kbtransit'); fl.classList.remove('kbd'); }
  uSyncSearchChrome();
  kbTransit = false;
  kbDodgeOff = false;
  uFloatDodge(true);
}
// 浮动组上移避让（-v150b1）：分页条随容器滚动进
// 入右下浮动组（#ufloat）占位区时，浮动组以
// transform 上移让开分页条、滚离自动回落。曾议
// 的「给滚动内容加底部留白」未采用：留白改变内
// 容几何、短列表平白多一截空白；避让只动浮动组
// 本人、不碰内容，main 的 padding 维持原样。几
// 何：浮动组自然占位（未施加 transform 时）的
// 上/下沿 = 当前 rect 上/下沿＋已施加的避让量
// kbDodgeY（translateY(-d) 把 rect 整体上移 d、
// 读数已含偏移，须加回扣除）。分页条竖带与自
// 然占位竖带相交时，上移量 = 自然下沿−分页条
// 上沿＋8px 呼吸：浮动组下沿恰好停在分页条上
// 沿之上 8px，整条分页（尤其右侧「下一页」）完
// 全露出；不相交归零。跟踪 1:1 即时：scroll 监
// 听内同步算、直接写 transform、不设过渡（#ufloat
// 的 transition 只含 opacity，transform 本就瞬
// 时）。作用域：搜索展开（staging 接管浮动组位
// 置）与 transit 期间避让清零禁用——uExpandSearch
// 入口清零并置 kbDodgeOff、kbTransitEnd 解禁重
// 算，uFloatDodge 自身再以 .open/kbTransit 双检
// 兜底。分页条不可见（统计页签、或加载中被
// visibility 隐藏）时归零。#ufloat 的 transform
// 此前无任何占用（回顶钮的 transform 在按钮自
// 身），本机制独占组上的 transform。
// -v150b5 顺滑化：滚动跟随改 rAF 逐帧（见
// dodgeLoop 与 scroll 监听头注），事件驱动的台
// 阶跳变消除；非滚动时刻的突变（渲染收尾、切页
// 签、resize、transit 结束等）经 kbDodgeApply 的
// animate 参走 .dodgesmooth 短过渡滑过去，不再
// 整段瞬移。choreography 内部写入（staging 交
// 接、禁用态归零）仍即时、不经此参。
var kbDodgeY = 0, kbDodgeOff = false, kbDodgeAnimTimer = 0;
function kbDodgeApply(v, animate) {
  var fl = document.getElementById('ufloat');
  if (animate && v !== kbDodgeY) {
    if (fl) {
      fl.classList.add('dodgesmooth');
      clearTimeout(kbDodgeAnimTimer);
      kbDodgeAnimTimer = setTimeout(function () { var f2 = document.getElementById('ufloat'); if (f2) f2.classList.remove('dodgesmooth'); }, 230);
    }
  } else if (!animate) {
    if (fl) fl.classList.remove('dodgesmooth');
    clearTimeout(kbDodgeAnimTimer);
  }
  kbDodgeY = v;
  uFloatTransform();
}
function uFloatDodge(animate) {
  var fl = document.getElementById('ufloat');
  if (!fl) return;
  var box = document.getElementById('usearch');
  if (kbDodgeOff || kbTransit || viewAnim || (box && box.classList.contains('open'))) return;
  if (ufDragOn || !ufIsHome()) { if (kbDodgeY !== 0) kbDodgeApply(0, animate); return; }
  var pg = document.querySelector('.pager');
  if (!pg || document.getElementById('paneList').style.display === 'none' || pg.style.visibility === 'hidden') { kbDodgeApply(0, animate); return; }
  var fr = fl.getBoundingClientRect();
  var natTop = fr.top + stShift + kbDodgeY, natBot = fr.bottom + stShift + kbDodgeY;
  var pr = pg.getBoundingClientRect();
  var need = 0;
  if (pr.bottom > natTop && pr.top < natBot) need = Math.round(natBot - pr.top + 8);
  if (need < 0) need = 0;
  kbDodgeApply(need, animate);
}
// 避让跟随的 rAF 循环（-v150b5）：滚动期逐帧重
// 算（即时写、无过渡——过渡在滚动中只会拖影）；
// 停机条件：距最后一次 scroll 事件 >150ms 且本
// 帧算出的 kbDodgeY 与上一帧相同（几何已稳）。
// 循环只在滚动期存活，由 scroll 监听头部启动。
var dodgeScrolling = false, dodgeScrollAt = 0, dodgeRaf = 0, dodgeLastY = -1;
function dodgeLoop() {
  uFloatDodge();
  var same = kbDodgeY === dodgeLastY;
  dodgeLastY = kbDodgeY;
  if (Date.now() - dodgeScrollAt > 150 && same) { dodgeRaf = 0; dodgeScrolling = false; return; }
  dodgeRaf = requestAnimationFrame(dodgeLoop);
}
// 1px 挤压看守（-v151b11 实验）：微信键盘在本页
// 会话首次唤出时，落地正确后约 350ms ih 与 vvH
// 同时塌为 1 并保持数秒（页面全黑），切换键盘才
// 恢复（真机两录定案）；深度研究无公开先例、
// 页面 CSS 救不了 1px 的原生框，唯一够得着的
// 动作是 provoke 宿主重算——候选
// Telegram.WebApp.expand()。看守挂在下方既有
// vv-resize 处理函数内（不新增任何监听器），对
// 既有机制只读：不碰 stShift/stPair/kbDodge 的
// 任何判定与写入；挤压期间 stPairSettle 的
// v>40 下限自保、不受影响。
var sqTimer = 0, sqResetTimer = 0, sqPending = false, sqEpisode = false, sqNudged = false;
function sqWatch(v) {
  var ih = window.innerHeight;
  if (ih <= 2 && v <= 2) {
    if (sqResetTimer) { clearTimeout(sqResetTimer); sqResetTimer = 0; }
    if (!sqPending && !sqEpisode) { sqPending = true; sqTimer = setTimeout(sqConfirm, 300); }
    return;
  }
  if (sqPending) { clearTimeout(sqTimer); sqTimer = 0; sqPending = false; }
  if (ih > 2 && v > 2) {
    if (sqNudged) { sqNudged = false; }
    if (sqEpisode && !sqResetTimer) sqResetTimer = setTimeout(sqResetDone, 1000);
  } else if (sqResetTimer) { clearTimeout(sqResetTimer); sqResetTimer = 0; }
}
function sqConfirm() {
  sqTimer = 0; sqPending = false;
  var box = document.getElementById('usearch');
  if (!box || !box.classList.contains('open')) return;
  if (!window.visualViewport) return;
  var v = Math.round(window.visualViewport.height);
  if (!(window.innerHeight <= 2 && v <= 2)) return;
  if (sqEpisode) return;
  sqEpisode = true; sqNudged = true;
  try {
    if (window.Telegram && Telegram.WebApp && typeof Telegram.WebApp.expand === 'function') { Telegram.WebApp.expand(); }
  } catch (e) {}
}
function sqResetDone() { sqResetTimer = 0; sqEpisode = false; }
function sqResetAll() {
  if (sqTimer) { clearTimeout(sqTimer); sqTimer = 0; }
  if (sqResetTimer) { clearTimeout(sqResetTimer); sqResetTimer = 0; }
  sqPending = false; sqEpisode = false; sqNudged = false;
}
// vv-resize 预警纠偏：真塌缩先到先学键盘高；未
// 预定位的直接重钉 top 抢救定位，已预定位但目
// 标差过 4 的重调 stStage 纠偏（-v150b9：FLIP
// 追赶已退役，纠偏只改布局锚，幅度个位数像素
// 且发生在淡入窗口内，不可见）。
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function () {
    var box = document.getElementById('usearch');
    if (!box || !box.classList.contains('open')) return;
    var v = Math.round(window.visualViewport.height);
    sqWatch(v);
    // 落地后追踪（-v151b8）：落地后 staging 关闭、浮
    // 动组只靠 bottom 锚，而会话中切换键盘时布局视
    // 口高度不跟随变化、锚停在旧键盘位置，新键盘高
    // 出的一截压住胶囊下部（真机定案；同键盘下收起
    // 重开按当前几何重算则完整）。故 open 且已落地
    // （且不在 staging——staging 期 stShift 由本处
    // 理器后段的纠偏分支独占）时，每次 vv-resize 以布
    // 局高与可视高之差重算补偿，经唯一写入点 uFloatTransform
    // 推出；差回落（切回矮键盘、或键盘收起 vvH 涨
    // 回全高）时 ns 归零、补偿自动放松。材质门 2px
    // 防抖。门控双保险：open 类由 uCollapseSearch
    // 同步摘除、stLanded 亦在收起时清零，收起后本
    // 分支永不执行，偏移不会复活。
    if (stLanded) {
      if (!stOn) {
        var ns = Math.max(0, window.innerHeight - v);
        if (Math.abs(ns - stShift) > 2) { stShift = ns; uFloatTransform(); }
        stPairArm();
      }
      return;
    }
    if (!(v < window.innerHeight - 40)) return;
    stLearn(v);
    if (!stOn) { stStage(v); return; }
    if (Math.abs(stTarget - v) > 4) stStage(v);
  });
}
// 落地解除：窗口高塌缩到预定位目标即恢复 bottom
// 锚（落点与预定位一致，无跳变）；若窗口高反而
// 回到目标之上 40 有余（键盘未落地先被关、或预
// 测偏差过大），同样解除，免得胶囊悬在半空。
// （本页自 -v146b14 起已无页眉补偿写入，见下方
// uFixPad 退役注。）
window.addEventListener('resize', function () {
  if (!stOn || stLanded) return;
  if (!document.getElementById('usearch').classList.contains('open')) return;
  if (window.innerHeight <= stTarget + 2) { stLanded = true; stUnstage(); stFreshLand(); stPairArm(); return; }
  if (window.innerHeight > stTarget + 40) stUnstage();
});
// 滚动自动收缩：挂在全页唯一的节流滚动监听尾部调用；
// 程序滚动（位置恢复的一跳、平滑回顶动画、加载引起的
// 滚动钳制）经 progScrollUntil 抑制窗口豁免，只认手动
// 滚动。收缩只收形态：搜索词与结果保留、dot 留痕。
function uSearchAutoHide() {
  if (Date.now() < progScrollUntil) return;
  if (document.activeElement === uqEl) return;
  uCollapseSearch();
}
uqEl.addEventListener('input', function (e) {
  uSyncSearchChrome();
  var v = e.target.value.trim();
  clearTimeout(qTimer);
  qTimer = setTimeout(function () {
    if (v === query) return;
    memLeave();
    query = v;
    enterKey();
  }, 300);
});
uqEl.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); uCollapseSearch(); }
});
// blur 并入统一收起（-v146b11）：b10 的 blur 监听只
// 入 transit、不解锚也不收起——按键盘自带收起键
// ⌄ 时键盘被系统收走、页面只收到 blur，胶囊以展开
// 姿势被晾在塌缩视口底部线（top 锚）上悬停，等恢
// 复 resize 的安全阀晚到才掉下去；blur 晚到时窗口
// 高已恢复、kbTransitStart 的 ih 判据又直接放行，
// 连淡隐都没有——与点按钮收起（走 uCollapseSearch：
// 先解锚再淡隐）表现完全两样。本版 blur 改走同一
// 条收起流水线：搜索还开着且不在收起流程中，就直
// 接调 uCollapseSearch()，解锚/transit/摘 .kbd 全
// 由它接管，只剩一条收起路径。防递归：
// uCollapseSearch 入口置 kbCollapsing、函数尾清
// 零，其内程序化 blur() 触发本监听时见标志直接跳
// 过（且 .open 在 blur() 前已摘除，.open 守卫是第
// 二重保险）。
// 胶囊内失焦豁免：点 × 清除键（uxbtn）或放大镜钮
// （usbtn）时焦点可能从输入框移开、触发 blur，绝
// 不能因此收起。两层判读：① blur 的 relatedTarget
// 落在 #usearch 内 → 跳过；② relatedTarget 在部分
// WebView 为 null 不可靠，再看触摸兜底——kbTouchAt
// 是最近一次 touchstart 的时刻、kbTouchOut 记其目
// 标在胶囊外（true）/内（false）：仅当最近触摸在
// 胶囊内且距今 <500ms 才跳过（点按引起的失焦必
// 然紧随其 touchstart）。时近性不可省：⌄ 路径里
// 最后一次页面触摸往往正是开搜索时点的放大镜/输
// 入框（同在胶囊内），若只看「在内」不看时近，要
// 修的 ⌄ 路径会被自己豁免掉。两层都判在外才收起。
uqEl.addEventListener('blur', function (e) {
  if (kbCollapsing) return;
  var box = document.getElementById('usearch');
  if (!box || !box.classList.contains('open')) return;
  var rt = e ? e.relatedTarget : null;
  if (rt && rt.closest && rt.closest('#usearch')) return;
  if (!kbTouchOut && Date.now() - kbTouchAt < 500) return;
  uCollapseSearch();
});
// 再聚焦兜底：键盘被系统收起键关掉、搜索还开着时，
// 再点输入框要重新预定位（展开端点的 staging 只在
// uExpandSearch 里发生，单独点输入框不会走）。tran-
// sit 未尽先结束淡隐、恢复可见；.kbd 随聚焦补回
// （键盘将起、回顶钮当藏，与展开端点口径一致）。
uqEl.addEventListener('focus', function () {
  var box = document.getElementById('usearch');
  if (!box || !box.classList.contains('open')) return;
  if (kbTransit) kbTransitEnd();
  document.getElementById('ufloat').classList.add('kbd');
  if (!stOn && stVVH > 40 && stVVH < window.innerHeight - 40) stStage(stVVH);
  uDragWatchArm();
});
// 键盘期真实拖动收起：展开且聚焦时，在胶囊外拖动超
// 过 12px 识别为「想滚动」的意图，即收起搜索（blur
// 连带退键盘）；胶囊内的触摸（点输入框、点 ×）不触
// 发。桌面滚轮同理：聚焦中滚轮即收起，对齐「滚动时
// 收回」。
var kbTouchY = null, kbTouchX = null, kbTouchOut = false, kbTouchAt = 0;
document.addEventListener('touchstart', function (e) {
  kbTouchOut = !(e.target && e.target.closest && e.target.closest('#usearch'));
  kbTouchAt = Date.now();
  kbTouchY = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
  kbTouchX = (e.touches && e.touches[0]) ? e.touches[0].clientX : null;
}, { passive: true });
document.addEventListener('touchmove', function (e) {
  if (!document.getElementById('usearch').classList.contains('open') || document.activeElement !== uqEl || kbTouchY === null || !kbTouchOut) return;
  var y = (e.touches && e.touches[0]) ? e.touches[0].clientY : null;
  if (y === null) return;
  if (Math.abs(y - kbTouchY) > 12) { kbTouchY = null; uCollapseSearch(); }
}, { passive: true });
document.addEventListener('wheel', function () {
  if (document.activeElement === uqEl) uCollapseSearch();
}, { passive: true });
// y 位移拖动监视（-v146b12）：收起侧探针实测——
// 此 WebView 原生滚动期间 touchmove 根本不送达
// （2.7s 连续滚动零条记录、y 变化只有采样能看
// 见），而 uSearchAutoHide 对聚焦态豁免，于是键
// 盘开着拖动时无人收起，vv 几何提交还被持续触
// 摸推迟、页眉被 vv 平移带到 hd -187。故改以
// 100ms 采样容器 scrollTop 对基准 y0：位移 >24px
// 即判定真实拖动，收起并停表。y0 在武装时（展
// 开端点与 focus 兜底）记当时滚动位；progScroll-
// Until 抑制窗内只刷新 y0 不判位移（程序滚动/
// 位置恢复不误触）；搜索关闭或输入框失焦由 tick
// 自检停表（失焦后归 blur 与 AutoHide 路径管）。
// 单实例：重复武装只刷新 y0、不叠表；收起流程
// 内亦停表（uCollapseSearch）。
var uDragY0 = 0, uDragTimer = 0;
function uDragWatchArm() {
  uDragY0 = uScr.scrollTop || 0;
  if (uDragTimer) return;
  uDragTimer = setInterval(function () {
    var box = document.getElementById('usearch');
    if (!box || !box.classList.contains('open') || document.activeElement !== uqEl) { uDragWatchStop(); return; }
    var y = uScr.scrollTop || 0;
    if (Date.now() < progScrollUntil) { uDragY0 = y; return; }
    if (Math.abs(y - uDragY0) > 24) { uDragWatchStop(); uCollapseSearch(); }
  }, 100);
}
function uDragWatchStop() {
  if (uDragTimer) { clearInterval(uDragTimer); uDragTimer = 0; }
}
// 点空白收起（-v146b12）：空白处是非可聚焦元
// 素、不产生 blur（点按钮会、rt=null 实测），
// b11 的 blur 统一收起等不到信号。改以点按识别
// 补位：touchstart 在胶囊外落点（kbTouchOut），
// touchend 时搜索还开着、时长 <400ms、位移
// <12px 即点按，调 uCollapseSearch()。胶囊内
// 触摸不触发；点 chip/页签/分页同样会先经此路
// 收起，与它们自身的收起调用重复、但被 .open
// 守卫与 kbCollapsing 挡住，无害。
document.addEventListener('touchend', function (e) {
  if (!kbTouchOut || !kbTouchAt) return;
  var box = document.getElementById('usearch');
  if (!box || !box.classList.contains('open')) return;
  if (Date.now() - kbTouchAt >= 400) return;
  var t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
  if (!t || kbTouchX === null || kbTouchY === null) return;
  var dx = t.clientX - kbTouchX, dy = t.clientY - kbTouchY;
  if (Math.sqrt(dx * dx + dy * dy) < 12) uCollapseSearch();
}, { passive: true });
// 左右横滑切换六视图（-v150b1 新增，此功能从未
// 有过；-v155b2 增「被屏蔽」一格）：顺序 [全部,
// 已验证, 待验证, 已屏蔽, 被屏蔽, 数据统计]，
// 左滑下一格、右滑上一格，到头不循
// 环。识别放在 touchmove 阶段（|dx|≥56 且
// |dx|≥1.6|dy|），赶在 touchend 的 click 之前
// 就置好抑制戳 swipeAt；切换本体借道现行入口
// （chip 的 .click() 与 showTab），自家调用以
// swipeSelf 标记绕过两处入口的 swipeAt 守卫——
// 守卫只拦手势收尾落在 chip/页签上的那记真实
// click（横滑起手在 chip 上时它会把视图又切回
// 去）。一滑一格：识别后本手势锁定、touchend
// 解锁。豁免：起点在 #usearch 内、搜索输入框
// 正聚焦、起点在 select 上。与点空白（位移
// <12px）天然正交；拖动监视只看纵向 scrollTop，
// 横滑不改变它，互不干扰。当前视图判定：统计
// 侧看 paneStats 的 display、列表侧看 filt。
var swipeViews = ['all', 'verified', 'pending', 'blocked', 'botblocked', 'stats'];
var swipeAt = 0, swipeSelf = false;
var swipeX0 = null, swipeY0 = null, swipeLock = false, swipeOff = true;
function swipeCurIdx() {
  if (document.getElementById('paneStats').style.display !== 'none') return swipeViews.length - 1;
  var i = swipeViews.indexOf(filt);
  return i >= 0 ? i : 0;
}
function swipeGo(idx) {
  var v = swipeViews[idx];
  swipeSelf = true;
  if (v === 'stats') {
    showTab('stats');
  } else {
    if (document.getElementById('paneStats').style.display !== 'none') showTab('list');
    var cs = document.querySelectorAll('.chip');
    for (var i = 0; i < cs.length; i++) {
      if (cs[i].dataset.f === v) { cs[i].click(); break; }
    }
  }
  swipeSelf = false;
}
document.addEventListener('touchstart', function (e) {
  var t = (e.touches && e.touches[0]) ? e.touches[0] : null;
  swipeLock = false;
  swipeOff = !t;
  swipeX0 = t ? t.clientX : null;
  swipeY0 = t ? t.clientY : null;
  if (!t) return;
  if (document.activeElement === uqEl) swipeOff = true;
  var el = e.target;
  if (el && el.closest && (el.closest('#usearch') || el.closest('select'))) swipeOff = true;
}, { passive: true });
document.addEventListener('touchmove', function (e) {
  // 二级模式下横滑切视图禁用（站序本身不变，进出
  // 二级只走统计块点击与 #l2back 返回）。
  if (l2Mode || swipeOff || swipeLock || swipeX0 === null || swipeY0 === null) return;
  var t = (e.touches && e.touches[0]) ? e.touches[0] : null;
  if (!t) return;
  var dx = t.clientX - swipeX0, dy = t.clientY - swipeY0;
  if (Math.abs(dx) >= 56 && Math.abs(dx) >= 1.6 * Math.abs(dy)) {
    swipeLock = true;
    swipeAt = Date.now();
    var cur = swipeCurIdx();
    var nxt = cur + (dx < 0 ? 1 : -1);
    if (nxt < 0) nxt = 0;
    if (nxt > swipeViews.length - 1) nxt = swipeViews.length - 1;
    if (nxt !== cur) swipeGo(nxt);
  }
}, { passive: true });
document.addEventListener('touchend', function () {
  swipeLock = false;
  swipeX0 = null;
  swipeY0 = null;
}, { passive: true });
// 展开中途宽度突变（旋转屏幕）直接收起，保预定
// 位假设成立；键盘开合只改高度、不动宽度，不会
// 误触。
window.addEventListener('resize', function () {
  if (!document.getElementById('usearch').classList.contains('open')) return;
  if (stW && (window.innerWidth || 0) !== stW) uCollapseSearch();
});
window.addEventListener('resize', function () { uFloatDodge(true); });
// 六视图整页滑动（-v150b5）：旧切换读作硬切——
// 旧列表先被清空（或闪一下转圈）、新列表才以
// .in-r/.in-l 小滑入场，页签高亮瞬间变色。新法
// 整页滑动：当前 pane 先朝切换方向退场
// （transform＋opacity .22s），230ms 后执行原切
// 换本体（筛选/页签状态、loadUsers 路径、位置记
// 忆的存取时机全部原样），新 pane 停在对侧入场
// 位、数据就绪后以 .26s 滑入；spinner 若未就绪
// 就在停驻的 pane 里转，showListDone 补触发入场
// （viewEnterPending 标志、只触发一次）。viewAnim
// 二合一：动画锁（两 funnel 最前端拦截动画中的
// 真实再切换）＋避让暂停闩（uFloatDodge 禁用判
// 断并入——分页条随 pane 位移期间不读其 rect）。
// 释放唯一出口 viewSlideFinish（入场定时器与
// 1400ms 兜底都直调它），不许有第二条释放路径
// ——b150b1 闩锁泄漏的教训。借道组合（横滑离开
// 统计页时 swipeGo 先 showTab('list') 再
// chip.click()，两步同在一同步段）：第一步起滑
// 后，第二步本体经 viewChain 串到待执行本体之
// 后，两步仍按原序在 230ms 点一并执行、最终视
// 图不错位。
var viewAnim = false, viewDir = 1, viewBody = null, viewBodyRan = false;
var viewBodyTimer = 0, viewEnterTimer = 0, viewFallbackTimer = 0, viewEnterPending = null;
function viewCurPane() {
  return document.getElementById('paneList').style.display !== 'none' ? document.getElementById('paneList') : document.getElementById('paneStats');
}
function viewChain(fn) {
  var prev = viewBody;
  viewBody = function () { if (prev) prev(); fn(); };
}
function viewSlideBegin(dir, bodyFn) {
  viewAnim = true;
  viewDir = dir;
  viewBody = bodyFn;
  viewBodyRan = false;
  viewEnterPending = null;
  clearTimeout(viewFallbackTimer);
  viewFallbackTimer = setTimeout(viewSlideFinish, 1400);
  var cp = viewCurPane();
  cp.style.transition = 'transform .22s ease, opacity .22s ease';
  cp.style.transform = 'translateX(' + (dir > 0 ? -28 : 28) + 'px)';
  cp.style.opacity = '0';
  clearTimeout(viewBodyTimer);
  viewBodyTimer = setTimeout(viewRunBody, 230);
}
function viewRunBody() {
  if (viewBodyRan) return;
  viewBodyRan = true;
  var b = viewBody;
  viewBody = null;
  if (b) b();
  if (!viewAnim) return;
  var np = viewCurPane();
  np.style.transition = '';
  np.style.transform = 'translateX(' + (viewDir > 0 ? 28 : -28) + 'px)';
  np.style.opacity = '0';
  if (np === document.getElementById('paneList') && listLoading) { viewEnterPending = np; return; }
  viewEnterStart(np);
}
function viewEnterStart(p) {
  void p.offsetWidth;
  p.style.transition = 'transform .26s ease, opacity .26s ease';
  p.style.transform = 'translateX(0px)';
  p.style.opacity = '1';
  clearTimeout(viewEnterTimer);
  viewEnterTimer = setTimeout(viewSlideFinish, 280);
}
function viewSlideFinish() {
  if (!viewAnim) return;
  clearTimeout(viewFallbackTimer);
  clearTimeout(viewBodyTimer);
  clearTimeout(viewEnterTimer);
  clearTimeout(l2AnimTimer);
  viewEnterPending = null;
  var pl = document.getElementById('paneList'), ps = document.getElementById('paneStats');
  if (pl) { pl.style.transition = ''; pl.style.transform = ''; pl.style.opacity = ''; }
  if (ps) { ps.style.transition = ''; ps.style.transform = ''; ps.style.opacity = ''; }
  // 二级推入/滑出的落地与收滑板也收口在这里（二
  // 级转场同样持 viewAnim 锁）：先按 l2LandFn 落地
  // （落地里 showTabBody 的 slideIn 在锁未释放时天
  // 然短路、不与推入叠加），再经 l2SlabOff 把滑板
  // 两元素恢复流内。
  if (l2LandFn) { var l2Lf = l2LandFn; l2LandFn = null; l2Lf(); }
  if (l2Anim) { l2Anim = 0; l2SlabOff(); }
  viewAnim = false;
  uFloatDodge(true);
}
document.getElementById('usbtn').onclick = function () {
  var box = document.getElementById('usearch');
  if (box.classList.contains('open')) uCollapseSearch();
  else uExpandSearch();
};
document.getElementById('uxbtn').onclick = function () {
  if (!uqEl.value) return;
  uqEl.value = '';
  uSyncSearchChrome();
  clearTimeout(qTimer);
  if (query) {
    memLeave();
    query = '';
    enterKey();
  }
  uqEl.focus();
};
document.getElementById('chips').addEventListener('click', function (e) {
  if (!swipeSelf && Date.now() - swipeAt < 350) return;
  if (!e.target.dataset || !e.target.dataset.f) return;
  var nf = e.target.dataset.f;
  if (viewAnim) {
    // 借道组合的第二步串到待执行本体之后；真实
    // 再切换在动画中拦截（见整页滑动块注）。
    if (swipeSelf && !viewBodyRan) viewChain(function () { chipSwitch(nf); });
    return;
  }
  var cur = swipeCurIdx();
  if (swipeViews.indexOf(nf) === cur) { chipSwitch(nf); return; }
  viewSlideBegin(swipeViews.indexOf(nf) > cur ? 1 : -1, function () { chipSwitch(nf); });
});
function chipSwitch(nf) {
  uCollapseSearch();
  var order = ['all', 'verified', 'pending', 'blocked', 'botblocked'];
  var ni = order.indexOf(nf);
  var dir = ni >= prevFiltIdx ? 1 : -1;
  prevFiltIdx = ni;
  if (nf === filt) {
    // 重复点当前筛选：沿旧行为回第一页重取。
    resetAndLoad();
    uScrollTop();
    return;
  }
  memLeave();
  filt = nf;
  var cs = document.querySelectorAll('.chip');
  for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (cs[i].dataset.f === filt ? ' on' : '');
  var had = enterKey();
  slideIn(document.getElementById('list'), dir);
  if (!had) uScrollTop();
}
document.getElementById('sortrow').addEventListener('click', function (e) {
  if (!swipeSelf && Date.now() - swipeAt < 350) return;
  // 转场中与 chips 同口径直接忽略（第十轮审计·低
  // 6）：动画期改 sortMode / 清 posMem，会被待执行
  // 本体按旧快照覆盖、还白打一次请求；转场最长
  // 280ms，落定后重点即可。
  if (viewAnim) return;
  var b = e.target;
  if (!b || !b.dataset || (!b.dataset.sf && !b.dataset.sd)) return;
  var nm = b.dataset.sf
    ? b.dataset.sf + '_' + sortDirn()
    : sortField() + '_' + b.dataset.sd;
  if (nm === sortMode) return;
  sortMode = nm;
  sortTouched = true;
  sortChrome();
  // 排序变了，各视图记住的旧位置全部作废。boot 时 uiDefaults
  // 回填组合是程序赋值、不经点击路径，不会误清。
  posMem = {};
  pendingScrollY = null;
  resetAndLoad();
  uScrollTop();
});
document.getElementById('prev').onclick = function () {
  if (viewAnim) return;
  uCollapseSearch();
  if (pageAnchor > 0) {
    if (pageAnchor > 1) { pageAnchor--; loadUsers(); uScrollTop(); }
    return;
  }
  if (!cursorStack.length) return;
  var topItem = cursorStack[cursorStack.length - 1];
  if (typeof topItem === 'string' && topItem.indexOf('pg:') === 0) {
    // 栈顶是跳页锚点标记：回锚定页改走页号模式一次取回。
    cursorStack = [];
    curCursor = '';
    pageAnchor = Number(topItem.slice(3)) || 1;
    pageJumpNext = null;
    loadUsers();
    uScrollTop();
    return;
  }
  curCursor = cursorStack.pop();
  loadUsers();
  uScrollTop();
};
document.getElementById('next').onclick = function () {
  if (viewAnim) return;
  uCollapseSearch();
  if (pageAnchor > 0) {
    if (pageJumpNext) {
      // 跳页后「下一页」接回游标模式：栈底垫跳页锚点标记，
      // 回程「上一页」据此转页号模式取回锚定页。
      cursorStack = ['pg:' + pageAnchor];
      curCursor = pageJumpNext;
      pageAnchor = 0;
      pageJumpNext = null;
      loadUsers();
      uScrollTop();
    }
    return;
  }
  if (nextCursor) { cursorStack.push(curCursor); curCursor = nextCursor; loadUsers(); uScrollTop(); }
};
document.getElementById('pgsel').addEventListener('change', function () {
  var sel = document.getElementById('pgsel');
  // 转场中忽略（审计·低6，与 chips 同口径），并把
  // 下拉显示拨回当前页：不拨回的话它会停在没生效
  // 的页号上误导。
  if (viewAnim) { sel.value = String(curPageNo()); return; }
  var n = Number(sel.value) || 1;
  uCollapseSearch();
  if (n === curPageNo()) return;
  if (n === 1) { resetAndLoad(); uScrollTop(); return; }
  // 页码直达：清空游标栈，以页号锚定一次取回目标页。
  curCursor = '';
  cursorStack = [];
  pageAnchor = n;
  pageJumpNext = null;
  loadUsers();
  uScrollTop();
});

function showTab(which) {
  if (!swipeSelf && Date.now() - swipeAt < 350) return;
  var target = which === 'stats' ? swipeViews.indexOf('stats') : swipeViews.indexOf(filt);
  var cur = swipeCurIdx();
  if (viewAnim) {
    if (swipeSelf && !viewBodyRan) viewChain(function () { showTabBody(which); });
    return;
  }
  if (target === cur) { showTabBody(which); return; }
  viewSlideBegin(target > cur ? 1 : -1, function () { showTabBody(which); });
}
function showTabBody(which) {
  var isStats = which === 'stats';
  if (isStats) uCollapseSearch();
  if (isStats) loadStats();
  document.getElementById('usearch').style.display = isStats ? 'none' : '';
  document.getElementById('paneList').style.display = isStats ? 'none' : '';
  document.getElementById('chips').style.display = isStats ? 'none' : '';
  document.getElementById('paneStats').style.display = isStats ? '' : 'none';
  // 页眉「共 N 人」只归列表页：统计页签下隐藏，
  // 免得把列表最后一次的数字带过去（-v160b6）。
  document.getElementById('cnt').style.display = isStats ? 'none' : '';
  document.getElementById('tabList').className = 'tab' + (isStats ? '' : ' on');
  document.getElementById('tabStats').className = 'tab' + (isStats ? ' on' : '');
  slideIn(document.getElementById(isStats ? 'paneStats' : 'paneList'), isStats ? 1 : -1);
  uScrollTop();
  uTopBtn();
  uFloatDodge(true);
}
document.getElementById('tabList').onclick = function () { showTab('list'); };
document.getElementById('tabStats').onclick = function () { showTab('stats'); };
document.getElementById('toTop').onclick = function () { uScrollTop(); };

// ===== 二级模式（数据统计人群块直达名单）=====
// 一级筛选仍是五个常用钮；统计总览的人群块是二级
// 入口：与一级钮同集的（全部 / 已验证 / 待验证 /
// 已屏蔽 / 被屏蔽）经 statsGo 借道现行 chip 路径，
// 一级里没有的（未开始 / 已信任 / 有话题 / 待用通
// 行证）进二级模式：filt 换成二级 state（posMem
// 按 filt 键天然隔离），顶栏换成 #l2head（‹ 返回
// + 人群名 + 共 N 人），页眉 / 筛选行隐藏，排序
// 行保留在位；排序与一级共用 sortMode（-v161b1
// 方案一：进出二级不改选择，二级内改了一级跟
// 随）；横滑在二级下禁用。点 ‹
// 回数据统计页签，并把 filt 还原为进入前的一级筛
// 选重取，二级状态不残留。
var L2_NAMES = { fresh: '未开始', trusted: '🤝 已信任', topic: '有话题', passes: '🎫 待用通行证' };
var l2Mode = null, l2PrevFilt = 'all';
function statsGo(act) {
  if (act === 'fresh' || act === 'trusted' || act === 'topic' || act === 'passes') { enterL2(act); return; }
  // 一级入口在转场期先结算（第十轮审计·低5）：整
  // 页滑入统计的入场期点一级人群块时，showTab 与
  // chip.click 都会在 viewAnim 下 early-return、点
  // 击无声丢失；与 enterL2 / exitL2 的打断口径一
  // 致，先 viewSlideFinish 就地落定再借道。
  if (viewAnim) viewSlideFinish();
  swipeSelf = true;
  if (document.getElementById('paneStats').style.display !== 'none') showTab('list');
  var cs = document.querySelectorAll('.chip');
  for (var i = 0; i < cs.length; i++) {
    if (cs[i].dataset.f === act) { cs[i].click(); break; }
  }
  swipeSelf = false;
}
// ===== 二级转场：整页自右推入（-v160b5）=====
// 二级不是横滑序列里的一站（左右方向语义不成立），
// 进出不再借 showTabBody 的 slideIn 写死方向、也不
// 再让表头硬切：转场期把二级页做成一块覆在当前页
// 之上的整页滑板——#l2head 与 #paneList 同步
// position:fixed、同一条 transform 过渡、同起同
// 落（.l2ov 标记成对出现/消失），进入自右推入
// .26s、退出向右滑出 .22s（与整页滑动的入场/退
// 场同族时长）。滑板实底（#0f141a）不透底；底下
// 的页面在滑板升起前先摆回目标布局，滑入时逐格
// 被盖、滑出时逐格露出，页头与内容不存在谁先谁
// 后的分离。动画锁仍是 viewAnim、释放仍只走
// viewSlideFinish 一个出口（它按 l2LandFn 执行落
// 地、再经 l2SlabOff 收滑板），1400ms 兜底同现行
// 口径；转场中被打断（动画中点 ‹、点页签、再点
// 统计块）先 viewSlideFinish 就地结算再走下一步，
// 不落错格、不残留状态。取数时机不变：进入点块
// 即 resetAndLoad，转圈在滑入的页面里转。
// -v163b2 滑板几何改量测口径：旧法以 left:0 /
// right:0 把 #paneList 拉成视口全宽（它流内受
// main 的 12px 边距与 #uscroll 的 scrollbar-
// gutter 约束、窄约 24px），排序行 space-
// between 的两组滑行期按全宽顶到两边、落地撤
// 板瞬间向中跳约 12px。新法 l2SlabOn 上板前先
// 量两元素流内矩形、左与宽逐像素照抄（#l2head
// 本是通栏，量得即全幅、照抄不缩），滑行全程
// 内容盒不变宽；停靠位移相应改按视口宽平移
// （按自身宽算的百分百在滑板变窄后会留一条
// 缝，视口宽保证整页出屏），推入与滑出同口径。
var l2Anim = 0, l2LandFn = null, l2AnimTimer = 0;
function l2SlabOn(topPx) {
  var hd = document.getElementById('l2head');
  var pl = document.getElementById('paneList');
  // 两条调用路径到这里时两元素都在流内：先量流
  // 内矩形，滑板的左与宽逐像素照抄（-v163b2，
  // 见转场块注）；量不到（宽为 0）退回旧口径拉
  // 满，行为不劣于旧版。
  var hdR = hd.getBoundingClientRect();
  var plR = pl.getBoundingClientRect();
  hd.classList.add('l2ov');
  pl.classList.add('l2ov');
  hd.style.position = 'fixed';
  hd.style.top = '0';
  if (hdR.width > 0) { hd.style.left = hdR.left + 'px'; hd.style.width = hdR.width + 'px'; hd.style.right = 'auto'; }
  else { hd.style.left = '0'; hd.style.right = '0'; }
  hd.style.zIndex = '4';
  pl.style.position = 'fixed';
  pl.style.top = topPx + 'px';
  if (plR.width > 0) { pl.style.left = plR.left + 'px'; pl.style.width = plR.width + 'px'; pl.style.right = 'auto'; }
  else { pl.style.left = '0'; pl.style.right = '0'; }
  pl.style.bottom = '0';
  pl.style.zIndex = '4';
  pl.style.background = '#0f141a';
}
function l2SlabOff() {
  var hd = document.getElementById('l2head');
  var pl = document.getElementById('paneList');
  hd.classList.remove('l2ov');
  pl.classList.remove('l2ov');
  hd.style.position = '';
  hd.style.top = '';
  hd.style.left = '';
  hd.style.right = '';
  hd.style.width = '';
  hd.style.zIndex = '';
  hd.style.transition = '';
  hd.style.transform = '';
  pl.style.position = '';
  pl.style.top = '';
  pl.style.left = '';
  pl.style.right = '';
  pl.style.width = '';
  pl.style.bottom = '';
  pl.style.zIndex = '';
  pl.style.transition = '';
  pl.style.transform = '';
  pl.style.background = '';
}
function l2PushIn() {
  viewAnim = true;
  l2Anim = 1;
  l2LandFn = l2PushLand;
  clearTimeout(viewFallbackTimer);
  viewFallbackTimer = setTimeout(viewSlideFinish, 1400);
  var hd = document.getElementById('l2head');
  var pl = document.getElementById('paneList');
  pl.style.display = '';
  document.getElementById('l2name').textContent = L2_NAMES[l2Mode] || '';
  document.getElementById('l2cnt').textContent = '';
  document.getElementById('l2head').style.display = 'flex';
  var hdH = hd.offsetHeight || 0;
  l2SlabOn(hdH);
  hd.style.transform = 'translateX(100vw)';
  pl.style.transform = 'translateX(100vw)';
  void pl.offsetWidth;
  hd.style.transition = 'transform .26s ease';
  pl.style.transition = 'transform .26s ease';
  hd.style.transform = 'translateX(0px)';
  pl.style.transform = 'translateX(0px)';
  clearTimeout(l2AnimTimer);
  l2AnimTimer = setTimeout(viewSlideFinish, 280);
}
function l2PushLand() {
  // 滑板完全盖住后，底下换成二级布局（slideIn 在
  // 锁未释放时短路，不与推入叠加），滑板随即由
  // viewSlideFinish 收回流内、无缝接上。
  showTabBody('list');
  document.getElementById('uhead').style.display = 'none';
  document.getElementById('chips').style.display = 'none';
}
function l2PopOut() {
  viewAnim = true;
  l2Anim = 2;
  l2LandFn = l2PopLand;
  clearTimeout(viewFallbackTimer);
  viewFallbackTimer = setTimeout(viewSlideFinish, 1400);
  var pl = document.getElementById('paneList');
  var topPx = Math.round(pl.getBoundingClientRect().top);
  // 底下先把统计页摆回原位（页眉与页签复位、统计
  // pane 显示并回顶），滑板仍顶着名单整页向右滑
  // 出、逐格露出。
  document.getElementById('paneStats').style.display = '';
  document.getElementById('tabList').className = 'tab';
  document.getElementById('tabStats').className = 'tab on';
  document.getElementById('usearch').style.display = 'none';
  document.getElementById('cnt').style.display = 'none';
  document.getElementById('uhead').style.display = '';
  l2SlabOn(topPx);
  uStopAnim();
  uScr.scrollTop = 0;
  var hd = document.getElementById('l2head');
  hd.style.transition = 'transform .22s ease';
  pl.style.transition = 'transform .22s ease';
  hd.style.transform = 'translateX(100vw)';
  pl.style.transform = 'translateX(100vw)';
  clearTimeout(l2AnimTimer);
  l2AnimTimer = setTimeout(viewSlideFinish, 240);
}
function l2PopLand() {
  document.getElementById('l2head').style.display = 'none';
  document.getElementById('uhead').style.display = '';
  document.getElementById('sortrow').style.display = '';
  showTabBody('stats');
  enterKey();
}
function enterL2(nf) {
  if (l2Mode === nf) return;
  // 转场未落定先结算（释放只走 viewSlideFinish），
  // 再从稳态进入，不叠两场动画。
  if (viewAnim) viewSlideFinish();
  uCollapseSearch();
  memLeave();
  if (!l2Mode) l2PrevFilt = filt;
  var wasL2 = !!l2Mode;
  l2Mode = nf;
  filt = nf;
  if (wasL2) {
    // 已在二级里换人群（界面上无此入口，程序兜
    // 底）：不走转场，原地换名单。
    document.getElementById('l2name').textContent = L2_NAMES[nf] || '';
    document.getElementById('l2cnt').textContent = '';
    resetAndLoad();
    uStopAnim();
    uScr.scrollTop = 0;
    return;
  }
  uStopAnim();
  uScr.scrollTop = 0;
  l2PushIn();
  resetAndLoad();
}
function exitL2() {
  if (!l2Mode) return;
  if (viewAnim) viewSlideFinish();
  uCollapseSearch();
  memLeave();
  l2Mode = null;
  filt = l2PrevFilt;
  l2PopOut();
}
document.getElementById('l2back').onclick = function () { exitL2(); };

function stile(v, l, sub, act) {
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
  if (sub != null) {
    var c = document.createElement('div');
    c.className = 'ss';
    c.textContent = sub;
    d.appendChild(c);
  }
  if (act) {
    // 可点人群块（仅访客总览组）：右侧 › 标记，点
    // 击经 statsGo 进对应名单；新增 / 活跃 / 消息
    // 量三组不传 act，保持只读、无标记。
    d.className = 'stile stlink';
    var ch = document.createElement('span');
    ch.className = 'stchev';
    ch.textContent = '›';
    d.appendChild(ch);
    d.onclick = function () { statsGo(act); };
  }
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
  // 加载失败不算已取：下次切到统计页签时重试。
  statsRequested = false;
  var box = document.getElementById('sgrid');
  box.textContent = '';
  var e = document.createElement('div');
  e.className = 'sloading';
  e.textContent = APPMODE ? '统计加载失败，请稍后重试；若反复失败，可能是会话已失效，请关闭小程序后重新打开。' : '统计加载失败（不影响访客列表）';
  box.appendChild(e);
}

// 统计懒加载（第十轮审计中 14）：此前页面一打开就
// 无条件预取整份统计，只看列表也全价付。改为首次
// 切到数据统计页签时才由 showTabBody 调 loadStats
// 取数，取到后缓存复用、后续切入不重取；失败不算
// 已取（statsFail 里复位标记），下次切入重试。
var statsRequested = false;
function loadStats() {
  if (statsRequested) return;
  statsRequested = true;
  // 取数期间在统计区显示与名单加载同一个转圈（共
  // 享 .loadingbox/.spinner/.loadingtxt，不另造一
  // 套）：成功渲染与 statsFail 都先清空 #sgrid，
  // 转圈随之消失、不会卡住；已取过再切入在上方
  // 已 return，内容不动、不闪转圈。
  var sbox = document.getElementById('sgrid');
  sbox.innerHTML = '<div class="loadingbox"><div class="spinner"></div><div class="loadingtxt">加载中…</div></div>';
  fetch('/api/stats?' + qs.toString())
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.ok) { statsFail(); return; }
      var box = document.getElementById('sgrid');
      box.textContent = '';
      box.appendChild(sgroup('访客总览', [
        stile(d.users.total, '访客总数', null, 'all'),
        stile(d.users.verified, '已验证', null, 'verified'),
        stile(d.users.pending, '待验证', null, 'pending'),
        stile(d.users.blocked, '已屏蔽', null, 'blocked'),
        stile(d.users.botBlocked, '被屏蔽', null, 'botblocked'),
        stile(d.users.fresh, '未开始', null, 'fresh'),
        stile(d.users.trusted, '已信任', null, 'trusted'),
        stile(d.users.withTopic, '有话题', null, 'topic'),
        stile(d.users.passes, '待用通行证', null, 'passes')
      ]));
      box.appendChild(sgroup('新增访客', [
        stile(d.growth.d1, '过去 24 小时'),
        stile(d.growth.d7, '过去 7 天'),
        stile(d.growth.d30, '过去 30 天')
      ]));
      box.appendChild(sgroup('活跃访客', [
        stile(d.active.d1, '过去 24 小时', '新 ' + d.activeNew.d1 + ' · 老 ' + d.activeOld.d1),
        stile(d.active.d7, '过去 7 天', '新 ' + d.activeNew.d7 + ' · 老 ' + d.activeOld.d7),
        stile(d.active.d30, '过去 30 天', '新 ' + d.activeNew.d30 + ' · 老 ' + d.activeOld.d30)
      ]));
      box.appendChild(sgroup('消息量（访客 / 管理员回复）', [
        stile(d.messages.in.d1 + ' / ' + d.messages.out.d1, '过去 24 小时'),
        stile(d.messages.in.d7 + ' / ' + d.messages.out.d7, '过去 7 天'),
        stile(d.messages.in.d30 + ' / ' + d.messages.out.d30, '过去 30 天')
      ]));
    })
    .catch(statsFail);
}

loadUsers();
// 页眉补偿退役（-v146b14）：列表页改内层容器滚动
// 后，页眉与筛选行都是普通流内块、位置由布局决
// 定，不再需要实测页眉高写 body padding 与 chips
// 吸顶 top；uFixPad 与其 resize 防抖监听整套删
// 除。另两页不在本页脚本内，各自的版式逻辑不受
// 影响。
var uAnim = 0;
function uStopAnim() {
  if (uAnim) { cancelAnimationFrame(uAnim); uAnim = 0; }
}
window.addEventListener('wheel', uStopAnim, { passive: true });
window.addEventListener('touchstart', uStopAnim, { passive: true });
var prevFiltIdx = 0;
function slideIn(el, dir) {
  if (!el || viewAnim) return;
  el.classList.remove('in-r', 'in-l');
  void el.offsetWidth;
  el.classList.add(dir >= 0 ? 'in-r' : 'in-l');
}
function uScrollTop() {
  var startY = uScr.scrollTop || 0;
  if (!startY) return;
  uStopAnim();
  var dist = Math.abs(startY);
  var dur = Math.min(600, Math.max(220, Math.round(dist * 0.35)));
  progScrollUntil = Date.now() + dur + 200;
  var t0 = 0;
  function uStep(ts) {
    if (!t0) t0 = ts;
    var p = Math.min(1, (ts - t0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    uScr.scrollTop = Math.round(startY * (1 - e));
    uAnim = p < 1 ? requestAnimationFrame(uStep) : 0;
  }
  uAnim = requestAnimationFrame(uStep);
}

// ===== 浮动组拖动吸附 =====
// 长按拖动 / 左右吸附 / 原位坞 / 左侧镜像展开 /
// sessionStorage 记忆（键 ufpos1，绝不写 localStorage）。
// 位置只存 {side, bottom}；模式（分页条避让是否生效）
// 每次由 ufIsHome() 按当前位置现算、不单独存储，杜绝
// 「拖过一次就永久手动」的闩锁。摆放全走唯一写入点
// 的 ufX/ufY 分量，CSS 锚点终身不动。吸附、展开坞
// 位、收起回位等一次性移动以 rAF 插值推进，不挂
// CSS transform 过渡：免与展开淡入的 inline 过渡、
// 键盘期的逐帧即时写入互相打架。
var ufHomeW = 48;
function ufDockX(w) {
  if (ufSide !== 'left') return 0;
  return Math.round(2 * ufHomeR + w - window.innerWidth);
}
function ufClosedY() {
  return Math.round(ufHomeB - (ufBottom < 0 ? ufHomeB : ufBottom));
}
function ufSyncSideClass() {
  var fl = document.getElementById('ufloat');
  if (fl) fl.classList.toggle('ufleft', ufSide === 'left');
}
function ufApplyClosed() {
  ufX = ufDockX(ufHomeW);
  ufY = ufClosedY();
  ufSyncSideClass();
  uFloatTransform();
}
function ufSavePos() {
  try { sessionStorage.setItem('ufpos1', JSON.stringify({ s: ufSide, b: Math.round(ufBottom) })); } catch (e) {}
}
var ufGlideTimer = 0, ufGlideFrom = null, ufGlideDst = null, ufGlideT0 = 0;
function ufGlideStop() {
  if (ufGlideTimer) { cancelAnimationFrame(ufGlideTimer); ufGlideTimer = 0; }
  ufGlideFrom = null;
  ufGlideDst = null;
}
function ufGlideTo(tx, ty, dur) {
  ufGlideStop();
  ufGlideFrom = { x: ufX, y: ufY };
  ufGlideDst = { x: tx, y: ty };
  ufGlideT0 = Date.now();
  var step = function () {
    if (!ufGlideFrom || !ufGlideDst) { ufGlideTimer = 0; return; }
    var p = Math.min(1, (Date.now() - ufGlideT0) / dur);
    var e = 1 - Math.pow(1 - p, 3);
    ufX = Math.round(ufGlideFrom.x + (ufGlideDst.x - ufGlideFrom.x) * e);
    ufY = Math.round(ufGlideFrom.y + (ufGlideDst.y - ufGlideFrom.y) * e);
    uFloatTransform();
    if (p < 1) { ufGlideTimer = requestAnimationFrame(step); return; }
    ufGlideTimer = 0;
    ufGlideFrom = null;
    ufGlideDst = null;
  };
  ufGlideTimer = requestAnimationFrame(step);
}
// 左侧展开/收起时胶囊宽度在动：横向偏移须逐帧按当
// 前组宽重算、把左缘钉在边距上；纵向同时朝目标收
// 敛（展开 = 坞位 0，收起 = 所存底距）。宽度与纵
// 向都稳住 3 帧后停表；开合状态翻转时自动改向。
var ufTrackOn = false, ufTrackMode = 'open', ufTrackStable = 0, ufTrackLastW = -1;
function ufTrackStart(mode) {
  ufTrackMode = mode;
  ufTrackStable = 0;
  ufTrackLastW = -1;
  if (ufTrackOn) return;
  ufTrackOn = true;
  requestAnimationFrame(ufTrackTick);
}
function ufTrackTick() {
  if (!ufTrackOn) return;
  var fl = document.getElementById('ufloat');
  var box = document.getElementById('usearch');
  if (!fl || !box) { ufTrackOn = false; return; }
  var open = box.classList.contains('open');
  if (ufTrackMode === 'open' && !open) ufTrackMode = 'closed';
  if (ufTrackMode === 'closed' && open) ufTrackMode = 'open';
  var w = fl.offsetWidth || 48;
  var targetY = ufTrackMode === 'open' ? 0 : ufClosedY();
  ufX = ufDockX(w);
  if (Math.abs(ufY - targetY) <= 1) ufY = targetY;
  else ufY = Math.round(ufY + (targetY - ufY) * 0.35);
  uFloatTransform();
  if (w === ufTrackLastW && ufY === targetY) ufTrackStable += 1;
  else ufTrackStable = 0;
  ufTrackLastW = w;
  if (ufTrackStable >= 3) { ufTrackOn = false; return; }
  requestAnimationFrame(ufTrackTick);
}
function ufDockForOpen() {
  if (ufSide === 'left') { ufGlideStop(); ufTrackStart('open'); return; }
  ufGlideTo(0, 0, 280);
}
function ufRestorePos() {
  if (kbTransit) {
    // 淡隐窗口内瞬时回位（不可见期完成，与基线收起
    // 编排同口径）；横向按收起后组宽（原位实测宽）算。
    ufGlideStop();
    ufTrackOn = false;
    ufX = ufDockX(ufHomeW);
    ufY = ufClosedY();
    ufSyncSideClass();
    uFloatTransform();
    return;
  }
  if (ufSide === 'left') { ufTrackStart('closed'); return; }
  ufGlideTo(0, ufClosedY(), 280);
}
var ufPressTimer = 0, ufPressPt = null, ufDragCtx = null, ufSwallowAt = 0;
function ufPt(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}
function ufPressCancel() {
  if (ufPressTimer) { clearTimeout(ufPressTimer); ufPressTimer = 0; }
  ufPressPt = null;
}
function ufOnPressStart(e) {
  if (e.type === 'mousedown' && e.button) return;
  var box = document.getElementById('usearch');
  if (!box || box.classList.contains('open')) return;
  var pane = document.getElementById('paneList');
  if (pane && pane.style.display === 'none') return;
  var t = e.target;
  if (!t || !t.closest || !t.closest('#ufloat')) return;
  if (t.closest('#uq')) return;
  ufPressPt = ufPt(e);
  if (ufPressTimer) clearTimeout(ufPressTimer);
  var p0 = ufPressPt;
  ufPressTimer = setTimeout(function () { ufDragBegin(p0); }, 250);
}
function ufDragBegin(p) {
  ufPressTimer = 0;
  var fl = document.getElementById('ufloat');
  if (!fl) return;
  var box = document.getElementById('usearch');
  if (box && box.classList.contains('open')) return;
  ufGlideStop();
  ufTrackOn = false;
  // 避让正顶着时先把避让量折进 ufY 初值再归零：
  // 合成偏移 -(stShift + stPair + kbDodgeY) + ufY
  // 在抓取帧前后逐像素不变，按钮组停在眼睛看到的
  // 位置开始跟手（收起态 stShift/stPair 恒 0，折
  // 入只动纵向分量）；拖动期间 kbDodgeY 恒 0，
  // 落点存的位置仍按拖动坐标系现算、不含避让
  // 量；拖动期间避让由 uFloatDodge 的门让位。
  if (kbDodgeY !== 0) { ufY -= kbDodgeY; kbDodgeApply(0); }
  ufDragOn = true;
  swipeOff = true;
  var r = fl.getBoundingClientRect();
  ufDragCtx = { sx: p.x, sy: p.y, x0: ufX, y0: ufY, left: r.left, top: r.top, w: r.width, h: r.height };
  fl.classList.add('ufdrag');
}
function ufOnMove(e) {
  if (ufDragOn && ufDragCtx) {
    if (e.cancelable) e.preventDefault();
    var p = ufPt(e);
    var vw = window.innerWidth, ih = window.innerHeight;
    var nl = ufDragCtx.left + (p.x - ufDragCtx.sx);
    var nt = ufDragCtx.top + (p.y - ufDragCtx.sy);
    if (nl < 6) nl = 6;
    if (nl > vw - ufDragCtx.w - 6) nl = vw - ufDragCtx.w - 6;
    if (nt < 6) nt = 6;
    if (nt > ih - ufDragCtx.h - 6) nt = ih - ufDragCtx.h - 6;
    ufX = ufDragCtx.x0 + Math.round(nl - ufDragCtx.left);
    ufY = ufDragCtx.y0 + Math.round(nt - ufDragCtx.top);
    uFloatTransform();
    var bd = ih - (nt + ufDragCtx.h);
    var hint = (nl + ufDragCtx.w / 2) >= vw / 2 && bd <= ufHomeB + 36;
    var fl = document.getElementById('ufloat');
    if (fl) fl.classList.toggle('ufhome', hint);
    return;
  }
  if (ufPressPt) {
    var q = ufPt(e);
    var dx = q.x - ufPressPt.x, dy = q.y - ufPressPt.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) ufPressCancel();
  }
}
function ufOnEnd() {
  if (!ufDragOn) { ufPressCancel(); return; }
  ufDragOn = false;
  ufSwallowAt = Date.now();
  var fl = document.getElementById('ufloat');
  var ctx = ufDragCtx;
  ufDragCtx = null;
  if (!fl || !ctx) return;
  fl.classList.remove('ufdrag');
  fl.classList.remove('ufhome');
  var r = fl.getBoundingClientRect();
  var vw = window.innerWidth, ih = window.innerHeight;
  var bd = Math.round(ih - r.bottom);
  var side = (r.left + r.width / 2) >= vw / 2 ? 'right' : 'left';
  var docked = false;
  if (side === 'right' && bd <= ufHomeB + 36) {
    ufSide = 'right';
    ufBottom = ufHomeB;
    docked = true;
  } else {
    ufSide = side;
    ufBottom = bd;
  }
  ufSyncSideClass();
  ufSavePos();
  ufGlideTo(ufDockX(fl.offsetWidth || 48), ufClosedY(), 280);
  setTimeout(function () { uFloatDodge(true); }, 300);
}
function ufPosInit() {
  var fl = document.getElementById('ufloat');
  if (!fl) return;
  var r = fl.getBoundingClientRect();
  if (r && r.width > 10) {
    ufHomeW = Math.round(r.width);
    ufHomeB = Math.round(window.innerHeight - r.bottom);
    ufHomeR = Math.round(window.innerWidth - r.right);
  }
  var raw = null;
  try { raw = sessionStorage.getItem('ufpos1'); } catch (e) {}
  if (raw) {
    try {
      var o = JSON.parse(raw);
      if (o && (o.s === 'left' || o.s === 'right') && isFinite(Number(o.b))) {
        ufSide = o.s;
        ufBottom = Number(o.b);
        // 值域钳制（第十轮审计·低7）：形状合法不等
        // 于值域合法——过大的 b 经 ufClosedY 换算
        // 会把浮动组钉出屏外、且本会话内再也点不
        // 回来。落点在拖动期恒满足 b ≤ 视口高 −
        // 组高 − 6（ufOnMove 的钳制），恢复时视口
        // 可能已变（旋转 / 折叠屏），按当前视口同
        // 界夹回；组高读不到时退到保证最底一只
        // 48px 钮完整在屏内的界（视口高 − 48）。
        // 负值归未定位哨兵 -1（与旧行为同义：
        // ufClosedY / ufIsHome 本就把负数按原位解）。
        if (ufBottom < 0) ufBottom = -1;
        var ihN = window.innerHeight || 0;
        if (ufBottom >= 0 && ihN > 0) {
          var ghN = (r && r.height) || 0;
          var maxBN = ihN - (ghN > 0 ? ghN + 6 : 48);
          if (ufBottom > maxBN) ufBottom = Math.max(0, maxBN);
        }
      }
    } catch (e) {}
  }
  if (ufSide === 'right' && ufBottom >= 0 && Math.abs(ufBottom - ufHomeB) <= 2) ufBottom = ufHomeB;
  ufApplyClosed();
}
var ufFlEl = document.getElementById('ufloat');
if (ufFlEl) {
  ufFlEl.addEventListener('touchstart', ufOnPressStart, { passive: true });
  ufFlEl.addEventListener('mousedown', ufOnPressStart);
  ufFlEl.addEventListener('click', function (e) {
    if (Date.now() - ufSwallowAt < 600) {
      e.stopPropagation();
      e.preventDefault();
      ufSwallowAt = 0;
    }
  }, true);
}
document.addEventListener('touchmove', ufOnMove, { passive: false });
document.addEventListener('mousemove', ufOnMove);
document.addEventListener('touchend', ufOnEnd);
document.addEventListener('touchcancel', ufOnEnd);
document.addEventListener('mouseup', ufOnEnd);
window.addEventListener('resize', function () {
  var box = document.getElementById('usearch');
  if (box && box.classList.contains('open')) return;
  if (ufDragOn) return;
  ufApplyClosed();
});
ufPosInit();
</script>
${pageCtx.appMode ? '' : expiryBannerScript(pageCtx.botUsername)}
</body>
</html>`;
}

/* -------------------------------------------------------------------------- */
/*                            服务熔断（改版新增）                              */
/* -------------------------------------------------------------------------- */

const PAUSE_STATE_KEY = 'sys:pause';
const PAUSE_DEFAULT_MINUTES = 60;
const PAUSE_MAX_MINUTES = 10080;

// 主管理员告警的统一发送口：调用方全是无按钮的系统
// 告警（熔断通知、看门狗、死信、限流、更新等），故在
// 此统一附「系统提示」标签（SYS_TAG_MARKUP）。
async function notifyPrimaryAdmins(
  env,
  text,
  exceptId = ''
) {
  for (const adminId of getPrimaryAdminIds(env)) {
    if (
      exceptId &&
      String(adminId) === String(exceptId)
    ) {
      continue;
    }

    try {
      await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: adminId,
          text,
          parse_mode: 'HTML',
          reply_markup: SYS_TAG_MARKUP
        }
      );
    } catch (error) {
      console.error(
        '通知主管理员失败：',
        error?.message || error
      );
    }
  }
}

async function alertAdminsPauseStateCorrupt(env) {
  try {
    const last = Number(
      (await dbConfigGet('alertat:pausestate', env)) || 0
    );

    if (Date.now() - last < 24 * 60 * 60 * 1000) {
      return;
    }

    await dbConfigPut(
      'alertat:pausestate',
      String(Date.now()),
      env
    );

    await notifyPrimaryAdmins(
      env,
      '⚠️ 熔断状态记录损坏：机器人按「熔断中」从严' +
      '处理（访客消息暂被拦下）。执行 /resume 可清' +
      '除坏值恢复服务，或重新 /pause 覆盖写入。'
    );
  } catch (error) {
    console.error(
      '发送熔断状态损坏告警失败：',
      error?.message || error
    );
  }
}

async function getPauseState(env) {
  const raw = await dbConfigGet(
    PAUSE_STATE_KEY,
    env
  );

  if (!raw) {
    return null;
  }

  const state = safeJsonParse(raw, null);

  if (
    !state ||
    typeof state !== 'object' ||
    !state.episode
  ) {
    // 坏值 fail-closed（第十轮审计）：sys:pause 写
    // 坏（非 JSON、缺 episode）时旧口径按未熔断放
    // 行——熔断是安全闸门，状态不明就该关着。返
    // 回一轮无到期时间的合成熔断（文案显示「手动
    // 恢复前一直暂停」），并节流告警主管理员；管
    // 理员执行 /resume（stopPause 无条件删键）或
    // 重新 /pause（覆盖写）即可清除坏值。正常值
    // 路径不受影响；读状态本身抛错的放行口径在闸
    // 门调用方保持不变。
    await alertAdminsPauseStateCorrupt(env);

    return { episode: 'corrupt', until: 0, by: '' };
  }

  const until = Number(state.until || 0);

  if (until && Date.now() >= until) {
    // 原子占用：并发读到过期的多个调用里，只让抢到的一方发通知。
    const wonNotice = await dbConfigClaim(
      'sys:pause-notified',
      String(state.episode),
      env
    );

    // 先翻牌、翻完才清状态：单次只翻一批（上限见
    // flipPauseCards），仍有剩余（或读取失败、剩余未知）
    // 时保留状态行——它 until 已过期，后续每一次读状态
    // 都会续翻一批，直到翻完才清行，残卡不会搁浅；
    // 通知仍只由抢到的一方发。
    // 整体包 try：翻牌是写操作（逐卡外部调用 + 删记录），
    // 却挂在读路径上内联执行，异常绝不能逃出本函数拖死
    // 触发它的那条更新——失败只记日志，状态保留待续跑。
    try {
      const flip = await flipPauseCards(env);

      if (flip.remaining <= 0) {
        // 按进入时读到的原值 CAS 删除：翻牌期间管理员
        // 新开一轮熔断会覆盖状态行，值已变就放弃清行，
        // 绝不误删新熔断（第十轮审计）。
        await dbConfigDeleteIfValue(
          PAUSE_STATE_KEY,
          raw,
          env
        );
      }
    } catch (error) {
      console.error(
        '熔断到期翻牌或清状态失败（下次触发续跑）：',
        error?.message || error
      );
    }

    if (wonNotice) {
      await notifyPrimaryAdmins(
        env,
        '⏰ 服务熔断时间已到，机器人已自动恢复服务。'
      );
    }

    return null;
  }

  return {
    episode: String(state.episode),
    until,
    by: String(state.by || '')
  };
}

async function startPause(env, minutes, byAdminId) {
  const state = {
    episode: String(Date.now()),
    until: Date.now() + minutes * 60000,
    by: String(byAdminId || '')
  };

  await setConfig(
    PAUSE_STATE_KEY,
    JSON.stringify(state),
    env
  );

  return state;
}

async function stopPause(env, episode = '') {
  if (!episode) {
    await dbConfigDelete(PAUSE_STATE_KEY, env);

    return;
  }

  // 带 episode 的清行（恢复流程专用）：状态行若已被
  // 新一轮熔断覆盖（episode 不同）就不删——旧恢复
  // 流程无条件清行会把管理员刚开的新熔断静默取消
  // （第十轮审计）。读到后再按原值 CAS 一道：读与
  // 删之间又被改写同样放弃。
  const raw = await dbConfigGet(PAUSE_STATE_KEY, env);

  if (!raw) {
    return;
  }

  const state = safeJsonParse(raw, null);

  if (
    !state ||
    typeof state !== 'object' ||
    String(state.episode || '') !== String(episode)
  ) {
    return;
  }

  await dbConfigDeleteIfValue(PAUSE_STATE_KEY, raw, env);
}

// 恢复服务时收尾熔断期间留下的两类访客侧消息：
// pausemsg:<uid> 记录的那张「请稍后再试」原地编辑成
// 已恢复确认；pausewarn:<uid> 记录的编辑/反应警告
// 直接删除。两类记录同一趟处理、共享单次上限，逐条
// 处理后才删对应记录，中途被打断可由下一次恢复续跑：
// 消息被访客自行删掉、机器人被拉黑等都静默跳过。
// 翻牌成功的「✅ 服务已恢复」卡不无痕结算：编号先转记
// 到 pauserestored:<uid> 再删 pausemsg 记录，由访客
// 下一次发消息时随回执清理一并撤回（见
// clearRestoredPauseCard），与验证成功回执同一口径；
// 翻牌未成功（终局错误结算、卡已不存在等）不转记。
// 单次最多处理 limit 条（默认 10）：收尾挂在读路径上
// （惰性到期、闸门、菜单）内联执行，必须给单次请求
// 留出正文处理的子请求预算；剩余记录保留，下一次
// 触发继续处理。返回值 { remaining, settled }：本轮后
// 剩余未处理数与本轮已处理（删记录）数；读取记录本身
// 失败时 remaining=-1（剩余未知），调用方不得据此
// 认定已处理完而清熔断状态行。
async function flipPauseCards(env, limit = 10) {
  let rows = [];

  try {
    const msgResult = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('pausemsg:%')
      .all();

    const warnResult = await env.TG_BOT_DB.prepare(
      'SELECT key, value FROM config ' +
        'WHERE key LIKE ?'
    )
      .bind('pausewarn:%')
      .all();

    // 两类记录合并成一趟队列、共享单次上限：
    // 翻牌在前、警告删除在后，顺序固定便于续跑判断。
    rows = [
      ...(msgResult?.results || []).map((row) => ({
        ...row,
        warn: false
      })),
      ...(warnResult?.results || []).map((row) => ({
        ...row,
        warn: true
      }))
    ];
  } catch (error) {
    console.error(
      '读取熔断提示记录失败：',
      error?.message || error
    );

    // remaining=-1 与「真翻完」的 0 区分开：调用方据此
    // 决定是否清熔断状态行，未知时必须保留待续跑。
    return { remaining: -1, settled: 0 };
  }

  // 恢复文案循环外读一次：逐卡读同一键是纯浪费，
  // 且恢复进行中改文案会让同批访客收到不同的恢复句。
  const restoredText = await textConfig(
    'pause_restored_text',
    env
  );

  let processed = 0;
  let settled = 0;

  for (const row of rows) {
    if (processed >= limit) {
      break;
    }

    processed += 1;

    const key = String(row.key || '');

    const prefix = row.warn
      ? 'pausewarn:'
      : 'pausemsg:';

    const userId = key.slice(prefix.length);

    // 警告行值带形态（纯编号 / 编号:episode / claim 占位，
    // 见 parsePauseWarnValue）：claim 占位没有卡本体，
    // messageId 为 0、走下方「无编号清行」分支；其余
    // 形态都取编号删卡。pausemsg 行值仍是纯编号。
    const messageId = row.warn
      ? parsePauseWarnValue(row.value).messageId
      : Number(row.value);

    if (!userId || !messageId) {
      // 无卡可翻的残行：按读到的原值条件删——期间该行
      // 被新一轮熔断改写（新卡编号）时不误删，留给新
      // 一轮自己的恢复流程处理（第十轮审计）。
      if (
        await dbConfigDeleteIfValue(key, row.value, env)
      ) {
        settled += 1;
      }

      continue;
    }

    let opError = null;

    try {
      if (row.warn) {
        // 警告不翻牌：恢复时直接删掉这条警告消息。
        await telegramApi(
          env.BOT_TOKEN,
          'deleteMessage',
          {
            chat_id: userId,
            message_id: messageId
          }
        );
      } else {
        await telegramApi(
          env.BOT_TOKEN,
          'editMessageText',
          {
            chat_id: userId,
            message_id: messageId,
            text: restoredText,
            reply_markup: SYS_TAG_MARKUP
          }
        );
      }
    } catch (error) {
      opError = error;
    }

    // 记录在处理尝试之后才删：进程中途被打断时，没轮到的
    // 记录还在，下一次恢复会续跑（已翻的编辑同文案无副作用，
    // 已删的警告再删只会得到终局错误、同列处理）。
    // 且只有处理成功、或失败是终局错误（消息已删、被
    // 拉黑、已是恢复文案等）才删；瞬时失败（429、5xx、
    // 网络抖动、子请求超限）保留记录下一次再处理，
    // 否则访客端会永远留着「请稍后再试」或警告。终局/
    // 瞬时的判据与全站统一走 isTransientTelegramError
    // ——旧口径只看 errorCode 是否存在，带码的 429/5xx
    // 会被误判终局删记录，卡永久搁浅（第十轮审计）。
    if (!opError || !isTransientTelegramError(opError)) {
      if (!row.warn && !opError) {
        // 翻牌成功：这张卡现在显示「✅ 服务已恢复」，
        // 编号转记到 pauserestored:<uid>，等访客下一次
        // 发消息时随回执清理撤回。转记失败只丢追踪
        // （卡长留），不影响结算本身，与熔断回复编号
        // 记账失败同一降级口径。
        try {
          await dbConfigPut(
            `pauserestored:${userId}`,
            String(messageId),
            env
          );
        } catch (error) {
          console.error(
            '转记已恢复提示编号失败：',
            error?.message || error
          );
        }
      }

      // 同无卡分支：按读到的原值条件删，行已被新一
      // 轮改写时保留、不计本轮 settled（剩余数里留
      // 着它，本轮也不会因此误清状态行）。
      if (
        await dbConfigDeleteIfValue(key, row.value, env)
      ) {
        settled += 1;
      }
    }
  }

  return {
    remaining: rows.length - settled,
    settled
  };
}

function describePauseRemaining(state) {
  if (!state?.until) {
    return '手动恢复前一直暂停';
  }

  const totalMinutes = Math.max(
    1,
    Math.ceil((state.until - Date.now()) / 60000)
  );

  if (totalMinutes < 60) {
    return `约 ${totalMinutes} 分钟后自动恢复`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0
    ? `约 ${hours} 小时 ${minutes} 分钟后自动恢复`
    : `约 ${hours} 小时后自动恢复`;
}

async function performPause(env, minutes, byAdminId) {
  const state = await startPause(
    env,
    minutes,
    byAdminId
  );

  await notifyPrimaryAdmins(
    env,
    '⏸ 机器人已开启服务熔断，' +
      `${describePauseRemaining(state)}。` +
      '期间访客新发的消息将被删除。',
    byAdminId
  );

  return state;
}

async function performResume(
  env,
  byAdminId,
  ctx = null
) {
  // 记住本次恢复对应哪一轮熔断：翻牌期间管理员可能
  // 又新开一轮（状态行被覆盖写），本轮的清行与待续
  // 翻改写都只能作用于自己这一轮（按 episode 守卫，
  // 见 stopPause 与下方收尾改写）。
  let resumeEpisode = '';

  try {
    const rawAtStart = await dbConfigGet(
      PAUSE_STATE_KEY,
      env
    );
    const stateAtStart = safeJsonParse(rawAtStart, null);

    if (
      stateAtStart &&
      typeof stateAtStart === 'object' &&
      stateAtStart.episode
    ) {
      resumeEpisode = String(stateAtStart.episode);
    }
  } catch (error) {
    console.error(
      '读取待恢复的熔断轮次失败：',
      error?.message || error
    );
  }

  // 先翻牌、翻完才清状态：分批翻（单批上限见
  // flipPauseCards），直到剩余为 0 才走 stopPause 清行。
  // 没翻完不清行：某批一张都没翻动（多半是持续性
  // 故障）、批数用尽仍有剩余、或剩余未知（读取失败）
  // 时，把状态行的 until 改到过去并保留该行——服务
  // 即刻按已恢复处理（读状态一律返回未熔断），后续每
  // 一次读状态又会续翻一批，直到翻完由读路径清行，
  // 残卡不会搁浅（见 getPauseState 的到期续翻）。
  let flip = await flipPauseCards(env);

  if (
    flip.remaining > 0 &&
    flip.settled > 0 &&
    ctx?.waitUntil
  ) {
    // 有请求上下文时只同步翻第一批：剩余批次挂
    // waitUntil 后台续翻（翻完清行），同步部分随即
    // 走下面的「保留待续翻」分支收尾——状态行 until
    // 改到过去、服务即刻按已恢复处理。后台万一没
    // 翻完，读路径也会续翻，双保险。
    ctx.waitUntil(
      (async () => {
        try {
          let rest = flip;

          for (
            let pass = 0;
            pass < 19 &&
            rest.remaining > 0 &&
            rest.settled > 0;
            pass += 1
          ) {
            rest = await flipPauseCards(env);
          }

          if (rest.remaining <= 0) {
            await stopPause(env, resumeEpisode);
          }
        } catch (error) {
          console.error(
            '后台续翻熔断提示卡失败（读路径会续翻）：',
            error?.message || error
          );
        }
      })()
    );
  } else {
    // 无请求上下文的调用方（如网页管理台）维持
    // 同步翻完（连同上面第一批，总批数仍封顶 20）。
    for (
      let pass = 0;
      pass < 19 &&
      flip.remaining > 0 &&
      flip.settled > 0;
      pass += 1
    ) {
      flip = await flipPauseCards(env);
    }
  }

  if (flip.remaining <= 0) {
    await stopPause(env, resumeEpisode);

    await notifyPrimaryAdmins(
      env,
      '▶️ 机器人已恢复服务。',
      byAdminId
    );

    return;
  }

  try {
    const raw = await dbConfigGet(PAUSE_STATE_KEY, env);
    const state = safeJsonParse(raw, null);

    if (
      state &&
      typeof state === 'object' &&
      state.episode &&
      (!resumeEpisode ||
        String(state.episode) === resumeEpisode)
    ) {
      // 先占掉到期通知名额：后续读路径续翻时不会再
      // 补发一条「已自动恢复」的重复通知。
      await dbConfigClaim(
        'sys:pause-notified',
        String(state.episode),
        env
      );

      state.until = Date.now() - 1;

      // 按读到的原值 CAS 写回：期间状态行被新一轮
      // 熔断覆盖（episode 已变，守卫先拦）或被其他
      // 路径改写时放弃本次改写，绝不把新熔断改回
      // 本轮的过期形状（第十轮审计）。
      await dbConfigPutIfValue(
        PAUSE_STATE_KEY,
        raw,
        JSON.stringify(state),
        env
      );
    }
  } catch (error) {
    console.error(
      '恢复服务保留待续翻状态失败：',
      error?.message || error
    );
  }

  const leftText =
    flip.remaining > 0
      ? `尚有 ${flip.remaining} 张提示卡未翻完`
      : '尚有部分提示卡未翻完';

  await notifyPrimaryAdmins(
    env,
    '▶️ 机器人已恢复服务。' +
      `${leftText}，将随后续消息自动翻完。`,
    byAdminId
  );
}

async function describePauseStateForPanel(env) {
  const state = await getPauseState(env);

  if (!state) {
    return { active: false };
  }

  return {
    active: true,
    until: state.until,
    remaining_text: describePauseRemaining(state)
  };
}

// pausewarn:<uid> 行值的三种形态：
//   「<消息编号>:<episode>」——本版记账（已发出的警告）；
//   「<消息编号>」——旧版存量（无 episode 信息）；
//   「claim:<episode>」——发送前的原子占位（还没有卡）。
// episode 是不透明字符串（现行实现为熔断开启时刻的毫秒
// 时间戳），一律按严格相等比较。messageId 为 0 表示
// 没有卡本体（占位或无法解析）。
function parsePauseWarnValue(raw) {
  const text = String(raw || '');

  const warned = text.match(/^(\d+)(?::(.+))?$/);

  if (warned) {
    return {
      messageId: Number(warned[1]),
      episode: warned[2] ?? null
    };
  }

  const claim = text.match(/^claim:(.+)$/);

  if (claim) {
    return { messageId: 0, episode: claim[1] };
  }

  return { messageId: 0, episode: null };
}

// 熔断期间访客编辑/贴反应被拒时的警告：独立于熔断回复
// 的另一张卡，每位访客每轮熔断至多一张（编辑、反应共
// 用额度）。记账与 pausenote 同模式：先原子占用
// （dbConfigClaim 写 claim:<episode>）再发送，发送成功
// 把行改写成「<编号>:<episode>」，发送失败按 claim 值
// 释放占用、下一个触发点可重试——并发被拒也只有一路能
// 占到行，杜绝旧版「查账→发送→记账」裸三步在并发下发
// 出两张、只记一张、另一张恢复时删不掉的孤儿卡。
// 行值带 episode：上一轮翻牌中断残留的行（episode 对
// 不上）在新一轮被识别为过期——旧卡先删、旧行清掉，
// 本轮额度重新占用，不被上一轮的账吞掉；旧版存量行
// （纯编号、无 episode）按「已发出」对待：本轮不再重
// 发，恢复时由 flipPauseCards 照常按编号删卡。
// 恢复时由 flipPauseCards 随收尾队列删除并清行。
// 是否发送跟随熔断回复开关 pause_reply_enabled（与新
// 消息回复同一读法）：关着时不发、也不占行，开关中途
// 打开后同轮再被拒仍可发本轮第一张。全程包 try：警告
// 只是附带通知，任何失败都不能影响闸门的拦截决定。
async function maybeSendPauseWarn(env, userId, episode) {
  try {
    const warnEnabled =
      (await getConfig(
        'pause_reply_enabled',
        env,
        'true'
      )) === 'true';

    if (!warnEnabled) {
      return;
    }

    const key = `pausewarn:${userId}`;
    const ep = String(episode || '');

    const rawExisting = await dbConfigGet(key, env);
    const existing = parsePauseWarnValue(rawExisting);

    if (existing.messageId) {
      if (
        existing.episode === null ||
        existing.episode === ep
      ) {
        // 本轮已发过（旧版存量行无 episode，同等对待）。
        return;
      }

      // 上一轮残留：旧卡先尽力删掉（quietDeleteMessage
      // 静默吞错）、旧行按原值条件清掉，随后照常占用
      // 本轮额度。
      await quietDeleteMessage(
        env,
        userId,
        existing.messageId
      );

      await dbConfigDeleteIfValue(
        key,
        String(rawExisting),
        env
      );
    } else if (
      existing.episode !== null &&
      existing.episode === ep
    ) {
      // 同轮 claim 占位还在：并发的另一路正在发送，或
      // 占位者中途退出——本轮额度已被占，不再重发（与
      // pausenote 占位未释放时本轮不再补发同一口径）。
      return;
    }

    // 先原子占用再发送：只有把行写成 claim 值的一路
    // 能继续，其余并发触发在此落选。
    const claimValue = `claim:${ep}`;

    const won = await dbConfigClaim(
      key,
      claimValue,
      env
    );

    if (!won) {
      return;
    }

    try {
      const warnText = await textConfig(
        'pause_warn_text',
        env
      );

      const sent = await telegramApi(
        env.BOT_TOKEN,
        'sendMessage',
        {
          chat_id: userId,
          text: warnText,
          reply_markup: SYS_TAG_MARKUP
        }
      );

      if (sent?.message_id) {
        try {
          await dbConfigPut(
            key,
            `${sent.message_id}:${ep}`,
            env
          );
        } catch (error) {
          console.error(
            '记录熔断警告编号失败：',
            error?.message || error
          );
        }
      } else {
        // 没拿到编号：释放占用，下一个触发点可重试。
        await dbConfigDeleteIfValue(
          key,
          claimValue,
          env
        );
      }
    } catch (error) {
      // 发送失败释放占用（只删仍是本次 claim 值的行，
      // 不误删并发/新一轮的占用），下一个触发点可重试。
      await dbConfigDeleteIfValue(
        key,
        claimValue,
        env
      );

      throw error;
    }
  } catch (error) {
    console.error(
      '发送熔断编辑/反应警告失败：',
      error?.message || error
    );
  }
}

// 暂停闸门：置于去重之前。返回 true 表示这条更新应被丢弃。
// 拦非管理员私聊的新消息、按钮、编辑与反应；编辑与
// 反应被拒时另发一张独立警告（每轮至多一张、跟随熔断
// 回复开关，见 maybeSendPauseWarn）。管理员与管理群
// 侧永远放行，
// my_chat_member 等事件不拦。
async function pauseGateDrops(update, env) {
  let actorId = '';
  let kind = '';

  if (update.message) {
    if (update.message.chat?.type !== 'private') {
      return false;
    }

    actorId = String(update.message.from?.id || '');
    kind = 'message';
  } else if (update.edited_message) {
    if (
      update.edited_message.chat?.type !== 'private'
    ) {
      return false;
    }

    actorId = String(
      update.edited_message.from?.id || ''
    );
    kind = 'edited_message';
  } else if (update.message_reaction) {
    if (
      update.message_reaction.chat?.type !== 'private'
    ) {
      return false;
    }

    actorId = String(
      update.message_reaction.user?.id || ''
    );
    kind = 'reaction';
  } else if (update.callback_query) {
    actorId = String(
      update.callback_query.from?.id || ''
    );
    kind = 'callback';
  } else {
    return false;
  }

  if (!actorId) {
    return false;
  }

  let state = null;

  try {
    state = await getPauseState(env);
  } catch (error) {
    // 读状态本身失败时按未熔断放行：闸门位于每条更新
    // 的最前沿，绝不能因熔断子系统抖动吞掉正常更新。
    console.error(
      '读取熔断状态失败，按未熔断放行：',
      error?.message || error
    );

    return false;
  }

  if (!state) {
    return false;
  }

  if (await isAdminUser(actorId, env)) {
    return false;
  }

  if (
    kind === 'edited_message' ||
    kind === 'reaction'
  ) {
    // 对已送达消息的编辑与反应同样拒收：编辑可以把
    // 旧消息整段换成新内容，照常同步等于绕过熔断
    // 发新消息。被拒内容不留存（不存正文原则），
    // 恢复后不补同步——靠警告当场告知访客未送达。
    // 被封禁访客保持全静默：只拦不发。封禁状态读取
    // 失败时按未封禁发警告，拦截决定本身不变。
    let blocked = false;

    try {
      const gateUser = await dbUserGet(actorId, env);

      blocked = !!gateUser?.is_blocked;
    } catch (error) {
      console.error(
        '熔断闸门读取访客封禁状态失败：',
        error?.message || error
      );
    }

    if (!blocked) {
      await maybeSendPauseWarn(env, actorId, state.episode);
    }

    return true;
  }

  if (kind === 'message') {
    // 熔断期间访客新发的消息当场删除：消息消失本身
    // 就是「仍在熔断」的信号。编辑与反应不走这里——
    // 它们在上方已被拦下：不删访客的旧消息本体，
    // 只是不再同步到话题副本。
    await quietDeleteMessage(
      env,
      update.message.chat.id,
      update.message.message_id
    );
  }

  if (kind === 'callback') {
    return true;
  }

  const user = await dbUserGet(actorId, env);

  if (user?.is_blocked) {
    return true;
  }

  const replyEnabled =
    (await getConfig(
      'pause_reply_enabled',
      env,
      'true'
    )) === 'true';

  if (replyEnabled) {
    // 先原子占用再发送：并发触发也只发出一条；
    // 发送失败则释放占用，允许下一次触发重试。
    const wonReply = await dbConfigClaim(
      `pausenote:${actorId}`,
      state.episode,
      env
    );

    if (wonReply) {
      const replyText = await textConfig(
        'pause_reply_text',
        env
      );

      try {
        const sent = await telegramApi(
          env.BOT_TOKEN,
          'sendMessage',
          {
            chat_id: actorId,
            text: replyText,
            reply_markup: SYS_TAG_MARKUP
          }
        );

        // 记下这张「请稍后再试」的编号，
        // 恢复服务时原地翻牌成「✅ 服务已恢复」。
        if (sent?.message_id) {
          // 新卡记账前先清上一轮残留的「✅ 服务已恢复」
          // 卡（若有）：状态相反的两张卡不能并存。清
          // 失败不影响新卡记账，残留卡仍可由访客下一
          // 条消息的回执清理点消费。
          try {
            await clearRestoredPauseCard(env, actorId);
          } catch (error) {
            console.error(
              '清理残留已恢复提示失败：',
              error?.message || error
            );
          }

          try {
            await dbConfigPut(
              `pausemsg:${actorId}`,
              String(sent.message_id),
              env
            );
          } catch (error) {
            console.error(
              '记录熔断提示编号失败：',
              error?.message || error
            );
          }
        }
      } catch (error) {
        console.error(
          '发送服务熔断回复失败：',
          error?.message || error
        );

        await dbConfigDelete(
          `pausenote:${actorId}`,
          env
        );
      }
    }
  }

  return true;
}

// Webhook 同步编排（at-least-once）：闸门 → 两阶段
// claim → 同步处理 → 按结果落账。处理成功回 200；
// 瞬时失败（含 RateLimitDeferred）回 500，Telegram
// 重推后整条重新处理（中继靠意向行防重复复制）；
// 同一条更新连续失败 3 次判死信：标完成、私聊告警
// 全体主管理员、回 200 止住重推。闸门丢弃不占位、
// 直接回 200，与旧语义一致。
async function processWebhookUpdate(
  update,
  env,
  origin,
  ctx
) {
  // 闸门自身已有「读状态失败放行」的口径；这里再兜
  // 一层：闸门异常按放行处理，绝不让熔断子系统抖动
  // 吞掉正常更新（后续处理若撞上同一故障，自有失败
  // 重推兜底）。
  let dropped = false;

  try {
    dropped = await pauseGateDrops(update, env);
  } catch (error) {
    console.error(
      '熔断闸门异常，按放行处理：',
      error?.message || error
    );
  }

  if (dropped) {
    return 200;
  }

  const claim = await claimUpdateStart(
    update?.update_id,
    env
  );

  if (claim.mode === 'duplicate') {
    console.log(
      '忽略重复 Update：',
      update?.update_id
    );

    return 200;
  }

  if (claim.mode === 'inflight') {
    console.log(
      'Update 正在处理中，忽略本次投递：',
      update?.update_id
    );

    return 200;
  }

  try {
    await handleUpdate(update, env, origin, ctx);
  } catch (error) {
    console.error(
      '处理 Update 失败：',
      error?.stack || error?.message || error
    );

    if (claim.mode !== 'process') {
      return 500;
    }

    // 限流不算处理失败：释放占位（attempts 不累计）、
    // 回 500 等 Telegram 在限流窗口后重推，并给主管理员
    // 一条节流提示。再久的限流也不会把消息误判成死信。
    // 分流口径与全站瞬时判据对齐：不只认抛成
    // RateLimitDeferred 的（retry_after > 15），请求内
    // 重试耗尽的普通 429（小 retry_after）与不带
    // retry_after 的 429 同属限流，一律释放不计次——
    // 旧口径下它们会累计死信计数，限流过后本可成功
    // 的消息被误判死信（第十轮审计）。
    if (
      error?.name === 'RateLimitDeferred' ||
      Number(error?.errorCode || 0) === 429
    ) {
      await bookkeepingWithRetry(
        '释放限流占位',
        () => claimUpdateRelease(update.update_id, env),
        ctx
      );

      await alertAdminsRateLimited(env);

      return 500;
    }

    let dead = false;

    const deadResult = await bookkeepingWithRetry(
      '记录 Update 失败次数',
      () =>
        claimUpdateFailed(
          update.update_id,
          env,
          claim.attempts
        ),
      ctx
    );

    dead = deadResult === true;

    if (dead) {
      const brief =
        (error?.name && error.name !== 'Error'
          ? `${error.name}：`
          : '') +
        String(error?.message || error).slice(0, 300);

      const summary = summarizeUpdateForAlert(update);

      await notifyPrimaryAdmins(
        env,
        '⚠️ 死信告警：一条 Telegram 更新连续处理失败 ' +
        '3 次，已停止重试。\n' +
        `update_id：${update.update_id}\n` +
        `错误：${brief}` +
        (summary.length
          ? `\n${summary.join('\n')}`
          : '')
      );

      return 200;
    }

    return 500;
  }

  if (claim.mode === 'process') {
    try {
      await claimUpdateDone(update.update_id, env);
    } catch (error) {
      // 处理已成功：落账失败不改判失败。占位行留在
      // pending，超时后被重推接管或被清扫回收；中继
      // 有意向行保护，不会重复复制。
      console.error(
        '标记 Update 处理完成失败：',
        error?.message || error
      );
    }
  }

  return 200;
}

async function handleUpdate(
  update,
  env,
  origin = '',
  ctx = null
) {
  if (update.message) {
    if (
      update.message.chat.type ===
      'private'
    ) {
      await handlePrivateMessage(
        update.message,
        env,
        origin,
        ctx
      );
    } else if (
      String(update.message.chat.id) ===
      String(env.ADMIN_GROUP_ID)
    ) {
      await handleAdminReply(
        update.message,
        env,
        ctx
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

  if (update.chat_member) {
    await handleGroupChatMember(
      update.chat_member,
      env
    );

    return;
  }

  if (update.callback_query) {
    await handleCallbackQuery(
      update.callback_query,
      env,
      origin,
      ctx
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Cloudflare Worker 入口                               */
/* -------------------------------------------------------------------------- */

// 数据接口统一禁缓存（第十轮审计）：四个 GET 数
// 据接口（访客列表 / 数据统计 / 管理台配置 / 审计
// 日志）此前用裸 Response.json 应答、不带
// Cache-Control，与三页的 no-store 口径不一致——
// 带签名链接的敏感数据不该被浏览器或中间层缓存。
// 在路由层统一给响应补头，覆盖各 handler 的全部
// 返回路径（含错误应答）。
async function withNoStore(responsePromise) {
  const response = await responsePromise;
  const headers = new Headers(response.headers);

  headers.set('cache-control', 'no-store');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

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
        'Initialization Error',
        {
          status: 500,
          headers: {
            'content-type':
              'text/plain; charset=utf-8'
          }
        }
      );
    }

    // 请求级访客行缓存（见 dbUserGet）：浅拷贝一份
    // env 并挂空 Map，本请求的全部处理（含 waitUntil
    // 续跑）共用这份 env，缓存随请求结束自然释放。
    env = { ...env, __userRowCache: new Map(), __linkEpochCache: new Map() };

    const requestUrl = new URL(request.url);

    try {
      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/verify'
      ) {
        return await handleVerifyPage(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname ===
          '/verify/confirm'
      ) {
        return await handleVerifyConfirm(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/pass'
      ) {
        return await handlePassPage(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/pass/confirm'
      ) {
        return await handlePassConfirm(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/users'
      ) {
        return await handleUserListPage(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/users'
      ) {
        return await withNoStore(handleUserListApi(request, env));
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/stats'
      ) {
        return await withNoStore(handleStatsApi(request, env));
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/panel'
      ) {
        return await handlePanelPage(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/guide'
      ) {
        return await handleGuidePage(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/app'
      ) {
        return await handleAppShellPage();
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/app-auth'
      ) {
        return await withNoStore(handleAppAuth(request, env));
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/config'
      ) {
        return await withNoStore(handleConfigApi(request, env));
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/config/set'
      ) {
        return await handleConfigSet(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/config/toggle'
      ) {
        return await handleConfigToggle(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/config/list'
      ) {
        return await handleConfigList(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/config/pause'
      ) {
        return await handleConfigPause(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/users/action'
      ) {
        return await handleUserListAction(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/nonce'
      ) {
        return await handleNonceMint(
          request,
          env
        );
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/api/config/revoke-links'
      ) {
        return await handleRevokeLinks(
          request,
          env
        );
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/audit'
      ) {
        return await withNoStore(handleAuditApi(request, env));
      }
    } catch (error) {
      // 鉴权存储（epoch）读取失败的受控降级（第十一轮
      // 审计中 4）：API 回 503 JSON、页面回友好错误
      // 页；其余异常照旧上抛，不改变任何既有失败形态。
      if (error?.code === 'AUTH_STORE_UNAVAILABLE') {
        return authStoreUnavailableResponse(
          requestUrl.pathname
        );
      }

      throw error;
    }

    if (request.method === 'GET') {
      // 未匹配任何页面路由的 GET 一律 404 且不带字样，
      // 不再回「Worker is running」横幅让扫描器确认存活。
      return new Response(null, { status: 404 });
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

    if (requestUrl.pathname !== '/webhook') {
      // Webhook 只认固定路径 /webhook；其余 POST 路径
      // （前面已定义的 /api/* 等路由不走这里）一律 404。
      return new Response(null, { status: 404 });
    }

    const webhookSecret = request.headers.get(
      'X-Telegram-Bot-Api-Secret-Token'
    );

    if (
      !webhookSecret ||
      !env.WEBHOOK_SECRET ||
      !timingSafeEqualString(
        webhookSecret,
        env.WEBHOOK_SECRET
      )
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

    // 同步处理（at-least-once）：处理完成才回响应，
    // 瞬时失败回 500 让 Telegram 重推，编排细节见
    // processWebhookUpdate。清理与更新检查仍走
    // waitUntil 搭载，不占同步路径。
    let updateStatus = 200;

    try {
      updateStatus = await processWebhookUpdate(
        update,
        env,
        requestUrl.origin,
        ctx
      );
    } catch (error) {
      console.error(
        '编排 Update 失败：',
        error?.stack || error?.message || error
      );

      updateStatus = 500;
    }

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

    return new Response(
      updateStatus === 200
        ? 'OK'
        : 'Processing Error',
      {
        status: updateStatus,
        headers: {
          'content-type':
            'text/plain; charset=utf-8'
        }
      }
    );
  }
};
