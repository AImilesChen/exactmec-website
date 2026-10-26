# 可选外部统计适配器

2026-10-26。接入用户提供的 GA4 `G-E8EBN552MZ`、Clarity `z3mu7j6fex`、ShipSolo 托管 Plausible（domain `exactmec.com`）及 Ahrefs Web Analytics `kwvnBi883wOXoELTpu9YWQ`，不创建账号、升级套餐或开启广告功能。业务询价、客户门户与管理员登录不依赖这些服务。

## 调用合同

```js
import { createVendorAnalytics, isVendorMarketingRoute } from './vendors.mjs';
const vendors = createVendorAnalytics({ enabled: config.externalAnalyticsEnabled });
// 构造不联网；仅在已确认的可选统计同意后调用。
vendors.setConsent(savedChoice === true);
vendors.track('pageview', { route: location.pathname });
vendors.track('quote_cta_click', { route: location.pathname, placement: 'hero' });
// 撤回：先保存拒绝，再停止适配器；已加载 SDK 时立即整页重载。
vendors.setConsent(false);
if (vendors.hasStarted()) location.reload();
// 生命周期结束后此实例不能重新启用；此方法不保存用户选择。
vendors.destroy();
```

`setConsent(true)` 会初始化允许的供应商并手动发送一次页面浏览，同一实例／文档内相同规范路径不重复计数。`track` 仅允许 `pageview`、`quote_cta_click`、`whatsapp_click`；只转发规范 route 与枚举 placement，且必须与当前页面一致。不排队补报未同意期间的活动，不发送表单内容、联系人、编号、用户 ID、任意属性或原始错误。

测试可注入 `{window,document,fetchImpl}`；正式页面应只创建一个实例。`knownPaths` 只能来自可信已发布 CMS 营销路径，不能来自 URL、表单或事件属性。另导出 `vendorMarketingRoute(value,knownPaths)` 返回规范路径/null、`isVendorMarketingRoute` 返回布尔。

## 页面与导航边界

- 只允许 `https://exactmec.com` 的已登记营销页，硬排除询价、成功、法律、账号、后台、API、设计工作台、404及未知路径；localhost、www、端口变体、凭据 URL 不启用。
- GA/Plausible 使用 `https://exactmec.com` 加规范路径构造的地址，不使用实际 query/hash、document.title 或 document.referrer。
- Clarity 本身会读取实际地址和 referrer，无法靠内容 mask 改写这些元数据。因此只有当前地址无 query/hash，且 referrer 为空、干净的本站营销路径或纯外部 origin 时才加载；其他情况整项跳过。加载前给 documentElement/root 设置 `data-clarity-mask=true`，不调用 identify/unmask。
- 外部统计开启时，宿主必须对内部导航、历史返回等使用整页导航，先结束当前文档再展示其他页面，不能让已加载 SDK 跟随 SPA 进入表单／客户／后台 DOM。适配器检测到未预期路径变化时也会停止，但不能用此补救替代整页隔离。

## 供应商处理

Google 使用 basic opt-in：同意前不加载脚本、不发送拒绝状态 ping。初始化队列顺序是 consent default 全部 denied、隐私配置、consent update 只授予 analytics_storage，再配置与异步脚本。广告存储、ad_user_data、ad_personalization 均 denied；`allow_google_signals` 和 `allow_ad_personalization_signals` 为 false，`ads_data_redaction` 为 true，关闭 url_passthrough。每页 `send_page_view:false`，页面浏览由适配器手动发送。

Google 属性中的 Enhanced Measurement 设置仍需运营核对：官方说明 history 自动页面浏览独立于 `send_page_view`。本站以整页导航避免双重 SPA 跟踪，不假造一个能关闭所有远程增强测量配置的 SDK 参数。[Google 同意指南](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic)、[页面浏览](https://developers.google.com/analytics/devguides/collection/ga4/views)、[配置字段](https://developers.google.com/analytics/devguides/collection/ga4/reference/config?hl=en)。

Clarity 使用官方 `consentv2`，注意字段名大小写：`analytics_Storage:'granted'`、`ad_Storage:'denied'`；在脚本前排队。自定义事件只传固定事件名。撤回时两项 denied，再调用公开源代码导出的 stop；宿主仍必须重载。[ConsentV2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2)、[mask 与客户端事件](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-api)、[官方 stop 实现](https://github.com/microsoft/clarity/blob/master/packages/clarity-js/src/clarity.ts)。

实际只读获取 `https://plausible.shipsolo.io/js/script.js` 和 `/js/script.manual.js` 均为200。前者自动 PV/history/engagement，后者虽然可手动覆盖 url，仍无条件发送原始 document.referrer，并安装 engagement 监听器；因此两者都不注入。经用户授权范围内选择同服务的官方 Events API 等效接入：POST `https://plausible.shipsolo.io/api/event`，JSON 使用 `name/url/domain/referrer/props`，domain固定 exactmec.com，referrer为null，fetch采用 credentials omit、no-referrer、no-store、redirect error。没有 SDK 自动浏览或 engagement，不额外设置访客标识。[Plausible Events API](https://plausible.io/docs/events-api)。

实际源与隔离 VM 证据位于仓库外 `backend-delivery/analytics-integration-2026-10-26/`，其中 `plausible-actual-script-behavior.json` 记录自动／手动脚本行为。此为代码与受控模拟证据，不冒充三个供应商后台已接收真实生产数据。

## 撤回与限制

Ahrefs 使用官方 head 脚本 https://analytics.ahrefs.com/analytics.js ，data-key 如上。官方当前脚本支持 data-page-location 和 data-no-pageview-auto；本接入关闭自动页面浏览，由加载成功回调发送一次 pageview，后续只显式发送允许的营销按钮事件。SDK还会自动观测公共链接点击，因此它不能被称为只接收本适配器自定义字段。询价/私有页面不加载；当前URL有query/hash或referrer不安全时整项跳过，与Clarity使用同一检查。它不是UTM广告归因的替代，带参数落地页仍由既有GA/Plausible发送清洗后的事件。

Ahrefs会收到公开页面标题、规范地址、通过安全检查的来源、公开链接目标与设备/网络信息。官方说明不使用cookies而在服务端计算当日假名访客ID；这不代表不处理IP或UA。新增服务使用v3选择，不继承旧v2的允许状态。同意前不加载，不为AhrefsSiteAudit伪造同意或专门放开统计；其爬虫不点击选择框，后台自动安装检查可能仍提示未检测到。不要为了消除提示绕过访客选择。撤回后本接入禁用公开sendEvent，宿主仍必须整页重载来卸载SDK内部监听器。

官方参考：[安装与采集说明](https://help.ahrefs.com/en/articles/10247870-about-ahrefs-web-analytics)、[事件API](https://help.ahrefs.com/en/articles/11381932-tracked-events-in-ahrefs-web-analytics)、[安装检测限制](https://help.ahrefs.com/en/articles/10631520-troubleshooting-ahrefs-web-analytics-snippet-isn-t-found-on-your-website)。本次读取的官方脚本原件及受控验证保存在仓库外backend-delivery/ahrefs-analytics-2026-10-26。

先持久保存拒绝；停止新的 track，设置 Google ga-disable，撤回供应商同意，清除尚未执行的本适配器授权／事件队列并终止可取消的 Plausible 请求。只清理本站 `_ga`、本测量 ID 的 GA cookie、`_gid`、本 ID 的 `_gat_gtag`、`_clck`、`_clsk`，不碰客户会话或其他必要 cookie。

删除 script 节点不能卸载已运行 SDK，也不能追回已经发送的数据；第三方域 cookie 无法由本站 JavaScript 清除。`hasStarted()` 在脚本移除后仍返回true，提醒宿主保存拒绝后整页重载。拒绝保存失败时宿主必须采用拒绝优先的重载标记，不能从旧 allow 值重新开启。已撤回实例不能再授予同意，需新的文档。所有供应商故障被隔离，不阻塞页面、询价或联系操作，不自动重试。

浏览器会向供应商提供正常网络信息（如 IP、User-Agent）；SDK 还按其服务机制处理设备、cookie 与已授权的营销页交互。这不是“无识别器”或“不使用第三方 SDK”的实现。法律说明、同意 UI、CSP 与线上验收由宿主同步。

验证：`node --test tests/analytics-vendors.test.mjs`。全部使用假 DOM/网络；同意前零请求、精确域名/页面隔离、字段清洗、去重、同意顺序、referrer边界、撤回、cookie隔离、供应商故障均有回归覆盖。
