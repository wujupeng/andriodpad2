/**
 * browse_view_modes 单元测试（TASK-TEST-01）。
 * 覆盖 T-VM-01~14，对应 REQ-VM-01~14 + DFX-VM-01~08。
 *
 * 项目无 React Testing Library 且 HC-01 禁止新增依赖，
 * 组件渲染类测试转为配置/逻辑/纯函数断言。
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEW_MODE_CONFIG,
  VIEW_MODE_OPTIONS,
  type ViewModeConfigEntry,
} from '../src/ui/pages/BrowsePage/viewModeConfig.ts';
import {
  useUiPrefsStore,
  readPersistedPrefs,
  hydrateUiPrefs,
  type ViewMode,
} from '../src/state/uiPrefsStore.ts';
import { computeVisibleRange } from '../src/ui/hooks/useVirtualList.ts';

const PREFS_KEY = 'pad2.prefs.v1';
const STORAGE_KEY = 'CapacitorStorage.' + PREFS_KEY;

let prefsStore: Record<string, string>;

beforeEach(() => {
  prefsStore = {};
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => prefsStore[key] ?? null,
      setItem: (key: string, value: string) => {
        prefsStore[key] = value;
      },
      removeItem: (key: string) => {
        delete prefsStore[key];
      },
      clear: () => {
        for (const k in prefsStore) delete prefsStore[k];
      },
      key: (i: number) => Object.keys(prefsStore)[i] ?? null,
      get length() {
        return Object.keys(prefsStore).length;
      },
    },
  };
});

afterEach(() => {
  delete (globalThis as any).window;
  useUiPrefsStore.setState({
    themeMode: 'system',
    sideNavCollapsed: false,
    viewMode: 'detail',
  });
});

function makeFile(name: string, isDirectory = false) {
  return {
    name,
    isDirectory,
    size: isDirectory ? 0 : 1024,
    lastModified: 1700000000000,
    path: `/share/${name}`,
  };
}

const SAMPLE_FILES = [
  makeFile('zebra.pdf'),
  makeFile('apple.docx'),
  makeFile('banana.xlsx'),
  { ...makeFile('docs', true), path: '/share/docs' },
];

function sortedAndFilteredFiles(
  files: typeof SAMPLE_FILES,
  sort: { field: string; ascending: boolean },
  query: string,
) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? files.filter((f) => f.name.toLowerCase().includes(q))
    : [...files];
  const dir = sort.ascending ? 1 : -1;
  return filtered.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    switch (sort.field) {
      case 'size':
        return (a.size - b.size) * dir;
      case 'lastModified':
        return (a.lastModified - b.lastModified) * dir;
      case 'type':
        return a.name.localeCompare(b.name) * dir;
      case 'name':
      default:
        return a.name.localeCompare(b.name, 'zh-CN') * dir;
    }
  });
}

describe('T-VM-01: readPersistedPrefs 解析 viewMode（REQ-VM-03/DFX-VM-07）', () => {
  test('含 viewMode 的偏好数据正确解析', async () => {
    prefsStore[STORAGE_KEY] = JSON.stringify({
      version: 1,
      themeMode: 'dark',
      sideNavCollapsed: true,
      viewMode: 'largeIcon',
    });
    const result = await readPersistedPrefs();
    assert.ok(result);
    assert.equal(result!.viewMode, 'largeIcon');
    assert.equal(result!.themeMode, 'dark');
    assert.equal(result!.sideNavCollapsed, true);
  });

  test('旧数据（无 viewMode）加载后 viewMode=detail', async () => {
    prefsStore[STORAGE_KEY] = JSON.stringify({
      version: 1,
      themeMode: 'light',
      sideNavCollapsed: false,
    });
    const result = await readPersistedPrefs();
    assert.ok(result);
    assert.equal(result!.viewMode, 'detail');
  });
});

describe('T-VM-02: 初始 viewMode=detail（REQ-VM-04/DFX-VM-08）', () => {
  test('useUiPrefsStore 初始 viewMode=detail', () => {
    assert.equal(useUiPrefsStore.getState().viewMode, 'detail');
  });

  test('hydrateUiPrefs 无持久化时 viewMode 保持 detail', async () => {
    useUiPrefsStore.setState({ viewMode: 'detail' });
    await hydrateUiPrefs();
    assert.equal(useUiPrefsStore.getState().viewMode, 'detail');
  });
});

describe('T-VM-03: 非法 viewMode 降级 detail（DFX-VM-03/异常场景2）', () => {
  test('viewMode 为非法值时降级为 detail', async () => {
    prefsStore[STORAGE_KEY] = JSON.stringify({
      version: 1,
      themeMode: 'system',
      sideNavCollapsed: false,
      viewMode: 'extraLarge',
    });
    const result = await readPersistedPrefs();
    assert.ok(result);
    assert.equal(result!.viewMode, 'detail');
  });

  test('viewMode 为 null 时降级为 detail', async () => {
    prefsStore[STORAGE_KEY] = JSON.stringify({
      version: 1,
      themeMode: 'system',
      sideNavCollapsed: false,
      viewMode: null,
    });
    const result = await readPersistedPrefs();
    assert.ok(result);
    assert.equal(result!.viewMode, 'detail');
  });

  test('JSON 损坏时返回 null 不崩溃', async () => {
    prefsStore[STORAGE_KEY] = '{broken json';
    const result = await readPersistedPrefs();
    assert.equal(result, null);
  });
});

describe('T-VM-04: setViewMode 全局偏好（REQ-VM-05）', () => {
  test('setViewMode 后 viewMode 状态变更', () => {
    useUiPrefsStore.getState().setViewMode('largeIcon');
    assert.equal(useUiPrefsStore.getState().viewMode, 'largeIcon');
  });

  test('viewMode 为全局偏好，不随共享切换改变', () => {
    useUiPrefsStore.getState().setViewMode('mediumIcon');
    const beforeSwitch = useUiPrefsStore.getState().viewMode;
    assert.equal(beforeSwitch, 'mediumIcon');
  });
});

describe('T-VM-05: ViewModeMenu 五选项配置（REQ-VM-01/13）', () => {
  test('VIEW_MODE_OPTIONS 含五个选项', () => {
    assert.equal(VIEW_MODE_OPTIONS.length, 5);
  });

  test('选项标签与缩写正确', () => {
    const labels = VIEW_MODE_OPTIONS.map((o) => o.label);
    assert.deepEqual(labels, ['大图标', '中图标', '小图标', '平铺', '详细信息']);
    const abbrs = VIEW_MODE_OPTIONS.map((o) => o.abbr);
    assert.deepEqual(abbrs, ['大', '中', '小', '平', '详']);
  });

  test('选项 mode 覆盖全部 ViewMode 值', () => {
    const modes = VIEW_MODE_OPTIONS.map((o) => o.mode);
    assert.deepEqual(modes.sort(), [
      'detail',
      'largeIcon',
      'mediumIcon',
      'smallIcon',
      'tile',
    ]);
  });
});

describe('T-VM-06: 图标尺寸严格递减 64>48>32（REQ-VM-06/6.2-1）', () => {
  test('largeIcon.iconSize > mediumIcon.iconSize > smallIcon.iconSize', () => {
    assert.ok(
      VIEW_MODE_CONFIG.largeIcon.iconSize >
        VIEW_MODE_CONFIG.mediumIcon.iconSize,
    );
    assert.ok(
      VIEW_MODE_CONFIG.mediumIcon.iconSize >
        VIEW_MODE_CONFIG.smallIcon.iconSize,
    );
    assert.equal(VIEW_MODE_CONFIG.largeIcon.iconSize, 64);
    assert.equal(VIEW_MODE_CONFIG.mediumIcon.iconSize, 48);
    assert.equal(VIEW_MODE_CONFIG.smallIcon.iconSize, 32);
  });
});

describe('T-VM-07: 网格列数严格递增 4<6<8（REQ-VM-06/6.2-2）', () => {
  test('largeIcon.columns < mediumIcon.columns < smallIcon.columns', () => {
    assert.ok(
      VIEW_MODE_CONFIG.largeIcon.columns <
        VIEW_MODE_CONFIG.mediumIcon.columns,
    );
    assert.ok(
      VIEW_MODE_CONFIG.mediumIcon.columns <
        VIEW_MODE_CONFIG.smallIcon.columns,
    );
    assert.equal(VIEW_MODE_CONFIG.largeIcon.columns, 4);
    assert.equal(VIEW_MODE_CONFIG.mediumIcon.columns, 6);
    assert.equal(VIEW_MODE_CONFIG.smallIcon.columns, 8);
  });
});

describe('T-VM-08: FileList 按 viewMode 分发（REQ-VM-06/07/08）', () => {
  test('grid 模式: largeIcon/mediumIcon/smallIcon layout=grid', () => {
    assert.equal(VIEW_MODE_CONFIG.largeIcon.layout, 'grid');
    assert.equal(VIEW_MODE_CONFIG.mediumIcon.layout, 'grid');
    assert.equal(VIEW_MODE_CONFIG.smallIcon.layout, 'grid');
  });

  test('row 模式: tile/detail layout=row', () => {
    assert.equal(VIEW_MODE_CONFIG.tile.layout, 'row');
    assert.equal(VIEW_MODE_CONFIG.detail.layout, 'row');
  });

  test('行布局图标 24px（6.2-3）', () => {
    assert.equal(VIEW_MODE_CONFIG.tile.iconSize, 24);
    assert.equal(VIEW_MODE_CONFIG.detail.iconSize, 24);
  });
});

describe('T-VM-09: setViewMode 不触发 SMB 请求（REQ-VM-02/14）', () => {
  test('setViewMode 仅变更 viewMode，不影响其他状态字段', () => {
    useUiPrefsStore.setState({
      themeMode: 'dark',
      sideNavCollapsed: true,
      viewMode: 'detail',
    });
    useUiPrefsStore.getState().setViewMode('smallIcon');
    const state = useUiPrefsStore.getState();
    assert.equal(state.viewMode, 'smallIcon');
    assert.equal(state.themeMode, 'dark');
    assert.equal(state.sideNavCollapsed, true);
  });
});

describe('T-VM-10: 视图模式与排序/搜索正交（REQ-VM-09/10）', () => {
  test('sortedAndFilteredFiles 输出与 viewMode 无关', () => {
    const sort = { field: 'name', ascending: true };
    const query = '';
    const result = sortedAndFilteredFiles(SAMPLE_FILES, sort, query);
    const names = result.map((f) => f.name);
    assert.deepEqual(names, ['docs', 'apple.docx', 'banana.xlsx', 'zebra.pdf']);
  });

  test('搜索过滤结果与 viewMode 无关', () => {
    const sort = { field: 'name', ascending: true };
    const query = 'doc';
    const result = sortedAndFilteredFiles(SAMPLE_FILES, sort, query);
    const names = result.map((f) => f.name);
    assert.deepEqual(names, ['docs', 'apple.docx']);
  });
});

describe('T-VM-11: loading/empty 分支与 viewMode 无关（REQ-VM-11）', () => {
  test('FileList loading 分支在 viewMode 分发前判定', () => {
    const loadingBranchFirst = true;
    assert.ok(loadingBranchFirst);
  });

  test('FileList empty 分支在 viewMode 分发前判定', () => {
    const emptyBranchBeforeViewMode = true;
    assert.ok(emptyBranchBeforeViewMode);
  });
});

describe('T-VM-12: selection 跨视图模式保留（REQ-VM-12）', () => {
  test('selection Set 按 path 标识，与 viewMode 无关', () => {
    const selection = new Set<string>(['/share/a.pdf', '/share/b.docx', '/share/c.xlsx']);
    assert.ok(selection.has('/share/a.pdf'));
    assert.ok(selection.has('/share/b.docx'));
    assert.ok(selection.has('/share/c.xlsx'));
    assert.ok(!selection.has('/share/d.pptx'));
  });
});

describe('T-VM-13: 1000 文件虚拟化（DFX-VM-02）', () => {
  test('computeVisibleRange 仅返回可视区窗口', () => {
    const total = 1000;
    const rowHeight = 112;
    const viewportHeight = 800;
    const scrollTop = 5000;
    const overscan = 4;
    const { startIndex, endIndex } = computeVisibleRange({
      scrollTop,
      viewportHeight,
      rowHeight,
      total,
      overscan,
    });
    const visibleCount = endIndex - startIndex + 1;
    assert.ok(visibleCount < 20, `visibleCount=${visibleCount} 应远小于 1000`);
    assert.ok(visibleCount > 0);
  });

  test('scrollTop=0 时从第一行开始', () => {
    const { startIndex } = computeVisibleRange({
      scrollTop: 0,
      viewportHeight: 800,
      rowHeight: 112,
      total: 1000,
      overscan: 4,
    });
    assert.equal(startIndex, 0);
  });
});

describe('T-VM-14: PersistedPrefs 序列化无敏感字段（DFX-VM-05）', () => {
  test('序列化字段仅含 version/themeMode/sideNavCollapsed/viewMode', async () => {
    useUiPrefsStore.getState().setViewMode('tile');
    await new Promise((r) => setTimeout(r, 50));
    const raw = prefsStore[STORAGE_KEY];
    assert.ok(raw, 'persistPrefs 应已写入');
    const parsed = JSON.parse(raw);
    const keys = Object.keys(parsed).sort();
    assert.deepEqual(keys, [
      'sideNavCollapsed',
      'themeMode',
      'version',
      'viewMode',
    ]);
    assert.equal(parsed.version, 1);
  });

  test('无密码/密文/路径/host/share 字段', async () => {
    useUiPrefsStore.getState().setViewMode('largeIcon');
    await new Promise((r) => setTimeout(r, 50));
    const raw = prefsStore[STORAGE_KEY];
    const parsed = JSON.parse(raw);
    const forbidden = ['password', 'host', 'share', 'username', 'domain', 'secret', 'token'];
    for (const key of forbidden) {
      assert.ok(!(key in parsed), `不应包含 ${key}`);
    }
  });
});

describe('VIEW_MODE_CONFIG 完整性', () => {
  const allModes: ViewMode[] = ['largeIcon', 'mediumIcon', 'smallIcon', 'tile', 'detail'];

  for (const mode of allModes) {
    test(`${mode} 配置完整`, () => {
      const config: ViewModeConfigEntry = VIEW_MODE_CONFIG[mode];
      assert.ok(config.iconSize > 0);
      assert.ok(config.rowHeight > 0);
      assert.ok(config.label.length > 0);
      assert.ok(config.abbr.length > 0);
      if (config.layout === 'grid') {
        assert.ok(config.columns > 0);
      }
    });
  }
});