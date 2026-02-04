<p align="center">
  <img src="https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/logo.svg" alt="AgentKits Logo" width="80" height="80">
</p>

<h1 align="center">AgentKits Memory</h1>

<p align="center">
  <em>من <strong>AityTech</strong></em>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@aitytech/agentkits-memory"><img src="https://img.shields.io/npm/v/@aitytech/agentkits-memory.svg" alt="npm"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  <img src="https://img.shields.io/badge/Claude_Code-Compatible-blueviolet" alt="Claude Code">
  <img src="https://img.shields.io/badge/Cursor-Compatible-blue" alt="Cursor">
  <img src="https://img.shields.io/badge/Windsurf-Compatible-cyan" alt="Windsurf">
  <img src="https://img.shields.io/badge/Cline-Compatible-orange" alt="Cline">
  <img src="https://img.shields.io/badge/OpenCode-Compatible-green" alt="OpenCode">
</p>

<p align="center">
  <strong>نظام ذاكرة دائمة لمساعدي البرمجة بالذكاء الاصطناعي</strong>
</p>

<p align="center">
  مساعدك بالذكاء الاصطناعي ينسى كل شيء بين الجلسات. AgentKits Memory يحل هذه المشكلة.<br>
  القرارات والأنماط والأخطاء والسياق — كلها محفوظة محليًا عبر MCP.
</p>

<p align="center">
  <a href="https://www.agentkits.net/memory">الموقع</a> •
  <a href="https://www.agentkits.net/memory/docs">التوثيق</a> •
  <a href="#البدء-السريع">البدء السريع</a> •
  <a href="#كيف-يعمل">كيف يعمل</a> •
  <a href="#دعم-منصات-متعددة">المنصات</a> •
  <a href="#أوامر-cli">CLI</a> •
  <a href="#عارض-الويب">عارض الويب</a>
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh.md">简体中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <a href="./README.es.md">Español</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.fr.md">Français</a> · <a href="./README.pt-br.md">Português</a> · <a href="./README.vi.md">Tiếng Việt</a> · <a href="./README.ru.md">Русский</a> · <strong>العربية</strong>
</p>

---

## المميزات

| الميزة | الفائدة |
|---------|---------|
| **محلي 100%** | جميع البيانات تبقى على جهازك. لا سحابة، لا مفاتيح API، لا حسابات |
| **سريع للغاية** | SQLite الأصلي (better-sqlite3) = استعلامات فورية، صفر تأخير |
| **بدون إعداد** | يعمل مباشرة. لا حاجة لإعداد قاعدة بيانات |
| **متعدد المنصات** | Claude Code، Cursor، Windsurf، Cline، OpenCode — أمر إعداد واحد |
| **خادم MCP** | 9 أدوات: save، search، timeline، details، recall، list، update، delete، status |
| **التقاط تلقائي** | الخطافات تلتقط سياق الجلسة واستخدام الأدوات والملخصات تلقائيًا |
| **إثراء بالذكاء الاصطناعي** | عمال الخلفية يثرون الملاحظات بملخصات مولدة بالذكاء الاصطناعي |
| **بحث متجهي** | تشابه دلالي HNSW مع تضمينات متعددة اللغات (أكثر من 100 لغة) |
| **عارض ويب** | واجهة متصفح لعرض وبحث وإضافة وتحرير وحذف الذكريات |
| **بحث ثلاثي الطبقات** | الكشف التدريجي يوفر ~87% من الرموز مقارنة بجلب كل شيء |
| **إدارة دورة الحياة** | ضغط تلقائي وأرشفة وتنظيف الجلسات القديمة |
| **تصدير/استيراد** | نسخ احتياطي واستعادة الذكريات كـ JSON |

---

## كيف يعمل

```
الجلسة 1: "استخدم JWT للمصادقة"          الجلسة 2: "أضف نقطة نهاية تسجيل الدخول"
┌──────────────────────────┐          ┌──────────────────────────┐
│  تقوم بالبرمجة مع AI...  │          │  AI يعرف بالفعل:         │
│  AI يتخذ القرارات       │          │  ✓ قرار مصادقة JWT      │
│  AI يواجه أخطاء         │   ───►   │  ✓ حلول الأخطاء         │
│  AI يتعلم الأنماط       │  محفوظ   │  ✓ أنماط الكود           │
│                          │          │  ✓ سياق الجلسة          │
└──────────────────────────┘          └──────────────────────────┘
         │                                      ▲
         ▼                                      │
    .claude/memory/memory.db  ──────────────────┘
    (SQLite، محلي 100%)
```

1. **إعداد لمرة واحدة** — `npx agentkits-memory-setup` يقوم بإعداد منصتك
2. **التقاط تلقائي** — الخطافات تسجل القرارات واستخدام الأدوات والملخصات أثناء العمل
3. **حقن السياق** — الجلسة التالية تبدأ بالتاريخ ذي الصلة من الجلسات السابقة
4. **معالجة الخلفية** — العمال يثرون الملاحظات بالذكاء الاصطناعي، ويولدون التضمينات، ويضغطون البيانات القديمة
5. **بحث في أي وقت** — AI يستخدم أدوات MCP (`memory_search` → `memory_details`) للعثور على السياق السابق

جميع البيانات تبقى في `.claude/memory/memory.db` على جهازك. لا سحابة. لا حاجة لمفاتيح API.

---

## قرارات التصميم المهمة

معظم أدوات الذاكرة تنثر البيانات عبر ملفات markdown، تتطلب بيئات تشغيل Python، أو ترسل كودك إلى واجهات برمجة تطبيقات خارجية. AgentKits Memory يتخذ خيارات مختلفة جذريًا:

| خيار التصميم | لماذا مهم |
|---------------|----------------|
| **قاعدة بيانات SQLite واحدة** | ملف واحد (`memory.db`) يحتوي على كل شيء — الذكريات والجلسات والملاحظات والتضمينات. لا ملفات منتشرة للمزامنة، لا تعارضات دمج، لا بيانات يتيمة. النسخ الاحتياطي = نسخ ملف واحد |
| **Node.js أصلي، صفر Python** | يعمل حيثما يعمل Node. لا conda، لا pip، لا virtualenv. نفس اللغة مثل خادم MCP الخاص بك — أمر `npx` واحد، انتهى |
| **بحث ثلاثي الطبقات موفر للرموز** | فهرس البحث أولاً (~50 رمزًا/نتيجة)، ثم سياق الجدول الزمني، ثم التفاصيل الكاملة. اجلب فقط ما تحتاجه. الأدوات الأخرى تفرغ ملفات الذاكرة بأكملها في السياق، محرقة الرموز على محتوى غير ذي صلة |
| **التقاط تلقائي عبر الخطافات** | القرارات والأنماط والأخطاء تُسجل أثناء حدوثها — ليس بعد أن تتذكر حفظها. حقن سياق الجلسة يحدث تلقائيًا عند بداية الجلسة التالية |
| **تضمينات محلية، بدون استدعاءات API** | البحث المتجهي يستخدم نموذج ONNX محلي (multilingual-e5-small). البحث الدلالي يعمل دون اتصال، لا يكلف شيئًا، ويدعم أكثر من 100 لغة |
| **عمال الخلفية** | إثراء الذكاء الاصطناعي وتوليد التضمينات والضغط يعملون بشكل غير متزامن. تدفق البرمجة الخاص بك لا يُحجب أبدًا |
| **متعدد المنصات منذ اليوم الأول** | علامة `--platform=all` واحدة تكون Claude Code و Cursor و Windsurf و Cline و OpenCode في وقت واحد. نفس قاعدة بيانات الذاكرة، محررات مختلفة |
| **بيانات ملاحظات منظمة** | استخدام الأداة يُلتقط مع تصنيف النوع (قراءة/كتابة/تنفيذ/بحث)، تتبع الملفات، كشف النية، وسرديات مولدة بالذكاء الاصطناعي — ليس تفريغات نصية خام |
| **بدون تسريب عمليات** | عمال الخلفية ينهون أنفسهم تلقائيًا بعد 5 دقائق، يستخدمون ملفات قفل قائمة على PID مع تنظيف قفل قديم، ويتعاملون مع SIGTERM/SIGINT بشكل سلس. لا عمليات زومبي، لا عمال يتامى |
| **بدون تسريب ذاكرة** | الخطافات تعمل كعمليات قصيرة العمر (ليست خدمات طويلة الأمد). اتصالات قاعدة البيانات تغلق عند الإيقاف. عملية فرعية للتضمين لها إعادة إنتاج محدودة (بحد أقصى 2)، مهلات طلب معلقة، وتنظيف سلس لجميع المؤقتات والطوابير |

---

## عارض الويب

اعرض وأدر ذكرياتك من خلال واجهة ويب حديثة.

```bash
npx agentkits-memory-web
```

ثم افتح **http://localhost:1905** في متصفحك.

### قائمة الجلسات

تصفح جميع الجلسات مع عرض الجدول الزمني وتفاصيل النشاط.

![Session List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-session-list_v2.png)

### قائمة الذاكرة

تصفح جميع الذكريات المخزنة مع البحث وتصفية مساحة الاسم.

![Memory List](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-list_v2.png)

### إضافة ذاكرة

أنشئ ذكريات جديدة بمفتاح ومساحة اسم ونوع ومحتوى ووسوم.

![Add Memory](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-add-memory_v2.png)

### تفاصيل الذاكرة

اعرض تفاصيل الذاكرة الكاملة مع خيارات التحرير والحذف.

![Memory Detail](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-memory-detail_v2.png)

### إدارة التضمينات

ولّد وأدر تضمينات المتجهات للبحث الدلالي.

![Manage Embeddings](https://raw.githubusercontent.com/aitytech/agentkits-memory/main/assets/agentkits-memory-embedding_v2.png)

---

## البدء السريع

### الخيار 1: سوق إضافات Claude Code (موصى به لـ Claude Code)

تثبيت بأمر واحد — لا حاجة لإعداد يدوي:

```bash
/plugin marketplace add aitytech/agentkits-memory
/plugin install agentkits-memory@aitytech
```

هذا يُثبّت الخطافات وخادم MCP ومهارة سير عمل الذاكرة تلقائيًا. أعد تشغيل Claude Code بعد التثبيت.

### الخيار 2: إعداد تلقائي (جميع المنصات)

```bash
npx agentkits-memory-setup
```

هذا يكتشف منصتك تلقائيًا ويكوّن كل شيء: خادم MCP، الخطافات (Claude Code/OpenCode)، ملفات القواعد (Cursor/Windsurf/Cline)، ويُنزل نموذج التضمين.

**استهدف منصة معينة:**

```bash
npx agentkits-memory-setup --platform=cursor
npx agentkits-memory-setup --platform=windsurf,cline
npx agentkits-memory-setup --platform=all
```

### الخيار 3: إعداد MCP يدوي

إذا كنت تفضل الإعداد اليدوي، أضف إلى إعداد MCP الخاص بك:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "agentkits-memory-server"]
    }
  }
}
```

مواقع ملف الإعداد:
- **Claude Code**: `.claude/settings.json` (مضمن في مفتاح `mcpServers`)
- **Cursor**: `.cursor/mcp.json`
- **Windsurf**: `.windsurf/mcp.json`
- **Cline / OpenCode**: `.mcp.json` (جذر المشروع)

### 3. أدوات MCP

بمجرد الإعداد، يمكن لمساعد الذكاء الاصطناعي الخاص بك استخدام هذه الأدوات:

| الأداة | الوصف |
|------|-------------|
| `memory_status` | التحقق من حالة نظام الذاكرة (اتصل أولاً!) |
| `memory_save` | حفظ القرارات والأنماط والأخطاء أو السياق |
| `memory_search` | **[الخطوة 1]** فهرس البحث — معرفات وعناوين خفيفة الوزن (~50 رمزًا/نتيجة) |
| `memory_timeline` | **[الخطوة 2]** احصل على السياق الزمني حول ذاكرة |
| `memory_details` | **[الخطوة 3]** احصل على المحتوى الكامل لمعرفات محددة |
| `memory_recall` | نظرة عامة سريعة على الموضوع — ملخص مجمع |
| `memory_list` | سرد الذكريات الحديثة |
| `memory_update` | تحديث محتوى أو وسوم ذاكرة موجودة |
| `memory_delete` | إزالة الذكريات القديمة |

---

## الكشف التدريجي (بحث موفر للرموز)

AgentKits Memory يستخدم **نمط بحث ثلاثي الطبقات** يوفر ~70% من الرموز مقارنة بجلب المحتوى الكامل مقدمًا.

### كيف يعمل

```
┌─────────────────────────────────────────────────────────────┐
│  الخطوة 1: memory_search                                    │
│  يعيد: المعرفات والعناوين والوسوم والدرجات (~50 رمزًا/عنصر) │
│  → مراجعة الفهرس، اختر الذكريات ذات الصلة                   │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  الخطوة 2: memory_timeline (اختياري)                       │
│  يعيد: السياق ±30 دقيقة حول الذاكرة                        │
│  → فهم ما حدث قبل/بعد                                      │
└─────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────┐
│  الخطوة 3: memory_details                                  │
│  يعيد: المحتوى الكامل للمعرفات المحددة فقط                  │
│  → اجلب فقط ما تحتاجه فعلاً                                │
└─────────────────────────────────────────────────────────────┘
```

### مثال سير العمل

```typescript
// الخطوة 1: البحث - احصل على فهرس خفيف الوزن
memory_search({ query: "authentication" })
// → يعيد: [{ id: "abc", title: "JWT pattern...", score: 85% }]

// الخطوة 2: (اختياري) شاهد السياق الزمني
memory_timeline({ anchor: "abc" })
// → يعيد: ما حدث قبل/بعد هذه الذاكرة

// الخطوة 3: احصل على المحتوى الكامل فقط لما تحتاجه
memory_details({ ids: ["abc"] })
// → يعيد: المحتوى الكامل للذاكرة المحددة
```

### توفير الرموز

| المنهج | الرموز المستخدمة |
|----------|-------------|
| **القديم:** جلب كل المحتوى | ~500 رمز × 10 نتائج = 5000 رمز |
| **الجديد:** الكشف التدريجي | 50 × 10 + 500 × 2 = 1500 رمز |
| **التوفير** | **تقليل 70%** |

---

## أوامر CLI

```bash
# إعداد بأمر واحد (يكتشف المنصة تلقائيًا)
npx agentkits-memory-setup
npx agentkits-memory-setup --platform=cursor      # منصة محددة
npx agentkits-memory-setup --platform=all          # جميع المنصات
npx agentkits-memory-setup --force                 # إعادة التثبيت/التحديث

# بدء خادم MCP
npx agentkits-memory-server

# عارض الويب (منفذ 1905)
npx agentkits-memory-web

# عارض الطرفية
npx agentkits-memory-viewer
npx agentkits-memory-viewer --stats                # إحصائيات قاعدة البيانات
npx agentkits-memory-viewer --json                 # إخراج JSON

# حفظ من CLI
npx agentkits-memory-save "Use JWT with refresh tokens" --category pattern --tags auth,security

# الإعدادات
npx agentkits-memory-hook settings .               # عرض الإعدادات الحالية
npx agentkits-memory-hook settings . --reset       # إعادة التعيين إلى الافتراضيات
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...

# تصدير / استيراد
npx agentkits-memory-hook export . my-project ./backup.json
npx agentkits-memory-hook import . ./backup.json

# إدارة دورة الحياة
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30
npx agentkits-memory-hook lifecycle-stats .
```

---

## الاستخدام البرمجي

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService({
  baseDir: '.claude/memory',
  dbFilename: 'memory.db',
});
await memory.initialize();

// تخزين ذاكرة
await memory.storeEntry({
  key: 'auth-pattern',
  content: 'Use JWT with refresh tokens for authentication',
  namespace: 'patterns',
  tags: ['auth', 'security'],
});

// الاستعلام عن الذكريات
const results = await memory.query({
  type: 'hybrid',
  namespace: 'patterns',
  content: 'authentication',
  limit: 10,
});

// الحصول بالمفتاح
const entry = await memory.getByKey('patterns', 'auth-pattern');
```

---

## خطافات الالتقاط التلقائي

الخطافات تلتقط جلسات البرمجة بالذكاء الاصطناعي تلقائيًا (Claude Code و OpenCode فقط):

| الخطاف | المحفز | الإجراء |
|------|---------|--------|
| `context` | بداية الجلسة | يحقن سياق الجلسة السابقة + حالة الذاكرة |
| `session-init` | مطالبة المستخدم | يبدأ/يستأنف الجلسة، يسجل المطالبات |
| `observation` | بعد استخدام الأداة | يلتقط استخدام الأداة مع كشف النية |
| `summarize` | نهاية الجلسة | يولد ملخص جلسة منظم |
| `user-message` | بداية الجلسة | يعرض حالة الذاكرة للمستخدم (stderr) |

إعداد الخطافات:
```bash
npx agentkits-memory-setup
```

**ما يُلتقط تلقائيًا:**
- قراءات/كتابات الملفات مع المسارات
- تغييرات الكود كاختلافات منظمة (قبل → بعد)
- نية المطور (إصلاح خطأ، ميزة، إعادة هيكلة، تحقيق، إلخ)
- ملخصات الجلسات مع القرارات والأخطاء والخطوات التالية
- تتبع متعدد المطالبات داخل الجلسات

---

## دعم منصات متعددة

| المنصة | MCP | الخطافات | ملف القواعد | الإعداد |
|----------|-----|-------|------------|-------|
| **Claude Code** | `.claude/settings.json` | ✅ كامل | CLAUDE.md (مهارة) | `--platform=claude-code` |
| **Cursor** | `.cursor/mcp.json` | — | `.cursorrules` | `--platform=cursor` |
| **Windsurf** | `.windsurf/mcp.json` | — | `.windsurfrules` | `--platform=windsurf` |
| **Cline** | `.mcp.json` | — | `.clinerules` | `--platform=cline` |
| **OpenCode** | `.mcp.json` | ✅ كامل | — | `--platform=opencode` |

- **خادم MCP** يعمل مع جميع المنصات (أدوات الذاكرة عبر بروتوكول MCP)
- **الخطافات** توفر التقاط تلقائي على Claude Code و OpenCode
- **ملفات القواعد** تعلم Cursor/Windsurf/Cline سير عمل الذاكرة
- **بيانات الذاكرة** تُخزن دائمًا في `.claude/memory/` (مصدر واحد للحقيقة)

---

## عمال الخلفية

بعد كل جلسة، يعالج عمال الخلفية المهام في قائمة الانتظار:

| العامل | المهمة | الوصف |
|--------|------|-------------|
| `embed-session` | التضمينات | توليد تضمينات المتجهات للبحث الدلالي |
| `enrich-session` | إثراء الذكاء الاصطناعي | إثراء الملاحظات بملخصات وحقائق ومفاهيم مولدة بالذكاء الاصطناعي |
| `compress-session` | الضغط | ضغط الملاحظات القديمة (10:1–25:1) وتوليد ملخصات الجلسات (20:1–100:1) |

العمال يعملون تلقائيًا بعد انتهاء الجلسة. كل عامل:
- يعالج حتى 200 عنصر لكل تشغيل
- يستخدم ملفات القفل لمنع التنفيذ المتزامن
- ينهي نفسه تلقائيًا بعد 5 دقائق (يمنع الزومبي)
- يعيد المحاولة للمهام الفاشلة حتى 3 مرات

---

## إعداد موفر الذكاء الاصطناعي

إثراء الذكاء الاصطناعي يستخدم موفرين قابلين للتوصيل. الافتراضي هو `claude-cli` (لا حاجة لمفتاح API).

| الموفر | النوع | النموذج الافتراضي | ملاحظات |
|----------|------|---------------|-------|
| **Claude CLI** | `claude-cli` | `haiku` | يستخدم `claude --print`، لا حاجة لمفتاح API |
| **OpenAI** | `openai` | `gpt-4o-mini` | أي نموذج OpenAI |
| **Google Gemini** | `gemini` | `gemini-2.0-flash` | مفتاح Google AI Studio |
| **OpenRouter** | `openai` | أي | عيّن `baseUrl` إلى `https://openrouter.ai/api/v1` |
| **GLM (Zhipu)** | `openai` | أي | عيّن `baseUrl` إلى `https://open.bigmodel.cn/api/paas/v4` |
| **Ollama** | `openai` | أي | عيّن `baseUrl` إلى `http://localhost:11434/v1` |

### الخيار 1: متغيرات البيئة

```bash
# OpenAI
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-...

# Google Gemini
export AGENTKITS_AI_PROVIDER=gemini
export AGENTKITS_AI_API_KEY=AIza...

# OpenRouter (يستخدم تنسيق متوافق مع OpenAI)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_API_KEY=sk-or-...
export AGENTKITS_AI_BASE_URL=https://openrouter.ai/api/v1
export AGENTKITS_AI_MODEL=anthropic/claude-3.5-haiku

# Ollama المحلي (لا حاجة لمفتاح API)
export AGENTKITS_AI_PROVIDER=openai
export AGENTKITS_AI_BASE_URL=http://localhost:11434/v1
export AGENTKITS_AI_MODEL=llama3.2

# تعطيل إثراء الذكاء الاصطناعي تمامًا
export AGENTKITS_AI_ENRICHMENT=false
```

### الخيار 2: إعدادات دائمة

```bash
# محفوظ في .claude/memory/settings.json — يستمر عبر الجلسات
npx agentkits-memory-hook settings . aiProvider.provider=openai aiProvider.apiKey=sk-...
npx agentkits-memory-hook settings . aiProvider.provider=gemini aiProvider.apiKey=AIza...
npx agentkits-memory-hook settings . aiProvider.baseUrl=https://openrouter.ai/api/v1

# عرض الإعدادات الحالية
npx agentkits-memory-hook settings .

# إعادة التعيين إلى الافتراضيات
npx agentkits-memory-hook settings . --reset
```

> **الأولوية:** متغيرات البيئة تتجاوز settings.json. settings.json يتجاوز الافتراضيات.

---

## إدارة دورة الحياة

إدارة نمو الذاكرة مع مرور الوقت:

```bash
# ضغط الملاحظات الأقدم من 7 أيام، أرشفة الجلسات الأقدم من 30 يومًا
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30

# أيضًا حذف تلقائي للجلسات المؤرشفة الأقدم من 90 يومًا
npx agentkits-memory-hook lifecycle . --compress-days=7 --archive-days=30 --delete --delete-days=90

# عرض إحصائيات دورة الحياة
npx agentkits-memory-hook lifecycle-stats .
```

| المرحلة | ما يحدث |
|-------|-------------|
| **الضغط** | ضغط الملاحظات بالذكاء الاصطناعي، توليد ملخصات الجلسات |
| **الأرشفة** | وضع علامة على الجلسات القديمة كمؤرشفة (مستبعدة من السياق) |
| **الحذف** | إزالة الجلسات المؤرشفة (اختياري، يتطلب `--delete`) |

---

## تصدير / استيراد

نسخ احتياطي واستعادة ذكريات مشروعك:

```bash
# تصدير جميع الجلسات لمشروع
npx agentkits-memory-hook export . my-project ./backup.json

# استيراد من النسخة الاحتياطية (يزيل التكرار تلقائيًا)
npx agentkits-memory-hook import . ./backup.json
```

تنسيق التصدير يتضمن الجلسات والملاحظات والمطالبات والملخصات.

---

## فئات الذاكرة

| الفئة | حالة الاستخدام |
|----------|----------|
| `decision` | قرارات البنية، اختيارات مكدس التقنية، المقايضات |
| `pattern` | اتفاقيات البرمجة، أنماط المشروع، المناهج المتكررة |
| `error` | إصلاحات الأخطاء، حلول الأخطاء، رؤى تصحيح الأخطاء |
| `context` | خلفية المشروع، اتفاقيات الفريق، إعداد البيئة |
| `observation` | ملاحظات الجلسة الملتقطة تلقائيًا |

---

## التخزين

الذكريات تُخزن في `.claude/memory/` داخل دليل مشروعك.

```
.claude/memory/
├── memory.db          # قاعدة بيانات SQLite (جميع البيانات)
├── memory.db-wal      # سجل الكتابة المسبقة (مؤقت)
├── settings.json      # إعدادات دائمة (موفر AI، إعداد السياق)
└── embeddings-cache/  # تضمينات المتجهات المخزنة مؤقتًا
```

---

## دعم اللغات CJK

AgentKits Memory لديه **دعم CJK تلقائي** للبحث في النصوص الصينية واليابانية والكورية.

### بدون إعداد

عندما يتم تثبيت `better-sqlite3` (افتراضي)، البحث CJK يعمل تلقائيًا:

```typescript
import { ProjectMemoryService } from '@aitytech/agentkits-memory';

const memory = new ProjectMemoryService('.claude/memory');
await memory.initialize();

// تخزين محتوى CJK
await memory.storeEntry({
  key: 'auth-pattern',
  content: '認証機能の実装パターン - JWT with refresh tokens',
  namespace: 'patterns',
});

// البحث باليابانية أو الصينية أو الكورية - يعمل فقط!
const results = await memory.query({
  type: 'hybrid',
  content: '認証機能',
});
```

### كيف يعمل

- **SQLite الأصلي**: يستخدم `better-sqlite3` لأقصى أداء
- **محلل Trigram**: FTS5 مع trigram ينشئ تسلسلات من 3 أحرف لمطابقة CJK
- **رجوع ذكي**: استعلامات CJK القصيرة (< 3 أحرف) تستخدم تلقائيًا بحث LIKE
- **ترتيب BM25**: تسجيل الصلة لنتائج البحث

### متقدم: تجزئة الكلمات اليابانية

لليابانية المتقدمة مع تجزئة كلمات مناسبة، استخدم اختياريًا lindera:

```typescript
import { createJapaneseOptimizedBackend } from '@aitytech/agentkits-memory';

const backend = createJapaneseOptimizedBackend({
  databasePath: '.claude/memory/memory.db',
  linderaPath: './path/to/liblindera_sqlite.dylib',
});
```

يتطلب بناء [lindera-sqlite](https://github.com/lindera/lindera-sqlite).

---

## مرجع API

### ProjectMemoryService

```typescript
interface ProjectMemoryConfig {
  baseDir: string;              // الافتراضي: '.claude/memory'
  dbFilename: string;           // الافتراضي: 'memory.db'
  enableVectorIndex: boolean;   // الافتراضي: false
  dimensions: number;           // الافتراضي: 384
  embeddingGenerator?: EmbeddingGenerator;
  cacheEnabled: boolean;        // الافتراضي: true
  cacheSize: number;            // الافتراضي: 1000
  cacheTtl: number;             // الافتراضي: 300000 (5 دقائق)
}
```

### الطرق

| الطريقة | الوصف |
|--------|-------------|
| `initialize()` | تهيئة خدمة الذاكرة |
| `shutdown()` | إيقاف وحفظ التغييرات |
| `storeEntry(input)` | تخزين إدخال ذاكرة |
| `get(id)` | الحصول على إدخال بالمعرف |
| `getByKey(namespace, key)` | الحصول على إدخال بمساحة الاسم والمفتاح |
| `update(id, update)` | تحديث إدخال |
| `delete(id)` | حذف إدخال |
| `query(query)` | الاستعلام عن الإدخالات بالمرشحات |
| `semanticSearch(content, k)` | بحث تشابه دلالي |
| `count(namespace?)` | عد الإدخالات |
| `listNamespaces()` | سرد جميع مساحات الأسماء |
| `getStats()` | الحصول على الإحصائيات |

---

## المتطلبات

- **Node.js LTS**: 18.x أو 20.x أو 22.x (موصى به)
- مساعد برمجة ذكاء اصطناعي متوافق مع MCP

### ملاحظات إصدار Node.js

هذه الحزمة تستخدم `better-sqlite3` الذي يتطلب ملفات ثنائية أصلية. **الملفات الثنائية المبنية مسبقًا متوفرة لإصدارات LTS فقط**.

| إصدار Node | الحالة | ملاحظات |
|--------------|--------|-------|
| 18.x LTS | ✅ يعمل | ملفات ثنائية مبنية مسبقًا |
| 20.x LTS | ✅ يعمل | ملفات ثنائية مبنية مسبقًا |
| 22.x LTS | ✅ يعمل | ملفات ثنائية مبنية مسبقًا |
| 19.x, 21.x, 23.x | ⚠️ يتطلب أدوات البناء | لا ملفات ثنائية مبنية مسبقًا |

### استخدام إصدارات غير LTS (Windows)

إذا كان عليك استخدام إصدار غير LTS (19، 21، 23)، ثبّت أدوات البناء أولاً:

**الخيار 1: Visual Studio Build Tools**
```powershell
# قم بالتنزيل والتثبيت من:
# https://visualstudio.microsoft.com/visual-cpp-build-tools/
# اختر حمل عمل "تطوير سطح المكتب مع C++"
```

**الخيار 2: windows-build-tools (npm)**
```powershell
npm install --global windows-build-tools
```

**الخيار 3: Chocolatey**
```powershell
choco install visualstudio2022-workload-vctools
```

انظر [دليل node-gyp Windows](https://github.com/nodejs/node-gyp#on-windows) لمزيد من التفاصيل.

---

## نظام AgentKits البيئي

**AgentKits Memory** جزء من نظام AgentKits البيئي من AityTech - أدوات تجعل مساعدي البرمجة بالذكاء الاصطناعي أذكى.

| المنتج | الوصف | الرابط |
|---------|-------------|------|
| **AgentKits Engineer** | 28 وكيلًا متخصصًا، أكثر من 100 مهارة، أنماط مؤسسية | [GitHub](https://github.com/aitytech/agentkits-engineer) |
| **AgentKits Marketing** | توليد محتوى تسويقي مدعوم بالذكاء الاصطناعي | [GitHub](https://github.com/aitytech/agentkits-marketing) |
| **AgentKits Memory** | ذاكرة دائمة لمساعدي الذكاء الاصطناعي (هذه الحزمة) | [npm](https://www.npmjs.com/package/@aitytech/agentkits-memory) |

<p align="center">
  <a href="https://agentkits.net">
    <img src="https://img.shields.io/badge/Visit-agentkits.net-blue?style=for-the-badge" alt="agentkits.net">
  </a>
</p>

---

## تاريخ النجوم

<a href="https://star-history.com/#aitytech/agentkits-memory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=aitytech/agentkits-memory&type=Date" />
 </picture>
</a>

---

## الترخيص

MIT

---

<p align="center">
  <strong>امنح مساعد الذكاء الاصطناعي الخاص بك ذاكرة تستمر.</strong>
</p>

<p align="center">
  <em>AgentKits Memory من AityTech</em>
</p>

<p align="center">
  ضع نجمة على هذا المستودع إذا ساعد ذكاءك الاصطناعي على التذكر.
</p>