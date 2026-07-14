// ==UserScript==
// @name         BetterEAMS
// @namespace    https://github.com/henryli/bettereams
// @version      0.9.27
// @description  Improve ShanghaiTech EAMS course search, filtering, layout, favorites, and schedule conflict checks.
// @author       BetterEAMS
// @homepageURL  https://github.com/Maotechh/BetterEAMS
// @supportURL   https://github.com/Maotechh/BetterEAMS/issues
// @updateURL    https://raw.githubusercontent.com/Maotechh/BetterEAMS/main/userscripts/bettereams.user.js
// @downloadURL  https://raw.githubusercontent.com/Maotechh/BetterEAMS/main/userscripts/bettereams.user.js
// @match        https://eams.shanghaitech.edu.cn/eams/stdElectCourse!defaultPage.action*
// @match        http://eams.shanghaitech.edu.cn/eams/stdElectCourse!defaultPage.action*
// @match        https://eams.shanghaitech.edu.cn/eams/stdElectCourse.action*
// @match        http://eams.shanghaitech.edu.cn/eams/stdElectCourse.action*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      coursebench.org
// ==/UserScript==

(function () {
  "use strict";

  const APP_ID = "better-eams";
  const APP_VERSION = "0.9.26";
  const STORAGE_KEY = `${APP_ID}:state:v1`;
  const FAVORITES_KEY = `${APP_ID}:favorites:v1`;
  const PLANS_KEY = `${APP_ID}:plans:v1`;
  const API_TEMPLATES_KEY = `${APP_ID}:api-templates:v1`;
  const COURSEBENCH_CACHE_KEY = `${APP_ID}:coursebench:v1`;
  const COURSEBENCH_API_URL = "https://coursebench.org/v1/course/all";
  const COURSEBENCH_ORIGIN = "https://coursebench.org";
  const COURSEBENCH_CACHE_TTL = 6 * 60 * 60 * 1000;
  const COURSEBENCH_RETRY_DELAY = 5 * 60 * 1000;
  const COURSEBENCH_ENOUGH_DATA_THRESHOLD = 3;
  const COURSEBENCH_SCORE_LABELS = ["课程质量", "作业用时", "考核难度", "给分情况"];
  const PLAN_COMPLETION_PATH = "/eams/myPlanCompl.action";
  const PREFERRED_EAMS_LOCALE = "zh_CN";
  const LESSON_ARRAY_NAMES = ["lessonJSONs", "takedLessonsStr", "otherTakedLessonsStr"];
  const BROAD_PLAN_GROUPS = new Set([
    "通识教育课程",
    "人文社科通识课程",
    "自然科学通识课程",
    "专业课程",
    "专业必修",
    "专业选修",
    "本学科选修",
    "毕业要求",
    "总学分"
  ]);
  const CATEGORY_RANK = {
    unknown: 0,
    raw: 40,
    rawCategory: 50,
    studentFallback: 80,
    tableCell: 90,
    tableContext: 100,
    studentPlan: 120
  };
  const COURSE_CATEGORY_PATTERNS = [
    [/跨学院\s*选修(?:\s*方向)?(?:\s*课程)?/, "跨学院选修"],
    [/专业\s*方向\s*必修(?:\s*课程)?/, "专业方向必修"],
    [/专业\s*方向\s*选修(?:\s*课程)?/, "专业方向选修"],
    [/专业\s*方向(?:\s*课程)?/, "专业方向"],
    [/自然科学\s*基础\s*选修(?:\s*课程)?/, "自然科学基础选修"],
    [/人文社科\s*通识\s*课程/, "人文社科通识课程"],
    [/自然科学\s*通识\s*课程/, "自然科学通识课程"],
    [/通识\s*教育\s*课程/, "通识教育课程"],
    [/专业\s*必修(?:\s*课程)?/, "专业必修"],
    [/专业\s*选修(?:\s*课程)?/, "专业选修"],
    [/本学科\s*选修(?:\s*课程)?/, "本学科选修"],
    [/体育\s*兴趣(?:\s*课程)?/, "体育兴趣"],
    [/创新\s*创业(?:\s*课程)?/, "创新创业"],
    [/写作(?:\s*课程)?/, "写作"],
    [/导读(?:\s*课程)?/, "导读"],
    [/任意\s*选修|任选/, "任意选修"],
    [/课程群/, "课程群"],
    [/必修\s*课程/, "必修课程"],
    [/选修\s*课程/, "选修课程"]
  ];
  const ACTIONABLE_PLAN_GROUP_HINT = /课程群|选修|体育兴趣|跨学院|创新创业|写作|导读|专业方向/;
  const GENERIC_PLAN_GROUP_FIELD = /^(课程|课程类别|选修|选修课|必修|必修课|通识|专业|全校|不限|任选)$/;
  const DAYS = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const PERIOD_MINUTES = [
    null,
    [8 * 60 + 15, 9 * 60],
    [9 * 60 + 10, 9 * 60 + 55],
    [10 * 60 + 15, 11 * 60],
    [11 * 60 + 10, 11 * 60 + 55],
    [13 * 60, 13 * 60 + 45],
    [13 * 60 + 55, 14 * 60 + 40],
    [15 * 60, 15 * 60 + 45],
    [15 * 60 + 55, 16 * 60 + 40],
    [16 * 60 + 50, 17 * 60 + 35],
    [18 * 60, 18 * 60 + 45],
    [18 * 60 + 55, 19 * 60 + 40],
    [19 * 60 + 50, 20 * 60 + 35],
    [20 * 60 + 45, 21 * 60 + 30]
  ];
  const PERIOD_COUNT = PERIOD_MINUTES.length - 1;
  // Pinyin lookup adapted from tiny-pinyin (MIT): https://github.com/creeperyang/pinyin
  const PINYIN_UNIHANS = "阿哎安肮凹八挀扳邦勹陂奔伻屄边灬憋汃冫癶峬嚓偲参仓撡冊嵾曽叉芆辿伥抄车抻阷吃充抽出欻揣巛刅吹旾逴呲匆凑粗汆崔邨搓咑呆丹当刀嘚扥灯氐甸刁爹丁丟东吺厾耑垖吨多妸诶奀鞥儿发帆匚飞分丰覅仏紑夫旮侅甘冈皋戈给根刯工勾估瓜乖关光归丨呙哈咍佄夯茠诃黒拫亨噷叿齁乎花怀欢巟灰昏吙丌加戋江艽阶巾坕冂丩凥姢噘军咔开刊忼尻匼肎劥空抠扝夸蒯宽匡亏坤扩垃来兰啷捞肋勒崚哩俩奁良撩毟拎伶溜囖龙瞜噜驴娈掠抡罗呣妈埋嫚牤猫么呅门甿咪宀喵乜民名谬摸哞毪嗯拏腉囡囔孬疒娞恁能妮拈娘鸟捏囜宁妞农羺奴女奻疟黁挪喔讴妑拍眅乓抛呸喷匉丕囨剽氕姘乒钋剖仆七掐千呛悄癿亲靑卭丘区峑缺夋呥穣娆惹人扔日茸厹邚挼堧婑瞤捼仨毢三桒掻閪森僧杀筛山伤弰奢申升尸収书刷衰闩双脽吮说厶忪捜苏狻夊孙唆他囼坍汤夲忑熥剔天旫帖厅囲偷凸湍推吞乇穵歪弯尣危昷翁挝乌夕虲仙乡灱些心星凶休吁吅削坃丫恹央幺倻一囙应哟佣优扜囦曰晕帀災兂匨傮则贼怎増扎捚沾张佋蜇贞争之中州朱抓拽专妆隹宒卓乲宗邹租钻厜尊昨兙";
  const PINYIN_PINYINS = "A AI AN ANG AO BA BAI BAN BANG BAO BEI BEN BENG BI BIAN BIAO BIE BIN BING BO BU CA CAI CAN CANG CAO CE CEN CENG CHA CHAI CHAN CHANG CHAO CHE CHEN CHENG CHI CHONG CHOU CHU CHUA CHUAI CHUAN CHUANG CHUI CHUN CHUO CI CONG COU CU CUAN CUI CUN CUO DA DAI DAN DANG DAO DE DEN DENG DI DIAN DIAO DIE DING DIU DONG DOU DU DUAN DUI DUN DUO E EI EN ENG ER FA FAN FANG FEI FEN FENG FIAO FO FOU FU GA GAI GAN GANG GAO GE GEI GEN GENG GONG GOU GU GUA GUAI GUAN GUANG GUI GUN GUO HA HAI HAN HANG HAO HE HEI HEN HENG HM HONG HOU HU HUA HUAI HUAN HUANG HUI HUN HUO JI JIA JIAN JIANG JIAO JIE JIN JING JIONG JIU JU JUAN JUE JUN KA KAI KAN KANG KAO KE KEN KENG KONG KOU KU KUA KUAI KUAN KUANG KUI KUN KUO LA LAI LAN LANG LAO LE LEI LENG LI LIA LIAN LIANG LIAO LIE LIN LING LIU LO LONG LOU LU LV LUAN LVE LUN LUO M MA MAI MAN MANG MAO ME MEI MEN MENG MI MIAN MIAO MIE MIN MING MIU MO MOU MU N NA NAI NAN NANG NAO NE NEI NEN NENG NI NIAN NIANG NIAO NIE NIN NING NIU NONG NOU NU NV NUAN NVE NUN NUO O OU PA PAI PAN PANG PAO PEI PEN PENG PI PIAN PIAO PIE PIN PING PO POU PU QI QIA QIAN QIANG QIAO QIE QIN QING QIONG QIU QU QUAN QUE QUN RAN RANG RAO RE REN RENG RI RONG ROU RU RUA RUAN RUI RUN RUO SA SAI SAN SANG SAO SE SEN SENG SHA SHAI SHAN SHANG SHAO SHE SHEN SHENG SHI SHOU SHU SHUA SHUAI SHUAN SHUANG SHUI SHUN SHUO SI SONG SOU SU SUAN SUI SUN SUO TA TAI TAN TANG TAO TE TENG TI TIAN TIAO TIE TING TONG TOU TU TUAN TUI TUN TUO WA WAI WAN WANG WEI WEN WENG WO WU XI XIA XIAN XIANG XIAO XIE XIN XING XIONG XIU XU XUAN XUE XUN YA YAN YANG YAO YE YI YIN YING YO YONG YOU YU YUAN YUE YUN ZA ZAI ZAN ZANG ZAO ZE ZEI ZEN ZENG ZHA ZHAI ZHAN ZHANG ZHAO ZHE ZHEN ZHENG ZHI ZHONG ZHOU ZHU ZHUA ZHUAI ZHUAN ZHUANG ZHUI ZHUN ZHUO ZI ZONG ZOU ZU ZUAN ZUI ZUN ZUO ".split(" ");
  const PINYIN_EXCEPTIONS = {"曾":"ZENG","沈":"SHEN","嗲":"DIA","碡":"ZHOU","聒":"GUO","炔":"QUE","蚵":"KE","砉":"HUA","嬤":"MO","嬷":"MO","蹒":"PAN","蹊":"XI","丬":"PAN","霰":"XIAN","莘":"XIN","豉":"CHI","饧":"XING","筠":"JUN","长":"CHANG","帧":"ZHEN","峙":"SHI","郍":"NA","芎":"XIONG","谁":"SHUI"};
  const LATIN_SEARCH_RE = /^[a-z0-9]+$/;
  const COURSE_NO_ONLY_QUERY_RE = /^(?:chem|mse|phys|sp|bio|bme|sl|math|cs|ee|si)/;
  const TIMETABLE_ROW_HEIGHT = 30;
  const TIMETABLE_MAX_VISIBLE_LANES = 3;
  let pinyinSupported = null;
  let pinyinCollator = null;
  const pinyinTokenCache = new Map();
  const searchIndexCache = new Map();
  const DEFAULT_STATE = {
    query: "",
    type: "",
    dept: "",
    credit: "",
    day: "",
    period: "",
    gradeRecord: "",
    status: "all",
    availability: "all",
    onlyFavorites: false,
    hideConflict: false,
    onlyPlanGaps: false,
    showStagedOnTimetable: false,
    sort: "relevance",
    collapsed: false
  };

  const state = { ...DEFAULT_STATE, ...readJson(STORAGE_KEY, {}) };
  let favorites = new Set(readJson(FAVORITES_KEY, []));
  let planStore = normalizePlanStore(readJson(PLANS_KEY, null));
  let apiTemplates = readJson(API_TEMPLATES_KEY, []);
  const cachedCourseBench = readJson(COURSEBENCH_CACHE_KEY, {});
  let courseBenchCatalog = buildCourseBenchCatalog(cachedCourseBench?.courses);
  let courseBenchFetchedAt = toNumber(cachedCourseBench?.fetchedAt);
  let courseBenchLastAttemptAt = 0;
  let courseBenchLoading = false;
  let courseBenchLoaded = courseBenchCatalog.size > 0;
  let courseBenchError = "";
  let lessonCatalog = new Map();
  let lessons = [];
  let studentCourseCategories = emptyStudentCourseCategories();
  let rowIndex = new Map();
  let rowHeaderCache = new WeakMap();
  let electionState = emptyElectionState();
  let pageMeta = emptyPageMeta();
  let curriculumPlan = emptyCurriculumPlan();
  let curriculumPlanLoading = false;
  let curriculumPlanLoaded = false;
  let curriculumPlanError = "";
  let panel;
  let controls = {};
  let lastSignature = "";
  let renderTimer = null;
  let activeCapture = null;
  let originalSearchResetTimer = null;
  let previewLessonId = "";
  let hoveredTimetableBlock = null;
  let pinnedTimetableOverflowGroups = new Set();
  const pendingMutations = new Set();

  if (window.top !== window.self || document.getElementById(`${APP_ID}-panel`)) return;

  ready(init);

  function init() {
    if (!shouldActivateHelper()) return;
    document.documentElement.dataset.betterEamsVersion = APP_VERSION;
    injectStyles();
    if (isElectionPortalPage()) {
      installElectionPortalHelper();
      return;
    }
    if (isRecoverableElectionProblemPage()) {
      installElectionRecoveryPanel();
      return;
    }
    if (!shouldActivatePanel()) return;
    installRequestRecorder();
    exposeDebugApi();
    improveLegacyPage();
    document.documentElement.classList.add("better-eams-full-app");
    createPanel();
    refreshLessons();
    observePageChanges();
  }

  function shouldActivateHelper() {
    return isElectionMainPage() || isElectionPortalPage();
  }

  function shouldActivatePanel() {
    return isElectionMainPage() && !isRecoverableElectionProblemPage();
  }

  function isPlanCompletionPage() {
    return /\/eams\/myPlanCompl\.action(?:[?#]|$)/.test(location.href);
  }

  function isElectionPortalPage() {
    return /\/eams\/stdElectCourse\.action(?:[?#]|$)/.test(location.href);
  }

  function isElectionMainPage() {
    return /\/eams\/stdElectCourse!defaultPage\.action(?:[?#]|$)/.test(location.href);
  }

  function localizedEamsUrl(pathOrUrl) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      const absolute = new URL(pathOrUrl);
      if (absolute.origin !== location.origin) return absolute.href;
    }
    const url = new URL(pathOrUrl, location.origin);
    if (url.origin === location.origin && /\/eams\//.test(url.pathname)) {
      url.searchParams.set("request_locale", PREFERRED_EAMS_LOCALE);
    }
    return url.href;
  }

  function electionPortalUrl() {
    return localizedEamsUrl("/eams/stdElectCourse.action");
  }

  function isRecoverableElectionProblemPage() {
    if (!isElectionMainPage()) return false;
    const text = cleanText(document.body?.textContent || "");
    if (!text) return false;
    if (document.querySelector("#electableLessonList, #electedLessonList") || /\blessonJSONs\b/.test(text)) return false;
    if (document.querySelector("#error_img, #exceptionStack")) return true;
    return /出错了|Error happened|参数非法|非法参数|连接中断|选课系统连接中断|服务器连接中断|会话.*失效|请重新登录|不在选课时间|未开放|选课轮次不存在|轮次.*不存在|profile|exception/i.test(text);
  }

  function installElectionPortalHelper() {
    if (document.getElementById(`${APP_ID}-portal`)) return;
    const helper = document.createElement("section");
    helper.id = `${APP_ID}-portal`;
    const currentLink = currentPortalEntryLink();
    helper.innerHTML = `
      <div class="beams-portal-main">
        <strong>BetterEAMS 入口助手 <span>standalone ${escapeHtml(APP_VERSION)}</span></strong>
        <span data-role="portal-status">${escapeHtml(currentLink ? "检测到选课入口。旧标签页请优先点“刷新入口并进入”。" : "正在寻找选课入口。")}</span>
      </div>
      <div class="beams-portal-actions">
        <button type="button" data-portal-action="refreshEnter">刷新入口并进入</button>
        <button type="button" data-portal-action="openCurrent" ${currentLink ? "" : "disabled"}>进入当前链接</button>
        <button type="button" data-portal-action="reload">刷新本页</button>
      </div>
    `;
    const host = document.querySelector("body");
    host?.insertBefore(helper, host.firstElementChild);
    document.addEventListener("click", (event) => {
      const link = event.target.closest?.('a[href*="stdElectCourse!defaultPage.action"]');
      if (!link || link.closest(`#${APP_ID}-portal`)) return;
      event.preventDefault();
      refreshPortalEntryAndEnter(helper);
    }, true);
    helper.addEventListener("click", (event) => {
      const button = event.target.closest("[data-portal-action]");
      if (!button) return;
      event.preventDefault();
      const action = button.dataset.portalAction;
      if (action === "refreshEnter") refreshPortalEntryAndEnter(helper);
      if (action === "openCurrent") {
        const url = currentPortalEntryLink();
        if (url) location.assign(appendFreshEntryHint(url));
      }
      if (action === "reload") location.assign(electionPortalUrl());
    });
  }

  function currentPortalEntryLink(root = document) {
    const candidates = [...root.querySelectorAll?.("a[href], button[onclick], input[onclick]") || []];
    const link = candidates
      .map((element) => actionUrlFromElement(element, /stdElectCourse!defaultPage\.action/i) || element.href || "")
      .find((url) => /\/eams\/stdElectCourse!defaultPage\.action/i.test(url));
    return link ? localizedEamsUrl(link) : "";
  }

  async function refreshPortalEntryAndEnter(helper) {
    const status = helper.querySelector('[data-role="portal-status"]');
    const buttons = [...helper.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    if (status) status.textContent = "正在重新读取 EAMS 入口...";
    try {
      const response = await fetch(electionPortalUrl(), {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "text/html, */*; q=0.01" }
      });
      const html = await response.text();
      const problem = responseProblemText(html);
      if (!response.ok || problem && /登录|连接中断|参数非法|未开放|不在选课时间/.test(problem)) {
        throw new Error(problem || `HTTP ${response.status}`);
      }
      const doc = new DOMParser().parseFromString(html, "text/html");
      const url = currentPortalEntryLink(doc);
      if (!url) throw new Error("没有在入口页找到“进入选课”链接。");
      location.assign(appendFreshEntryHint(url));
    } catch (error) {
      if (status) status.textContent = `入口刷新失败：${error?.message || "EAMS 没有返回入口"}`;
      showActionResult("无法刷新选课入口", `${error?.message || "EAMS 没有返回入口"}\n\n可以刷新准备页后再进入；如果仍然失败，通常是 EAMS 会话断开或选课轮次暂未开放。`, "error");
      buttons.forEach((button) => { button.disabled = false; });
    }
  }

  function appendFreshEntryHint(url) {
    const target = new URL(url, location.href);
    target.searchParams.set("request_locale", PREFERRED_EAMS_LOCALE);
    target.searchParams.set("_beamsFresh", String(Date.now()));
    return target.href;
  }

  function installElectionRecoveryPanel() {
    if (document.getElementById(`${APP_ID}-recovery`)) return;
    const problem = responseProblemText(document.body?.innerHTML || document.body?.textContent || "") ||
      "EAMS 返回了异常页面，通常是旧入口参数、会话中断或选课轮次状态变化。";
    const panelNode = document.createElement("section");
    panelNode.id = `${APP_ID}-recovery`;
    panelNode.innerHTML = `
      <div class="beams-recovery-head">
        <strong>BetterEAMS 检测到 EAMS 没有进入选课页</strong>
        <span>standalone ${escapeHtml(APP_VERSION)}</span>
      </div>
      <p>${escapeHtml(problem)}</p>
      <div class="beams-recovery-actions">
        <button type="button" data-recovery-action="portal">重新打开选课准备页</button>
        <button type="button" data-recovery-action="freshEnter">刷新入口并进入</button>
        <button type="button" data-recovery-action="reload">刷新当前页</button>
      </div>
    `;
    document.body?.insertBefore(panelNode, document.body.firstElementChild);
    panelNode.addEventListener("click", (event) => {
      const button = event.target.closest("[data-recovery-action]");
      if (!button) return;
      event.preventDefault();
      const action = button.dataset.recoveryAction;
      if (action === "portal") location.assign(electionPortalUrl());
      if (action === "reload") location.reload();
      if (action === "freshEnter") refreshRecoveryEntryAndEnter(panelNode);
    });
  }

  async function refreshRecoveryEntryAndEnter(node) {
    const helper = {
      querySelector: (selector) => node.querySelector(selector),
      querySelectorAll: (selector) => node.querySelectorAll(selector)
    };
    node.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    await refreshPortalEntryAndEnter(helper);
  }

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getPageWindow() {
    try {
      return typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    } catch (_) {
      return window;
    }
  }

  function emptyStudentCourseCategories() {
    return {
      available: false,
      byCourseId: new Map(),
      fallback: "",
      source: ""
    };
  }

  // EAMS renders the student-specific plan category by courseId, then falls back to course type 84.
  function parseStudentCourseCategories(pageWindow) {
    const result = emptyStudentCourseCategories();
    const courseTable = pageWindow?.electCourseTable;
    const planMap = courseTable?.planCourseTypeMap;
    const courseTypeMap = courseTable?.courseTypeMap;

    if (planMap && typeof planMap === "object") {
      result.available = true;
      addStudentCourseCategoryEntries(result.byCourseId, planMap);
      if (result.byCourseId.size) result.source = "page-plan-course-type-map";
    }
    result.fallback = courseCategoryMapValue(courseTypeMap, "84");

    const scriptText = [...document.scripts].map((script) => script.textContent || "").join("\n");
    if (!result.available && /\b(?:var\s+)?planCourseTypeMap\s*=/.test(scriptText)) {
      result.available = true;
    }

    const scriptPlanMap = parseCourseCategoryMapAssignments(scriptText, "planCourseTypeMap");
    if (scriptPlanMap.size) {
      for (const [courseId, category] of scriptPlanMap) {
        if (!result.byCourseId.has(courseId)) result.byCourseId.set(courseId, category);
      }
      if (!result.source) result.source = "script-plan-course-type-map";
    }

    if (!result.fallback) {
      result.fallback = parseCourseCategoryMapAssignments(scriptText, "courseTypeMap").get("84") || "";
    }
    return result;
  }

  function addStudentCourseCategoryEntries(target, source) {
    if (!source || typeof source !== "object") return;
    for (const [key, value] of Object.entries(source)) {
      const courseId = asText(key).match(/^t(\d+)$/)?.[1];
      const category = asText(value);
      if (courseId && category) target.set(courseId, category);
    }
  }

  function courseCategoryMapValue(source, courseId) {
    if (!source || typeof source !== "object") return "";
    return asText(source[`t${courseId}`]);
  }

  function parseCourseCategoryMapAssignments(text, variableName) {
    const result = new Map();
    const pattern = new RegExp(`${escapeRegExp(variableName)}\\s*\\[\\s*["']t(\\d+)["']\\s*\\]\\s*=\\s*(["'])((?:\\\\.|[^\\\\])*?)\\2\\s*;`, "g");
    let match;
    while ((match = pattern.exec(text))) {
      const category = decodeJsStringBody(match[3]);
      if (category) result.set(match[1], category);
    }
    return result;
  }

  function decodeJsStringBody(value) {
    return asText(value)
      .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\(["'\\])/g, "$1");
  }

  function refreshLessons() {
    rowHeaderCache = new WeakMap();
    electionState = parseElectionState();
    pageMeta = parsePageMeta();
    studentCourseCategories = parseStudentCourseCategories(getPageWindow());
    const found = collectLessons();
    lessons = mergeIntoCatalog(found.map(normalizeLesson));
    rowIndex = indexRows(lessons);
    attachCurriculumPlanMarks();
    attachCourseBenchRatings();
    lastSignature = pageSignature();
    hideLegacyCourseLists();
    updateFilterOptions();
    render();
    updateDebugState();
    ensureCurriculumPlanLoaded();
    ensureCourseBenchLoaded();
  }

  function emptyElectionState() {
    return {
      electedIds: new Set(),
      electableIds: new Set(),
      preElectIds: new Set(),
      unWithdrawableIds: new Set()
    };
  }

  function emptyPageMeta() {
    return {
      student: [],
      credit: "",
      profile: "",
      profileUrl: ""
    };
  }

  function emptyCurriculumPlan() {
    return {
      hasData: false,
      requiredCourses: [],
      groups: [],
      gaps: [],
      summary: {}
    };
  }

  function parseElectionState() {
    const text = [...document.scripts].map((script) => script.textContent || "").join("\n");
    const state = emptyElectionState();
    collectAssignedLessonIds(text, "electedIds", (value) => /true/i.test(value)).forEach((id) => state.electedIds.add(id));
    collectAssignedLessonIds(text, "electableIds").forEach((id) => state.electableIds.add(id));
    collectAssignedLessonIds(text, "preElectIds").forEach((id) => state.preElectIds.add(id));
    collectAssignedLessonIds(text, "unWithdrawableLessonIds", (value) => /true/i.test(value)).forEach((id) => state.unWithdrawableIds.add(id));
    return state;
  }

  function collectAssignedLessonIds(text, variableName, acceptValue = () => true) {
    const result = new Set();
    const pattern = new RegExp(`${escapeRegExp(variableName)}\\s*\\[\\s*["']l?(\\d+)["']\\s*\\]\\s*=\\s*([^;]+);`, "g");
    let match;
    while ((match = pattern.exec(text))) {
      if (acceptValue(match[2])) result.add(match[1]);
    }
    return result;
  }

  function parsePageMeta() {
    const meta = emptyPageMeta();
    const bodyText = originalPageText();
    const fields = parseMetaFieldsFromText(bodyText);
    const planLink = planProfileLinkElement();
    meta.student = ["学号", "姓名", "年级", "院系", "专业"]
      .map((key) => ({ key, value: fields[key] || "" }))
      .filter((item) => item.value);
    meta.profile = cleanMetaFieldValue(planLink?.textContent || fields["培养方案"] || "") || (planLink ? "我的培养方案" : "");
    meta.profileUrl = planLink?.href ? localizedEamsUrl(planLink.href) : "";
    meta.credit = bodyText.match(/本学期学分上限\s*[:：]?\s*([^\s()（）]+)(?:\s*[（(]\s*已选\s*[:：]?\s*([^)）]+)\s*[)）])?/i)?.slice(1, 3).filter(Boolean).join(" · 已选 ");
    return meta;
  }

  function originalPageText() {
    return [...document.body?.querySelectorAll("body > *") || []]
      .filter((node) => !node.closest(`#${APP_ID}-panel, #${APP_ID}-portal, #${APP_ID}-recovery, .beams-confirm-overlay, .beams-toast`))
      .map((node) => cleanText(node.textContent || ""))
      .join(" ");
  }

  function parseMetaFieldsFromText(text) {
    const fields = {};
    const source = cleanText(text).replace(/\s*[:：]\s*/g, "：");
    const keys = ["学号", "姓名", "年级", "院系", "专业", "培养方案"];
    for (const key of keys) {
      const pattern = new RegExp(`${key}：([\\s\\S]*?)(?=(?:${keys.filter((item) => item !== key).join("|")})：|本学期学分上限|$)`);
      const value = cleanMetaFieldValue(pattern.exec(source)?.[1] || "");
      if (value) fields[key] = value;
    }
    return fields;
  }

  function cleanMetaFieldValue(value) {
    return cleanText(value)
      .replace(/^培养方案：?/, "")
      .replace(/\s*(?:必修课程|课程代码|课程序号|课程名称|教师姓名|课程安排|已选\/上限|function\s+\w+)[\s\S]*$/i, "")
      .replace(/\s*(?:修改|查看|详情|进入|打开)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function planProfileLinkElement() {
    return [...document.querySelectorAll('a[href*="myPlan"]')]
      .find((item) => !item.closest(`#${APP_ID}-panel, #${APP_ID}-portal, #${APP_ID}-recovery, .beams-confirm-overlay, .beams-toast`));
  }

  function planProfileLink() {
    const link = planProfileLinkElement();
    return link?.href ? localizedEamsUrl(link.href) : "";
  }

  function collectLessons() {
    const pageWindow = getPageWindow();
    const fromWindow = lessonArraysFromWindow(pageWindow);
    const fromScripts = parseLessonsFromScripts();
    const fromTables = parseLessonsFromTables();

    return [...fromWindow, ...fromScripts, ...fromTables];
  }

  function lessonArraysFromWindow(pageWindow) {
    return LESSON_ARRAY_NAMES.flatMap((name) => {
      try {
        const value = pageWindow?.[name];
        return Array.isArray(value) ? value : [];
      } catch (_) {
        return [];
      }
    });
  }

  function parseLessonsFromScripts() {
    const result = [];
    const scripts = [...document.scripts];
    for (const script of scripts) {
      const text = script.textContent || "";
      for (const name of LESSON_ARRAY_NAMES) {
        result.push(...parseLessonArrayAssignments(text, name));
      }
    }
    return result;
  }

  function parseLessonArrayAssignments(text, name) {
    const result = [];
    const assignment = new RegExp(`(?:var\\s+)?${escapeRegExp(name)}\\s*=`, "g");
    let match;
    while ((match = assignment.exec(text))) {
      const start = text.indexOf("[", assignment.lastIndex);
      if (start < 0) continue;
      const end = findMatchingBracket(text, start);
      if (end < 0) continue;

      const source = text.slice(start, end + 1);
      try {
        const parsed = Function(`"use strict"; return (${source});`)();
        if (Array.isArray(parsed)) result.push(...parsed);
      } catch (error) {
        console.warn(`[BetterEAMS] Failed to parse ${name} script.`, error);
      }
      assignment.lastIndex = end + 1;
    }
    return result;
  }

  function findMatchingBracket(text, start) {
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === quote) {
          quote = "";
        }
        continue;
      }
      if (ch === "'" || ch === "\"" || ch === "`") {
        quote = ch;
      } else if (ch === "[") {
        depth += 1;
      } else if (ch === "]") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  function parseLessonsFromTables() {
    const result = [];
    const tables = [...document.querySelectorAll("table")];
    for (const table of tables) {
      const rows = [...table.querySelectorAll("tr")];
      if (rows.length < 2) continue;
      const tableText = cleanText(table.textContent);
      if (!/课程名称|课程代码|课程序号/.test(tableText)) continue;

      const headerRow = rows.find((row) => /课程名称|课程代码|课程序号/.test(cleanText(row.textContent)));
      const headerCells = [...(headerRow || rows[0]).children].map((cell) => cleanText(cell.textContent));
      const headers = headerCells.some(Boolean) ? headerCells : [];

      for (const row of rows.slice(1)) {
        const cells = [...row.children].map(tableCellText);
        if (cells.length < 3 || cells.join("").length < 4) continue;
        if (/课程序号|课程代码|课程名称/.test(cells.slice(0, 4).join(" "))) continue;
        const item = lessonFromCells(cells, headers, row);
        if ((item.no || item.code) && item.name) {
          item.__row = row;
          result.push(item);
        }
      }
    }
    return result;
  }

  function lessonFromCells(cells, headers, row) {
    const byHeader = (patterns) => {
      const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
      return index >= 0 ? cells[index] : "";
    };

    const codeLike = cells.find((value) => /^[A-Z]{1,8}\d{2,5}[A-Z]?(?:\.\d+)?$/i.test(value)) || "";
    const creditLike = cells.find((value) => /^\d+(?:\.\d+)?$/.test(value) && Number(value) <= 10) || "";
    const capacity = parseCapacity(byHeader([/已选\/上限|已选.*上限|人数|容量/]) || "");

    const teacherText = byHeader([/教师|老师|主讲/]);
    const cellCategory = byHeader([/^课程类别$|^类别$|^课程性质$|^性质$/]);
    const contextCategory = lessonCategoryFromRow(row, cellCategory);
    const category = contextCategory || cellCategory;
    return {
      ...lessonStateFromRow(row, headers),
      no: byHeader([/^课程序号$|^教学班$|^课号$|^编号$|^Number$/i]) || codeLike,
      code: byHeader([/^课程代码$|^课程号$|^代码$|^Course\s*Code$/i]) || codeLike.replace(/\.\d+$/, ""),
      name: byHeader([/^课程名称$|^名称$|^Course\s*Title$|^Course\s*Name$/i]) || guessNameFromCells(cells, codeLike),
      teachers: teacherText,
      teachDepartName: byHeader([/^开课院系$|^院系$|^部门$|^单位$/]),
      category,
      courseTypeName: category,
      sourceCourseTypeName: cellCategory,
      __categoryRank: contextCategory ? CATEGORY_RANK.tableContext : cellCategory ? CATEGORY_RANK.tableCell : CATEGORY_RANK.unknown,
      __categorySource: contextCategory ? "table-context" : cellCategory ? "table-cell" : "",
      credits: byHeader([/^学分$|^Credits?$/i]) || creditLike,
      gradeRecord: byHeader([/^成绩记录|^成绩记载方式$|^考核方式$|^评分方式$|^等级$/]),
      teachClassName: byHeader([/^面向对象$|^教学班$|^班级$|^专业$|^年级$|^建议修读对象$/]),
      preRequirement: byHeader([/先修|要求|备注/]),
      bstdCount: capacity.count,
      bstdLimit: capacity.limit,
      scheduleText: normalizeScheduleText(byHeader([/^课程安排$|^时间$|^地点$|^上课时间$/])),
      __searchText: cells.join(" "),
      ...lessonLinksFromRow(row, headers, teacherText)
    };
  }

  function tableCellText(cell) {
    if (!cell) return "";
    if (!cell.querySelector("br")) return normalizeScheduleText(cleanText(cell.textContent));
    const clone = cell.cloneNode(true);
    for (const br of clone.querySelectorAll("br")) {
      br.replaceWith(document.createTextNode("；"));
    }
    return normalizeScheduleText(cleanText(clone.textContent));
  }

  function lessonStateFromRow(row, headers) {
    const result = {};
    if (!row) return result;

    const lessonId = lessonIdFromRow(row);
    if (lessonId) {
      result.id = lessonId;
      result.lessonId = lessonId;
    }

    const cells = [...row.children];
    const actionIndex = headers.findIndex((header) => /操作|选课|退课|退选|Action/i.test(header));
    const actionScope = actionIndex >= 0 ? cells[actionIndex] : row;
    const actionText = [
      row.id,
      row.className,
      cleanText(actionScope?.textContent),
      ...[...(actionScope?.querySelectorAll?.("a, button, input") || [])].map((element) => [
        element.getAttribute("operator"),
        element.getAttribute("onclick"),
        element.getAttribute("href"),
        element.value,
        element.title
      ].filter(Boolean).join(" "))
    ].join(" ");

    if (/defaultElected|elected|WITHDRAW|退课|退选|撤销|取消/i.test(actionText)) {
      result.elected = true;
      result.withdrawable = !/unWithdrawable|不可退|禁止退|disabled/i.test(actionText);
    }
    if (/preElect|预选/i.test(actionText)) {
      result.preElect = true;
    }
    if (/operator\s*=\s*["']?(?:ELECT|SELECT|ENROLL)|选课|补选|加入/i.test(actionText)) {
      result.electable = true;
    }

    return result;
  }

  function lessonIdFromRow(row) {
    if (!row) return "";
    const rowId = asText(row.id).match(/(?:^|\b)lesson(\d+)(?:\b|$)/i)?.[1];
    if (rowId) return rowId;

    const source = [
      row.getAttribute("data-lesson-id"),
      row.getAttribute("lessonId"),
      ...[...row.querySelectorAll("a[href], a[onclick], button[onclick], input[onclick]")].map((element) => [
        element.getAttribute("onclick"),
        element.getAttribute("href"),
        element.getAttribute("data-lesson-id"),
        element.getAttribute("lessonId")
      ].filter(Boolean).join(" "))
    ].join(" ");
    return source.match(/lessonId\s*[:=]\s*["']?(\d+)/i)?.[1] ||
      source.match(/syllabusInfoLessonId=(\d+)/i)?.[1] ||
      "";
  }

  function lessonLinksFromRow(row, headers, teacherText) {
    const result = {};
    if (!row) return result;

    const cells = [...row.children];
    const teacherIndex = headers.findIndex((header) => /教师|老师|主讲/.test(header));
    const teacherScope = teacherIndex >= 0 ? cells[teacherIndex] : row;
    const teacherNames = normalizeTeachers(teacherText);
    const teacherLink = [...teacherScope.querySelectorAll("a[href], a[onclick]")].find((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const onclick = anchor.getAttribute("onclick") || "";
      const text = cleanText(anchor.textContent || anchor.title || "");
      return isTeacherLinkCandidate({ teachers: teacherNames }, text, href, onclick);
    });
    if (teacherLink) result.teacherProfileUrl = teacherUrlFromElement(teacherLink);

    const syllabusLink = [...row.querySelectorAll("a[href], a[onclick]")].find((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const onclick = anchor.getAttribute("onclick") || "";
      return /syllabusInfo\.action/i.test(href + onclick);
    });
    if (syllabusLink) result.syllabusUrl = actionUrlFromElement(syllabusLink, /syllabusInfo\.action/i);

    return result;
  }

  function lessonCategoryFromRow(row, cellCategory = "") {
    if (!row) return "";
    const table = row.closest("table");
    const candidates = [];

    candidates.push(...courseCategoryAttributeTexts(row));
    if (table) {
      candidates.push(...courseCategoryAttributeTexts(table));
      candidates.push(cleanText(table.caption?.textContent || ""));
      candidates.push(...courseCategoryNearbyTexts(table));
      candidates.push(...courseCategoryControlTexts(table));
      if (table.id === "electGroupResultsTable") {
        candidates.push(cleanText(document.querySelector("#electDescription")?.textContent || ""));
        candidates.push(...selectedCourseCategoryControlTexts());
      }
      if (table.id === "requiredCourse") candidates.push("专业必修");
    }

    const cellLabel = courseCategoryLabel(cellCategory);
    const seen = new Set();
    for (const candidate of candidates) {
      const text = cleanText(candidate);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      if (!isCourseCategoryContextText(text)) continue;
      const label = courseCategoryLabel(text);
      if (label && label !== cellLabel) return label;
      if (label) return label;
    }
    return "";
  }

  function courseCategoryAttributeTexts(element) {
    if (!element?.getAttribute) return [];
    return [
      "data-category",
      "data-course-category",
      "data-course-type",
      "data-group",
      "data-group-name",
      "title",
      "aria-label"
    ].map((name) => cleanText(element.getAttribute(name) || "")).filter(Boolean);
  }

  function courseCategoryNearbyTexts(element) {
    const texts = [];
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
      let sibling = current.previousElementSibling;
      for (let count = 0; sibling && count < 8; count += 1, sibling = sibling.previousElementSibling) {
        const text = cleanText(sibling.textContent || "");
        if (isCourseCategoryContextText(text)) texts.push(text);
      }
      const heading = current.parentElement?.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > legend, :scope > .title, :scope > .grid-title, :scope > .elect-title");
      const headingText = cleanText(heading?.textContent || "");
      if (isCourseCategoryContextText(headingText)) texts.push(headingText);
    }
    return texts;
  }

  function courseCategoryControlTexts(element) {
    const texts = [];
    const ids = [];
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      if (current.id) ids.push(current.id);
      const labelledBy = cleanText(current.getAttribute?.("aria-labelledby") || "");
      if (labelledBy) ids.push(labelledBy);
    }
    for (const id of uniqueValues(ids)) {
      const escaped = cssEscape(id);
      const controls = [
        ...document.querySelectorAll(`[href="#${escaped}"], [aria-controls="${escaped}"], [data-target="#${escaped}"], [data-target="${escaped}"]`),
        document.getElementById(id)
      ].filter(Boolean);
      for (const control of controls) {
        const text = cleanText(control.textContent || control.getAttribute?.("title") || control.getAttribute?.("aria-label") || "");
        if (isCourseCategoryContextText(text)) texts.push(text);
      }
    }
    return texts;
  }

  function selectedCourseCategoryControlTexts() {
    const texts = [];
    for (const option of document.querySelectorAll("select option:checked")) {
      const text = cleanText(option.textContent || "");
      if (isCourseCategoryContextText(text)) texts.push(text);
    }
    for (const input of document.querySelectorAll("input[type='radio']:checked, input[type='checkbox']:checked")) {
      const id = input.id ? cssEscape(input.id) : "";
      const label = input.closest("label") || (id ? document.querySelector(`label[for="${id}"]`) : null);
      const text = cleanText(label?.textContent || input.getAttribute("title") || "");
      if (isCourseCategoryContextText(text)) texts.push(text);
    }
    return texts;
  }

  function isCourseCategoryContextText(text) {
    const value = cleanText(text);
    if (!value || value.length > 260) return false;
    if (/课程序号|课程代码|课程名称|教师姓名|已选\/上限|课程安排/.test(value)) return false;
    return Boolean(courseCategoryLabel(value));
  }

  function courseCategoryLabel(text) {
    const value = cleanText(text);
    if (!value) return "";
    for (const [pattern, label] of COURSE_CATEGORY_PATTERNS) {
      if (pattern.test(value)) return label;
    }
    return "";
  }

  function guessNameFromCells(cells, codeLike) {
    const candidates = cells.filter((value) => value && value !== codeLike && !/^\d+(?:\.\d+)?$/.test(value));
    return candidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  function normalizeLesson(raw, index) {
    const arrangeInfo = Array.isArray(raw.arrangeInfo) ? raw.arrangeInfo : [];
    const rawId = asText(raw.id || raw.lessonId || "");
    const code = asText(raw.code || raw.courseCode || raw.no).replace(/\.\d+$/, "");
    const no = asText(raw.no || raw.lessonNo || raw.code || code);
    const categoryInfo = normalizeLessonCategory(raw);
    const category = categoryInfo.value || "未分类";
    const dept = asText(raw.teachDepartName || raw.department || raw.dept || "未标明院系");
    const teachers = normalizeTeachers(raw.teachers || raw.teacherName || raw.teacher || "");
    const bLimit = toNumber(raw.bstdLimit);
    const bCount = toNumber(raw.bstdCount);
    const yLimit = toNumber(raw.ystdLimit);
    const yCount = toNumber(raw.ystdCount);
    const limit = bLimit + yLimit;
    const count = bCount + yCount;
    const hasCapacity = limit > 0;
    const available = hasCapacity ? limit - count : null;

    const hasStateId = Boolean(rawId);
    const elected = raw.elected === true || (hasStateId && electionState.electedIds.has(rawId));
    const preElect = raw.preElect === true || (hasStateId && electionState.preElectIds.has(rawId));
    const electable = raw.electable === true || (hasStateId && raw.electable !== false && (electionState.electableIds.size === 0 || electionState.electableIds.has(rawId) || elected || preElect));
    const withdrawable = hasStateId ? raw.withdrawable !== false && !electionState.unWithdrawableIds.has(rawId) : raw.withdrawable;

    const item = {
      id: rawId || no || `${code}-${index}`,
      rawId,
      lessonId: rawId,
      raw,
      row: raw.__row || null,
      no,
      code,
      name: asText(raw.name || raw.courseName || ""),
      credits: toNumber(raw.credits),
      category,
      categorySource: categoryInfo.source,
      categorySourceRank: categoryInfo.rank,
      sourceCourseTypeName: asText(raw.sourceCourseTypeName || raw.courseTypeName || raw.courseType || ""),
      dept,
      teachers,
      gradeRecord: asText(raw.gradeRecord || raw.examModeName || raw.scoreType || ""),
      campus: asText(raw.campusName || raw.campus || ""),
      courseMoldName: asText(raw.courseMoldName || ""),
      teachClassName: asText(raw.teachClassName || ""),
      preRequirement: asText(raw.preRequirement || ""),
      similarcourses: asText(raw.similarcourses || ""),
      remark: asText(raw.remark || ""),
      scheduled: raw.scheduled !== false,
      elected,
      preElect,
      electable,
      withdrawable,
      bLimit,
      bCount,
      yLimit,
      yCount,
      limit,
      count,
      available,
      hasCapacity,
      arrangeInfo,
      scheduleText: formatSchedule(arrangeInfo) || asText(raw.scheduleText),
      syllabusUrl: asText(raw.syllabusUrl),
      teacherProfileUrl: asText(raw.teacherProfileUrl),
      searchExtras: asText(raw.__searchText)
    };
    rebuildLessonSearchData(item);
    return item;
  }

  function normalizeLessonCategory(raw = {}) {
    const explicitRank = Number(raw.__categoryRank);
    const rankedValue = (value, fallbackRank, source) => ({
      value: asText(value),
      rank: Number.isFinite(explicitRank) ? explicitRank : fallbackRank,
      source: asText(raw.__categorySource || source)
    });
    const candidates = [
      studentCourseCategoryForRaw(raw),
      rankedValue(raw.category, CATEGORY_RANK.rawCategory, "category"),
      rankedValue(raw.displayCategory || raw.electionCategory, CATEGORY_RANK.rawCategory, "display-category"),
      rankedValue(raw.courseTypeName, CATEGORY_RANK.raw, "courseTypeName"),
      rankedValue(raw.type || raw.courseType, CATEGORY_RANK.raw, "courseType")
    ].filter((item) => item && item.value && item.value !== "未分类");
    candidates.sort((a, b) => b.rank - a.rank);
    return candidates[0] || { value: "", rank: CATEGORY_RANK.unknown, source: "" };
  }

  function studentCourseCategoryForRaw(raw = {}) {
    if (!studentCourseCategories.available) return null;
    const courseId = asText(raw.courseId || raw.course?.id).match(/\d+/)?.[0] || "";
    const category = courseId ? studentCourseCategories.byCourseId.get(courseId) : "";
    if (category) {
      return {
        value: category,
        rank: CATEGORY_RANK.studentPlan,
        source: "planCourseTypeMap"
      };
    }
    if (courseId && studentCourseCategories.fallback) {
      return {
        value: studentCourseCategories.fallback,
        rank: CATEGORY_RANK.studentFallback,
        source: "planCourseTypeMap-fallback"
      };
    }
    return null;
  }

  function normalizeTeachers(value) {
    if (Array.isArray(value)) return value.map(asText).filter(Boolean);
    return asText(value).split(/[,，;；、]+/).map((item) => item.trim()).filter(Boolean);
  }

  function rebuildLessonSearchData(item) {
    if (!item) return;
    item.searchIndex = {
      all: buildSearchIndex([
        item.searchExtras,
        item.no,
        item.code,
        item.name,
        item.category,
        item.sourceCourseTypeName,
        item.dept,
        item.teachers?.join(" "),
        item.gradeRecord,
        item.courseMoldName,
        item.teachClassName,
        item.preRequirement,
        item.similarcourses,
        item.remark,
        item.campus,
        item.scheduleText
      ].join(" ")),
      name: buildSearchIndex(item.name),
      no: buildSearchIndex(item.no),
      code: buildSearchIndex(`${item.no} ${item.code}`),
      teachers: buildSearchIndex(item.teachers?.join(" ")),
      category: buildSearchIndex(item.category),
      dept: buildSearchIndex(item.dept)
    };
    item.searchText = item.searchIndex.all.plain;
  }

  function dedupeLessons(items) {
    const seen = new Map();
    const result = [];
    for (const item of items) {
      const key = lessonKey(item);
      const existing = seen.get(key);
      if (existing) {
        mergeLesson(existing, item);
        continue;
      }
      seen.set(key, item);
      result.push(item);
    }
    return result;
  }

  function mergeIntoCatalog(items) {
    const merged = dedupeLessons(items);
    for (const item of merged) {
      const key = lessonKey(item);
      const existing = lessonCatalog.get(key);
      if (existing) {
        mergeLesson(existing, item);
      } else {
        lessonCatalog.set(key, item);
      }
    }
    return dedupeLessons([...lessonCatalog.values()]);
  }

  function lessonKey(item) {
    if (item.no) return `no:${normalizeSearchText(item.no)}`;
    if (item.code && item.name) return `code-name:${normalizeSearchText(item.code)}:${normalizeSearchText(item.name)}`;
    return `id:${item.id || item.name}`;
  }

  function mergeLesson(target, source) {
    if (source.row && document.contains(source.row)) target.row = source.row;
    if (source.raw) target.raw = mergeRawLesson(target.raw, source.raw);
    if (source.rawId) {
      target.rawId = source.rawId;
      target.lessonId = source.lessonId || source.rawId;
    }
    if (source.searchExtras && !normalizeSearchText(target.searchExtras).includes(normalizeSearchText(source.searchExtras))) {
      target.searchExtras = `${asText(target.searchExtras)} ${source.searchExtras}`.trim();
    }
    mergeLessonCategory(target, source);
    if (source.teachers?.length && !target.teachers?.length) target.teachers = source.teachers;
    if (source.arrangeInfo?.length && !target.arrangeInfo?.length) target.arrangeInfo = source.arrangeInfo;
    for (const key of ["teachClassName", "preRequirement", "remark", "similarcourses", "scheduleText", "syllabusUrl", "teacherProfileUrl"]) {
      if (!target[key] && source[key]) target[key] = source[key];
    }
    for (const key of ["name", "no", "code", "dept", "gradeRecord", "campus", "courseMoldName"]) {
      if ((!target[key] || /未分类|未标明院系/.test(target[key]) || isPlaceholderLessonName(target, key)) && source[key]) target[key] = source[key];
    }
    for (const key of ["scheduled"]) {
      if (source[key] !== undefined) target[key] = source[key];
    }
    if (hasReliableState(source)) {
      for (const key of ["elected", "preElect", "electable", "withdrawable"]) {
        if (source[key] !== undefined) target[key] = source[key];
      }
    }
    if (source.hasCapacity) {
      target.bLimit = source.bLimit;
      target.bCount = source.bCount;
      target.yLimit = source.yLimit;
      target.yCount = source.yCount;
      target.limit = source.limit;
      target.count = source.count;
      target.available = source.available;
      target.hasCapacity = source.hasCapacity;
    }
    rebuildLessonSearchData(target);
  }

  function mergeLessonCategory(target, source) {
    const sourceCategory = asText(source.category);
    if (!sourceCategory || sourceCategory === "未分类") return;

    const targetCategory = asText(target.category);
    const sourceRank = lessonCategoryRank(source);
    const targetRank = lessonCategoryRank(target);
    const shouldReplace = !targetCategory ||
      targetCategory === "未分类" ||
      sourceRank > targetRank ||
      sourceRank === targetRank && source.row && document.contains(source.row) && !(target.row && document.contains(target.row));

    if (shouldReplace) {
      target.category = sourceCategory;
      target.categorySource = source.categorySource || target.categorySource || "";
      target.categorySourceRank = sourceRank;
    }

    target.categoryCandidates = uniqueValues([
      ...(Array.isArray(target.categoryCandidates) ? target.categoryCandidates : []),
      targetCategory,
      sourceCategory
    ]);
  }

  function lessonCategoryRank(item) {
    const rank = Number(item?.categorySourceRank);
    if (Number.isFinite(rank)) return rank;
    if (item?.row && document.contains(item.row)) return CATEGORY_RANK.tableCell;
    return CATEGORY_RANK.raw;
  }

  function hasReliableState(item) {
    return Boolean(item.rawId || item.lessonId || (item.raw && (item.raw.id || item.raw.lessonId)));
  }

  function mergeRawLesson(targetRaw = {}, sourceRaw = {}) {
    const targetScore = rawRichness(targetRaw);
    const sourceScore = rawRichness(sourceRaw);
    const merged = sourceScore >= targetScore ? { ...targetRaw, ...sourceRaw } : { ...sourceRaw, ...targetRaw };
    for (const key of ["teacherProfileUrl", "syllabusUrl", "teacherUrl", "teacherHomePage", "teacherHomepage", "teacherIntroUrl", "teacherLink"]) {
      if (sourceRaw[key] && !merged[key]) merged[key] = sourceRaw[key];
      if (targetRaw[key] && !merged[key]) merged[key] = targetRaw[key];
    }
    if (sourceRaw.__row && document.contains(sourceRaw.__row)) merged.__row = sourceRaw.__row;
    else if (targetRaw.__row && document.contains(targetRaw.__row)) merged.__row = targetRaw.__row;
    return merged;
  }

  function rawRichness(raw = {}) {
    let score = 0;
    if (raw.id || raw.lessonId) score += 20;
    if (Array.isArray(raw.arrangeInfo) && raw.arrangeInfo.length) score += 12;
    if (raw.name || raw.courseName) score += 4;
    if (raw.bstdLimit || raw.ystdLimit) score += 3;
    if (raw.teacherProfileUrl || raw.syllabusUrl) score += 2;
    return score;
  }

  async function ensureCourseBenchLoaded(force = false) {
    const now = Date.now();
    const cacheFresh = courseBenchCatalog.size > 0 && now - courseBenchFetchedAt < COURSEBENCH_CACHE_TTL;
    const retryCoolingDown = courseBenchError && now - courseBenchLastAttemptAt < COURSEBENCH_RETRY_DELAY;
    if (courseBenchLoading || (!force && (cacheFresh || retryCoolingDown))) return;

    courseBenchLastAttemptAt = now;
    courseBenchLoading = true;
    courseBenchError = "";
    render();
    try {
      const courses = await requestCourseBenchCourses();
      const catalog = buildCourseBenchCatalog(courses);
      if (!catalog.size) throw new Error("CourseBench 没有返回课程数据");

      courseBenchCatalog = catalog;
      courseBenchFetchedAt = Date.now();
      courseBenchLoaded = true;
      writeJson(COURSEBENCH_CACHE_KEY, {
        fetchedAt: courseBenchFetchedAt,
        courses: [...courseBenchCatalog.values()]
      });
    } catch (error) {
      courseBenchError = error?.message || "读取失败";
      console.warn("[BetterEAMS] Failed to read CourseBench ratings.", error);
    } finally {
      courseBenchLoading = false;
      attachCourseBenchRatings();
      render();
      updateDebugState();
    }
  }

  function requestCourseBenchCourses() {
    if (typeof GM_xmlhttpRequest === "function") {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: COURSEBENCH_API_URL,
          headers: { "Accept": "application/json" },
          anonymous: true,
          timeout: 15000,
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(`CourseBench HTTP ${response.status}`));
              return;
            }
            try {
              const payload = JSON.parse(response.responseText || "{}");
              if (payload.error || !Array.isArray(payload.data)) throw new Error("CourseBench 响应格式异常");
              resolve(payload.data);
            } catch (error) {
              reject(error);
            }
          },
          onerror: () => reject(new Error("无法连接 CourseBench")),
          ontimeout: () => reject(new Error("CourseBench 请求超时"))
        });
      });
    }

    return fetch(COURSEBENCH_API_URL, {
      method: "GET",
      credentials: "omit",
      headers: { "Accept": "application/json" }
    }).then(async (response) => {
      if (!response.ok) throw new Error(`CourseBench HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.error || !Array.isArray(payload.data)) throw new Error("CourseBench 响应格式异常");
      return payload.data;
    });
  }

  function buildCourseBenchCatalog(courses) {
    const catalog = new Map();
    if (!Array.isArray(courses)) return catalog;
    for (const raw of courses) {
      const course = normalizeCourseBenchCourse(raw);
      if (!course) continue;
      const current = catalog.get(course.code);
      if (!current || course.commentCount > current.commentCount) catalog.set(course.code, course);
    }
    return catalog;
  }

  function normalizeCourseBenchCourse(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = toNumber(raw.id);
    const code = normalizeCourseCode(raw.code);
    const sourceScores = Array.isArray(raw.score) ? raw.score : raw.scores;
    if (!id || !code || !Array.isArray(sourceScores) || sourceScores.length < 4) return null;
    const scores = sourceScores.slice(0, 4).map((value) => {
      const score = Number(value);
      return Number.isFinite(score) ? Math.min(5, Math.max(0, score)) : 0;
    });
    return {
      id,
      code,
      name: asText(raw.name),
      scores,
      commentCount: Math.max(0, toNumber(raw.comment_num ?? raw.commentCount))
    };
  }

  function attachCourseBenchRatings() {
    for (const item of lessons) {
      const code = normalizeCourseCode(item.code || item.no);
      item.courseBenchRating = code ? courseBenchCatalog.get(code) || null : null;
    }
  }

  async function ensureCurriculumPlanLoaded(force = false) {
    if (isPlanCompletionPage()) return;
    if (curriculumPlanLoading || (curriculumPlanLoaded && !force)) return;

    curriculumPlanLoading = true;
    curriculumPlanError = "";
    render();
    try {
      const response = await fetch(localizedEamsUrl(PLAN_COMPLETION_PATH), {
        method: "GET",
        credentials: "include",
        headers: { "Accept": "text/html, */*; q=0.01" }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const documentFromPlan = new DOMParser().parseFromString(html, "text/html");
      curriculumPlan = parseCurriculumPlanDocument(documentFromPlan);
      curriculumPlanLoaded = true;
    } catch (error) {
      curriculumPlanError = error?.message || "读取失败";
      curriculumPlan = emptyCurriculumPlan();
      console.warn("[BetterEAMS] Failed to read plan completion page.", error);
    } finally {
      curriculumPlanLoading = false;
      attachCurriculumPlanMarks();
      render();
      updateDebugState();
    }
  }

  function parseCurriculumPlanDocument(root) {
    const planTable = findPlanCompletionTable(root);
    if (!planTable) return emptyCurriculumPlan();

    const rows = [...planTable.querySelectorAll("tr")];
    const headerIndex = rows.findIndex((row) => /课程序号|课程名称|要求学分|是否通过/.test(cleanText(row.textContent)));
    const contentRows = rows.slice(Math.max(headerIndex + 1, 0));
    const requiredCourses = [];
    const groups = [];

    for (const row of contentRows) {
      const cells = [...row.children].map((cell) => cleanText(cell.textContent));
      if (isPlanCourseRow(cells)) {
        const course = parsePlanCourseRow(cells);
        if (course) requiredCourses.push(course);
      } else if (isPlanGroupRow(cells)) {
        const group = parsePlanGroupRow(cells);
        if (group) groups.push(group);
      }
    }

    const gaps = [
      ...requiredCourses.filter((item) => item.missing).map((item) => ({ ...item, kind: "required" })),
      ...groups.filter((item) => item.missingCredit > 0 || item.missingCourses > 0).map((item) => ({ ...item, kind: "group" }))
    ];

    return {
      hasData: Boolean(requiredCourses.length || groups.length),
      requiredCourses,
      groups,
      gaps,
      summary: parsePlanSummary(root)
    };
  }

  function findPlanCompletionTable(root) {
    return [...root.querySelectorAll("table")].find((table) => {
      const text = cleanText(table.textContent);
      const hasCourseColumns = /课程序号|课程名称/.test(text) || /\bNumber\b/.test(text) && /Course\s*Title/i.test(text);
      const hasCreditColumns = /要求学分/.test(text) || /Required\s*Credits?|Credits?\s*Required/i.test(text);
      const hasPassedColumn = /是否通过|Passed/i.test(text);
      return hasCourseColumns && hasCreditColumns && hasPassedColumn;
    }) || null;
  }

  function parsePlanSummary(root) {
    const infoTable = [...root.querySelectorAll("table")].find((table) => /要求学分\/完成学分\/实修学分|审核结果/.test(cleanText(table.textContent)));
    if (!infoTable) return {};
    const text = cleanText(infoTable.textContent);
    return {
      creditsText: text.match(/要求学分\/完成学分\/实修学分:\s*([\d./\s]+)/)?.[1]?.trim() || "",
      auditText: text.match(/审核结果:\s*([^审]+?)(?:审核时间:|$)/)?.[1]?.trim() || ""
    };
  }

  function isPlanCourseRow(cells) {
    return cells.length >= 8 && Boolean(normalizeCourseCode(cells[1])) && cells[2] && /^\d+(?:\.\d+)?$/.test(cells[3] || "");
  }

  function isPlanGroupRow(cells) {
    if (cells.length < 5) return false;
    if (normalizeCourseCode(cells[1])) return false;
    if (!cleanPlanGroupTitle(cells[0])) return false;
    const hasCreditColumns = /^\d+(?:\.\d+)?$/.test(cells[1] || "") && /^\d+(?:\.\d+)?$/.test(cells[2] || "");
    return hasCreditColumns && /缺\s*\d|未完成|否/.test(planGroupStatusCell(cells));
  }

  function parsePlanCourseRow(cells) {
    const required = toNumber(cells[3]);
    const completed = toNumber(cells[4]);
    const actual = toNumber(cells[5]);
    const status = cells[7] || "";
    const remark = cells[8] || "";
    return {
      code: asText(cells[1]),
      name: asText(cells[2]),
      required,
      completed,
      actual,
      status,
      remark,
      missing: isPlanCourseMissing(status, required, completed, remark)
    };
  }

  function parsePlanGroupRow(cells) {
    const title = cleanPlanGroupTitle(cells[0]);
    const required = toNumber(cells[1]);
    const completed = toNumber(cells[2]);
    const actual = toNumber(cells[3]);
    const status = planGroupStatusCell(cells);
    const missing = parsePlanMissingText(status, required, completed);
    if (!title) return null;
    return {
      category: title,
      actionable: isActionablePlanGroup(title, status),
      required,
      completed,
      actual,
      limitText: status,
      missingCredit: missing.credit,
      missingCourses: missing.courses,
      missing: missing.credit || missing.courses || 0,
      unit: missing.courses ? "course" : "credit",
      matchers: { codes: [], names: [] }
    };
  }

  function planGroupStatusCell(cells) {
    return cells.find((cell) => /缺\s*\d|未完成|否/.test(cell)) || cells[5] || cells[cells.length - 1] || "";
  }

  function isActionablePlanGroup(title, status = "") {
    const category = cleanPlanGroupTitle(title);
    if (!category || BROAD_PLAN_GROUPS.has(category)) return false;
    if (/缺\s*\d/.test(status)) return true;
    return ACTIONABLE_PLAN_GROUP_HINT.test(category);
  }

  function isPlanCourseMissing(status, required, completed, remark = "") {
    const text = cleanText(`${status} ${remark}`);
    if (/在读|on\s*reading|taking/i.test(text)) return false;
    if (/^(yes|passed)$/i.test(text) || /是|通过|已完成|完成/.test(text) && completed >= required && required > 0) return false;
    if (/^(no|failed|unpassed)$/i.test(text) || /否|未通过|未修|未完成|缺/.test(text)) return true;
    return required > 0 && completed < required;
  }

  function parsePlanMissingText(text, required, completed) {
    const source = cleanText(text);
    const creditMatch = source.match(/缺\s*(\d+(?:\.\d+)?)\s*分/);
    const courseMatch = source.match(/缺\s*(\d+(?:\.\d+)?)\s*门/) ||
      source.match(/Lost\s*(\d+(?:\.\d+)?)\s*Courses?/i);
    return {
      credit: creditMatch ? Number(creditMatch[1]) : Math.max(0, (required || 0) - (completed || 0)),
      courses: courseMatch ? Number(courseMatch[1]) : 0
    };
  }

  function cleanPlanGroupTitle(value) {
    return cleanText(value)
      .replace(/^[一二三四五六七八九十]+[、.\s]*/, "")
      .replace(/^\(?[一二三四五六七八九十]+\)?[、.\s]*/, "")
      .replace(/^\d+(?:\.\d+)*\s*/, "")
      .replace(/\s+/g, "")
      .replace(/[（(].*$/, "")
      .trim();
  }

  function planCourseMatchers(text) {
    const source = cleanText(text);
    const codes = uniqueValues([...source.matchAll(/[A-Z]{1,8}\d{2,5}[A-Z]?(?:\.\d+)?/gi)].map((match) => normalizeCourseCode(match[0])).filter(Boolean));
    const names = uniqueValues(source.split(/[、,，;；/｜|（）()\[\]【】<>《》\s]+/)
      .map((item) => cleanText(item))
      .filter((item) => item.length >= 2 && item.length <= 40 && !normalizeCourseCode(item) && !/^(课程|可选|任选|或|和|及|以及|全校)$/.test(item)));
    return { codes, names };
  }

  function attachCurriculumPlanMarks() {
    for (const item of lessons) {
      item.planMatches = [];
    }
    if (!curriculumPlan.gaps.length) return;

    for (const gap of curriculumPlan.gaps) {
      for (const item of lessons) {
        const match = curriculumPlanMatchForGap(item, gap);
        if (match) item.planMatches.push(match);
      }
    }

    for (const item of lessons) {
      item.planMatches = prioritizedCurriculumPlanMatches(item.planMatches);
    }
  }

  function curriculumPlanMatchForGap(item, gap) {
    if (gap.kind === "required") {
      if (!requiredPlanCourseMatches(item, gap)) return null;
      return {
        kind: "required",
        priority: 0,
        label: "培养方案待修",
        title: `培养方案待修：${gap.name || gap.code || item.name}`
      };
    }

    if (gap.kind === "group") {
      if (!gap.actionable) return null;
      if (item.elected || item.preElect) return null;
      if (!electivePlanGroupMatches(item, gap)) return null;
      return {
        kind: "group",
        priority: planGroupMatchPriority(gap),
        generic: isGenericPlanGroup(gap),
        label: `${gap.category || "培养方案"}差${formatPlanGapMissing(gap)}`,
        title: `${gap.category || "培养方案类别"}：${gap.limitText || planGapLabel(gap)}`
      };
    }

    return null;
  }

  function curriculumPlanMatches(item) {
    return Array.isArray(item.planMatches) ? item.planMatches : [];
  }

  function prioritizedCurriculumPlanMatches(matches = []) {
    const unique = [];
    const seen = new Set();
    for (const match of matches) {
      const key = `${match.kind}:${match.label}:${match.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(match);
    }

    const hasSpecific = unique.some((match) => !match.generic);
    return unique
      .filter((match) => !hasSpecific || !match.generic)
      .sort((a, b) => (a.priority || 50) - (b.priority || 50) || a.label.localeCompare(b.label, "zh-Hans-CN"));
  }

  function hasCurriculumPlanGap(item) {
    return curriculumPlanMatches(item).length > 0;
  }

  function requiredPlanCourseMatches(item, requirement) {
    const wantedCode = normalizeCourseCode(requirement.code);
    const itemCodes = [item.code, item.no, item.raw?.code, item.raw?.courseCode, item.raw?.no]
      .map(normalizeCourseCode)
      .filter(Boolean);
    if (wantedCode && itemCodes.includes(wantedCode)) return true;

    const wantedName = normalizeSearchText(requirement.name);
    const itemName = normalizeSearchText(item.name);
    return Boolean(wantedName && itemName && (itemName === wantedName || itemName.includes(wantedName) || wantedName.includes(itemName)));
  }

  function electivePlanGroupMatches(item, group) {
    const itemCodes = [item.code, item.no, item.raw?.code, item.raw?.courseCode, item.raw?.no]
      .map(normalizeCourseCode)
      .filter(Boolean);
    if (group.matchers?.codes?.length && group.matchers.codes.some((code) => itemCodes.includes(code))) return true;

    const itemName = normalizeSearchText(item.name);
    if (group.matchers?.names?.length && group.matchers.names.some((name) => itemName.includes(normalizeSearchText(name)))) return true;

    if (group.matchers?.codes?.length || group.matchers?.names?.length) return false;

    const groupName = normalizeSearchText(group.category);
    if (!groupName) return false;
    return planGroupMatchFields(item)
      .some((value) => fieldMatchesPlanGroup(value, groupName));
  }

  function normalizeCourseCode(value) {
    const normalized = asText(value).toUpperCase().replace(/\.\d+$/, "").replace(/[^A-Z0-9]/g, "");
    return /[A-Z]/.test(normalized) && /\d/.test(normalized) ? normalized : "";
  }

  function isGenericPlanGroup(group) {
    return /任意选修|任选/.test(cleanPlanGroupTitle(group.category));
  }

  function planGroupMatchPriority(group) {
    const category = cleanPlanGroupTitle(group.category);
    if (/任意选修|任选/.test(category)) return 80;
    if (/跨学院选修/.test(category)) return 45;
    if (/课程群|体育兴趣|专业方向必修|自然科学基础选修/.test(category)) return 20;
    if (/选修/.test(category)) return 35;
    return 50;
  }

  function planGroupMatchFields(item) {
    return [
      item.category,
      item.courseMoldName,
      item.teachClassName,
      item.raw?.courseTypeName,
      item.raw?.courseType,
      item.raw?.courseKindName,
      item.raw?.moduleName
    ]
      .map(cleanPlanGroupTitle)
      .map(normalizeSearchText)
      .filter((value) => value && !GENERIC_PLAN_GROUP_FIELD.test(value));
  }

  function fieldMatchesPlanGroup(field, groupName) {
    if (!field || !groupName) return false;
    if (field === groupName) return true;
    if (field.length >= 4 && groupName.includes(field)) return true;
    if (groupName.length >= 4 && field.includes(groupName)) return true;
    return false;
  }

  function indexRows(items) {
    const rows = [...document.querySelectorAll("tr")].filter((row) => row.children.length >= 3);
    const map = new Map();

    for (const item of items) {
      if (item.row && document.contains(item.row)) {
        map.set(item.id, item.row);
        continue;
      }
      const candidates = rows.filter((row) => {
        const text = normalizeSearchText(row.textContent || "");
        return (item.no && text.includes(normalizeSearchText(item.no))) ||
          (item.code && item.name && text.includes(normalizeSearchText(item.code)) && text.includes(normalizeSearchText(item.name))) ||
          (item.name && text.includes(normalizeSearchText(item.name)));
      });
      if (candidates[0]) map.set(item.id, candidates[0]);
    }

    for (const [id, row] of map) {
      row.dataset.betterEamsLessonId = id;
      [...row.children].forEach((cell) => {
        const text = cleanText(cell.textContent);
        if (text && !cell.title) cell.title = text;
      });
    }
    return map;
  }

  function createPanel() {
    panel = document.createElement("section");
    panel.id = `${APP_ID}-panel`;
    panel.dataset.version = APP_VERSION;
    panel.innerHTML = `
      <div class="beams-head">
        <div class="beams-icon" aria-hidden="true">BE</div>
        <div class="beams-title">
          <strong>BetterEAMS 课程工作台 <span class="beams-build">standalone ${escapeHtml(APP_VERSION)}</span></strong>
          <span data-role="summary">正在读取课程...</span>
        </div>
        <button type="button" class="beams-mini" data-action="refresh" title="重新扫描页面">刷新</button>
      </div>
      <div class="beams-body">
        <div class="beams-left-pane">
          <div class="beams-page-meta" data-role="pageMeta" hidden></div>
          <div class="beams-timetable" data-role="timetable"></div>
          <div class="beams-sandbox-summary" data-role="sandbox"></div>
        </div>
        <div class="beams-right-pane">
          <div class="beams-tools">
            <strong class="beams-workspace-label">当前工作区</strong>
            <button type="button" data-action="clearPlan">清空暂存</button>
            <button type="button" data-action="toggleStagedTimetable">显示暂存叠加</button>
            <button type="button" class="beams-apply-plan" data-action="applyPlan">按工作区选课</button>
            <button type="button" data-action="clear">清空筛选</button>
            <button type="button" data-action="scrollTop">回到顶部</button>
          </div>
          <div class="beams-search-row">
            <input data-control="query" type="search" placeholder="搜课程、老师、拼音、首字母、类别、院系..." autocomplete="off">
          </div>
          <div class="beams-controls">
            ${selectHtml("type", "课程类别")}
            ${selectHtml("dept", "开课院系")}
            ${selectHtml("credit", "学分")}
            ${selectHtml("day", "星期")}
            ${selectHtml("period", "节次")}
            ${selectHtml("gradeRecord", "评分方式")}
            <label class="beams-field">
              <span>选课状态</span>
              <select data-control="status">
                <option value="all">全部</option>
                <option value="elected">已选</option>
                <option value="electable">可选</option>
                <option value="preElect">预选</option>
              </select>
            </label>
            <label class="beams-field">
              <span>余量</span>
              <select data-control="availability">
                <option value="all">全部</option>
                <option value="available">有余量</option>
                <option value="full">已满/超员</option>
                <option value="unknown">未知</option>
              </select>
            </label>
            <label class="beams-field">
              <span>排序</span>
              <select data-control="sort">
                <option value="relevance">相关度</option>
                <option value="available">余量多</option>
                <option value="name">课程名</option>
                <option value="credit">学分</option>
              </select>
            </label>
          </div>
          <div class="beams-toggles">
            <label><input data-control="onlyFavorites" type="checkbox"> 只看收藏</label>
            <label><input data-control="hideConflict" type="checkbox"> 隐藏冲突</label>
            <label><input data-control="onlyPlanGaps" type="checkbox"> 只看培养方案缺口</label>
          </div>
          <div class="beams-empty" data-role="empty" hidden></div>
          <div class="beams-list" data-role="list"></div>
        </div>
      </div>
    `;

    document.body.insertBefore(panel, document.body.firstElementChild);
    hideLegacyCourseLists();
    controls = Object.fromEntries([...panel.querySelectorAll("[data-control]")].map((node) => [node.dataset.control, node]));
    applyStateToControls();
    bindPanelEvents();
    hideLegacyPageChrome();
  }

  function selectHtml(name, label) {
    return `
      <label class="beams-field">
        <span>${escapeHtml(label)}</span>
        <select data-control="${name}">
          <option value="">全部</option>
        </select>
      </label>
    `;
  }

  function bindPanelEvents() {
    panel.addEventListener("input", (event) => {
      const control = event.target.closest("[data-control]");
      if (!control) return;
      updateStateFromControl(control);
      scheduleRender();
    });

    panel.addEventListener("change", (event) => {
      const control = event.target.closest("[data-control]");
      if (!control) return;
      updateStateFromControl(control);
      scheduleRender();
    });

    panel.addEventListener("mouseover", handleLessonPreviewEnter);
    panel.addEventListener("mouseout", handleLessonPreviewLeave);
    panel.addEventListener("focusin", handleLessonPreviewEnter);
    panel.addEventListener("focusout", handleLessonPreviewLeave);
    panel.addEventListener("mousemove", handleTimetableBlockHoverMove);
    panel.addEventListener("mouseleave", () => clearLessonPreview());
    panel.addEventListener("mouseleave", clearHoveredTimetableBlock);

    panel.addEventListener("click", (event) => {
      const block = event.target.closest(".beams-time-course[data-day][data-start-unit][data-end-unit]");
      if (block && !event.target.closest("[data-action]")) {
        if (toggleTimetableSlotFilterFromBlock(block, event)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      const button = event.target.closest("[data-action]");
      if (!button) {
        if (pinnedTimetableOverflowGroups.size && !event.target.closest(".beams-time-group")) {
          pinnedTimetableOverflowGroups.clear();
          renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
        }
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.action;
      const id = button.closest("[data-lesson-id]")?.dataset.lessonId;

      if (action === "refresh") {
        curriculumPlanLoaded = false;
        curriculumPlanError = "";
        refreshLessons();
        ensureCourseBenchLoaded(true);
      }
      if (action === "pickSlot") {
        toggleTimetableSlotFilter(button.dataset.day, button.dataset.period);
      }
      if (action === "toggleStagedTimetable") toggleStagedTimetableVisibility();
      if (action === "clear") clearFilters();
      if (action === "clearPlan") clearActivePlan();
      if (action === "applyPlan") applyActivePlanToEams();
      if (action === "scrollTop") {
        const listNode = panel.querySelector('[data-role="list"]');
        if (listNode) {
          listNode.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      }
      if (action === "favorite" && id) toggleFavorite(id);
      if (action === "planToggle" && id) toggleLessonInActivePlan(id);
      if (action === "locate" && id) locateOriginalRow(id);
      if (action === "toggleOverflowGroup") togglePinnedTimetableOverflow(button.dataset.groupId);
      if (action === "focusLesson" && (button.dataset.lessonId || id)) {
        focusLessonCard(button.dataset.lessonId || id);
        if (pinnedTimetableOverflowGroups.size) {
          pinnedTimetableOverflowGroups.clear();
          renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
        }
      }
      if (action === "origin" && id) triggerOriginalAction(id, button.dataset.originIndex, button.dataset.originKind);
    });
  }

  function handleLessonPreviewEnter(event) {
    const card = event.target.closest?.(".beams-card[data-lesson-id]");
    if (!card || !panel?.contains(card)) return;
    if (event.type === "mouseover" && card.contains(event.relatedTarget)) return;
    setLessonPreview(card.dataset.lessonId);
  }

  function handleLessonPreviewLeave(event) {
    const card = event.target.closest?.(".beams-card[data-lesson-id]");
    if (!card || !panel?.contains(card)) return;
    if (card.contains(event.relatedTarget)) return;
    clearLessonPreview(card.dataset.lessonId);
  }

  function handleTimetableBlockHoverMove(event) {
    const block = event.target.closest?.(".beams-time-course[data-lesson-id]");
    if (!block || !panel?.contains(block) || block.classList.contains("is-preview")) {
      clearHoveredTimetableBlock();
      return;
    }
    setHoveredTimetableBlock(block);
  }

  function setHoveredTimetableBlock(block) {
    if (!block || hoveredTimetableBlock === block) return;
    clearHoveredTimetableBlock();
    hoveredTimetableBlock = block;
    hoveredTimetableBlock.classList.add("is-hovered-direct");
  }

  function clearHoveredTimetableBlock() {
    if (!hoveredTimetableBlock) return;
    hoveredTimetableBlock.classList.remove("is-hovered-direct");
    hoveredTimetableBlock = null;
  }

  function setLessonPreview(id) {
    const item = lessonById(id);
    const nextId = canPreviewLessonOnTimetable(item) ? item.id : "";
    if (previewLessonId === nextId) return;
    previewLessonId = nextId;
    syncPreviewSourceCards();
    renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
  }

  function clearLessonPreview(id = "") {
    if (id && previewLessonId && previewLessonId !== id) return;
    if (!previewLessonId) return;
    previewLessonId = "";
    syncPreviewSourceCards();
    renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
  }

  function syncPreviewSourceCards() {
    if (!panel) return;
    for (const card of panel.querySelectorAll(".beams-card.is-preview-source")) {
      if (card.dataset.lessonId !== previewLessonId) card.classList.remove("is-preview-source");
    }
    if (previewLessonId) {
      panel.querySelector(`.beams-card[data-lesson-id="${cssEscape(previewLessonId)}"]`)?.classList.add("is-preview-source");
    }
  }

  function lessonById(id) {
    return lessons.find((item) => item.id === id) || null;
  }

  function canPreviewLessonOnTimetable(item) {
    return Boolean(item &&
      !isAppliedLesson(item) &&
      !activePlanLessonIds().has(item.id) &&
      Array.isArray(item.arrangeInfo) &&
      item.arrangeInfo.length);
  }

  function selectedTimetableSlot() {
    const day = DAYS.includes(state.day) ? state.day : "";
    const period = clampPeriodUnit(Number(state.period));
    return day && period ? { day, period } : null;
  }

  function toggleTimetableSlotFilter(day, period) {
    const nextDay = DAYS.includes(asText(day)) ? asText(day) : "";
    const nextPeriod = clampPeriodUnit(Number(period));
    if (!nextDay || !nextPeriod) return;

    if (state.day === nextDay && Number(state.period) === nextPeriod) {
      state.day = "";
      state.period = "";
    } else {
      state.day = nextDay;
      state.period = `${nextPeriod}`;
    }

    applyStateToControls();
    render();
    panel?.querySelector('[data-role="list"]')?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTimetableSlotFilterFromBlock(block, event) {
    const dayIndex = Number(block.dataset.day);
    const day = DAYS[dayIndex] || "";
    const startUnit = clampPeriodUnit(Number(block.dataset.startUnit));
    const endUnit = clampPeriodUnit(Number(block.dataset.endUnit));
    if (!day || !startUnit || !endUnit || endUnit < startUnit) return false;

    const rect = block.getBoundingClientRect();
    const ratio = rect.height > 0 ?
      Math.min(0.999, Math.max(0, (event.clientY - rect.top) / rect.height)) :
      0;
    const span = Math.max(1, endUnit - startUnit + 1);
    const period = Math.min(endUnit, startUnit + Math.floor(ratio * span));
    toggleTimetableSlotFilter(day, period);
    return true;
  }

  function toggleStagedTimetableVisibility() {
    state.showStagedOnTimetable = !state.showStagedOnTimetable;
    saveState();
    renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
    syncWorkspaceToolStates();
  }

  function applyStateToControls() {
    for (const [name, control] of Object.entries(controls)) {
      if (control.type === "checkbox") {
        control.checked = Boolean(state[name]);
      } else {
        control.value = state[name] ?? "";
      }
    }
  }

  function updateStateFromControl(control) {
    const name = control.dataset.control;
    state[name] = control.type === "checkbox" ? control.checked : control.value;
    saveState();
  }

  function updateFilterOptions() {
    fillSelect("type", uniqueValues(lessons.map((item) => item.category)));
    fillSelect("dept", uniqueValues(lessons.map((item) => item.dept)));
    fillSelect("credit", uniqueValues(lessons.map((item) => item.credits).filter((value) => value > 0).map((value) => `${value}`), numericCompare));
    fillSelect("day", DAYS.slice(1));
    fillSelect("period", [...Array(PERIOD_COUNT)].map((_, index) => `${index + 1}`));
    fillSelect("gradeRecord", uniqueValues(lessons.map((item) => item.gradeRecord)));
    applyStateToControls();
  }

  function fillSelect(name, values) {
    const select = controls[name];
    if (!select) return;
    const current = state[name] || "";
    const first = select.querySelector("option")?.outerHTML || '<option value="">全部</option>';
    select.innerHTML = first + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    select.value = values.includes(current) ? current : "";
    state[name] = select.value;
  }

  function render() {
    clearLessonPreview();
    saveState();
    const listNode = panel.querySelector('[data-role="list"]');
    const summaryNode = panel.querySelector('[data-role="summary"]');
    const emptyNode = panel.querySelector('[data-role="empty"]');
    const sandboxNode = panel.querySelector('[data-role="sandbox"]');
    const timetableNode = panel.querySelector('[data-role="timetable"]');
    const pageMetaNode = panel.querySelector('[data-role="pageMeta"]');
    const filtered = filteredLessons();

    syncWorkspaceToolStates();
    summaryNode.textContent = summaryText(filtered.length, lessons.length);
    renderPageMeta(pageMetaNode);
    renderSandboxSummary(sandboxNode);
    renderPlanTimetable(timetableNode);
    emptyNode.hidden = filtered.length > 0;
    emptyNode.textContent = lessons.length ? "没有符合条件的课程。" : "当前页面还没有检测到课程数据。请进入 EAMS 选课/课程搜索页面后点刷新。";
    listNode.innerHTML = filtered.slice(0, 300).map(cardHtml).join("");

    if (filtered.length > 300) {
      listNode.insertAdjacentHTML("beforeend", `<div class="beams-limit">已显示前 300 条，请继续缩小筛选条件。</div>`);
    }
    markOriginalRows(filtered);
    hideLegacyCourseLists();
    hideLegacyPageChrome();
    updateDebugState();
  }

  function syncWorkspaceToolStates() {
    const button = panel?.querySelector('[data-action="toggleStagedTimetable"]');
    if (!button) return;
    const visible = Boolean(state.showStagedOnTimetable);
    button.textContent = visible ? "隐藏暂存叠加" : "显示暂存叠加";
    button.classList.toggle("is-staged-visibility-active", visible);
    button.title = visible ? "暂存课程正在课表里按重叠分栏显示" : "把暂存课程加入课表的分栏叠加视图";
  }

  function summaryText(filteredCount, totalCount) {
    const parts = [`${filteredCount} / ${totalCount} 门课程`];
    const filters = activeFilterLabels();
    if (filters.length) parts.push(filters.join(" · "));
    return parts.join(" · ");
  }

  function activeFilterLabels() {
    const labels = [];
    if (state.query) labels.push(`搜索：${state.query}`);
    if (state.type) labels.push(`类别：${state.type}`);
    if (state.dept) labels.push(`院系：${state.dept}`);
    if (state.credit) labels.push(`${state.credit} 学分`);
    if (state.day) labels.push(state.day);
    if (state.period) labels.push(`${state.period} 节`);
    if (state.gradeRecord) labels.push(state.gradeRecord);
    if (state.status !== "all") labels.push(selectedOptionLabel("status"));
    if (state.availability !== "all") labels.push(selectedOptionLabel("availability"));
    if (state.onlyFavorites) labels.push("只看收藏");
    if (state.hideConflict) labels.push("隐藏冲突");
    if (state.onlyPlanGaps) labels.push("培养方案缺口");
    return labels;
  }

  function selectedOptionLabel(name) {
    const control = controls[name];
    return control?.selectedOptions?.[0]?.textContent?.trim() || state[name] || "";
  }

  function renderPageMeta(node) {
    if (!node) return;
    const chips = [];
    for (const item of pageMeta.student || []) {
      if (item.key && item.value) chips.push(`<span><b>${escapeHtml(item.key)}</b>${escapeHtml(item.value)}</span>`);
    }
    if (pageMeta.profile) {
      const profileText = escapeHtml(pageMeta.profile);
      chips.push(pageMeta.profileUrl ?
        `<span><b>培养方案</b><a href="${escapeHtml(pageMeta.profileUrl)}" target="_blank" rel="noopener noreferrer">${profileText}</a></span>` :
        `<span><b>培养方案</b>${profileText}</span>`);
    }
    if (pageMeta.credit) chips.push(`<span><b>学分</b>${escapeHtml(pageMeta.credit)}</span>`);

    node.hidden = !chips.length;
    node.innerHTML = chips.join("");
  }

  function renderSandboxSummary(node) {
    if (!node) return;
    const plan = activePlan();
    if (!plan) {
      node.innerHTML = "";
      node.hidden = true;
      return;
    }
    const planLessons = lessonsInPlan(plan);
    const appliedLessons = planLessons.filter(isAppliedLesson);
    const stagedLessons = planLessons.filter((item) => !isAppliedLesson(item));
    const conflicts = planConflicts(planLessons);
    const credits = planLessons.reduce((sum, item) => sum + (item.credits || 0), 0);
    const stagedCredits = stagedLessons.reduce((sum, item) => sum + (item.credits || 0), 0);
    const appliedCredits = appliedLessons.reduce((sum, item) => sum + (item.credits || 0), 0);
    const previewNames = (items, emptyText) => items.length ?
      items.slice(0, 5).map((item) => `${item.no || item.code} ${item.name}`).join("；") + (items.length > 5 ? `；等 ${items.length} 门` : "") :
      emptyText;
    const conflictHtml = conflicts.length ? `
      <details class="beams-sandbox-conflicts">
        <summary>${conflicts.length} 组时间冲突</summary>
        <ul>${conflicts.slice(0, 8).map((pair) => `<li>${escapeHtml(pair.map((item) => `${item.no || item.code} ${item.name}`).join(" ↔ "))}</li>`).join("")}</ul>
      </details>
    ` : `<span class="beams-sandbox-ok">无时间冲突</span>`;
    node.hidden = false;
    node.innerHTML = `
      <div class="beams-sandbox-main">
        <strong>当前工作区</strong>
        <span>${planLessons.length} 门 · ${formatPlainNumber(credits)} 学分</span>
        <span class="is-applied" title="${escapeHtml(previewNames(appliedLessons, "暂无"))}">已选 ${appliedLessons.length} 门 · ${formatPlainNumber(appliedCredits)} 学分</span>
        <span class="is-staged" title="${escapeHtml(previewNames(stagedLessons, "暂无"))}">本地暂存 ${stagedLessons.length} 门 · ${formatPlainNumber(stagedCredits)} 学分</span>
        ${conflictHtml}
      </div>
      ${planLessons.length ? `
        <details class="beams-plan-roster">
          <summary>工作区课程</summary>
          <ul>${planLessons.map((item) => `
            <li data-lesson-id="${escapeHtml(item.id)}">
              <span class="${isAppliedLesson(item) ? "is-applied" : "is-staged"}">${escapeHtml(isAppliedLesson(item) ? "已选" : "暂存")}</span>
              <strong>${escapeHtml(`${item.no || item.code} ${item.name}`)}</strong>
              ${item.credits ? `<em>${escapeHtml(formatPlainNumber(item.credits))} 学分</em>` : ""}
              ${isAppliedLesson(item) ?
                `<button type="button" data-action="origin" data-origin-kind="drop" title="通过 EAMS 退课">退课</button>` :
                `<button type="button" data-action="planToggle" title="从工作区暂存移除">移除</button>`}
            </li>
          `).join("")}</ul>
        </details>
      ` : ""}
    `;
  }

  function isAppliedLesson(item) {
    return Boolean(item?.elected || item?.preElect);
  }

  function renderPlanTimetable(node) {
    if (!node) return;
    clearHoveredTimetableBlock();
    const plan = activePlan();
    if (!plan) {
      node.hidden = true;
      node.innerHTML = "";
      return;
    }
    const planLessons = lessonsInPlan(plan);
    const appliedLessons = planLessons.filter(isAppliedLesson);
    const stagedLessons = planLessons.filter((item) => !isAppliedLesson(item));
    const appliedScheduled = appliedLessons.filter((item) => Array.isArray(item.arrangeInfo) && item.arrangeInfo.length);
    const stagedScheduled = stagedLessons.filter((item) => Array.isArray(item.arrangeInfo) && item.arrangeInfo.length);
    const appliedUnscheduled = appliedLessons.filter((item) => !Array.isArray(item.arrangeInfo) || !item.arrangeInfo.length);
    const stagedUnscheduled = stagedLessons.filter((item) => !Array.isArray(item.arrangeInfo) || !item.arrangeInfo.length);
    const showStaged = Boolean(state.showStagedOnTimetable);
    const visibleUnscheduled = showStaged ? [...appliedUnscheduled, ...stagedUnscheduled] : appliedUnscheduled;
    const previewLesson = lessonById(previewLessonId);
    const previewBlocks = canPreviewLessonOnTimetable(previewLesson) ?
      timetablePreviewBlocks(previewLesson) :
      [];
    if (!planLessons.length && !previewBlocks.length) {
      node.hidden = false;
      node.innerHTML = `
        <div class="beams-timetable-head">
          <strong>当前工作区课表</strong>
          <span>当前工作区还没有课程。</span>
        </div>
      `;
      return;
    }

    const appliedBlocks = timetableBlocks(appliedScheduled, { kind: "applied" });
    const stagedBlocks = showStaged ?
      timetableBlocks(stagedScheduled, { kind: "staged", isOverlay: true }) :
      [];
    const groupedLayout = layoutTimetableGroups([...appliedBlocks, ...stagedBlocks], {
      maxVisibleLanes: TIMETABLE_MAX_VISIBLE_LANES
    });
    trimPinnedTimetableOverflowGroups(groupedLayout.validGroupIds);
    const metrics = calendarMetrics();
    const periodMarks = calendarPeriodMarks(metrics);
    const lineMarks = calendarLineMarks(metrics);
    const unscheduledHtml = unscheduledTimetableHtml(visibleUnscheduled);
    const slotFilter = selectedTimetableSlot();
    const summaryParts = [`${appliedScheduled.length} 门已选有时间`];
    if (stagedScheduled.length) summaryParts.push(showStaged ? `${stagedScheduled.length} 门暂存已叠加` : `${stagedScheduled.length} 门暂存已隐藏`);
    if (visibleUnscheduled.length) summaryParts.push(`${visibleUnscheduled.length} 门未排时间`);
    const previewLabel = `
      <span class="beams-preview-row">
        <span class="beams-preview-label ${previewBlocks.length ? "" : "is-empty"}">${previewBlocks.length ? `预览：${escapeHtml(previewLesson.name || previewLesson.no || previewLesson.code || "课程")}` : "预览占位"}</span>
      </span>
    `;
    const stagedHint = !showStaged && (stagedScheduled.length || stagedUnscheduled.length) ? `
      <span class="beams-staged-hint">还有 ${escapeHtml(String(stagedScheduled.length + stagedUnscheduled.length))} 门暂存未显示</span>
    ` : "";
    node.hidden = false;
    node.innerHTML = `
      <div class="beams-timetable-head">
        <strong>当前工作区课表</strong>
        <span>${escapeHtml(summaryParts.join(" · "))}</span>
        <span class="beams-calendar-legend"><b class="is-applied"></b>已选</span>
        <span class="beams-calendar-legend"><b class="is-staged-overlay"></b>暂存叠加</span>
        <span class="beams-calendar-legend"><b class="is-preview"></b>悬停预览</span>
        ${stagedHint}
        ${previewLabel}
      </div>
      ${unscheduledHtml}
      <div class="beams-calendar-scroll">
        <div class="beams-calendar-head-row">
          <div class="beams-calendar-axis-head">节次</div>
          ${DAYS.slice(1).map((day) => `<div class="beams-day-head">${escapeHtml(day)}</div>`).join("")}
        </div>
        <div class="beams-calendar-body" style="--beams-calendar-height:${metrics.height}px">
          <div class="beams-calendar-axis">
            ${periodMarks.map((mark) => `
              <span style="top:${mark.labelTop}px">${escapeHtml(mark.label)}</span>
            `).join("")}
          </div>
      ${DAYS.slice(1).map((day, dayIndex) => `
            <div class="beams-calendar-day-column" data-day="${escapeHtml(day)}">
              ${lineMarks.map((mark) => `<i class="beams-calendar-hour-line" style="top:${mark.top}px"></i>`).join("")}
              ${groupedLayout.groups.filter((group) => group.day === dayIndex + 1).map((group) => timetableGroupHtml(group, metrics)).join("")}
              ${previewBlocks.filter((block) => block.day === dayIndex + 1).map((block) => timetableBlockHtml(block, metrics)).join("")}
              ${timetableCellLayerHtml(day, metrics, slotFilter)}
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function timetableCellLayerHtml(day, metrics, slotFilter) {
    return `
      <div class="beams-calendar-cell-layer" aria-hidden="true">
        ${calendarPeriodMarks(metrics).map((mark) => `
          <button
            type="button"
            class="beams-calendar-hit-cell ${slotFilter?.day === day && Number(slotFilter?.period) === mark.period ? "is-selected" : ""}"
            data-action="pickSlot"
            data-day="${escapeHtml(day)}"
            data-period="${escapeHtml(mark.period)}"
            style="top:${calendarUnitTopPx(mark.period, metrics)}px;height:${metrics.rowHeight}px"
            title="${escapeHtml(`${day} 第${mark.period}节`)}"
            aria-label="${escapeHtml(`${day}第${mark.period}节`)}"
          ></button>
        `).join("")}
      </div>
    `;
  }

  function unscheduledTimetableHtml(items) {
    if (!items.length) return "";
    return `
      <div class="beams-timetable-unscheduled">
        <div class="beams-unscheduled-title">
          <strong>未排具体时间</strong>
          <span>${items.length} 门仍在当前工作区</span>
        </div>
        <div class="beams-unscheduled-list">
          ${items.map(unscheduledLessonHtml).join("")}
        </div>
      </div>
    `;
  }

  function unscheduledLessonHtml(item) {
    const applied = isAppliedLesson(item);
    const status = applied ? "已选" : "本地暂存";
    const meta = [
      item.no || item.code,
      item.credits ? `${formatPlainNumber(item.credits)} 学分` : "",
      item.teachers?.length ? item.teachers.join("、") : ""
    ].filter(Boolean).join(" · ");
    const details = scheduleDetailLines(item).join("；") || "EAMS 未提供具体周次/节次。";
    return `
      <div class="beams-unscheduled-course ${applied ? "is-applied" : "is-staged"}" title="${escapeHtml(details)}">
        <div class="beams-unscheduled-course-top">
          <strong>${escapeHtml(item.name || "未命名课程")}</strong>
          <em>${escapeHtml(status)}</em>
        </div>
        ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
      </div>
    `;
  }

  function timetableBlocks(items, extra = {}) {
    const blocks = [];
    for (const item of items) {
      for (const slot of item.arrangeInfo || []) {
        const day = Number(slot.weekDay);
        const unitRange = slotUnitRange(slot);
        const range = slotMinuteRange(slot) || slotMinuteRangeFromUnits(unitRange);
        if (!day || day < 1 || day > 7 || !unitRange || !range) continue;
        blocks.push({
          item,
          slot,
          day,
          startMinute: range[0],
          endMinute: range[1],
          startUnit: unitRange[0],
          endUnit: unitRange[1],
          kind: extra.kind || (isAppliedLesson(item) ? "applied" : "staged"),
          isOverlay: Boolean(extra.isOverlay)
        });
      }
    }
    return mergeContinuousTimetableBlocks(blocks)
      .sort((a, b) => a.day - b.day || a.startUnit - b.startUnit || a.endUnit - b.endUnit || compareTimetableLayoutBlocks(a, b));
  }

  function timetablePreviewBlocks(item) {
    const byDay = new Map();
    for (const slot of item.arrangeInfo || []) {
      const day = Number(slot.weekDay);
      const unitRange = slotUnitRange(slot);
      if (!day || day < 1 || day > 7 || !unitRange) continue;
      const bucket = byDay.get(day) || { day, ranges: [], slots: [] };
      bucket.ranges.push(unitRange);
      bucket.slots.push(slot);
      byDay.set(day, bucket);
    }

    const blocks = [];
    for (const bucket of byDay.values()) {
      for (const [startUnit, endUnit] of mergeUnitRanges(bucket.ranges)) {
        const range = slotMinuteRangeFromUnits([startUnit, endUnit]);
        if (!range) continue;
        const dayName = DAYS[bucket.day] || "";
        blocks.push({
          item,
          slot: bucket.slots[0] || {},
          slots: bucket.slots,
          day: bucket.day,
          startMinute: range[0],
          endMinute: range[1],
          startUnit,
          endUnit,
          kind: "preview",
          isPreview: true,
          isCompact: true,
          previewTitle: `${dayName} ${formatUnitRanges([[startUnit, endUnit]])}节`,
          previewRoomText: "覆盖节次"
        });
      }
    }
    return blocks.sort((a, b) => a.day - b.day || a.startUnit - b.startUnit || a.endUnit - b.endUnit);
  }

  function compareTimetableLayoutBlocks(a, b) {
    const rankA = timetableBlockPriority(a);
    const rankB = timetableBlockPriority(b);
    if (rankA !== rankB) return rankA - rankB;
    if (a.startUnit !== b.startUnit) return a.startUnit - b.startUnit;
    const durationA = (a.endUnit || a.startUnit) - (a.startUnit || 0);
    const durationB = (b.endUnit || b.startUnit) - (b.startUnit || 0);
    if (durationA !== durationB) return durationB - durationA;
    const nameCompare = cleanText(a.item?.name).localeCompare(cleanText(b.item?.name), "zh-Hans-CN");
    if (nameCompare) return nameCompare;
    return asText(a.item?.id).localeCompare(asText(b.item?.id));
  }

  function timetableBlockPriority(block) {
    if (block?.kind === "applied" || isAppliedLesson(block?.item)) return 0;
    if (block?.kind === "staged" || block?.isOverlay) return 1;
    return 2;
  }

  function layoutTimetableGroups(blocks, { maxVisibleLanes = TIMETABLE_MAX_VISIBLE_LANES } = {}) {
    const groups = [];
    const byDay = new Map();
    for (const block of blocks) {
      const bucket = byDay.get(block.day) || [];
      bucket.push(block);
      byDay.set(block.day, bucket);
    }

    for (const [day, dayBlocks] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
      const overlapGroups = collectTimetableOverlapGroups(dayBlocks);
      overlapGroups.forEach((groupBlocks, groupIndex) => {
        const assignedBlocks = assignTimetableGroupLanes(groupBlocks);
        const laneCount = Math.max(1, ...assignedBlocks.map((block) => (block.layoutLaneIndex || 0) + 1));
        const visibleLaneCount = Math.min(Math.max(1, maxVisibleLanes), laneCount);
        const startUnit = Math.min(...assignedBlocks.map((block) => block.startUnit));
        const endUnit = Math.max(...assignedBlocks.map((block) => block.endUnit));
        const compactGroup = laneCount > 1 || assignedBlocks.some((block) => block.isOverlay);
        const groupId = createTimetableGroupId(day, groupIndex, assignedBlocks);
        const visibleBlocks = [];
        const hiddenBlocks = [];

        for (const block of assignedBlocks) {
          const nextBlock = {
            ...block,
            groupId,
            groupStartUnit: startUnit,
            groupEndUnit: endUnit,
            groupLaneCount: laneCount,
            layoutLaneCount: visibleLaneCount,
            isCompact: Boolean(block.isCompact || compactGroup),
            isGroupMember: laneCount > 1 || Boolean(block.isOverlay)
          };
          if ((nextBlock.layoutLaneIndex || 0) < visibleLaneCount) visibleBlocks.push(nextBlock);
          else hiddenBlocks.push(nextBlock);
        }

        groups.push({
          id: groupId,
          day,
          startUnit,
          endUnit,
          laneCount,
          visibleLaneCount,
          visibleBlocks: visibleBlocks.sort((a, b) => (a.layoutLaneIndex || 0) - (b.layoutLaneIndex || 0) || compareTimetableLayoutBlocks(a, b)),
          hiddenBlocks: hiddenBlocks.sort(compareTimetableLayoutBlocks),
          isCompact: compactGroup
        });
      });
    }

    groups.sort((a, b) => a.day - b.day || a.startUnit - b.startUnit || a.endUnit - b.endUnit || a.id.localeCompare(b.id));
    return {
      groups,
      validGroupIds: new Set(groups.map((group) => group.id))
    };
  }

  function collectTimetableOverlapGroups(dayBlocks) {
    const remaining = dayBlocks.slice().sort((a, b) => a.startUnit - b.startUnit || a.endUnit - b.endUnit || compareTimetableLayoutBlocks(a, b));
    const groups = [];
    while (remaining.length) {
      const group = [remaining.shift()];
      let changed = true;
      while (changed) {
        changed = false;
        for (let index = remaining.length - 1; index >= 0; index -= 1) {
          if (group.some((other) => timetableBlocksOverlap(other, remaining[index]))) {
            group.push(remaining[index]);
            remaining.splice(index, 1);
            changed = true;
          }
        }
      }
      groups.push(group.sort(compareTimetableLayoutBlocks));
    }
    return groups.sort((a, b) => {
      const aStart = Math.min(...a.map((block) => block.startUnit));
      const bStart = Math.min(...b.map((block) => block.startUnit));
      if (aStart !== bStart) return aStart - bStart;
      const aEnd = Math.max(...a.map((block) => block.endUnit));
      const bEnd = Math.max(...b.map((block) => block.endUnit));
      return aEnd - bEnd;
    });
  }

  function assignTimetableGroupLanes(groupBlocks) {
    const chronological = groupBlocks.slice().sort((a, b) =>
      a.startUnit - b.startUnit ||
      a.endUnit - b.endUnit ||
      compareTimetableLayoutBlocks(a, b)
    );
    const lanes = [];
    const staged = [];
    for (const block of chronological) {
      let laneIndex = lanes.findIndex((laneBlocks) => !laneBlocks.some((other) => timetableBlocksOverlap(block, other)));
      if (laneIndex < 0) {
        laneIndex = lanes.length;
        lanes.push([]);
      }
      lanes[laneIndex].push(block);
      staged.push({ ...block, __laneIndex: laneIndex });
    }

    const laneOrder = lanes.map((laneBlocks, laneIndex) => ({
      laneIndex,
      keyBlock: laneBlocks.slice().sort(compareTimetableLayoutBlocks)[0],
      earliestStart: Math.min(...laneBlocks.map((block) => block.startUnit))
    })).sort((a, b) =>
      compareTimetableLayoutBlocks(a.keyBlock, b.keyBlock) ||
      a.earliestStart - b.earliestStart ||
      a.laneIndex - b.laneIndex
    );
    const laneMap = new Map(laneOrder.map((lane, index) => [lane.laneIndex, index]));

    return staged
      .map(({ __laneIndex, ...block }) => ({
        ...block,
        layoutLaneIndex: laneMap.get(__laneIndex) || 0
      }))
      .sort(compareTimetableLayoutBlocks);
  }

  function createTimetableGroupId(day, index, members) {
    const key = members
      .map((block) => [
        asText(block.item?.id),
        `${block.startUnit}-${block.endUnit}`,
        asText(block.slot?.weekState) || asText(block.slot?.weekStateDigest)
      ].join(":"))
      .sort()
      .join("|");
    return `beams-group-${day}-${index}-${hashText(key)}`;
  }

  function trimPinnedTimetableOverflowGroups(validGroupIds) {
    if (!pinnedTimetableOverflowGroups.size) return;
    pinnedTimetableOverflowGroups = new Set(
      [...pinnedTimetableOverflowGroups].filter((groupId) => validGroupIds.has(groupId))
    );
  }

  function togglePinnedTimetableOverflow(groupId) {
    if (!groupId) return;
    if (pinnedTimetableOverflowGroups.has(groupId)) pinnedTimetableOverflowGroups.delete(groupId);
    else pinnedTimetableOverflowGroups.add(groupId);
    renderPlanTimetable(panel?.querySelector('[data-role="timetable"]'));
  }

  function timetableGroupHtml(group, metrics) {
    const top = Math.max(0, calendarUnitTopPx(group.startUnit, metrics)) + 2;
    const height = Math.max(24, Math.round((group.endUnit - group.startUnit + 1) * metrics.rowHeight) - 4);
    const isOpen = pinnedTimetableOverflowGroups.has(group.id);
    const hiddenCount = group.hiddenBlocks.length;
    return `
      <div
        class="beams-time-group ${isOpen ? "is-open" : ""}"
        data-group-id="${escapeHtml(group.id)}"
        style="top:${top}px;height:${height}px"
      >
        ${group.visibleBlocks.map((block) => timetableBlockHtml(block, metrics)).join("")}
        ${hiddenCount ? `
          <div class="beams-time-overflow ${isOpen ? "is-open" : ""}">
            <button
              type="button"
              class="beams-time-overflow-toggle"
              data-action="toggleOverflowGroup"
              data-group-id="${escapeHtml(group.id)}"
              title="${escapeHtml(`该时段还有 ${hiddenCount} 门重叠课程`)}"
            >+${escapeHtml(String(hiddenCount))}</button>
            <div class="beams-time-overflow-pop">
              <div class="beams-time-overflow-title">同时间段的其他课程</div>
              <div class="beams-time-overflow-list">
                ${group.hiddenBlocks.map(timetableOverflowEntryHtml).join("")}
              </div>
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function timetableOverflowEntryHtml(block) {
    const item = block.item;
    const title = timetableBlockTitle(block);
    const summary = [item.no || item.code || "", item.teachers?.join("、") || ""].filter(Boolean).join(" · ");
    const detailParts = [
      timetableBlockRangeLabel(block),
      timetableBlockTimeText(block),
      timetableBlockWeekText(block),
      blockRoomsText(block)
    ].filter(Boolean);
    return `
      <button
        type="button"
        class="beams-time-overflow-entry"
        data-action="focusLesson"
        data-lesson-id="${escapeHtml(item.id)}"
        title="${escapeHtml(title)}"
      >
        <div class="beams-time-overflow-entry-top">
          <strong>${escapeHtml(item.name || item.no || item.code || "未命名课程")}</strong>
          <em>${escapeHtml(timetableBlockStatus(block))}</em>
        </div>
        ${summary ? `<span class="beams-time-overflow-summary">${escapeHtml(summary)}</span>` : ""}
        <span>${escapeHtml(detailParts.join(" · ") || "查看课程卡")}</span>
      </button>
    `;
  }

  function mergeContinuousTimetableBlocks(blocks) {
    const byLessonDay = new Map();
    for (const block of blocks) {
      const key = `${block.item.id}:${block.day}:${asText(block.slot?.weekState)}:${asText(block.slot?.weekStateDigest)}`;
      const bucket = byLessonDay.get(key) || [];
      bucket.push(block);
      byLessonDay.set(key, bucket);
    }

    const merged = [];
    for (const bucket of byLessonDay.values()) {
      bucket.sort((a, b) => a.startUnit - b.startUnit || a.endUnit - b.endUnit);
      for (const block of bucket) {
        const last = merged[merged.length - 1];
        if (last &&
            last.item.id === block.item.id &&
            last.day === block.day &&
            asText(last.slot?.weekState) === asText(block.slot?.weekState) &&
            asText(last.slot?.weekStateDigest) === asText(block.slot?.weekStateDigest) &&
            block.startUnit <= (last.endUnit || 0) + 1) {
          last.startMinute = Math.min(last.startMinute, block.startMinute);
          last.endMinute = Math.max(last.endMinute, block.endMinute);
          last.startUnit = Math.min(last.startUnit || block.startUnit, block.startUnit);
          last.endUnit = Math.max(last.endUnit || 0, block.endUnit || 0);
          last.slots.push(block.slot);
        } else {
          merged.push({ ...block, slots: [block.slot] });
        }
      }
    }
    return merged;
  }

  function timetableBlocksOverlap(a, b) {
    return a.day === b.day &&
      a.startUnit <= b.endUnit &&
      b.startUnit <= a.endUnit &&
      weeksOverlap(a.slot?.weekState, b.slot?.weekState);
  }

  function slotUnitRange(slot) {
    const startUnit = clampPeriodUnit(Number(slot.startUnit));
    const endUnit = clampPeriodUnit(Number(slot.endUnit) || Number(slot.startUnit));
    if (startUnit && endUnit && endUnit >= startUnit) return [startUnit, endUnit];
    return periodRangeFromMinutes(slotMinuteRange(slot));
  }

  function clampPeriodUnit(value) {
    return Number.isFinite(value) && value >= 1 && value <= PERIOD_COUNT ? value : 0;
  }

  function slotMinuteRangeFromUnits(unitRange) {
    if (!unitRange) return null;
    const start = PERIOD_MINUTES[unitRange[0]]?.[0];
    const end = PERIOD_MINUTES[unitRange[1]]?.[1];
    if (Number.isFinite(start) && Number.isFinite(end)) return normalizeMinuteRange(start, end);
    return null;
  }

  function periodRangeFromMinutes(range) {
    if (!range) return null;
    const [start, end] = range;
    let startUnit = 0;
    let endUnit = 0;
    for (let period = 1; period <= PERIOD_COUNT; period += 1) {
      const periodRange = PERIOD_MINUTES[period];
      if (!startUnit && start < periodRange[1]) startUnit = period;
      if (end > periodRange[0]) endUnit = period;
    }
    if (startUnit && endUnit && endUnit >= startUnit) return [startUnit, endUnit];
    return null;
  }

  function slotMinuteRange(slot) {
    const clockStart = clockValueToMinutes(slot.startTime);
    const clockEnd = clockValueToMinutes(slot.endTime);
    if (clockStart !== null && clockEnd !== null) {
      return normalizeMinuteRange(clockStart, clockEnd);
    }

    const startUnit = Number(slot.startUnit);
    const endUnit = Number(slot.endUnit) || startUnit;
    const start = PERIOD_MINUTES[startUnit]?.[0];
    const end = PERIOD_MINUTES[endUnit]?.[1];
    if (Number.isFinite(start) && Number.isFinite(end)) return normalizeMinuteRange(start, end);
    return null;
  }

  function normalizeMinuteRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (end <= start) end += 24 * 60;
    return [start, end];
  }

  function clockValueToMinutes(value) {
    const text = asText(value).trim();
    if (!text) return null;
    const colon = text.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
    if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
    const compact = text.padStart(4, "0").match(/^(\d{2})(\d{2})$/);
    if (compact) return Number(compact[1]) * 60 + Number(compact[2]);
    return null;
  }

  function formatMinutesClock(minute) {
    const value = ((minute % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hour = Math.floor(value / 60);
    const minutes = value % 60;
    return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function formatMinuteRange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
    return `${formatMinutesClock(start)}-${formatMinutesClock(end)}`;
  }

  function calendarMetrics() {
    return {
      periodCount: PERIOD_COUNT,
      rowHeight: TIMETABLE_ROW_HEIGHT,
      height: PERIOD_COUNT * TIMETABLE_ROW_HEIGHT
    };
  }

  function calendarPeriodMarks(metrics) {
    const result = [];
    for (let period = 1; period <= metrics.periodCount; period += 1) {
      result.push({
        period,
        labelTop: Math.round((period - 0.5) * metrics.rowHeight),
        label: `第${period}节`
      });
    }
    return result;
  }

  function calendarLineMarks(metrics) {
    return [...Array(metrics.periodCount + 1)].map((_, index) => ({
      top: Math.round(index * metrics.rowHeight)
    }));
  }

  function calendarUnitTopPx(unit, metrics) {
    return Math.round((unit - 1) * metrics.rowHeight);
  }

  function timetableBlockHtml(block, metrics) {
    const { item, slot } = block;
    const preview = Boolean(block.isPreview);
    const overlay = Boolean(block.isOverlay);
    const compact = Boolean(block.isCompact || preview);
    const inGroup = Number.isFinite(block.groupStartUnit);
    const laneCount = preview ? 1 : Math.max(1, block.layoutLaneCount || block.groupLaneCount || 1);
    const laneWidth = preview ? 100 : 100 / laneCount;
    const top = inGroup ?
      Math.max(0, Math.round((block.startUnit - block.groupStartUnit) * metrics.rowHeight)) :
      Math.max(0, calendarUnitTopPx(block.startUnit, metrics)) + 2;
    const height = Math.max(24, Math.round((block.endUnit - block.startUnit + 1) * metrics.rowHeight) - 4);
    const left = preview ? "6px" : `calc(${(block.layoutLaneIndex || 0) * laneWidth}% + 3px)`;
    const width = preview ? "calc(100% - 12px)" : `calc(${laneWidth}% - 6px)`;
    const status = timetableBlockStatus(block);
    const timeText = timetableBlockTimeText(block);
    const roomText = block.previewRoomText || blockRoomsText(block) || "地点未标明";
    const weeksText = preview ? "" : timetableBlockWeekText(block);
    const title = timetableBlockTitle(block);
    const compactDetailPopover = compact && !preview ? timetableCompactDetailPopoverHtml(block) : "";
    return `
      <div
        class="beams-time-course ${preview ? "is-preview" : overlay ? "is-staged-overlay" : isAppliedLesson(item) ? "is-applied" : "is-staged"} ${compact ? "is-compact" : ""} ${block.isGroupMember ? "is-group-member" : ""}"
        style="top:${top}px;height:${height}px;left:${left};width:${width}"
        data-lesson-id="${escapeHtml(item.id || "")}"
        data-day="${escapeHtml(String(block.day || 0))}"
        data-start-unit="${escapeHtml(String(block.startUnit || 0))}"
        data-end-unit="${escapeHtml(String(block.endUnit || 0))}"
        title="${escapeHtml(title)}"
      >
        <div class="beams-time-course-body">
          <div class="beams-calendar-course-top">
            <strong>${escapeHtml(shortTimetableName(item.name, compact ? 10 : 18))}</strong>
            <em>${escapeHtml(status)}</em>
          </div>
          ${compact ? "" : `
            <span class="beams-calendar-course-code">${escapeHtml(item.no || item.code || "")}</span>
            <span class="beams-calendar-room">${escapeHtml(roomText)}</span>
            <span class="beams-calendar-time">${escapeHtml(timeText)}</span>
            ${weeksText ? `<span class="beams-calendar-weeks">${escapeHtml(`${weeksText}周`)}</span>` : ""}
          `}
        </div>
        ${compactDetailPopover}
      </div>
    `;
  }

  function timetableCompactDetailPopoverHtml(block) {
    const item = block.item || {};
    const timeSummary = [timetableBlockRangeLabel(block), timetableBlockTimeText(block)].filter(Boolean).join(" · ");
    const weeksText = timetableBlockWeekText(block);
    const roomText = block.previewRoomText || blockRoomsText(block) || "地点未标明";
    const codeText = [item.no || item.code || "", creditText(item)].filter(Boolean).join(" · ");
    const teacherText = item.teachers?.join("、") || "";
    const classes = [
      "beams-time-course-pop",
      block.day >= 5 ? "is-left" : "",
      block.endUnit >= Math.max(10, PERIOD_COUNT - 3) ? "is-above" : ""
    ].filter(Boolean).join(" ");
    return `
      <div class="${classes}">
        <div class="beams-time-course-pop-top">
          <strong>${escapeHtml(item.name || item.no || item.code || "未命名课程")}</strong>
          <em>${escapeHtml(timetableBlockStatus(block))}</em>
        </div>
        ${codeText ? `<span class="beams-time-course-pop-summary">${escapeHtml(codeText)}</span>` : ""}
        ${teacherText ? `<span>${escapeHtml(teacherText)}</span>` : ""}
        ${timeSummary ? `<span>${escapeHtml(timeSummary)}</span>` : ""}
        ${weeksText ? `<span>${escapeHtml(`${weeksText}周`)}</span>` : ""}
        <span>${escapeHtml(roomText)}</span>
      </div>
    `;
  }

  function timetableBlockStatus(block) {
    if (block.isPreview) return "预览";
    if (block.kind === "applied" || isAppliedLesson(block.item)) return "已选";
    return "暂存";
  }

  function timetableBlockTimeText(block) {
    return formatMinuteRange(block.startMinute, block.endMinute) || formatTimeRange(block.slot?.startTime, block.slot?.endTime) || timetableBlockRangeLabel(block);
  }

  function timetableBlockRangeLabel(block) {
    return formatUnitRanges([[block.startUnit, block.endUnit]]) + "节";
  }

  function timetableBlockWeekText(block) {
    return asText(block.slot?.weekStateDigest) || uniqueValues((block.slots || []).map((slot) => asText(slot.weekStateDigest)).filter(Boolean)).join(" / ");
  }

  function timetableBlockTitle(block) {
    if (block.previewTitle) return `${itemLabel(block.item)}：${block.previewTitle}`;
    const details = uniqueValues((block.slots || [block.slot]).map(scheduleSlotLine).filter(Boolean)).join("；");
    if (details) return `${itemLabel(block.item)}：${details}`;
    return itemLabel(block.item);
  }

  function itemLabel(item) {
    return [item?.no || item?.code, item?.name].filter(Boolean).join(" ");
  }

  function blockRoomsText(block) {
    return uniqueValues((block.slots || [block.slot])
      .map((slot) => asText(slot?.rooms) || asText(slot?.room))
      .filter(Boolean)).join(" / ");
  }

  function shortTimetableName(value, maxLength = 18) {
    const text = cleanText(value);
    if (!text) return "未命名课程";
    return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}...` : text;
  }

  function planGapLabel(gap) {
    if (gap.kind === "required") {
      return `待修 ${shortPlanCourseLabel(gap)}`;
    }
    const amount = formatPlanGapMissing(gap);
    if (amount) {
      return `${gap.category || "课程类别"}差 ${amount}`;
    }
    return gap.category || gap.name || "培养方案条目";
  }

  function shortPlanCourseLabel(gap) {
    const code = gap.code || "";
    const name = cleanText(gap.name || "");
    if (!name) return code || "课程";
    const clipped = name.length > 28 ? `${name.slice(0, 27)}...` : name;
    return code ? `${code} ${clipped}` : clipped;
  }

  function formatPlanGapMissing(gap) {
    const parts = [];
    if (gap.missingCredit > 0) parts.push(formatPlanAmount(gap.missingCredit, "credit"));
    if (gap.missingCourses > 0) parts.push(formatPlanAmount(gap.missingCourses, "course"));
    if (!parts.length && gap.missing > 0) parts.push(formatPlanAmount(gap.missing, gap.unit));
    return parts.join(" / ");
  }

  function formatPlanAmount(amount, unit) {
    const value = Number.isInteger(amount) ? String(amount) : String(amount).replace(/\.0+$/, "");
    return unit === "course" ? `${value} 门` : `${value} 学分`;
  }

  function buildQueryTokens(query) {
    return tokenize(query).map(buildSearchToken).filter(Boolean);
  }

  function buildSearchToken(value) {
    const plain = normalizeSearchText(value);
    const compact = plain.replace(/\s+/g, "");
    if (!compact) return null;
    return {
      plain,
      compact,
      isLatin: LATIN_SEARCH_RE.test(compact)
    };
  }

  function isCourseNoOnlyQuery(query) {
    return COURSE_NO_ONLY_QUERY_RE.test(normalizeSearchText(query));
  }

  function lessonMatchesQueryToken(item, token) {
    return searchIndexMatches(item?.searchIndex?.all, token);
  }

  function lessonNoContainsQuery(item, token) {
    const index = item?.searchIndex?.no;
    if (!index || !token) return false;
    return index.plain.includes(token.plain) || index.compact.includes(token.compact);
  }

  function searchIndexMatches(index, token) {
    if (!index || !token) return false;
    if (index.plain.includes(token.plain) || index.compact.includes(token.compact)) return true;
    if (token.isLatin && (index.pinyinCompact.includes(token.compact) || index.initials.includes(token.compact))) return true;
    if (token.compact.length < 2) return false;
    if (isSubsequenceMatch(token.compact, index.compact)) return true;
    if (token.isLatin && (isSubsequenceMatch(token.compact, index.pinyinCompact) || isSubsequenceMatch(token.compact, index.initials))) return true;
    return false;
  }

  function searchIndexScore(index, token, weights = {}) {
    if (!index || !token) return 0;
    let score = 0;
    if (index.plain.includes(token.plain) || index.compact.includes(token.compact)) score = Math.max(score, weights.direct || 0);
    if (token.isLatin && index.pinyinCompact.includes(token.compact)) score = Math.max(score, weights.pinyin || 0);
    if (token.isLatin && index.initials.includes(token.compact)) score = Math.max(score, weights.initials || 0);
    if (token.compact.length >= 2) {
      if (isSubsequenceMatch(token.compact, index.compact)) score = Math.max(score, weights.fuzzy || 0);
      if (token.isLatin && isSubsequenceMatch(token.compact, index.pinyinCompact)) score = Math.max(score, weights.fuzzyPinyin || weights.fuzzy || 0);
      if (token.isLatin && isSubsequenceMatch(token.compact, index.initials)) score = Math.max(score, weights.fuzzyInitials || weights.fuzzyPinyin || weights.fuzzy || 0);
    }
    return score;
  }

  function isSubsequenceMatch(needle, haystack) {
    if (!needle || !haystack) return false;
    let offset = 0;
    for (const char of haystack) {
      if (char !== needle[offset]) continue;
      offset += 1;
      if (offset === needle.length) return true;
    }
    return false;
  }

  function filteredLessons() {
    const tokens = buildQueryTokens(state.query);
    const onlyCourseNo = isCourseNoOnlyQuery(state.query);
    const courseNoToken = onlyCourseNo ? buildSearchToken(state.query) : null;
    const selectedIds = new Set();
    const result = [];

    for (const item of lessons) {
      if (state.onlyFavorites && !favorites.has(item.id)) continue;
      if (state.type && item.category !== state.type) continue;
      if (state.dept && item.dept !== state.dept) continue;
      if (state.credit && `${item.credits}` !== state.credit) continue;
      if (state.gradeRecord && item.gradeRecord !== state.gradeRecord) continue;
      if (state.status === "elected" && !item.elected) continue;
      if (state.status === "electable" && (!item.electable || item.elected)) continue;
      if (state.status === "preElect" && !item.preElect) continue;
      if (state.day && !hasDay(item, state.day)) continue;
      if (state.period && !hasPeriod(item, Number(state.period))) continue;
      if (state.availability === "available" && !(item.available !== null && item.available > 0)) continue;
      if (state.availability === "full" && !(item.available !== null && item.available <= 0)) continue;
      if (state.availability === "unknown" && item.available !== null) continue;
      if (state.hideConflict && hasVisibleConflict(item)) continue;
      if (state.onlyPlanGaps && !hasCurriculumPlanGap(item)) continue;
      if (courseNoToken && !lessonNoContainsQuery(item, courseNoToken)) continue;
      if (!courseNoToken && tokens.length && !tokens.every((token) => lessonMatchesQueryToken(item, token))) continue;
      item.__score = scoreLesson(item, tokens, courseNoToken);
      result.push(item);
      selectedIds.add(item.id);
    }

    result.sort(compareLessons);
    result.selectedIds = selectedIds;
    return result;
  }

  function compareLessons(a, b) {
    if (state.sort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN") || a.no.localeCompare(b.no);
    if (state.sort === "credit") return b.credits - a.credits || a.name.localeCompare(b.name, "zh-Hans-CN");
    if (state.sort === "available") return availabilityRank(b) - availabilityRank(a) || a.name.localeCompare(b.name, "zh-Hans-CN");
    return comparePlanGapLessons(a, b) || b.__score - a.__score || a.name.localeCompare(b.name, "zh-Hans-CN");
  }

  function comparePlanGapLessons(a, b) {
    return planGapRank(a) - planGapRank(b) || a.name.localeCompare(b.name, "zh-Hans-CN") || a.no.localeCompare(b.no);
  }

  function planGapRank(item) {
    if (!hasCurriculumPlanGap(item)) return 90;
    if (!isAppliedLesson(item) && item.electable) return 0;
    if (!isAppliedLesson(item)) return 20;
    return 50;
  }

  function availabilityRank(item) {
    return item.available === null ? -9999 : item.available;
  }

  function scoreLesson(item, tokens, courseNoToken = null) {
    if (!tokens.length) return 0;
    if (courseNoToken) return lessonNoContainsQuery(item, courseNoToken) ? 12 : 0;
    let score = 0;
    const search = item.searchIndex || {};
    for (const token of tokens) {
      score += Math.max(
        searchIndexScore(search.code, token, { direct: 12, fuzzy: 4 }),
        searchIndexScore(search.name, token, { direct: 10, pinyin: 9, initials: 8, fuzzy: 5, fuzzyPinyin: 4, fuzzyInitials: 4 }),
        searchIndexScore(search.teachers, token, { direct: 8, pinyin: 7, initials: 6, fuzzy: 4, fuzzyPinyin: 3, fuzzyInitials: 3 }),
        searchIndexScore(search.category, token, { direct: 6, pinyin: 5, initials: 4, fuzzy: 3, fuzzyPinyin: 2, fuzzyInitials: 2 }),
        searchIndexScore(search.dept, token, { direct: 5, pinyin: 4, initials: 3, fuzzy: 2, fuzzyPinyin: 2, fuzzyInitials: 2 }),
        searchIndexScore(search.all, token, { direct: 1, pinyin: 1, initials: 1, fuzzy: 1, fuzzyPinyin: 1, fuzzyInitials: 1 })
      );
    }
    return score;
  }

  function cardHtml(item) {
    const applied = isAppliedLesson(item);
    const isFavorite = favorites.has(item.id);
    const inPlan = activePlanLessonIds().has(item.id);
    const conflict = hasConflict(item);
    const appliedConflicts = conflictingAppliedLessons(item);
    const sandboxConflict = inPlan && hasSandboxConflict(item);
    const planGap = hasCurriculumPlanGap(item);
    const actionsHtml = courseActionHtml(item, appliedConflicts);
    const tags = [
      item.category,
      item.dept,
      item.gradeRecord,
      item.courseMoldName
    ].filter(Boolean);

    return `
      <article class="beams-card ${isFavorite ? "is-favorite" : ""} ${applied ? "is-applied-card" : ""} ${inPlan && !applied ? "is-in-plan" : ""} ${conflict ? "has-conflict" : ""} ${appliedConflicts.length ? "has-applied-conflict" : ""} ${sandboxConflict ? "has-sandbox-conflict" : ""} ${planGap ? "has-plan-gap" : ""}" data-lesson-id="${escapeHtml(item.id)}">
        <div class="beams-card-main">
          <div class="beams-credit" title="${escapeHtml(creditText(item))}">${creditHtml(item)}</div>
          <div class="beams-course">
            <div class="beams-course-title">
              <strong title="${escapeHtml(item.name)}">${highlight(item.name || "未命名课程")}</strong>
              <span>${escapeHtml(item.no || item.code)}</span>
            </div>
            <div class="beams-meta">${escapeHtml(item.teachers.join("、") || "未标明教师")}</div>
          </div>
          ${courseBenchScoreHtml(item)}
          ${capacityHtml(item)}
        </div>
        <div class="beams-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        ${statusBadgesHtml(item, inPlan, appliedConflicts)}
        ${planBadgesHtml(item)}
        ${scheduleHtml(item)}
        ${item.preRequirement || item.remark || item.similarcourses || item.teachClassName ? `
          <details class="beams-detail">
            <summary>详情</summary>
            ${detailLine("面向", item.teachClassName)}
            ${detailLine("先修", item.preRequirement)}
            ${detailLine("备注", item.remark)}
            ${detailLine("相近课程", item.similarcourses)}
          </details>
        ` : ""}
        <div class="beams-actions">
          ${actionsHtml}
          <button type="button" class="beams-plan-toggle ${applied ? "is-applied" : inPlan ? "is-active" : ""}" data-action="planToggle" title="${applied ? "已选；如需移除请退课" : inPlan ? "从工作区暂存移除" : "加入当前工作区"}">${applied ? "已选" : inPlan ? "已暂存" : "加暂存"}</button>
          ${conflict ? '<span class="beams-warning">与收藏课程冲突</span>' : ""}
          ${sandboxConflict ? '<span class="beams-warning">工作区冲突</span>' : ""}
          <button type="button" class="beams-star" data-action="favorite" title="${isFavorite ? "取消收藏" : "收藏"}" aria-label="${isFavorite ? "取消收藏" : "收藏"}">${isFavorite ? "★" : "☆"}</button>
        </div>
      </article>
    `;
  }

  function detailLine(label, value) {
    return value ? `<p><b>${escapeHtml(label)}：</b>${escapeHtml(value)}</p>` : "";
  }

  function planBadgesHtml(item) {
    const matches = curriculumPlanMatches(item).slice(0, 3);
    if (!matches.length) return "";
    return `
      <div class="beams-plan-badges">
        ${matches.map((match) => `<span title="${escapeHtml(match.title || match.label)}">${escapeHtml(match.label)}</span>`).join("")}
      </div>
    `;
  }

  function statusBadgesHtml(item, inPlan = activePlanLessonIds().has(item.id), appliedConflicts = conflictingAppliedLessons(item)) {
    const badges = [];
    if (item.elected || item.preElect) badges.push({ className: "is-applied", label: "已选" });
    if (inPlan && !isAppliedLesson(item)) badges.push({ className: "is-staged", label: "本地暂存" });
    if (appliedConflicts.length) {
      badges.push({
        className: "is-time-conflict",
        label: "与已选冲突",
        title: `当前与以下已选课程时间冲突：${appliedConflicts.map((lesson) => `${lesson.no || lesson.code} ${lesson.name}`).join("；")}`
      });
    }
    if (!badges.length) return "";
    return `
      <div class="beams-status-badges">
        ${badges.map((badge) => `<span class="${escapeHtml(badge.className)}"${badge.title ? ` title="${escapeHtml(badge.title)}"` : ""}>${escapeHtml(badge.label)}</span>`).join("")}
      </div>
    `;
  }

  function scheduleHtml(item) {
    const chips = compactScheduleChips(item);
    const detailLines = scheduleDetailLines(item);
    if (!chips.length && !detailLines.length) {
      return '<div class="beams-schedule is-empty"><span class="beams-time-empty">未安排时间</span></div>';
    }

    const visibleChips = chips.slice(0, 4);
    const moreCount = chips.length - visibleChips.length;
    const chipsHtml = visibleChips.map((chip) => `
      <span class="beams-time-chip" title="${escapeHtml(chip.title || chip.label)}">${escapeHtml(chip.label)}</span>
    `).join("") + (moreCount > 0 ? `<span class="beams-time-chip is-more" title="${escapeHtml(chips.slice(4).map((chip) => chip.title || chip.label).join("；"))}">+${moreCount}</span>` : "");
    const detailHtml = detailLines.length ? `
      <details class="beams-schedule-more">
        <summary>完整时间</summary>
        <ul>${detailLines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
      </details>
    ` : "";

    return `
      <div class="beams-schedule">
        ${chipsHtml ? `<div class="beams-time-chips">${chipsHtml}</div>` : ""}
        ${detailHtml}
      </div>
    `;
  }

  function compactScheduleChips(item) {
    const grouped = new Map();
    for (const slot of Array.isArray(item.arrangeInfo) ? item.arrangeInfo : []) {
      const day = DAYS[Number(slot.weekDay)] || "";
      const start = Number(slot.startUnit);
      const end = Number(slot.endUnit);
      if (!day || !Number.isFinite(start) || !Number.isFinite(end)) continue;
      const dayIndex = Number(slot.weekDay);
      const group = grouped.get(day) || {
        day,
        dayIndex,
        ranges: [],
        details: []
      };
      group.ranges.push([Math.min(start, end), Math.max(start, end)]);
      const detail = scheduleSlotLine(slot);
      if (detail) group.details.push(detail);
      grouped.set(day, group);
    }

    const chips = [...grouped.values()].map((group) => {
      const ranges = mergeUnitRanges(group.ranges);
      const units = formatUnitRanges(ranges);
      return {
        label: units ? `${group.day} ${units}节` : group.day,
        title: uniqueValues(group.details).join("；") || group.day,
        sort: group.dayIndex * 100 + (ranges[0]?.[0] || 99)
      };
    });

    if (!chips.length && item.scheduleText) {
      for (const chip of compactScheduleChipsFromText(item.scheduleText)) chips.push(chip);
    }

    return chips.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, "zh-Hans-CN"));
  }

  function mergeUnitRanges(ranges) {
    const sorted = ranges
      .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end))
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const [start, end] of sorted) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1] + 1) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    }
    return merged;
  }

  function formatUnitRanges(ranges) {
    return ranges.map(([start, end]) => start === end ? `${start}` : `${start}-${end}`).join("、");
  }

  function compactScheduleChipsFromText(text) {
    const chips = [];
    const seen = new Set();
    for (const part of scheduleSegmentsFromText(text)) {
      const day = part.match(/周[一二三四五六日]/)?.[0] || "";
      const units = part.match(/(\d+(?:-\d+)?)\s*节/)?.[1] || "";
      const label = day && units ? `${day} ${units}节` : shortenScheduleFallback(part);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      chips.push({ label, title: part, sort: scheduleTextSort(label) });
    }
    return chips;
  }

  function scheduleTextSort(label) {
    const dayIndex = DAYS.indexOf(label.match(/周[一二三四五六日]/)?.[0] || "");
    const start = Number(label.match(/(\d+)/)?.[1] || 99);
    return (dayIndex > 0 ? dayIndex : 9) * 100 + start;
  }

  function shortenScheduleFallback(text) {
    const value = cleanText(text);
    if (!value || /未安排|尚未排课|未排课/.test(value)) return value || "未安排时间";
    return value.length > 14 ? `${value.slice(0, 13)}…` : value;
  }

  function scheduleDetailLines(item) {
    const lines = Array.isArray(item.arrangeInfo) && item.arrangeInfo.length ?
      item.arrangeInfo.map(scheduleSlotLine).filter(Boolean) :
      scheduleSegmentsFromText(item.scheduleText);
    return uniqueValues(lines);
  }

  function scheduleSegmentsFromText(text) {
    const parts = asText(text).split(/[；;]/).map((line) => cleanText(line)).filter(Boolean);
    const result = [];
    let pendingWeeks = "";
    for (const part of parts) {
      if (isWeekOnlySchedulePart(part)) {
        pendingWeeks = part;
        continue;
      }
      const line = pendingWeeks && /周[一二三四五六日]/.test(part) ? `${pendingWeeks} ${part}` : part;
      result.push(line);
      pendingWeeks = "";
    }
    if (pendingWeeks) result.push(pendingWeeks);
    return result;
  }

  function isWeekOnlySchedulePart(value) {
    return /^(?:第?\s*)?\d+(?:-\d+)?\s*周(?:\s*[,，、]\s*\d+(?:-\d+)?\s*周)*$/.test(cleanText(value));
  }

  function originalActionHtml(action, index) {
    return `
      <button
        type="button"
        class="beams-origin-action ${escapeHtml(action.kind ? `is-${action.kind}` : "")}"
        data-action="origin"
        data-origin-index="${index}"
        data-origin-kind="${escapeHtml(action.kind || "")}"
        title="${escapeHtml(action.title || action.label)}"
        ${action.disabled ? "disabled" : ""}
      >${escapeHtml(action.label)}</button>
    `;
  }

  function courseActionHtml(item, appliedConflicts = conflictingAppliedLessons(item)) {
    const actions = [];
    if (item.elected || item.preElect) {
      actions.push({
        label: "退课",
        kind: "drop",
        className: "is-drop",
        title: "通过 EAMS 接口退课；若被规则拦截会显示 EAMS 返回原因",
        disabled: item.elected && item.withdrawable === false
      });
    }
    if (!item.elected && item.electable) {
      actions.push({
        label: "选课",
        kind: "enroll",
        className: `is-enroll${appliedConflicts.length ? " is-conflict-hint" : ""}`,
        title: appliedConflicts.length ?
          `当前与以下已选课程时间冲突，直接提交通常会被 EAMS 拒绝：${appliedConflicts.map((lesson) => `${lesson.no || lesson.code} ${lesson.name}`).join("；")}` :
          "通过 EAMS 接口选课；若被规则拦截会显示 EAMS 返回原因"
      });
    }
    actions.push({
      label: "课程详情/大纲",
      kind: "detail",
      className: "is-detail",
      title: "打开 EAMS 课程详情/大纲"
    });
    const teacherUrl = teacherProfileUrl(item);
    if (teacherUrl) {
      actions.push({
        label: "教师简介",
        kind: "teacher",
        className: "is-teacher",
        title: "打开教师简介"
      });
    }

    return actions.map((action) => `
      <button
        type="button"
        class="beams-origin-action ${escapeHtml(action.className)}"
        data-action="origin"
        data-origin-kind="${escapeHtml(action.kind)}"
        title="${escapeHtml(action.title)}"
        ${action.disabled ? "disabled" : ""}
      >${escapeHtml(action.label)}</button>
    `).join("");
  }

  function highlight(text) {
    let html = escapeHtml(text);
    for (const token of tokenize(state.query).filter((item) => item.length >= 2).slice(0, 4)) {
      const escaped = escapeRegExp(token);
      html = html.replace(new RegExp(`(${escaped})`, "ig"), "<mark>$1</mark>");
    }
    return html;
  }

  function courseBenchScoreHtml(item) {
    const rating = item.courseBenchRating;
    if (rating) {
      const enoughData = rating.commentCount >= COURSEBENCH_ENOUGH_DATA_THRESHOLD;
      const average = courseBenchAverageScore(rating);
      const scoreText = enoughData ? average.toFixed(1) : "-";
      const detailText = rating.commentCount ? `${formatPlainNumber(rating.commentCount)} 评价` : "暂无评价";
      const title = courseBenchScoreTitle(rating, average, enoughData);
      return `
        <a
          class="beams-coursebench ${enoughData ? courseBenchScoreClass(average) : "is-insufficient"}"
          href="${escapeHtml(`${COURSEBENCH_ORIGIN}/course/${rating.id}`)}"
          target="_blank"
          rel="noopener noreferrer"
          title="${escapeHtml(title)}"
          aria-label="${escapeHtml(title)}"
        >
          <strong>${escapeHtml(scoreText)}</strong>
          <span>CB · ${escapeHtml(detailText)}</span>
        </a>
      `;
    }

    const status = courseBenchLoading && !courseBenchLoaded ? "读取中" :
      courseBenchError && !courseBenchLoaded ? "加载失败" :
      courseBenchLoaded ? "未收录" : "等待读取";
    const title = courseBenchError && !courseBenchLoaded ?
      `CourseBench 评分加载失败：${courseBenchError}` :
      `CourseBench：${status}`;
    return `
      <a
        class="beams-coursebench is-unavailable"
        href="${COURSEBENCH_ORIGIN}"
        target="_blank"
        rel="noopener noreferrer"
        title="${escapeHtml(title)}"
        aria-label="${escapeHtml(title)}"
      >
        <strong>-</strong>
        <span>CB · ${escapeHtml(status)}</span>
      </a>
    `;
  }

  function courseBenchAverageScore(rating) {
    if (!Array.isArray(rating?.scores) || !rating.scores.length) return 0;
    return rating.scores.reduce((sum, value) => sum + toNumber(value), 0) / rating.scores.length;
  }

  function courseBenchScoreTitle(rating, average, enoughData) {
    if (!enoughData) {
      return `CourseBench 数据不足：${formatPlainNumber(rating.commentCount)} 条评价，至少 ${COURSEBENCH_ENOUGH_DATA_THRESHOLD} 条后显示评分。点击查看课程。`;
    }
    const dimensions = COURSEBENCH_SCORE_LABELS
      .map((label, index) => `${label} ${toNumber(rating.scores[index]).toFixed(1)}`)
      .join(" · ");
    return `CourseBench 综合 ${average.toFixed(1)}/5 · ${formatPlainNumber(rating.commentCount)} 条评价 · ${dimensions}。各维度分数越高，分别代表质量更好、作业用时更少、考核更易、给分更好。点击查看详情。`;
  }

  function courseBenchScoreClass(average) {
    if (average >= 4.2) return "is-excellent";
    if (average >= 3.4) return "is-good";
    if (average >= 2.6) return "is-mixed";
    return "is-low";
  }

  function capacityText(item) {
    if (item.available === null) return "余量未知";
    const status = item.available > 0 ? `剩余 ${item.available} 位` : item.available === 0 ? "已满" : `超员 ${Math.abs(item.available)} 人`;
    return `${status}，已选 ${item.count} 人，上限 ${item.limit} 人`;
  }

  function capacityHtml(item) {
    if (item.available === null) {
      return `
        <div class="beams-capacity is-unknown">
          <strong>余量未知</strong>
          <span>人数信息未检测到</span>
        </div>
      `;
    }
    const status = item.available > 0 ? `剩余 ${item.available} 位` : item.available === 0 ? "已满" : `超员 ${Math.abs(item.available)} 人`;
    return `
      <div class="beams-capacity ${capacityClass(item)}">
        <strong>${escapeHtml(status)}</strong>
        <span>已选 ${escapeHtml(item.count)} 人 · 上限 ${escapeHtml(item.limit)} 人</span>
      </div>
    `;
  }

  function creditText(item) {
    return item.credits ? `${formatPlainNumber(item.credits)} 学分` : "学分未知";
  }

  function creditHtml(item) {
    const value = item.credits ? formatPlainNumber(item.credits) : "?";
    return `<strong>${escapeHtml(value)}</strong><span>学分</span>`;
  }

  function formatPlainNumber(value) {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0+$/, "");
  }

  function capacityClass(item) {
    if (item.available === null) return "is-unknown";
    if (item.available <= 0) return "is-full";
    if (item.available <= 3) return "is-tight";
    return "is-open";
  }

  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    writeJson(FAVORITES_KEY, [...favorites]);
    render();
  }

  function normalizePlanStore(raw) {
    const fallback = currentWorkspaceStore([]);
    if (!raw || !Array.isArray(raw.plans) || !raw.plans.length) return fallback;
    const plans = raw.plans.map((plan, index) => ({
      id: asText(plan.id) || `plan-${Date.now()}-${index}`,
      name: "当前工作区",
      lessonIds: uniqueValues(Array.isArray(plan.lessonIds) ? plan.lessonIds : [])
    }));
    const active = plans.find((plan) => plan.id === raw.activeId) || plans[0];
    return currentWorkspaceStore(active?.lessonIds || []);
  }

  function currentWorkspaceStore(lessonIds = []) {
    return {
      activeId: "workspace",
      plans: [{ id: "workspace", name: "当前工作区", lessonIds: uniqueValues(lessonIds) }]
    };
  }

  function writePlanStore() {
    planStore = normalizePlanStore(planStore);
    writeJson(PLANS_KEY, planStore);
  }

  function activePlan() {
    planStore = normalizePlanStore(planStore);
    return planStore.plans[0] || currentWorkspaceStore([]).plans[0];
  }

  function activePlanLessonIds() {
    return new Set(lessonsInPlan().map((item) => item.id));
  }

  function lessonsInPlan(plan = activePlan()) {
    const ids = new Set(plan?.lessonIds || []);
    return lessons.filter((item) => ids.has(item.id) || isAppliedLesson(item));
  }

  async function clearActivePlan() {
    const plan = activePlan();
    if (!plan) return;
    const stagedCount = lessonsInPlan(plan).filter((item) => !isAppliedLesson(item)).length;
    if (stagedCount) {
      const confirmed = await showSimpleConfirm({
        title: "清空暂存课程",
        message: `将清空当前工作区的 ${stagedCount} 门本地暂存课程。已选课程不会退课。`,
        proceedLabel: "清空暂存"
      });
      if (!confirmed) return;
    }
    plan.lessonIds = [];
    writePlanStore();
    toast("已清空暂存课程；已选课程仍保留。");
    render();
  }

  function showSimpleConfirm({ title, message, proceedLabel = "确认", cancelLabel = "取消", danger = false }) {
    closeActionConfirm(false);

    const overlay = document.createElement("div");
    overlay.id = `${APP_ID}-confirm`;
    overlay.className = "beams-confirm-overlay";
    overlay.innerHTML = `
      <section class="beams-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="${APP_ID}-simple-confirm-title">
        <div class="beams-confirm-head">
          <strong id="${APP_ID}-simple-confirm-title">${escapeHtml(title || "确认操作")}</strong>
          <button type="button" class="beams-confirm-close" data-simple-confirm-action="cancel" title="关闭">×</button>
        </div>
        <div class="beams-confirm-body">
          <p class="beams-confirm-summary">${escapeHtml(message || "确认继续？")}</p>
        </div>
        <div class="beams-confirm-actions">
          <button type="button" data-simple-confirm-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="${danger ? "is-danger" : "is-primary"}" data-simple-confirm-action="proceed">${escapeHtml(proceedLabel)}</button>
        </div>
      </section>
    `;

    document.body.appendChild(overlay);

    return new Promise((resolve) => {
      const finish = (value) => {
        overlay.remove();
        document.removeEventListener("keydown", onKeyDown, true);
        resolve(value);
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") finish(false);
      };

      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = event.target.closest("[data-simple-confirm-action]")?.dataset.simpleConfirmAction;
        if (action === "cancel" || event.target === overlay) finish(false);
        if (action === "proceed") finish(true);
      });
      document.addEventListener("keydown", onKeyDown, true);
      overlay.querySelector('[data-simple-confirm-action="cancel"]')?.focus();
    });
  }

  async function toggleLessonInActivePlan(id) {
    const plan = activePlan();
    if (!plan) return;
    const ids = new Set(plan.lessonIds);
    const currentItem = lessons.find((lesson) => lesson.id === id);
    if (currentItem && isAppliedLesson(currentItem)) {
      toast("这门课已经选上；如需移除请使用退课。");
      return;
    }
    if (ids.has(id)) {
      ids.delete(id);
      toast("已从工作区暂存移除。");
    } else {
      ids.add(id);
      toast("已加入工作区暂存。");
    }
    plan.lessonIds = [...ids];
    writePlanStore();
    render();
  }

  async function applyActivePlanToEams() {
    const plan = activePlan();
    if (!plan) return;
    const planLessons = lessonsInPlan(plan);
    const conflicts = planConflicts(planLessons);
    if (conflicts.length) {
      showActionResult(
        "工作区暂不能一键选课",
        `当前工作区仍有 ${conflicts.length} 组时间冲突。请先整理掉冲突的暂存课程；如果冲突来自已选课程，需要先退课或不要提交这门暂存课。`,
        "error"
      );
      return;
    }

    const targets = planLessons.filter((item) => !isAppliedLesson(item) && item.electable);
    const skipped = planLessons.filter((item) => !isAppliedLesson(item) && !item.electable);
    if (!targets.length) {
      showActionResult(
        "没有需要提交的课程",
        skipped.length ?
          `当前工作区没有可直接选课的暂存课程。不可选课程：${skipped.map((item) => `${item.no || item.code} ${item.name}`).join("；")}` :
          "当前工作区里的课程都已经选上，或没有需要提交的暂存课程。",
        "info"
      );
      return;
    }

    if (skipped.length) toast(`将跳过 ${skipped.length} 门当前不可选的暂存课程。`);
    await runPlanEnrollments(plan, targets);
  }

  async function runPlanEnrollments(plan, targets) {
    const button = panel?.querySelector('[data-action="applyPlan"]');
    if (button) {
      button.disabled = true;
      button.classList.add("is-loading");
      button.textContent = "选课中...";
    }

    const results = [];
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        toast(`正在提交 ${index + 1}/${targets.length}：${item.no || item.name}`);
        const ok = await triggerApiAction(item, "enroll", { suppressRefresh: true, suppressToast: true, suppressResultDialog: true });
        results.push({ item, ok });
        await delay(420);
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.classList.remove("is-loading");
        button.textContent = "按工作区选课";
      }
    }

    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.filter((result) => !result.ok).map((result) => result.item);
    showActionResult(
      "按工作区选课已完成",
      [
        `当前工作区：已提交 ${succeeded}/${targets.length} 门。`,
        failed.length ? `未完成：${failed.map((item) => `${item.no || item.code} ${item.name}`).join("；")}` : "",
        "页面将刷新以同步 EAMS 最新状态。"
      ].filter(Boolean).join("\n"),
      failed.length ? "error" : "info"
    );
    setTimeout(refreshLessons, 1200);
  }

  function planConflicts(planLessons = lessonsInPlan()) {
    const pairs = [];
    for (let i = 0; i < planLessons.length; i += 1) {
      for (let j = i + 1; j < planLessons.length; j += 1) {
        if (schedulesOverlap(planLessons[i].arrangeInfo, planLessons[j].arrangeInfo)) pairs.push([planLessons[i], planLessons[j]]);
      }
    }
    return pairs;
  }

  function hasSandboxConflict(item) {
    if (!activePlanLessonIds().has(item.id)) return false;
    return lessonsInPlan().some((selected) => selected.id !== item.id && schedulesOverlap(item.arrangeInfo, selected.arrangeInfo));
  }

  async function locateOriginalRow(id) {
    const item = lessons.find((lesson) => lesson.id === id);
    const row = item ? await ensureOriginalRow(item) : null;
    flashOriginalRow(row);
  }

  function focusLessonCard(id) {
    if (!panel || !id) return;
    const card = panel.querySelector(`.beams-card[data-lesson-id="${cssEscape(id)}"]`);
    if (!card) {
      const item = lessonById(id);
      toast(item ? `${item.name || item.no || item.code} 当前被筛选隐藏了。` : "当前列表里没有找到这门课。");
      return;
    }

    const listNode = panel.querySelector('[data-role="list"]');
    if (listNode?.contains(card)) {
      const listRect = listNode.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      const targetTop = listNode.scrollTop + (cardRect.top - listRect.top) - Math.max(0, (listRect.height - cardRect.height) / 2);
      listNode.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
    } else {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    card.classList.remove("is-linked-focus");
    void card.offsetWidth;
    card.classList.add("is-linked-focus");
    setTimeout(() => card.classList.remove("is-linked-focus"), 1600);
  }

  function flashOriginalRow(row) {
    if (!row) {
      toast("没有找到原页面中的对应行。");
      return;
    }
    revealLegacyRow(row);
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("better-eams-flash");
    setTimeout(() => row.classList.remove("better-eams-flash"), 1800);
  }

  function revealLegacyRow(row) {
    const hiddenHost = row.closest(".better-eams-legacy-hidden");
    if (!hiddenHost) return;
    hiddenHost.classList.add("better-eams-locate-reveal");
    setTimeout(() => hiddenHost.classList.remove("better-eams-locate-reveal"), 8000);
  }

  async function triggerOriginalAction(id, originIndex, requestedKind) {
    const item = lessons.find((lesson) => lesson.id === id);
    if (!item) return;

    if (requestedKind === "detail") {
      if (openDirectSyllabus(item)) return;
      if (await openOriginalDetailAction(item, originIndex)) return;
      toast("没有检测到课程详情入口。");
      return;
    }
    if (requestedKind === "teacher") {
      openTeacherProfile(item);
      return;
    }

    if (/enroll|drop/.test(requestedKind || "")) {
      await confirmCourseMutation(item, requestedKind, () => triggerApiAction(item, requestedKind));
      return;
    }

    toast("这个操作暂时没有 BetterEAMS 接管实现。");
  }

  async function confirmCourseMutation(item, kind, runAction) {
    const key = `${kind}:${item.id}`;
    if (pendingMutations.has(key)) {
      toast(`${actionKindName(kind)}请求还在处理中。`);
      return false;
    }

    if (kind !== "enroll") {
      const confirmed = await showActionConfirm(item, kind);
      if (!confirmed) {
        toast(`已取消${actionKindName(kind)}。`);
        return false;
      }
    }

    pendingMutations.add(key);
    setMutationButtonsDisabled(item.id, kind, true);
    beginActionCapture(item, kind);
    try {
      return await runAction();
    } finally {
      pendingMutations.delete(key);
      setMutationButtonsDisabled(item.id, kind, false);
    }
  }

  function setMutationButtonsDisabled(id, kind, disabled) {
    const selector = `#${APP_ID}-panel [data-lesson-id="${cssEscape(id)}"] [data-origin-kind="${cssEscape(kind)}"]`;
    for (const button of document.querySelectorAll(selector)) {
      button.disabled = disabled;
      button.classList.toggle("is-loading", disabled);
    }
  }

  function showActionConfirm(item, kind) {
    closeActionConfirm(false);

    const actionName = actionKindName(kind);
    const isDrop = kind === "drop";
    const overlay = document.createElement("div");
    overlay.id = `${APP_ID}-confirm`;
    overlay.className = "beams-confirm-overlay";
    overlay.innerHTML = `
      <section class="beams-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="${APP_ID}-confirm-title">
        <div class="beams-confirm-head">
          <strong id="${APP_ID}-confirm-title">确认${escapeHtml(actionName)}</strong>
          <button type="button" class="beams-confirm-close" data-confirm-action="cancel" title="关闭">×</button>
        </div>
        <div class="beams-confirm-body">
          <p class="beams-confirm-summary">${escapeHtml(isDrop ? "退课会从当前已选课程中移除这门课。" : "选课会向 EAMS 提交这门课。")}</p>
          <dl>
            <div><dt>课程</dt><dd>${escapeHtml(item.name || "未命名课程")}</dd></div>
            <div><dt>课号</dt><dd>${escapeHtml(item.no || item.code || item.id)}</dd></div>
            <div><dt>教师</dt><dd>${escapeHtml(item.teachers.join("、") || "未标明教师")}</dd></div>
            <div><dt>时间</dt><dd>${escapeHtml(item.scheduleText || "未安排时间地点")}</dd></div>
          </dl>
        </div>
        <div class="beams-confirm-actions">
          <button type="button" data-confirm-action="cancel">取消</button>
          <button type="button" class="${isDrop ? "is-danger" : "is-primary"}" data-confirm-action="proceed">确认${escapeHtml(actionName)}</button>
        </div>
      </section>
    `;

    document.body.appendChild(overlay);

    return new Promise((resolve) => {
      const finish = (value) => {
        overlay.remove();
        document.removeEventListener("keydown", onKeyDown, true);
        resolve(value);
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") finish(false);
      };

      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = event.target.closest("[data-confirm-action]")?.dataset.confirmAction;
        if (action === "cancel") finish(false);
        if (action === "proceed") finish(true);
        if (event.target === overlay) finish(false);
      });
      document.addEventListener("keydown", onKeyDown, true);
      overlay.querySelector('[data-confirm-action="cancel"]')?.focus();
    });
  }

  function closeActionConfirm() {
    document.getElementById(`${APP_ID}-confirm`)?.remove();
  }

  function showActionResult(title, message, tone = "info") {
    closeActionConfirm();

    const recoverable = isElectionMainPage() && /参数非法|入口|连接中断|登录状态|重新登录|会话|轮次|未开放|不在.*时间|通用错误页/.test(message);
    const overlay = document.createElement("div");
    overlay.id = `${APP_ID}-confirm`;
    overlay.className = "beams-confirm-overlay";
    overlay.innerHTML = `
      <section class="beams-confirm-dialog beams-result-dialog is-${escapeHtml(tone)}" role="dialog" aria-modal="true" aria-labelledby="${APP_ID}-result-title">
        <div class="beams-confirm-head">
          <strong id="${APP_ID}-result-title">${escapeHtml(title)}</strong>
          <button type="button" class="beams-confirm-close" data-result-action="close" title="关闭">×</button>
        </div>
        <div class="beams-confirm-body">
          <p class="beams-result-message">${escapeHtml(message)}</p>
        </div>
        <div class="beams-confirm-actions">
          ${recoverable ? '<button type="button" data-result-action="portal">准备页</button>' : ""}
          ${recoverable ? '<button type="button" data-result-action="freshEnter">重新读入口</button>' : ""}
          <button type="button" data-result-action="refresh">刷新页面</button>
          <button type="button" class="is-primary" data-result-action="close">知道了</button>
        </div>
      </section>
    `;

    const close = () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown, true);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") close();
    };

    overlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = event.target.closest("[data-result-action]")?.dataset.resultAction;
      if (action === "close" || event.target === overlay) close();
      if (action === "refresh") location.reload();
      if (action === "portal") location.assign(electionPortalUrl());
      if (action === "freshEnter") refreshPortalEntryAndEnter(overlay);
    });
    document.addEventListener("keydown", onKeyDown, true);
    document.body.appendChild(overlay);
    overlay.querySelector('[data-result-action="close"]')?.focus();
  }

  function openDirectSyllabus(item) {
    const lessonId = numericLessonId(item);

    const raw = item.raw || {};
    const isGraduate = String(raw.courseEducationId || raw.courseEducationName || "").includes("3") ||
      /研究生/.test(asText(raw.courseEducationName || item.courseMoldName));
    let url;
    const direct = [item.syllabusUrl, raw.syllabusUrl].map(asText).find((value) => /^https?:\/\//i.test(value));
    if (direct) {
      url = direct;
    } else if (isGraduate && raw.strSemester && item.no) {
      url = `https://graduate.shanghaitech.edu.cn/gsapp/sys/kcglapp/public/jxdg_shtech/info.html?bjdm=${encodeURIComponent(`${raw.strSemester}${item.no}`)}`;
    } else if (lessonId) {
      url = localizedEamsUrl(`/eams/stdElectCourse!syllabusInfo.action?syllabusInfoLessonId=${encodeURIComponent(lessonId)}`);
    }
    if (!url) return false;

    window.open(localizedEamsUrl(url), "_blank", "noopener");
    toast(`已打开 ${item.no || item.name} 的课程详情/大纲。`);
    return true;
  }

  async function openOriginalDetailAction(item, originIndex) {
    const row = await ensureOriginalRow(item);
    if (!row) return false;

    const headers = headersForRow(row);
    const actions = collectOriginalActions(item);
    const parsedIndex = Number(originIndex);
    const indexedAction = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? actions[parsedIndex] : null;
    const fallbackActions = actions.filter((action) => action.kind === "detail" || action.kind === "view");
    const nameColumnActions = actions.filter((action) => /课程名称|名称|Course\s*Title|Course\s*Name/i.test(headers[action.cellIndex] || ""));
    const candidates = [indexedAction, ...fallbackActions, ...nameColumnActions].filter(Boolean);
    const seen = new Set();

    for (const action of candidates) {
      const signature = action.element;
      if (!signature || seen.has(signature)) continue;
      seen.add(signature);
      if (openOriginalActionElement(action.element)) {
        toast(`已打开 ${item.no || item.name} 的课程详情。`);
        return true;
      }
    }
    return false;
  }

  function openOriginalActionElement(element) {
    if (!element) return false;
    const url = navigableUrlFromElement(element);
    if (url) {
      window.open(url, "_blank", "noopener");
      return true;
    }
    activateElement(element);
    return true;
  }

  function openTeacherProfile(item) {
    const url = teacherProfileUrl(item);
    if (!url) {
      toast("没有检测到教师简介链接。");
      return true;
    }
    window.open(localizedEamsUrl(url), "_blank", "noopener");
    toast(`已打开 ${item.teachers[0] || item.name} 的教师简介。`);
    return true;
  }

  function teacherProfileUrl(item) {
    if (Object.prototype.hasOwnProperty.call(item, "__teacherProfileUrl")) return item.__teacherProfileUrl;
    const raw = item.raw || {};
    const direct = [
      item.teacherProfileUrl,
      raw.teacherUrl,
      raw.teacherHomePage,
      raw.teacherHomepage,
      raw.teacherProfileUrl,
      raw.teacherIntroUrl,
      raw.teacherLink
    ].map(asText).find((value) => /^https?:\/\//i.test(value));
    if (direct) {
      item.__teacherProfileUrl = direct;
      return direct;
    }

    const row = findCurrentOriginalRow(item);
    const link = row ? [...row.querySelectorAll("a[href], a[onclick]")].find((anchor) => {
      const href = anchor.getAttribute("href") || "";
      const text = cleanText(anchor.textContent || anchor.title || "");
      const onclick = anchor.getAttribute("onclick") || "";
      return isTeacherLinkCandidate(item, text, href, onclick);
    }) : null;
    item.__teacherProfileUrl = link ? teacherUrlFromElement(link) : "";
    return item.__teacherProfileUrl;
  }

  function isTeacherLinkCandidate(item, text, href, onclick) {
    const combined = `${text} ${href} ${onclick}`;
    const looksLikeTeacher = item.teachers.some((name) => name && text.includes(name)) ||
      /教师|老师|简介|teacher|faculty/i.test(combined);
    return looksLikeTeacher && (/^https?:\/\//i.test(href) || /teacherInfo\.action/i.test(onclick + href));
  }

  function teacherUrlFromElement(element) {
    const href = element.getAttribute("href") || "";
    if (/^https?:\/\//i.test(href)) return element.href;

    const onclick = element.getAttribute("onclick") || "";
    return actionUrlFromElement({ href, onclick }, /teacherInfo\.action/i);
  }

  function normalizeNavigableUrl(pathOrUrl) {
    const value = asText(pathOrUrl).replace(/&amp;/g, "&").trim();
    if (!value || value === "#" || /^javascript:/i.test(value)) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[\w-]+(?:![\w-]+)?\.action(?:[?#]|$)/i.test(value)) return `/eams/${value}`;
    return value;
  }

  function navigableUrlFromElement(elementOrParts) {
    const href = typeof elementOrParts.getAttribute === "function" ? elementOrParts.getAttribute("href") || "" : elementOrParts.href || "";
    const normalizedHref = normalizeNavigableUrl(href);
    if (normalizedHref) return localizedEamsUrl(normalizedHref);

    const onclick = typeof elementOrParts.getAttribute === "function" ? elementOrParts.getAttribute("onclick") || "" : elementOrParts.onclick || "";
    const match = onclick.match(/["']([^"']*(?:\/eams\/|\.action(?:\?|['"]|$)|graduate\.shanghaitech\.edu\.cn)[^"']*)["']/i);
    return match ? localizedEamsUrl(normalizeNavigableUrl(match[1])) : "";
  }

  function actionUrlFromElement(elementOrParts, pattern) {
    const href = typeof elementOrParts.getAttribute === "function" ? elementOrParts.getAttribute("href") || "" : elementOrParts.href || "";
    if (/^https?:\/\//i.test(href) && pattern.test(href)) return new URL(href, location.href).href;

    const onclick = typeof elementOrParts.getAttribute === "function" ? elementOrParts.getAttribute("onclick") || "" : elementOrParts.onclick || "";
    const match = onclick.match(/["']([^"']+)["']/g)?.map((value) => value.slice(1, -1)).find((value) => pattern.test(value)) ||
      (pattern.test(href) ? href : "");
    return match ? localizedEamsUrl(normalizeNavigableUrl(match)) : "";
  }

  async function triggerApiAction(item, kind, options = {}) {
    if (/enroll|drop/.test(kind || "")) {
      const nativeResult = await triggerNativeBatchAction(item, kind, options);
      if (nativeResult !== null) return nativeResult;
    }

    const candidates = apiTemplates
      .filter((template) => template.kind === kind)
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const template of candidates) {
      const request = materializeApiRequest(template, item);
      if (!request || !isEamsRequest(request.url)) continue;
      try {
        const response = await fetch(request.url, {
          method: request.method || "GET",
          headers: request.headers || {},
          body: request.body || undefined,
          credentials: "include"
        });
        const text = await response.text().catch(() => "");
        const problem = responseProblemText(text);
        if (!response.ok || problem) {
          console.warn("[BetterEAMS] API action failed, falling back.", response.status, text.slice(0, 500));
          if (problem && !options.suppressResultDialog) showActionResult("EAMS 没有完成操作", problem, "error");
          continue;
        }
        if (!options.suppressToast) toast(`EAMS 接口已处理${actionKindName(kind)}。`);
        if (!options.suppressRefresh) setTimeout(refreshLessons, 1200);
        return true;
      } catch (error) {
        console.warn("[BetterEAMS] API action failed, falling back.", error);
      }
    }
    if (!options.suppressToast) toast(`暂时无法通过 EAMS 接口${actionKindName(kind)} ${item.no || item.name}。`);
    return false;
  }

  async function triggerNativeBatchAction(item, kind, options = {}) {
    const profileId = currentElectionProfileId();
    const lessonId = numericLessonId(item);
    if (!profileId || !lessonId) return null;

    const isEnroll = kind === "enroll";
    const params = new URLSearchParams();
    params.set("profileId", profileId);
    params.set("optype", isEnroll ? "true" : "false");
    params.set("operator0", isEnroll ? `${lessonId}:true:0` : `${lessonId}:false`);

    const url = new URL("/eams/stdElectCourse!batchOperator.action", location.origin);
    url.search = params.toString();

    try {
      const response = await fetch(url.href, {
        method: "GET",
        credentials: "include",
        headers: {
          "Accept": "text/html, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        }
      });
      const text = await response.text().catch(() => "");
      recordApiRequest({
        type: "fetch",
        method: "GET",
        url: url.href,
        headers: {
          "Accept": "text/html, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest"
        },
        status: response.status,
        responseText: text.slice(0, 800)
      });
      const problem = responseProblemText(text);
      if (!response.ok || problem) {
        console.warn("[BetterEAMS] Native batch API needs fallback.", response.status, text.slice(0, 800));
        if (!options.suppressResultDialog) showActionResult("EAMS 没有完成操作", problem || "EAMS 接口没有直接完成。", "error");
        return false;
      }

      if (!options.suppressToast) toast(resultToastText(kind, text));
      if (!options.suppressRefresh) setTimeout(() => location.reload(), 900);
      return true;
    } catch (error) {
      console.warn("[BetterEAMS] Native batch API failed, falling back.", error);
      if (!options.suppressToast) toast("EAMS 接口请求失败，请刷新后重试。");
      return false;
    }
  }

  function currentElectionProfileId() {
    const fromUrl = new URLSearchParams(location.search).get("electionProfile.id") ||
      new URLSearchParams(location.search).get("profileId");
    if (fromUrl) return fromUrl;

    const scripts = [...document.scripts].map((script) => script.textContent || "").join("\n");
    const match = scripts.match(/initStdElectCourseDefaultPage[\s\S]{0,300}?,\s*(\d{3,})\s*,/);
    return match ? match[1] : "";
  }

  function responseProblemText(text) {
    const sample = cleanProblemText(text).slice(0, 1200);
    if (!sample) return "";
    if (/验证码|滑块|拼图|verify|captcha/i.test(sample)) return "EAMS 需要验证码验证，请刷新页面后在原系统完成验证。";
    if (/出错了|Error happened/i.test(sample)) return "EAMS 返回通用错误页。通常是旧入口参数、会话中断或选课轮次状态变化。";
    if (/参数非法|非法参数/i.test(sample)) return "EAMS 返回“参数非法”。通常是从旧准备页进入，入口链接里的选课轮次参数已经过期。";
    if (/连接中断|系统连接中断|服务器连接中断|connection.*(?:lost|closed|interrupted)/i.test(sample)) return "EAMS 连接中断。通常是会话过期、入口页停留太久，或 EAMS 后端短暂断开。";
    if (/请重新登录|重新登录|登录超时|会话.*(?:失效|过期)|session.*(?:expired|timeout)/i.test(sample)) return "EAMS 登录状态可能已失效，请重新登录后再试。";
    if (/不在选课时间|选课.*未开放|未到选课时间|轮次.*未开放/i.test(sample)) return "当前不在 EAMS 允许选课的时间窗口。";
    const conflict = sample.match(/([^。！？]*(?:选课|退课)?失败[:：]\s*与以下课程冲突[:：]\s*[^。！？]*)/i)?.[1];
    if (conflict) return polishProblemText(conflict).slice(0, 260);
    const sentence = sample.match(/([^。！？\n]*(?:失败|错误|冲突|不能|不允许|已满|不存在|非法|参数|连接中断|请重新登录|登录|会话|已经选过|未选过|不在选课时间|不在退课时间|未开放|轮次|上限|超过|限制已达)[^。！？\n]*)/i)?.[1];
    if (sentence) return polishProblemText(sentence).slice(0, 260);
    if (/exception|error/i.test(sample)) return "EAMS 接口返回异常，请刷新后重试。";
    return "";
  }

  function cleanProblemText(value) {
    let source = asText(value)
      .replace(/<script[\s\S]*?(?:参数非法|非法参数|连接中断|请重新登录|不在选课时间|未开放|失败|错误)[\s\S]*?<\/script>/gi, (script) => ` ${script.replace(/<[^>]*>/g, " ")} `)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:dd|div|td|tr|p)>/gi, "\n")
      .replace(/<dd[^>]*>/gi, " ");
    try {
      source = new DOMParser().parseFromString(source, "text/html").body.textContent || source;
    } catch (_) {
      source = source.replace(/<[^>]*>/g, " ");
    }
    return polishProblemText(source);
  }

  function polishProblemText(value) {
    return cleanText(value)
      .replace(/\s*([:：])\s*/g, "：")
      .replace(/\s*([,，;；])\s*/g, "$1")
      .replace(/选课\s+失败/g, "选课失败")
      .replace(/退课\s+失败/g, "退课失败")
      .replace(/参数\s+非法/g, "参数非法")
      .replace(/连接\s+中断/g, "连接中断")
      .replace(/与以下课程冲突\s*：\s*/g, "与以下课程冲突：")
      .replace(/\s+(?=[《\[])/g, "")
      .replace(/(?:timeElapsed|window\.electCourseTable|preElect|defaultElected|elected|jQuery|function\s+\w+|var\s+\w+).*/i, "")
      .trim();
  }

  function resultToastText(kind, text) {
    const sample = cleanText(text).slice(0, 180);
    const match = sample.match(/([^。！？\n]*(成功|完成)[^。！？\n]*[。！？]?)/);
    if (match) return match[1];
    return `EAMS 接口已处理${actionKindName(kind)}。`;
  }

  function refreshNativeCourseTable() {
    const pageWindow = getPageWindow();
    try {
      if (pageWindow.electCourseTable && typeof pageWindow.electCourseTable.init === "function") {
        pageWindow.electCourseTable.init();
      }
    } catch (error) {
      console.warn("[BetterEAMS] Failed to refresh native EAMS table.", error);
    }
  }

  function materializeApiRequest(template, item) {
    const source = template.source || {};
    const target = lessonIdentity(item);
    const request = template.request || {};
    let url = request.url || "";
    let body = request.body || "";
    for (const [from, to] of replacementPairs(source, target)) {
      url = replaceEvery(url, from, to);
      body = replaceEvery(body, from, to);
    }
    return {
      url,
      method: request.method || "GET",
      headers: sanitizeHeaders(request.headers || {}),
      body
    };
  }

  function replacementPairs(source, target) {
    const pairs = [];
    for (const key of ["id", "rawId", "lessonId", "no", "code", "name"]) {
      if (!source[key] || !target[key] || source[key] === target[key]) continue;
      pairs.push([source[key], target[key]]);
      pairs.push([encodeURIComponent(source[key]), encodeURIComponent(target[key])]);
    }
    return pairs;
  }

  function replaceEvery(value, from, to) {
    if (!value || !from) return value;
    return String(value).split(String(from)).join(String(to));
  }

  function numericLessonId(item) {
    const values = [
      item.rawId,
      item.lessonId,
      item.raw?.id,
      item.raw?.lessonId,
      item.id
    ].map(asText);
    return values.find((value) => /^\d+$/.test(value)) || "";
  }

  async function ensureOriginalRow(item) {
    const current = findCurrentOriginalRow(item);
    if (current) return current;

    toast(`正在跨页定位 ${item.no || item.code || item.name}...`);
    const searched = await searchOriginalTable(item);
    if (searched) return searched;

    const paged = await scanOriginalPages(item);
    if (paged) return paged;

    return null;
  }

  function findCurrentOriginalRow(item) {
    const existing = rowIndex.get(item.id) || item.row;
    if (existing && document.contains(existing) && rowMatchesItem(existing, item)) {
      rowIndex.set(item.id, existing);
      item.row = existing;
      return existing;
    }

    const rows = [...document.querySelectorAll("tr")].filter((row) => row.children.length >= 3);
    const row = rows.find((candidate) => rowMatchesItem(candidate, item));
    if (row) {
      row.dataset.betterEamsLessonId = item.id;
      rowIndex.set(item.id, row);
      item.row = row;
    }
    return row || null;
  }

  function rowMatchesItem(row, item) {
    const text = normalizeSearchText(row.textContent || "");
    const no = normalizeSearchText(item.no);
    const code = normalizeSearchText(item.code);
    const name = normalizeSearchText(item.name);
    if (no && text.includes(no)) return true;
    return Boolean(code && name && text.includes(code) && text.includes(name));
  }

  async function searchOriginalTable(item) {
    const controls = courseSearchControls();
    if (!controls) return null;

    for (const input of controls.clearInputs) {
      input.value = "";
      dispatchInputEvents(input);
    }

    const targetInput = controls.inputs.no || controls.inputs.code || controls.inputs.name;
    if (!targetInput) return null;
    targetInput.value = controls.inputs.no ? item.no : controls.inputs.code ? item.code : item.name;
    dispatchInputEvents(targetInput);
    activateElement(controls.submit);
    const row = await waitForOriginalRow(item, 3500);
    if (row) {
      scheduleOriginalSearchReset(controls);
      return row;
    }

    const signature = originalRowsSignature();
    resetOriginalSearchControls(controls);
    await waitForOriginalRowsChange(signature, 2500);
    return null;
  }

  function scheduleOriginalSearchReset(controls) {
    window.clearTimeout(originalSearchResetTimer);
    const managedValues = controls.clearInputs.map((input) => ({ input, value: input.value }));
    originalSearchResetTimer = window.setTimeout(async () => {
      const userChanged = managedValues.some(({ input, value }) => document.contains(input) && input.value !== value);
      if (userChanged) return;
      const signature = originalRowsSignature();
      resetOriginalSearchControls(controls);
      await waitForOriginalRowsChange(signature, 2500);
      refreshLessons();
    }, 8500);
  }

  function resetOriginalSearchControls(controls) {
    for (const input of controls.clearInputs) {
      if (!document.contains(input)) continue;
      input.value = "";
      dispatchInputEvents(input);
    }
    if (controls.submit && document.contains(controls.submit)) activateElement(controls.submit);
  }

  function courseSearchControls() {
    const grid = gridCourseSearchControls();
    if (grid) return grid;

    const tables = [...document.querySelectorAll("table")];
    for (const table of tables) {
      const text = cleanText(table.textContent);
      if (!/课程序号|课程代码|课程名称/.test(text) || !/操作|课程安排|已选\/上限/.test(text)) continue;
      const rows = [...table.querySelectorAll("tr")];
      const filterRow = rows.find((row) => row.querySelector("input") && /课程序号|课程代码|课程名称/.test(cleanText(row.textContent)));
      if (!filterRow) continue;

      const inputs = {};
      for (const cell of [...filterRow.children]) {
        const input = cell.querySelector("input[type='text'], input:not([type]), textarea");
        if (!input) continue;
        const label = cleanText(cell.textContent);
        if (/课程序号|教学班|课号/.test(label)) inputs.no = input;
        else if (/课程代码|课程号|代码/.test(label)) inputs.code = input;
        else if (/课程名称|名称/.test(label)) inputs.name = input;
      }

      const submit = filterRow.querySelector("button, input[type='button'], input[type='submit'], input[type='image']") ||
        table.querySelector("button, input[type='button'], input[type='submit'], input[type='image']");
      if ((inputs.no || inputs.code || inputs.name) && submit) {
        return { table, filterRow, inputs, submit, clearInputs: Object.values(inputs) };
      }
    }
    return null;
  }

  function gridCourseSearchControls() {
    const scopes = [
      document.querySelector("#electableLessonList"),
      document.querySelector("#electedLessonList"),
      ...document.querySelectorAll(".gridtable")
    ].filter(Boolean);

    for (const scope of [...new Set(scopes)]) {
      const inputs = {};
      const clearInputs = [...scope.querySelectorAll("input[type='text'], input:not([type]), textarea")];
      for (const input of clearInputs) {
        const name = input.getAttribute("name") || "";
        if (/lesson\.no$/i.test(name) || /\.no$/i.test(name)) inputs.no = input;
        else if (/course\.code$/i.test(name) || /\.code$/i.test(name)) inputs.code = input;
        else if (/course\.name$/i.test(name) || /\.name$/i.test(name)) inputs.name = input;
      }

      const submit = scope.querySelector("input.grid-filter-submit, input[type='submit'], button[type='submit'], button");
      if ((inputs.no || inputs.code || inputs.name) && submit) {
        return { table: scope, filterRow: scope, inputs, submit, clearInputs };
      }
    }
    return null;
  }

  async function scanOriginalPages(item) {
    const visited = new Set();
    for (let i = 0; i < 6; i += 1) {
      const row = findCurrentOriginalRow(item);
      if (row) return row;

      const signature = originalRowsSignature();
      if (visited.has(signature)) return null;
      visited.add(signature);

      const next = nextPageControl();
      if (!next) return null;
      activateElement(next);
      await waitForOriginalRowsChange(signature, 2500);
    }
    return findCurrentOriginalRow(item);
  }

  function nextPageControl() {
    const candidates = [...document.querySelectorAll("a, button, input[type='button'], input[type='submit']")]
      .filter((element) => !element.closest(`#${APP_ID}-panel`) && !isDisabledElement(element));
    const numbered = candidates
      .filter((element) => /\bpgButton\b/.test(element.className || ""))
      .map((element) => ({ element, page: Number(cleanText(element.textContent || element.value || "")), active: /\bpgButtonHover\b/.test(element.className || "") }))
      .filter((item) => Number.isFinite(item.page) && item.page > 0)
      .sort((a, b) => a.page - b.page);
    const active = numbered.find((item) => item.active);
    if (active) {
      const next = numbered.find((item) => item.page > active.page);
      if (next) return next.element;
    }

    return candidates.find((element) => {
      const text = cleanText(element.textContent || element.value || element.title || element.getAttribute("aria-label") || "");
      return /^(下一页|下页|后页|Next|>)$/i.test(text) || /下一页|下页|nextPage|page\.next/i.test(element.getAttribute("onclick") || element.getAttribute("href") || "");
    }) || null;
  }

  function waitForOriginalRow(item, timeout) {
    return waitUntil(() => findCurrentOriginalRow(item), timeout);
  }

  function waitForPageSignatureChange(oldSignature, timeout) {
    return waitUntil(() => pageSignature() !== oldSignature, timeout);
  }

  function waitForOriginalRowsChange(oldSignature, timeout) {
    return waitUntil(() => originalRowsSignature() !== oldSignature, timeout);
  }

  function waitUntil(check, timeout) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const result = check();
        if (result) {
          resolve(result);
        } else if (Date.now() - start >= timeout) {
          resolve(null);
        } else {
          setTimeout(tick, 120);
        }
      };
      tick();
    });
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function dispatchInputEvents(input) {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function activateElement(element) {
    if (!element) return;
    if (typeof element.click === "function") {
      element.click();
      return;
    }
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }

  function isDisabledElement(element) {
    return Boolean(element.disabled || element.getAttribute("aria-disabled") === "true" || /disabled/.test(element.className || ""));
  }

  function actionKindName(kind) {
    return ({
      enroll: "选课",
      drop: "退课",
      detail: "课程详情/大纲",
      teacher: "教师简介"
    })[kind] || "操作";
  }

  function installRequestRecorder() {
    const targets = [window, getPageWindow()].filter(Boolean);
    for (const target of [...new Set(targets)]) {
      installFetchRecorder(target);
      installXhrRecorder(target);
    }
    document.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      recordApiRequest({
        type: "form",
        method: (form.method || "GET").toUpperCase(),
        url: new URL(form.action || location.href, location.href).href,
        body: serializeForm(form),
        headers: {}
      });
    }, true);
  }

  function installFetchRecorder(targetWindow) {
    const originalFetch = targetWindow.fetch;
    if (typeof originalFetch !== "function") return;
    if (originalFetch.__betterEamsRecorder) return;

    const wrappedFetch = function betterEamsFetch(input, init = {}) {
      const request = normalizeFetchRequest(input, init, targetWindow);
      const promise = originalFetch.apply(this, arguments);
      if (request) {
        promise.then((response) => {
          response.clone().text().then((text) => {
            recordApiRequest({ ...request, status: response.status, responseText: text.slice(0, 800) });
          }).catch(() => recordApiRequest({ ...request, status: response.status }));
        }).catch(() => recordApiRequest(request));
      }
      return promise;
    };
    wrappedFetch.__betterEamsRecorder = true;
    targetWindow.fetch = wrappedFetch;
  }

  function installXhrRecorder(targetWindow) {
    const Xhr = targetWindow.XMLHttpRequest;
    if (!Xhr?.prototype || Xhr.prototype.__betterEamsRecorder) return;

    const originalOpen = Xhr.prototype.open;
    const originalSetRequestHeader = Xhr.prototype.setRequestHeader;
    const originalSend = Xhr.prototype.send;

    Xhr.prototype.open = function betterEamsOpen(method, url) {
      this.__betterEamsRequest = {
        type: "xhr",
        method: asText(method || "GET").toUpperCase(),
        url: new URL(asText(url), location.href).href,
        headers: {}
      };
      return originalOpen.apply(this, arguments);
    };

    Xhr.prototype.setRequestHeader = function betterEamsHeader(name, value) {
      if (this.__betterEamsRequest) this.__betterEamsRequest.headers[name] = value;
      return originalSetRequestHeader.apply(this, arguments);
    };

    Xhr.prototype.send = function betterEamsSend(body) {
      if (this.__betterEamsRequest) {
        this.__betterEamsRequest.body = serializeRequestBody(body);
        this.addEventListener("loadend", () => {
          recordApiRequest({
            ...this.__betterEamsRequest,
            status: this.status,
            responseText: asText(this.responseText).slice(0, 800)
          });
        });
      }
      return originalSend.apply(this, arguments);
    };
    Xhr.prototype.__betterEamsRecorder = true;
  }

  function normalizeFetchRequest(input, init, targetWindow = window) {
    try {
      const RequestCtor = targetWindow.Request || window.Request;
      const request = RequestCtor && input instanceof RequestCtor ? input :
        input && typeof input === "object" && "url" in input ? input : null;
      const url = request ? request.url : new URL(asText(input), location.href).href;
      return {
        type: "fetch",
        method: asText(init.method || request?.method || "GET").toUpperCase(),
        url,
        headers: headersToObject(init.headers || request?.headers),
        body: serializeRequestBody(init.body)
      };
    } catch (_) {
      return null;
    }
  }

  function beginActionCapture(item, kind) {
    activeCapture = {
      at: Date.now(),
      kind: kind || "operation",
      source: lessonIdentity(item)
    };
    setTimeout(() => {
      if (activeCapture && Date.now() - activeCapture.at > 9000) activeCapture = null;
    }, 9500);
  }

  function recordApiRequest(request) {
    if (!activeCapture || Date.now() - activeCapture.at > 9000) return;
    if (!request || !isEamsRequest(request.url)) return;
    if (/\.(?:js|css|png|jpg|jpeg|gif|svg|ico)(?:\?|$)/i.test(request.url)) return;

    const template = {
      kind: activeCapture.kind,
      at: Date.now(),
      source: activeCapture.source,
      request: {
        type: request.type,
        method: request.method || "GET",
        url: request.url,
        headers: sanitizeHeaders(request.headers || {}),
        body: request.body || ""
      },
      status: request.status || 0,
      responseText: request.responseText || ""
    };

    const signature = apiTemplateSignature(template);
    apiTemplates = [template, ...apiTemplates.filter((item) => apiTemplateSignature(item) !== signature)].slice(0, 40);
    writeJson(API_TEMPLATES_KEY, apiTemplates);
    updateDebugState();
    console.info("[BetterEAMS] Learned EAMS API template.", template.kind, template.request.method, template.request.url);
  }

  function apiTemplateSignature(template) {
    return [
      template.kind,
      template.request?.method,
      template.request?.url,
      normalizeTemplateBody(template.request?.body || "", template.source || {})
    ].join("\n");
  }

  function normalizeTemplateBody(body, source) {
    let text = asText(body);
    for (const value of Object.values(source)) {
      if (value) text = replaceEvery(text, value, "{lesson}");
    }
    return text;
  }

  function lessonIdentity(item) {
    return {
      id: asText(item.id),
      rawId: asText(item.rawId || item.raw?.id),
      lessonId: asText(item.lessonId || item.raw?.lessonId),
      no: asText(item.no),
      code: asText(item.code),
      name: asText(item.name)
    };
  }

  function isEamsRequest(url) {
    try {
      const parsed = new URL(url, location.href);
      return parsed.origin === location.origin && /\/eams\//.test(parsed.pathname);
    } catch (_) {
      return false;
    }
  }

  function sanitizeHeaders(headers) {
    const result = {};
    for (const [name, value] of Object.entries(headersToObject(headers))) {
      if (/^(cookie|host|origin|referer|content-length)$/i.test(name)) continue;
      if (value == null || value === "") continue;
      result[name] = value;
    }
    return result;
  }

  function headersToObject(headers) {
    const result = {};
    if (!headers) return result;
    if (headers instanceof Headers) {
      headers.forEach((value, key) => { result[key] = value; });
      return result;
    }
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) result[key] = value;
      return result;
    }
    return { ...headers };
  }

  function serializeRequestBody(body) {
    if (!body) return "";
    if (typeof body === "string") return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) return new URLSearchParams([...body.entries()].map(([key, value]) => [key, asText(value)])).toString();
    try {
      return JSON.stringify(body);
    } catch (_) {
      return asText(body);
    }
  }

  function serializeForm(form) {
    try {
      return new URLSearchParams(new FormData(form)).toString();
    } catch (_) {
      return "";
    }
  }

  function collectOriginalActions(item) {
    const row = rowIndex.get(item.id) || item.row;
    if (!row) return [];

    const headers = headersForRow(row);
    const elements = [...row.querySelectorAll("a, button, input[type='button'], input[type='submit'], input[type='image']")]
      .filter((element) => !element.closest(`#${APP_ID}-panel`));
    const seen = new Set();
    const actions = [];

    for (const element of elements) {
      const cell = element.closest("td, th");
      const cellIndex = cell ? [...cell.parentElement.children].indexOf(cell) : -1;
      const header = headers[cellIndex] || "";
      const action = describeOriginalAction(element, header, cellIndex);
      if (!action) continue;

      const href = element.getAttribute("href") || "";
      const signature = `${action.kind}:${action.label}:${cellIndex}:${href}:${element.getAttribute("onclick") || ""}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      actions.push(action);
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  function describeOriginalAction(element, header, cellIndex) {
    const ownText = cleanText(
      element.textContent ||
      element.value ||
      element.title ||
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      ""
    );
    const title = cleanText([
      element.title,
      element.getAttribute("aria-label"),
      element.getAttribute("alt"),
      element.getAttribute("href")
    ].filter(Boolean).join(" "));
    const combined = `${header} ${ownText} ${title}`;
    const disabled = Boolean(element.disabled || element.getAttribute("aria-disabled") === "true");
    let label = ownText || "打开";
    let kind = "other";
    let priority = 80;

    if (/课程名称/.test(header)) {
      label = /大纲|syllabus/i.test(combined) ? "课程大纲" : "课程详情/大纲";
      kind = "detail";
      priority = 30;
    } else if (/教师|老师|主讲/.test(header)) {
      label = "教师简介";
      kind = "teacher";
      priority = 40;
    } else if (/操作|选课|退课|退选|退掉|撤销|取消|删除/.test(combined)) {
      if (/退课|退选|退掉|撤销|取消|删除/.test(combined)) {
        label = ownText || "退课";
        kind = "drop";
        priority = 11;
      } else if (/选课|补选|加入|选择/.test(combined)) {
        label = ownText || "选课";
        kind = "enroll";
        priority = 10;
      } else {
        label = ownText || "执行";
        kind = "operation";
        priority = 20;
      }
    } else if (/课程详情|详情|大纲|介绍|syllabus/i.test(combined)) {
      label = /大纲|syllabus/i.test(combined) ? "课程大纲" : "课程详情/大纲";
      kind = "detail";
      priority = 30;
    } else if (/教师|老师|简介|主页/.test(combined)) {
      label = "教师简介";
      kind = "teacher";
      priority = 40;
    } else if (/查看|打开|详情/.test(combined)) {
      label = ownText || "查看";
      kind = "view";
      priority = 50;
    }

    if (kind === "other" && !/查看|打开|详情|选|退|删|撤|大纲|简介|http|javascript/i.test(combined)) {
      return null;
    }

    return {
      element,
      label: shortenLabel(label),
      kind,
      priority,
      disabled,
      title: title || ownText || header,
      cellIndex
    };
  }

  function headersForRow(row) {
    if (rowHeaderCache.has(row)) return rowHeaderCache.get(row);

    const table = row.closest("table");
    if (!table) return [];
    const rows = [...table.querySelectorAll("tr")];
    const rowIndexInTable = rows.indexOf(row);
    const before = rows.slice(0, Math.max(rowIndexInTable, 0));
    const candidates = before.filter((candidate) => {
      const text = cleanText(candidate.textContent);
      return /课程序号|课程代码|课程名称|教师|开课院系|课程安排|操作|已选\/上限/.test(text);
    });
    const headerRow = candidates[candidates.length - 1];
    const headers = headerRow ? [...headerRow.children].map((cell) => cleanText(cell.textContent)) : [];
    rowHeaderCache.set(row, headers);
    return headers;
  }

  function clearFilters() {
    Object.assign(state, {
      ...DEFAULT_STATE,
      collapsed: false,
      showStagedOnTimetable: state.showStagedOnTimetable
    });
    applyStateToControls();
    render();
  }

  function togglePanel() {
    state.collapsed = !state.collapsed;
    panel.classList.toggle("is-collapsed", state.collapsed);
    saveState();
  }

  function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 80);
  }

  function saveState() {
    writeJson(STORAGE_KEY, state);
  }

  function hasDay(item, dayText) {
    const day = DAYS.indexOf(dayText);
    return item.arrangeInfo.some((slot) => Number(slot.weekDay) === day);
  }

  function hasPeriod(item, period) {
    return item.arrangeInfo.some((slot) => Number(slot.startUnit) <= period && Number(slot.endUnit) >= period);
  }

  function hasConflict(item) {
    if (!favorites.size || favorites.has(item.id)) return false;
    const favoriteLessons = lessons.filter((lesson) => favorites.has(lesson.id));
    return favoriteLessons.some((selected) => schedulesOverlap(item.arrangeInfo, selected.arrangeInfo));
  }

  function hasVisibleConflict(item) {
    if (!item) return false;
    if (hasConflict(item)) return true;
    if (conflictingAppliedLessons(item).length) return true;
    if (activePlanLessonIds().has(item.id) && hasSandboxConflict(item)) return true;
    return false;
  }

  function conflictingAppliedLessons(item) {
    if (!item || isAppliedLesson(item) || !Array.isArray(item.arrangeInfo) || !item.arrangeInfo.length) return [];
    return lessons.filter((lesson) =>
      lesson.id !== item.id &&
      isAppliedLesson(lesson) &&
      Array.isArray(lesson.arrangeInfo) &&
      lesson.arrangeInfo.length &&
      schedulesOverlap(item.arrangeInfo, lesson.arrangeInfo)
    );
  }

  function schedulesOverlap(aSlots, bSlots) {
    if (!Array.isArray(aSlots) || !Array.isArray(bSlots)) return false;
    for (const a of aSlots) {
      for (const b of bSlots) {
        if (Number(a.weekDay) !== Number(b.weekDay)) continue;
        const aRange = slotMinuteRange(a);
        const bRange = slotMinuteRange(b);
        if (!aRange || !bRange) continue;
        if (aRange[1] <= bRange[0] || bRange[1] <= aRange[0]) continue;
        if (!weeksOverlap(a.weekState, b.weekState)) continue;
        return true;
      }
    }
    return false;
  }

  function weeksOverlap(a = "", b = "") {
    if (!a || !b) return true;
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i += 1) {
      if (a[i] === "1" && b[i] === "1") return true;
    }
    return false;
  }

  function formatSchedule(arrangeInfo) {
    if (!Array.isArray(arrangeInfo) || !arrangeInfo.length) return "";
    return arrangeInfo.map(scheduleSlotLine).filter(Boolean).join("；");
  }

  function scheduleSlotLine(slot) {
    const day = DAYS[Number(slot.weekDay)] || `周${slot.weekDay}`;
    const startUnit = Number(slot.startUnit);
    const endUnit = Number(slot.endUnit);
    const units = Number.isFinite(startUnit) && Number.isFinite(endUnit) ?
      (startUnit === endUnit ? `${startUnit}` : `${startUnit}-${endUnit}`) :
      "";
    const weeks = asText(slot.weekStateDigest);
    const rooms = asText(slot.rooms);
    const time = formatTimeRange(slot.startTime, slot.endTime);
    return [day, units ? `${units}节` : "", weeks ? `${weeks}周` : "", time, rooms].filter(Boolean).join(" ");
  }

  function formatTimeRange(start, end) {
    const s = formatClock(start);
    const e = formatClock(end);
    if (s && e && s === e) return s;
    return s && e ? `${s}-${e}` : "";
  }

  function formatClock(value) {
    const text = asText(value);
    if (!text) return "";
    const colon = text.match(/^(\d{1,2})\s*:\s*(\d{2})$/);
    if (colon) return `${colon[1].padStart(2, "0")}:${colon[2]}`;
    const compact = text.padStart(4, "0");
    if (!/^\d{4}$/.test(compact)) return "";
    return `${compact.slice(0, 2)}:${compact.slice(2)}`;
  }

  function parseCapacity(value) {
    const text = asText(value);
    const match = text.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) return { count: "", limit: "" };
    return { count: match[1], limit: match[2] };
  }

  function normalizeScheduleText(value) {
    return cleanText(value)
      .replace(/\bMon(?:day)?\b/gi, " 周一")
      .replace(/\bTue(?:sday)?\b/gi, " 周二")
      .replace(/\bWed(?:nesday)?\b/gi, " 周三")
      .replace(/\bThu(?:r|rs|rsday|rday)?\b/gi, " 周四")
      .replace(/\bFri(?:day)?\b/gi, " 周五")
      .replace(/\bSat(?:urday)?\b/gi, " 周六")
      .replace(/\bSun(?:day)?\b/gi, " 周日")
      .replace(/\s*；\s*/g, "；")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isPlaceholderLessonName(target, key) {
    if (key !== "name") return false;
    const name = normalizeSearchText(target.name);
    if (!name) return false;
    return [target.no, target.code, target.id, target.rawId, target.lessonId]
      .map(normalizeSearchText)
      .filter(Boolean)
      .some((value) => value === name);
  }

  function shortenLabel(value) {
    const text = asText(value).replace(/\s+/g, " ");
    if (text.length <= 8) return text;
    if (/课程详情|课程大纲/.test(text)) return text;
    if (/教师简介/.test(text)) return text;
    return `${text.slice(0, 7)}…`;
  }

  function markOriginalRows(filtered) {
    const visible = new Set(filtered.map((item) => item.id));
    for (const [id, row] of rowIndex) {
      row.classList.toggle("better-eams-match", visible.has(id));
      if (state.query || state.type || state.dept || state.credit || state.day || state.period || state.gradeRecord || state.status !== "all" || state.availability !== "all" || state.onlyFavorites || state.hideConflict) {
        row.classList.toggle("better-eams-dim", !visible.has(id));
      } else {
        row.classList.remove("better-eams-dim");
      }
    }
  }

  function improveLegacyPage() {
    document.documentElement.classList.add("better-eams-active");
    for (const cell of document.querySelectorAll("td, th")) {
      const text = cleanText(cell.textContent);
      if (text && !cell.title) cell.title = text;
    }
  }

  function hideLegacyPageChrome() {
    document.documentElement.classList.add("better-eams-full-app");
    const keep = new Set([
      `${APP_ID}-panel`,
      `${APP_ID}-portal`,
      `${APP_ID}-recovery`,
      `${APP_ID}-confirm`
    ]);
    for (const node of [...document.body.children]) {
      if (keep.has(node.id) || node.classList.contains("beams-toast") || node.classList.contains("beams-confirm-overlay")) {
        node.classList.remove("better-eams-page-hidden");
      } else {
        node.classList.add("better-eams-page-hidden");
      }
    }
  }

  function replacementHost() {
    return legacyCourseTabsPanel() ||
      document.querySelector("#electableLessonList") ||
      document.querySelector("#electedLessonList") ||
      document.querySelector(".electTabContent") ||
      document.querySelector("table") ||
      document.body.firstElementChild ||
      document.body;
  }

  function hideLegacyCourseLists() {
    const selectors = [
      "#courseTable",
      "#requiredCourse",
      "#electGroupResultsTable",
      "#electDescription",
      "#electableLessonList",
      "#electedLessonList"
    ];
    for (const node of document.querySelectorAll(selectors.join(","))) {
      if (node.closest(`#${APP_ID}-panel`)) continue;
      node.classList.add("better-eams-legacy-hidden");
    }

    const tabsPanel = legacyCourseTabsPanel();
    if (tabsPanel && !tabsPanel.closest(`#${APP_ID}-panel`)) {
      tabsPanel.classList.add("better-eams-legacy-hidden");
    }

    hideLegacyPaginationBars();
  }

  function legacyCourseTabsPanel() {
    return document.querySelector("#electableLessonList")?.closest(".electTabPanel") ||
      document.querySelector("#electedLessonList")?.closest(".electTabPanel") ||
      null;
  }

  function hideLegacyPaginationBars() {
    for (const node of document.querySelectorAll(".girdbar-pgbar, .gridbar")) {
      if (node.closest(`#${APP_ID}-panel`)) continue;
      const bar = node.classList.contains("gridbar") ? node : node.closest(".gridbar") || node;
      if (bar.closest(`#${APP_ID}-panel`)) continue;
      if (!isCourseGridPaginationBar(bar)) continue;
      bar.classList.add("better-eams-legacy-hidden");
    }
  }

  function isCourseGridPaginationBar(bar) {
    if (!bar || bar.closest("#courseTable, #requiredCourse, #electGroupResultsTable")) return false;
    if (!bar.querySelector(".pgButton, .pgButtonHover")) return false;
    const grid = bar.closest(".grid");
    const text = cleanText(grid?.textContent || bar.textContent);
    return /课程列表|课程名称|课程序号|课程代码|已选\/上限|选课|退课/.test(text);
  }

  function observePageChanges() {
    const observer = new MutationObserver(() => {
      const signature = pageSignature();
      if (signature !== lastSignature) {
        window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(refreshLessons, 250);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function pageSignature() {
    const rowCount = document.querySelectorAll("tr").length;
    const scriptLength = [...document.scripts].reduce((sum, script) => sum + (script.textContent || "").length, 0);
    const lessonCount = Array.isArray(getPageWindow().lessonJSONs) ? getPageWindow().lessonJSONs.length : 0;
    return `${rowCount}:${scriptLength}:${lessonCount}:${originalRowsSignature()}`;
  }

  function originalRowsSignature() {
    const rowText = [...document.querySelectorAll("tr")]
      .filter((row) => row.children.length >= 3 && !row.closest(`#${APP_ID}-panel`))
      .map((row) => normalizeSearchText(row.textContent || "").slice(0, 180))
      .join("|");
    return hashText(rowText);
  }

  function hashText(value) {
    let hash = 0;
    const text = asText(value);
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return String(hash);
  }

  function exposeDebugApi() {
    const pageWindow = getPageWindow();
    try {
      pageWindow.__BetterEAMS = {
        version: APP_VERSION,
        getState: debugState,
        refresh: refreshLessons,
        locate: debugLocateLesson,
        lessons: debugLessons
      };
      updateDebugState();
    } catch (_) {}
  }

  function updateDebugState() {
    const pageWindow = getPageWindow();
    try {
      if (pageWindow.__BetterEAMS) pageWindow.__BetterEAMS.state = debugState();
    } catch (_) {}
    updateDebugDataset();
  }

  function debugState() {
    const courseTable = document.querySelector("#courseTable");
    const electDescription = document.querySelector("#electDescription");
    const electable = document.querySelector("#electableLessonList");
    const elected = document.querySelector("#electedLessonList");
    return {
      version: APP_VERSION,
      lessonCount: lessons.length,
      studentCategoryMapCount: studentCourseCategories.byCourseId.size,
      studentCategoryFallback: studentCourseCategories.fallback,
      studentCategorySource: studentCourseCategories.source,
      rowIndexCount: rowIndex.size,
      apiTemplateCount: apiTemplates.length,
      courseBenchLoaded,
      courseBenchLoading,
      courseBenchError,
      courseBenchCatalogCount: courseBenchCatalog.size,
      courseBenchMatchedLessonCount: lessons.filter((item) => Boolean(item.courseBenchRating)).length,
      planGapCount: curriculumPlan.gaps.length,
      planMatchedLessonCount: lessons.filter(hasCurriculumPlanGap).length,
      planActionableGapCount: curriculumPlan.gaps.filter((gap) => gap.kind !== "group" || gap.actionable).length,
      planGapLabels: curriculumPlan.gaps.slice(0, 12).map(planGapLabel),
      planActionableGapLabels: curriculumPlan.gaps
        .filter((gap) => gap.kind !== "group" || gap.actionable)
        .slice(0, 12)
        .map(planGapLabel),
      planLoading: curriculumPlanLoading,
      planLoaded: curriculumPlanLoaded,
      planError: curriculumPlanError,
      summary: panel?.querySelector('[data-role="summary"]')?.textContent.trim() || "",
      courseTableVisible: isVisible(courseTable),
      courseTableHiddenClass: Boolean(courseTable?.classList.contains("better-eams-legacy-hidden")),
      electDescriptionVisible: isVisible(electDescription),
      electDescriptionHiddenClass: Boolean(electDescription?.classList.contains("better-eams-legacy-hidden")),
      electableHidden: electable ? !isVisible(electable) : null,
      electedHidden: elected ? !isVisible(elected) : null,
      visibleLegacyPageButtons: visibleLegacyPageButtons().length,
      visibleLocateButtons: document.querySelectorAll(`#${APP_ID}-panel [data-action="locate"]`).length,
      hasCrossPageFailureText: document.body?.textContent?.includes("跨页查找失败") || false,
      activeFilters: activeFilterLabels()
    };
  }

  function updateDebugDataset() {
    if (!panel) return;
    const state = debugState();
    panel.dataset.lessonCount = String(state.lessonCount);
    panel.dataset.studentCategoryMapCount = String(state.studentCategoryMapCount);
    panel.dataset.studentCategoryFallback = state.studentCategoryFallback;
    panel.dataset.rowIndexCount = String(state.rowIndexCount);
    panel.dataset.apiTemplateCount = String(state.apiTemplateCount);
    panel.dataset.courseBenchLoaded = String(state.courseBenchLoaded);
    panel.dataset.courseBenchLoading = String(state.courseBenchLoading);
    panel.dataset.courseBenchCatalogCount = String(state.courseBenchCatalogCount);
    panel.dataset.courseBenchMatchedLessonCount = String(state.courseBenchMatchedLessonCount);
    panel.dataset.planGapCount = String(state.planGapCount);
    panel.dataset.planMatchedLessonCount = String(state.planMatchedLessonCount);
    panel.dataset.planActionableGapCount = String(state.planActionableGapCount);
    panel.dataset.planLoading = String(state.planLoading);
    panel.dataset.planLoaded = String(state.planLoaded);
    panel.dataset.courseTableVisible = String(state.courseTableVisible);
    panel.dataset.electDescriptionVisible = String(state.electDescriptionVisible);
    panel.dataset.electableHidden = String(state.electableHidden);
    panel.dataset.electedHidden = String(state.electedHidden);
    panel.dataset.visibleLegacyPageButtons = String(state.visibleLegacyPageButtons);
    panel.dataset.visibleLocateButtons = String(state.visibleLocateButtons);
    panel.dataset.hasCrossPageFailureText = String(state.hasCrossPageFailureText);
    panel.dataset.panelWidth = String(Math.round(panel.getBoundingClientRect().width));
    panel.dataset.viewportWidth = String(window.innerWidth);
  }

  function visibleLegacyPageButtons() {
    return [...document.querySelectorAll(".pgButton, .pgButtonHover")]
      .filter((node) => !node.closest(`#${APP_ID}-panel`) && isVisible(node));
  }

  function debugLocateLesson(query) {
    const item = findLessonForDebug(query);
    if (!item) {
      toast(`没有找到课程：${asText(query) || "空查询"}`);
      return false;
    }
    locateOriginalRow(item.id);
    return true;
  }

  function debugLessons() {
    return lessons.map((item) => ({
      id: item.id,
      no: item.no,
      code: item.code,
      courseId: asText(item.raw?.courseId),
      name: item.name,
      category: item.category,
      categorySource: item.categorySource,
      sourceCourseTypeName: item.sourceCourseTypeName,
      elected: item.elected,
      preElect: item.preElect,
      electable: item.electable,
      capacity: capacityText(item),
      planMatches: curriculumPlanMatches(item).map((match) => match.label)
    }));
  }

  function findLessonForDebug(query) {
    const normalized = normalizeSearchText(query);
    if (!normalized) return null;
    const tokens = buildQueryTokens(query);
    return lessons.find((item) => normalizeSearchText(item.id) === normalized || normalizeSearchText(item.no) === normalized) ||
      lessons.find((item) => normalizeSearchText(item.code) === normalized) ||
      lessons.find((item) => tokens.every((token) => lessonMatchesQueryToken(item, token))) ||
      null;
  }

  function isVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function toast(message) {
    const node = document.createElement("div");
    node.className = "beams-toast";
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.classList.add("is-visible"));
    setTimeout(() => {
      node.classList.remove("is-visible");
      setTimeout(() => node.remove(), 180);
    }, 1800);
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      #better-eams-panel {
        --beams-bg: #ffffff;
        --beams-panel: #f7f8fa;
        --beams-text: #172033;
        --beams-muted: #637083;
        --beams-border: #d8dee8;
        --beams-accent: #0f766e;
        --beams-accent-soft: #d8f3ee;
        --beams-danger: #b42318;
        --beams-warning: #b45309;
        --beams-open: #0f766e;
        position: relative;
        left: 50%;
        z-index: 30;
        width: calc(100vw - 8px);
        max-width: none;
        height: min(920px, calc(100vh - 24px));
        margin: 8px 0 12px calc(-50vw + 4px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: var(--beams-text);
        background: var(--beams-bg);
        border: 1px solid var(--beams-border);
        border-radius: 8px;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.10);
        font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      html.better-eams-full-app,
      html.better-eams-full-app body {
        min-height: 100%;
        margin: 0 !important;
        background: #eef2f7 !important;
      }
      html.better-eams-full-app body {
        overflow: hidden;
      }
      html.better-eams-full-app #better-eams-panel {
        left: 0;
        width: 100vw;
        height: 100vh;
        margin: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      #better-eams-panel * { box-sizing: border-box; }
      #better-eams-panel button,
      #better-eams-panel input,
      #better-eams-panel select {
        font: inherit;
      }
      #better-eams-panel button {
        border: 1px solid var(--beams-border);
        border-radius: 6px;
        background: #fff;
        color: var(--beams-text);
        cursor: pointer;
      }
      #better-eams-panel button:hover {
        border-color: var(--beams-accent);
        color: var(--beams-accent);
      }
      .beams-head {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-bottom: 1px solid var(--beams-border);
        background: var(--beams-panel);
        border-radius: 8px 8px 0 0;
      }
      .beams-icon {
        width: 32px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--beams-accent) !important;
        border-color: var(--beams-accent) !important;
        border-radius: 6px;
        color: #fff !important;
        font-weight: 700;
      }
      .beams-title {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .beams-title strong {
        font-size: 14px;
      }
      .beams-title span {
        color: var(--beams-muted);
        font-size: 11px;
      }
      .beams-mini {
        height: 28px;
        padding: 0 8px;
      }
      .beams-body {
        min-height: 0;
        flex: 1;
        display: grid;
        grid-template-columns: minmax(470px, 45vw) minmax(470px, 1fr);
        gap: 8px;
        padding: 9px;
        overflow: hidden;
      }
      .beams-left-pane,
      .beams-right-pane {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow: hidden;
      }
      .beams-left-pane {
        align-self: stretch;
      }
      .beams-right-pane {
        align-self: stretch;
      }
      .beams-page-meta {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        border: 1px solid var(--beams-border);
        border-radius: 8px;
        padding: 5px 7px;
        background: #f8fafc;
        color: var(--beams-muted);
      }
      .beams-page-meta span {
        min-width: 0;
        display: inline-flex;
        align-items: baseline;
        gap: 4px;
        border-radius: 999px;
        padding: 1px 6px;
        background: #fff;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .beams-page-meta b {
        color: var(--beams-text);
        font-weight: 600;
      }
      .beams-page-meta a {
        color: var(--beams-accent);
        text-decoration: none;
      }
      .beams-search-row input {
        width: 100%;
        height: 31px;
        border: 1px solid var(--beams-border);
        border-radius: 6px;
        padding: 0 8px;
        outline: none;
        background: #fff;
        color: var(--beams-text);
      }
      .beams-search-row input:focus,
      .beams-field select:focus {
        border-color: var(--beams-accent);
        box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.16);
      }
      .beams-controls {
        display: grid;
        grid-template-columns: repeat(5, minmax(104px, 1fr));
        gap: 6px;
      }
      .beams-field {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .beams-field span {
        color: var(--beams-muted);
        font-size: 11px;
      }
      .beams-field select {
        min-width: 0;
        height: 28px;
        border: 1px solid var(--beams-border);
        border-radius: 6px;
        background: #fff;
        color: var(--beams-text);
      }
      .beams-toggles,
      .beams-tools {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .beams-toggles label {
        color: var(--beams-muted);
        white-space: nowrap;
      }
      .beams-tools button {
        height: 27px;
        padding: 0 7px;
      }
      .beams-tools button.is-staged-visibility-active {
        border-color: #7dd3fc;
        background: #e0f2fe;
        color: #075985;
      }
      .beams-tools .beams-apply-plan {
        border-color: var(--beams-accent);
        background: var(--beams-accent);
        color: #fff;
      }
      .beams-tools .beams-apply-plan:hover {
        color: #fff;
        filter: brightness(0.96);
      }
      .beams-plan-picker {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--beams-muted);
      }
      .beams-plan-picker select {
        min-width: 112px;
        height: 30px;
      }
      .beams-sandbox-summary {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px;
        border: 1px solid #bae6fd;
        border-radius: 8px;
        padding: 5px 7px;
        background: #f0f9ff;
        color: #075985;
      }
      .beams-sandbox-main {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        align-items: baseline;
        width: 100%;
      }
      .beams-sandbox-main strong {
        color: #0f172a;
      }
      .beams-sandbox-main > span,
      .beams-plan-roster li span {
        border-radius: 999px;
        padding: 1px 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .beams-sandbox-main > span {
        background: rgba(255,255,255,.72);
      }
      .beams-sandbox-main .is-applied,
      .beams-plan-roster .is-applied {
        background: #dcfce7;
        color: #047857;
      }
      .beams-sandbox-main .is-staged,
      .beams-plan-roster .is-staged {
        background: #e0f2fe;
        color: #0369a1;
      }
      .beams-sandbox-main .is-system-only {
        background: #fef3c7;
        color: #92400e;
      }
      .beams-sandbox-ok {
        color: #047857;
      }
      .beams-sandbox-conflicts summary,
      .beams-plan-roster summary {
        cursor: pointer;
      }
      .beams-sandbox-conflicts summary {
        color: var(--beams-danger);
        font-size: 12px;
      }
      .beams-sandbox-conflicts ul,
      .beams-plan-roster ul {
        margin: 4px 0 0;
        padding-left: 18px;
      }
      .beams-plan-roster {
        width: 100%;
      }
      .beams-plan-roster li {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 5px;
      }
      .beams-plan-roster li + li {
        margin-top: 3px;
      }
      .beams-plan-roster li strong {
        min-width: 0;
        font-weight: 500;
        overflow-wrap: anywhere;
      }
      .beams-plan-roster em {
        color: #64748b;
        font-style: normal;
      }
      .beams-plan-roster button {
        height: 21px;
        padding: 0 5px;
        font-size: 11px;
      }
      .beams-timetable {
        min-height: 0;
        flex: 1 1 auto;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--beams-border);
        border-radius: 8px;
        padding: 6px;
        overflow: hidden;
        background: #fff;
      }
      .beams-timetable-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-bottom: 6px;
        min-height: 22px;
      }
      .beams-preview-row {
        flex: 0 0 100%;
        display: flex;
        align-items: center;
        min-height: 18px;
        overflow: hidden;
      }
      .beams-timetable-head strong {
        font-size: 13px;
      }
      .beams-timetable-head span,
      .beams-timetable-unscheduled {
        color: var(--beams-muted);
      }
      .beams-calendar-legend {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
      }
      .beams-calendar-legend b {
        width: 10px;
        height: 10px;
        border-radius: 3px;
      }
      .beams-calendar-legend b.is-applied {
        background: #dcfce7;
        border-left: 3px solid #059669;
      }
      .beams-calendar-legend b.is-staged {
        background: #e0f2fe;
        border-left: 3px solid #0284c7;
      }
      .beams-calendar-legend b.is-staged-overlay {
        background: rgba(224, 242, 254, 0.44);
        border-left: 3px solid rgba(2, 132, 199, 0.72);
      }
      .beams-calendar-legend b.is-preview {
        background: rgba(254, 243, 199, 0.56);
        border: 1px dashed rgba(217, 119, 6, 0.58);
      }
      .beams-staged-hint {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 1px 7px;
        background: #eff6ff;
        color: #1d4ed8 !important;
        font-size: 11px;
        line-height: 1.2;
        height: 18px;
        box-sizing: border-box;
      }
      .beams-preview-label {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        border-radius: 999px;
        padding: 1px 7px;
        background: #fef3c7;
        color: #92400e !important;
        font-size: 11px;
        line-height: 1.2;
        height: 18px;
        box-sizing: border-box;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-preview-label.is-empty {
        visibility: hidden;
      }
      .beams-calendar-scroll {
        min-height: 0;
        flex: 1 1 auto;
        border: 1px solid var(--beams-border);
        border-radius: 7px;
        overflow-x: hidden;
        overflow-y: auto;
        background: #fff;
      }
      .beams-calendar-head-row {
        position: sticky;
        top: 0;
        z-index: 5;
        display: grid;
        grid-template-columns: 38px repeat(7, minmax(0, 1fr));
        min-width: 0;
        border-bottom: 1px solid var(--beams-border);
        background: #f8fafc;
      }
      .beams-calendar-axis-head,
      .beams-day-head {
        min-height: 24px;
        border-right: 1px solid var(--beams-border);
      }
      .beams-day-head {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #475569;
        font-size: 10px;
        font-weight: 600;
      }
      .beams-calendar-body {
        display: grid;
        grid-template-columns: 38px repeat(7, minmax(0, 1fr));
        min-width: 0;
        height: var(--beams-calendar-height, 390px);
        position: relative;
      }
      .beams-calendar-axis,
      .beams-calendar-day-column {
        position: relative;
        height: var(--beams-calendar-height, 390px);
        border-right: 1px solid var(--beams-border);
      }
      .beams-calendar-axis {
        background: #f8fafc;
      }
      .beams-calendar-axis span {
        position: absolute;
        right: 4px;
        transform: translateY(-50%);
        color: #64748b;
        font-size: 9px;
        white-space: nowrap;
      }
      .beams-calendar-day-column {
        background:
          linear-gradient(to right, rgba(216, 222, 232, 0.55) 0, transparent 1px),
          #fff;
        overflow: visible;
      }
      .beams-calendar-hour-line {
        position: absolute;
        left: 0;
        right: 0;
        height: 1px;
        background: #e5e7eb;
        pointer-events: none;
      }
      .beams-calendar-cell-layer {
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .beams-calendar-hit-cell {
        position: absolute;
        left: 0;
        right: 0;
        margin: 0;
        border: 0 !important;
        border-radius: 0 !important;
        padding: 0;
        background: transparent !important;
        color: transparent !important;
        cursor: pointer;
        box-shadow: none;
      }
      .beams-calendar-hit-cell:hover {
        background: rgba(15, 118, 110, 0.08) !important;
        box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.18);
      }
      .beams-calendar-hit-cell.is-selected {
        background: rgba(15, 118, 110, 0.13) !important;
        box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.26);
      }
      .beams-calendar-hit-cell.is-selected:hover {
        background: rgba(15, 118, 110, 0.16) !important;
        box-shadow: inset 0 0 0 1px rgba(15, 118, 110, 0.32);
      }
      .beams-time-course {
        position: absolute;
        z-index: 3;
        border-left: 3px solid #0284c7;
        border-radius: 6px;
        padding: 4px 5px;
        background: rgba(224, 242, 254, 0.86);
        color: #075985;
        overflow: visible;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.10);
        pointer-events: auto;
        cursor: pointer;
        transition: opacity .12s ease, box-shadow .12s ease, transform .12s ease, filter .12s ease;
      }
      .beams-time-course-body {
        height: 100%;
        border-radius: inherit;
        overflow: hidden;
      }
      .beams-time-course.is-applied {
        border-left-color: #059669;
        background: rgba(220, 252, 231, 0.88);
        color: #047857;
      }
      .beams-time-course.is-staged {
        border-left-color: #0284c7;
      }
      .beams-time-course.is-staged-overlay {
        z-index: 4;
        border: 1px solid rgba(2, 132, 199, 0.34);
        border-left: 3px solid rgba(2, 132, 199, 0.74);
        background: rgba(224, 242, 254, 0.22);
        color: #075985;
        box-shadow: 0 0 0 1px rgba(2, 132, 199, 0.08), 0 1px 4px rgba(15, 23, 42, 0.06);
      }
      .beams-time-course.is-preview {
        z-index: 7;
        border: 1px dashed rgba(217, 119, 6, 0.38);
        border-left: 3px solid rgba(217, 119, 6, 0.62);
        background: rgba(254, 243, 199, 0.22);
        color: #92400e;
        pointer-events: none;
        box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.04), 0 1px 4px rgba(15, 23, 42, 0.06);
      }
      .beams-time-group {
        position: absolute;
        left: 0;
        right: 0;
        z-index: 3;
        pointer-events: none;
        overflow: visible;
      }
      .beams-time-group.is-open {
        z-index: 6;
      }
      .beams-time-group:hover {
        z-index: 7;
      }
      .beams-time-group:hover .beams-time-course.is-group-member:not(.is-hovered-direct) {
        opacity: 0.46;
        filter: saturate(0.82);
      }
      .beams-time-group:hover .beams-time-course.is-group-member.is-hovered-direct {
        opacity: 1;
        filter: none;
      }
      .beams-time-course:hover,
      .beams-time-course.is-hovered-direct {
        transform: translateY(-1px);
        box-shadow: 0 3px 10px rgba(15, 23, 42, 0.14);
      }
      .beams-time-course.is-hovered-direct {
        z-index: 9;
      }
      .beams-time-course.is-compact {
        padding: 4px;
      }
      .beams-time-course.is-compact .beams-calendar-course-top {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
      }
      .beams-time-course.is-compact strong {
        line-height: 1.2;
      }
      .beams-time-course.is-compact em {
        align-self: flex-start;
      }
      .beams-time-course-pop {
        position: absolute;
        top: -4px;
        left: calc(100% + 8px);
        z-index: 12;
        width: 188px;
        max-width: min(210px, 26vw);
        display: grid;
        gap: 3px;
        border: 1px solid rgba(203, 213, 225, 0.96);
        border-radius: 9px;
        padding: 8px 9px;
        background: rgba(255, 255, 255, 0.98);
        color: #0f172a;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
        opacity: 0;
        transform: translateX(6px) scale(0.985);
        pointer-events: none;
        transition: opacity .12s ease, transform .12s ease;
      }
      .beams-time-course-pop.is-left {
        left: auto;
        right: calc(100% + 8px);
        transform: translateX(-6px) scale(0.985);
      }
      .beams-time-course-pop.is-above {
        top: auto;
        bottom: -4px;
      }
      .beams-time-course.is-hovered-direct .beams-time-course-pop,
      .beams-time-course:focus-within .beams-time-course-pop {
        opacity: 1;
        transform: translateX(0) scale(1);
      }
      .beams-time-course-pop.is-left,
      .beams-time-course.is-hovered-direct .beams-time-course-pop.is-left,
      .beams-time-course:focus-within .beams-time-course-pop.is-left {
        transform-origin: right center;
      }
      .beams-time-course-pop-top {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .beams-time-course .beams-time-course-pop-top strong {
        flex: 1;
        min-width: 0;
        display: block;
        font-size: 12px;
        line-height: 1.25;
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
      }
      .beams-time-course-pop-top em {
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 1px 5px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 9px;
        font-style: normal;
        line-height: 1.35;
      }
      .beams-time-course.is-applied .beams-time-course-pop-top em {
        background: #dcfce7;
        color: #047857;
      }
      .beams-time-course.is-staged-overlay .beams-time-course-pop-top em,
      .beams-time-course.is-staged .beams-time-course-pop-top em {
        background: #eff6ff;
        color: #1d4ed8;
      }
      .beams-time-course .beams-time-course-pop span {
        display: block;
        color: #475569;
        font-size: 10px;
        line-height: 1.35;
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        overflow-wrap: anywhere;
      }
      .beams-time-course-pop-summary {
        color: #0f172a !important;
        font-weight: 600;
      }
      .beams-time-overflow {
        position: absolute;
        top: 4px;
        right: 4px;
        z-index: 8;
        pointer-events: auto;
      }
      .beams-time-overflow-toggle {
        min-width: 24px;
        height: 18px;
        border: 1px solid rgba(148, 163, 184, 0.48);
        border-radius: 999px;
        padding: 0 6px;
        background: rgba(255, 255, 255, 0.95);
        color: #334155;
        font-size: 10px;
        line-height: 1;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.10);
      }
      .beams-time-overflow-toggle:hover {
        background: #fff;
      }
      .beams-time-overflow-pop {
        position: absolute;
        top: 22px;
        right: 0;
        width: 210px;
        max-width: min(220px, 48vw);
        display: grid;
        gap: 6px;
        border: 1px solid rgba(203, 213, 225, 0.9);
        border-radius: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.98);
        box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
        opacity: 0;
        transform: translateY(-4px);
        pointer-events: none;
        transition: opacity .12s ease, transform .12s ease;
      }
      .beams-time-overflow:hover .beams-time-overflow-pop,
      .beams-time-overflow.is-open .beams-time-overflow-pop,
      .beams-time-group.is-open .beams-time-overflow-pop {
        opacity: 1;
        transform: translateY(0);
        pointer-events: auto;
      }
      .beams-time-overflow-title {
        color: #475569;
        font-size: 11px;
        font-weight: 700;
      }
      .beams-time-overflow-list {
        display: grid;
        gap: 5px;
      }
      .beams-time-overflow-entry {
        display: grid;
        gap: 2px;
        width: 100%;
        border: 1px solid rgba(226, 232, 240, 0.95);
        border-radius: 7px;
        padding: 6px 7px;
        background: #fff;
        color: #0f172a;
        text-align: left;
      }
      .beams-time-overflow-entry:hover {
        border-color: rgba(2, 132, 199, 0.34);
        background: #f8fbff;
      }
      .beams-time-overflow-entry-top {
        display: flex;
        align-items: flex-start;
        gap: 6px;
      }
      .beams-time-overflow-entry strong,
      .beams-time-overflow-entry span {
        display: block;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-time-overflow-entry strong {
        flex: 1;
        font-size: 11px;
      }
      .beams-time-overflow-summary {
        color: #0f172a !important;
        font-weight: 500;
      }
      .beams-time-overflow-entry em {
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 1px 4px;
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 9px;
        font-style: normal;
        line-height: 1.35;
      }
      .beams-time-overflow-entry span {
        color: #64748b;
        font-size: 10px;
      }
      .beams-time-course.has-stack {
        outline: 1px solid rgba(180, 83, 9, 0.25);
      }
      .beams-calendar-course-top {
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: 3px;
      }
      .beams-calendar-course-top strong {
        min-width: 0;
        flex: 1;
      }
      .beams-calendar-course-top em {
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 1px 3px;
        background: rgba(255,255,255,.72);
        font-size: 9px;
        font-style: normal;
        line-height: 1.35;
      }
      .beams-time-course strong,
      .beams-time-course span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-time-course strong {
        font-size: 10px;
      }
      .beams-time-course span {
        font-size: 9px;
        line-height: 1.25;
      }
      .beams-time-course .beams-calendar-course-code,
      .beams-time-course .beams-calendar-weeks {
        opacity: 0.86;
      }
      .beams-timetable-unscheduled {
        display: grid;
        gap: 6px;
        margin: 0 0 6px;
        border: 1px dashed #cbd5e1;
        border-radius: 7px;
        padding: 6px;
        background: #f8fafc;
        color: var(--beams-text);
      }
      .beams-unscheduled-title {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 6px;
      }
      .beams-unscheduled-title span {
        color: var(--beams-muted);
        font-size: 11px;
      }
      .beams-unscheduled-list {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 5px;
      }
      .beams-unscheduled-course {
        border-left: 4px solid #0284c7;
        border-radius: 6px;
        padding: 5px 7px;
        background: #e0f2fe;
        color: #075985;
      }
      .beams-unscheduled-course.is-applied {
        border-left-color: #059669;
        background: #dcfce7;
        color: #047857;
      }
      .beams-unscheduled-course-top {
        min-width: 0;
        display: flex;
        align-items: flex-start;
        gap: 5px;
      }
      .beams-unscheduled-course-top strong {
        min-width: 0;
        flex: 1;
        font-size: 11px;
        overflow-wrap: anywhere;
      }
      .beams-unscheduled-course-top em {
        flex: 0 0 auto;
        border-radius: 999px;
        padding: 1px 4px;
        background: rgba(255,255,255,.72);
        font-size: 10px;
        font-style: normal;
        line-height: 1.35;
      }
      .beams-unscheduled-course > span {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        line-height: 1.35;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-list {
        min-height: 0;
        flex: 1 1 auto;
        display: grid;
        align-content: start;
        grid-template-columns: repeat(auto-fit, minmax(315px, 1fr));
        gap: 8px;
        overflow: auto;
        padding-right: 2px;
      }
      .beams-card {
        border: 1px solid var(--beams-border);
        border-radius: 8px;
        padding: 9px;
        margin-bottom: 0;
        background: #fff;
      }
      .beams-card.is-favorite {
        border-color: var(--beams-accent);
        background: linear-gradient(0deg, var(--beams-accent-soft), var(--beams-accent-soft)), #fff;
      }
      .beams-card.is-applied-card {
        box-shadow: inset 3px 0 0 #059669;
      }
      .beams-card.is-in-plan {
        box-shadow: inset 3px 0 0 #0284c7;
      }
      .beams-card.has-conflict:not(.is-favorite) {
        border-color: #f2b8b5;
      }
      .beams-card.has-applied-conflict {
        border-color: #f2b8b5;
        outline: 1px solid rgba(180, 35, 24, 0.14);
        outline-offset: -1px;
        background: linear-gradient(0deg, rgba(254, 242, 242, 0.72), rgba(254, 242, 242, 0.72)), #fff;
      }
      .beams-card.has-sandbox-conflict {
        border-color: #f2b8b5;
      }
      .beams-card.has-plan-gap {
        border-color: #f7c948;
        box-shadow: inset 3px 0 0 #f59e0b;
      }
      .beams-card.is-preview-source {
        border-color: rgba(217, 119, 6, 0.52);
        box-shadow: 0 0 0 1px rgba(217, 119, 6, 0.12);
      }
      .beams-card.is-linked-focus {
        border-color: rgba(29, 78, 216, 0.5);
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18);
      }
      .beams-card-main {
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .beams-credit {
        width: 44px;
        flex: 0 0 auto;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 2px 4px 3px;
        background: #f8fafc;
        color: #334155;
        text-align: center;
      }
      .beams-credit strong,
      .beams-credit span {
        display: block;
        line-height: 1.1;
      }
      .beams-credit strong {
        font-size: 16px;
        font-weight: 800;
      }
      .beams-credit span {
        margin-top: 1px;
        color: var(--beams-muted);
        font-size: 9px;
      }
      .beams-course {
        min-width: 0;
        flex: 1;
      }
      .beams-course-title {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 5px;
      }
      .beams-course-title strong {
        min-width: 0;
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .beams-course-title span,
      .beams-meta,
      .beams-schedule,
      .beams-detail {
        color: var(--beams-muted);
      }
      .beams-capacity {
        flex: 0 0 auto;
        min-width: 100px;
        border-radius: 7px;
        padding: 3px 6px;
        font-size: 11px;
        text-align: right;
        background: #eef2f7;
      }
      .beams-capacity strong,
      .beams-capacity span {
        display: block;
        white-space: nowrap;
      }
      .beams-capacity strong {
        font-size: 11px;
        line-height: 1.25;
      }
      .beams-capacity span {
        margin-top: 1px;
        color: #64748b;
        font-size: 10px;
      }
      .beams-capacity.is-open { color: var(--beams-open); background: #dcfce7; }
      .beams-capacity.is-tight { color: var(--beams-warning); background: #fef3c7; }
      .beams-capacity.is-full { color: var(--beams-danger); background: #fee2e2; }
      .beams-coursebench {
        flex: 0 0 auto;
        width: 72px;
        min-height: 39px;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 7px;
        padding: 3px 6px;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        justify-content: center;
        background: #f8fafc;
        color: #334155;
        text-align: right;
        text-decoration: none;
        transition: border-color .12s ease, background .12s ease, transform .12s ease;
      }
      .beams-coursebench:hover,
      .beams-coursebench:focus-visible {
        border-color: #0f766e;
        background: #f0fdfa;
        transform: translateY(-1px);
        outline: none;
      }
      .beams-coursebench strong,
      .beams-coursebench span {
        display: block;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-coursebench strong {
        font-size: 16px;
        line-height: 1.1;
        font-weight: 800;
      }
      .beams-coursebench span {
        margin-top: 1px;
        font-size: 9px;
        line-height: 1.15;
      }
      .beams-coursebench.is-excellent { border-color: #86efac; background: #f0fdf4; color: #166534; }
      .beams-coursebench.is-good { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
      .beams-coursebench.is-mixed { border-color: #fcd34d; background: #fffbeb; color: #92400e; }
      .beams-coursebench.is-low { border-color: #fca5a5; background: #fef2f2; color: #b42318; }
      .beams-coursebench.is-insufficient,
      .beams-coursebench.is-unavailable { color: #64748b; background: #f8fafc; }
      .beams-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 6px 0;
      }
      .beams-tags span {
        max-width: 100%;
        border-radius: 999px;
        padding: 1px 6px;
        background: #eef2f7;
        color: #475569;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-plan-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 0 0 6px;
      }
      .beams-status-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 6px 0 0;
      }
      .beams-status-badges + .beams-plan-badges {
        margin-top: 6px;
      }
      .beams-plan-badges span {
        max-width: 100%;
        border-radius: 999px;
        padding: 1px 6px;
        background: #fef3c7;
        color: #92400e;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-status-badges span {
        max-width: 100%;
        border-radius: 999px;
        padding: 1px 6px;
        font-size: 11px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .beams-status-badges .is-applied,
      .beams-status-badges .is-plan-applied {
        background: #dcfce7;
        color: #047857;
      }
      .beams-status-badges .is-staged {
        background: #e0f2fe;
        color: #0369a1;
      }
      .beams-status-badges .is-time-conflict {
        background: #fee2e2;
        color: #b42318;
      }
      .beams-schedule {
        display: flex;
        flex-direction: column;
        gap: 5px;
        overflow-wrap: anywhere;
      }
      .beams-time-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .beams-time-chip {
        max-width: 100%;
        border: 1px solid #cbd5e1;
        border-radius: 999px;
        padding: 1px 6px;
        background: #f8fafc;
        color: #334155;
        font-size: 11px;
        line-height: 1.4;
        white-space: nowrap;
      }
      .beams-time-chip.is-more {
        color: var(--beams-muted);
        background: #eef2f7;
      }
      .beams-time-empty {
        color: var(--beams-muted);
        font-size: 11px;
      }
      .beams-schedule-more {
        color: var(--beams-muted);
      }
      .beams-schedule-more summary {
        cursor: pointer;
        color: var(--beams-accent);
        width: fit-content;
      }
      .beams-schedule-more ul {
        margin: 4px 0 0;
        padding-left: 18px;
      }
      .beams-schedule-more li + li {
        margin-top: 2px;
      }
      .beams-detail {
        margin-top: 6px;
      }
      .beams-detail summary {
        cursor: pointer;
        color: var(--beams-accent);
      }
      .beams-detail p {
        margin: 4px 0 0;
        overflow-wrap: anywhere;
      }
      .beams-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 7px;
      }
      .beams-actions button {
        height: 26px;
        padding: 0 7px;
      }
      .beams-actions .beams-star {
        margin-left: auto;
        width: 26px;
        min-width: 26px;
        padding: 0;
        font-size: 16px;
        line-height: 1;
      }
      .beams-actions button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .beams-origin-action.is-enroll {
        background: var(--beams-accent) !important;
        border-color: var(--beams-accent) !important;
        color: #fff !important;
      }
      .beams-origin-action.is-enroll.is-conflict-hint {
        background: #fff1f2 !important;
        border-color: #f2b8b5 !important;
        color: #b42318 !important;
      }
      .beams-origin-action.is-drop {
        border-color: #f2b8b5 !important;
        color: var(--beams-danger) !important;
      }
      .beams-origin-action.is-detail,
      .beams-origin-action.is-teacher {
        background: #f8fafc !important;
      }
      .beams-plan-toggle.is-active {
        border-color: #0284c7 !important;
        color: #0369a1 !important;
        background: #e0f2fe !important;
      }
      .beams-plan-toggle.is-applied {
        border-color: #86efac !important;
        color: #047857 !important;
        background: #dcfce7 !important;
      }
      .beams-warning {
        color: var(--beams-danger);
        font-size: 12px;
      }
      .beams-empty,
      .beams-limit {
        border: 1px dashed var(--beams-border);
        border-radius: 8px;
        padding: 12px;
        color: var(--beams-muted);
        background: #fff;
      }
      .beams-toast {
        position: fixed;
        right: 24px;
        bottom: 24px;
        z-index: 2147483001;
        padding: 9px 12px;
        border-radius: 7px;
        background: #111827;
        color: #fff;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.18s ease, transform 0.18s ease;
      }
      .beams-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }
      .beams-confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(15, 23, 42, 0.44);
      }
      .beams-confirm-dialog {
        width: min(520px, 100%);
        max-height: min(620px, calc(100vh - 36px));
        overflow: auto;
        border: 1px solid var(--beams-border, #d8dee8);
        border-radius: 8px;
        background: #fff;
        color: var(--beams-text, #172033);
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.26);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      .beams-confirm-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 13px 14px;
        border-bottom: 1px solid var(--beams-border, #d8dee8);
        background: #f7f8fa;
      }
      .beams-confirm-head strong {
        min-width: 0;
        flex: 1;
        font-size: 16px;
      }
      .beams-confirm-close {
        width: 30px;
        height: 30px;
        border: 1px solid var(--beams-border, #d8dee8);
        border-radius: 6px;
        background: #fff;
        color: var(--beams-text, #172033);
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      .beams-confirm-body {
        padding: 14px;
      }
      .beams-confirm-summary {
        margin: 0 0 12px;
        color: var(--beams-muted, #637083);
      }
      .beams-confirm-body dl {
        margin: 0;
        display: grid;
        gap: 8px;
      }
      .beams-confirm-body dl div {
        display: grid;
        grid-template-columns: 62px minmax(0, 1fr);
        gap: 10px;
      }
      .beams-confirm-body dt {
        color: var(--beams-muted, #637083);
      }
      .beams-confirm-body dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .beams-confirm-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 14px;
        border-top: 1px solid var(--beams-border, #d8dee8);
        background: #fff;
      }
      .beams-confirm-actions button {
        min-width: 86px;
        height: 32px;
        border: 1px solid var(--beams-border, #d8dee8);
        border-radius: 6px;
        background: #fff;
        color: var(--beams-text, #172033);
        cursor: pointer;
      }
      .beams-confirm-actions .is-primary {
        border-color: var(--beams-accent, #0f766e);
        background: var(--beams-accent, #0f766e);
        color: #fff;
      }
      .beams-confirm-actions .is-danger {
        border-color: var(--beams-danger, #b42318);
        background: var(--beams-danger, #b42318);
        color: #fff;
      }
      .beams-result-dialog.is-error .beams-confirm-head {
        background: #fff5f5;
      }
      .beams-result-dialog.is-error .beams-confirm-head strong {
        color: var(--beams-danger, #b42318);
      }
      .beams-result-message {
        margin: 0;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .beams-apply-list {
        margin: 12px 0 0;
        padding-left: 18px;
      }
      .beams-apply-list li + li {
        margin-top: 4px;
      }
      .beams-apply-list span {
        margin-left: 6px;
        color: var(--beams-muted, #637083);
      }
      #better-eams-panel.is-collapsed {
        left: 50%;
        width: calc(100vw - 8px);
        max-width: none;
        height: auto;
        margin-left: calc(-50vw + 4px);
        overflow: hidden;
      }
      #better-eams-panel.is-collapsed .beams-body {
        display: none;
      }
      #better-eams-panel.is-collapsed .beams-head {
        padding: 10px;
        border-radius: 8px;
      }
      #better-eams-panel mark {
        background: #fde68a;
        color: inherit;
        padding: 0 1px;
      }
      #better-eams-portal,
      #better-eams-recovery {
        --beams-bg: #ffffff;
        --beams-text: #172033;
        --beams-muted: #637083;
        --beams-border: #d8dee8;
        --beams-accent: #0f766e;
        --beams-danger: #b42318;
        box-sizing: border-box;
        position: relative;
        z-index: 2147482000;
        width: min(1080px, calc(100vw - 24px));
        margin: 10px auto;
        border: 1px solid var(--beams-border);
        border-radius: 8px;
        background: var(--beams-bg);
        color: var(--beams-text);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
        font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      #better-eams-portal *,
      #better-eams-recovery * {
        box-sizing: border-box;
      }
      #better-eams-portal {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
      }
      .beams-portal-main,
      .beams-recovery-head {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .beams-portal-main strong,
      .beams-recovery-head strong {
        font-size: 15px;
      }
      .beams-portal-main strong span,
      .beams-recovery-head span,
      .beams-portal-main [data-role="portal-status"] {
        color: var(--beams-muted);
        font-size: 12px;
      }
      .beams-portal-actions,
      .beams-recovery-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #better-eams-portal button,
      #better-eams-recovery button {
        height: 30px;
        border: 1px solid var(--beams-border);
        border-radius: 6px;
        padding: 0 10px;
        background: #fff;
        color: var(--beams-text);
        cursor: pointer;
        font: inherit;
      }
      #better-eams-portal button:hover,
      #better-eams-recovery button:hover {
        border-color: var(--beams-accent);
        color: var(--beams-accent);
      }
      #better-eams-portal button:disabled,
      #better-eams-recovery button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      #better-eams-portal [data-portal-action="refreshEnter"],
      #better-eams-recovery [data-recovery-action="freshEnter"] {
        border-color: var(--beams-accent);
        background: var(--beams-accent);
        color: #fff;
      }
      #better-eams-recovery {
        padding: 14px;
        border-color: #f7c948;
        background: #fffbeb;
      }
      #better-eams-recovery p {
        margin: 10px 0 12px;
        color: #7c2d12;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .better-eams-active table {
        max-width: none !important;
      }
      .better-eams-legacy-hidden {
        display: none !important;
      }
      .better-eams-page-hidden {
        display: none !important;
      }
      .better-eams-legacy-hidden.better-eams-locate-reveal {
        display: block !important;
        margin: 10px 0 !important;
        outline: 2px solid rgba(15, 118, 110, 0.28);
        outline-offset: 2px;
      }
      .better-eams-active th {
        position: sticky;
        top: 0;
        z-index: 3;
      }
      .better-eams-active td,
      .better-eams-active th {
        white-space: normal !important;
        overflow-wrap: anywhere;
      }
      tr.better-eams-match {
        outline: 2px solid rgba(15, 118, 110, 0.35);
        outline-offset: -2px;
      }
      tr.better-eams-dim {
        opacity: 0.38;
      }
      tr.better-eams-flash {
        animation: better-eams-flash 1.8s ease;
      }
      @keyframes better-eams-flash {
        0%, 100% { background: transparent; }
        20%, 80% { background: #fef3c7; }
      }
      @media (max-width: 1120px) {
        #better-eams-panel {
          height: auto;
          min-height: 0;
          overflow: visible;
        }
        html.better-eams-full-app body {
          overflow: auto;
        }
        html.better-eams-full-app #better-eams-panel {
          min-height: 100vh;
          height: auto;
        }
        .beams-body {
          display: flex;
          flex-direction: column;
          overflow: visible;
        }
        .beams-left-pane,
        .beams-right-pane,
        .beams-timetable,
        .beams-list {
          overflow: visible;
        }
        .beams-list {
          flex: none;
        }
      }
      @media (max-width: 640px) {
        #better-eams-panel {
          left: 0;
          width: calc(100vw - 16px);
          height: auto;
          margin: 8px auto;
          overflow: visible;
        }
        #better-eams-panel.is-collapsed {
          left: 0;
          width: calc(100vw - 16px);
          margin: 8px auto;
        }
        .beams-controls {
          grid-template-columns: 1fr;
        }
        .beams-list {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function tokenize(query) {
    return normalizeSearchText(query).split(/\s+/).filter(Boolean);
  }

  function buildSearchIndex(value) {
    const source = cleanText(value);
    if (!source) return { plain: "", compact: "", pinyinCompact: "", initials: "" };
    const cached = searchIndexCache.get(source);
    if (cached) return cached;

    const plain = normalizeSearchText(source);
    const compact = plain.replace(/\s+/g, "");
    const pinyinCompact = normalizeSearchText(convertSearchPinyin(source)).replace(/\s+/g, "");
    const initials = normalizeSearchText(convertSearchPinyinInitials(source)).replace(/\s+/g, "");
    const index = { plain, compact, pinyinCompact, initials };
    searchIndexCache.set(source, index);
    return index;
  }

  function isPinyinSupported(force = false) {
    if (!force && pinyinSupported !== null) return pinyinSupported;
    if (typeof Intl === "object" && Intl?.Collator) {
      pinyinCollator = new Intl.Collator(["zh-Hans-CN", "zh-CN"]);
      pinyinSupported = Intl.Collator.supportedLocalesOf(["zh-CN"]).length === 1;
    } else {
      pinyinSupported = false;
    }
    return pinyinSupported;
  }

  function pinyinTokenForChar(char) {
    if (!char) return { source: "", target: "", type: "unknown" };
    if (pinyinTokenCache.has(char)) return pinyinTokenCache.get(char);

    const token = { source: char, target: char, type: "unknown" };
    if (!isPinyinSupported()) {
      pinyinTokenCache.set(char, token);
      return token;
    }
    if (Object.prototype.hasOwnProperty.call(PINYIN_EXCEPTIONS, char)) {
      token.type = "pinyin";
      token.target = PINYIN_EXCEPTIONS[char];
      pinyinTokenCache.set(char, token);
      return token;
    }
    if (char.charCodeAt(0) < 256) {
      token.type = "latin";
      pinyinTokenCache.set(char, token);
      return token;
    }

    let offset = -1;
    let cmp = pinyinCollator.compare(char, PINYIN_UNIHANS[0]);
    if (cmp < 0) {
      pinyinTokenCache.set(char, token);
      return token;
    }
    if (cmp === 0) {
      offset = 0;
    } else {
      cmp = pinyinCollator.compare(char, PINYIN_UNIHANS[PINYIN_UNIHANS.length - 1]);
      if (cmp > 0) {
        pinyinTokenCache.set(char, token);
        return token;
      }
      if (cmp === 0) {
        offset = PINYIN_UNIHANS.length - 1;
      }
    }

    token.type = "pinyin";
    if (offset < 0) {
      let begin = 0;
      let end = PINYIN_UNIHANS.length - 1;
      while (begin <= end) {
        offset = Math.trunc((begin + end) / 2);
        cmp = pinyinCollator.compare(char, PINYIN_UNIHANS[offset]);
        if (cmp === 0) break;
        if (cmp > 0) begin = offset + 1;
        else end = offset - 1;
      }
    }
    if (cmp < 0) offset -= 1;

    token.target = PINYIN_PINYINS[offset] || char;
    if (!PINYIN_PINYINS[offset]) token.type = "unknown";
    pinyinTokenCache.set(char, token);
    return token;
  }

  function convertSearchPinyin(value) {
    return asText(value).split("").map((char) => {
      const token = pinyinTokenForChar(char);
      return token.type === "pinyin" ? token.target.toLowerCase() : token.target;
    }).join("");
  }

  function convertSearchPinyinInitials(value) {
    return asText(value).split("").map((char) => {
      const token = pinyinTokenForChar(char);
      if (token.type === "pinyin") return token.target[0]?.toLowerCase() || "";
      if (token.type === "latin") return token.target.toLowerCase();
      return token.target;
    }).join("");
  }

  function normalizeSearchText(value) {
    return asText(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function cleanText(value) {
    return asText(value).replace(/\s+/g, " ").trim();
  }

  function asText(value) {
    return value == null ? "" : String(value).trim();
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function uniqueValues(values, sorter) {
    const unique = [...new Set(values.map(asText).filter(Boolean))];
    return unique.sort(sorter || ((a, b) => a.localeCompare(b, "zh-Hans-CN")));
  }

  function numericCompare(a, b) {
    return Number(a) - Number(b);
  }

  function readJson(key, fallback) {
    try {
      const storage = getLocalStorage();
      if (!storage) return fallback;
      const value = storage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      const storage = getLocalStorage();
      if (storage) storage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function getLocalStorage() {
    try {
      return getPageWindow().localStorage || window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(value) {
    return asText(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[ch]));
  }

  function cssEscape(value) {
    const text = asText(value);
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(text);
    }
    return text.replace(/["\\\]\[]/g, "\\$&");
  }

  function escapeRegExp(value) {
    return asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})();
