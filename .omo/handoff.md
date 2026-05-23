# Handoff — 다른 머신에서 이어서 작업하기

## 현재 진행 상황

- **Plan**: `acp-swarm-agent` (`.omo/plans/acp-swarm-agent.md`)
- **진행률**: 3/15 완료, Wave 2 시작 전
- **Branch**: `swarm-agent` (origin에 push 완료)

### 완료된 작업
- ✅ Task 1: 프로젝트 스캐폴딩 (package.json, vitest, 디렉토리)
- ✅ Task 2: Base provider adapter 인터페이스 (TDD, 6 tests 통과)
- ✅ Task 3: AGENT.md 정의 (OpenCode subagent)

### 다음 작업 (Wave 2 — 모두 병렬 실행 가능)
- ⬜ Task 4: Claude Code provider adapter (TDD)
- ⬜ Task 5: Codex CLI provider adapter (TDD)
- ⬜ Task 6: Gemini CLI provider adapter (TDD)
- ⬜ Task 7: Result comparison module (TDD)

## 다른 머신에서 이어받는 방법

```bash
# 1. 레포 클론
git clone https://github.com/Klassikcat/opencode-hooks
cd opencode-hooks

# 2. swarm-agent 브랜치 체크아웃
git checkout swarm-agent

# 3. 의존성 설치
cd agents-opencode/swarm
npm install

# 4. 현재 상태 확인
npx vitest run    # 6 tests should pass

# 5. 작업 시작 — 각 Task를 독립적으로 실행
# Task 4: src/providers/claude.js + __tests__/providers/claude.test.js
# Task 5: src/providers/codex.js + __tests__/providers/codex.test.js
# Task 6: src/providers/gemini.js + __tests__/providers/gemini.test.js
# Task 7: src/compare.js + __tests__/compare.test.js

# 각각 TDD: 테스트 먼저 작성 → RED 실패 확인 → 구현 → GREEN 통과
```

## 기존 코드 구조

```
agents-opencode/swarm/
├── AGENT.md                        # @swarm agent 정의 (YAML frontmatter)
├── package.json                    # ESM, vitest devDep, @opencode-ai/plugin peerDep
├── vitest.config.js                # ESM 설정
├── .gitignore                      # node_modules/
├── src/
│   ├── cli.js                      # 스텁 (main() returns "opencode-swarm-agent")
│   └── providers/
│       └── base.js                 # ProviderAdapter 기본 클래스
├── __tests__/
│   └── providers/
│       ├── scaffold.test.js        # 스캐폴딩 확인 (1 test)
│       └── base.test.js            # ProviderAdapter 계약 테스트 (5 tests)
├── fixtures/
│   └── sample-plan.md              # QA용 샘플 플랜 파일
└── scripts/
    └── smoke-test.mjs              # 스모크 테스트
```

## ProviderAdapter 기본 인터페이스 (Task 2 결과)

```js
// src/providers/base.js
export const STATUS_SUCCESS = "success";
export const STATUS_FAILED = "failed";
export const STATUS_TIMEOUT = "timeout";
export const DEFAULT_TIMEOUT_MS = 30000;
export const ENV_PREFIX = "SWARM_";

export class ProviderAdapter {
  constructor(options = {}) { /* command, args, timeoutMs, env */ }
  get name() { throw new Error("must override"); }   // → "claude" | "codex" | "gemini"
  async execute(prompt, reviewTarget) { throw ... }   // → { status, output, error?, durationMs }
}
```

## Plan 문서

Plan은 `.omo/plans/acp-swarm-agent.md`에 있습니다. 상세한 작업 사양, acceptance criteria, QA 시나리오가 포함되어 있습니다.
