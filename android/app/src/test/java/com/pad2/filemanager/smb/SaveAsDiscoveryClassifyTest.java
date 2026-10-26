package com.pad2.filemanager.smb;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * L1 矩阵测试：SaveAsDiscoveryService.classifyCandidate 分级准入矩阵（PAD2-HOTFIX-D2D3D5-001）。
 * 参数注入式，覆盖 design 4.2 准入规则与 4.3 误收/漏收论证表全部样本；
 * HF-D3-R01~R06 映射见各方法注释。
 * 仅调用静态纯函数（无 Android API 引用、不实例化解冻类，design R-06 缓解）。
 */
public class SaveAsDiscoveryClassifyTest {

    private static final long START = 1_000_000L;
    private static final long END = 2_000_000L;
    private static final long ORIGINAL_SIZE = 10_000L;

    private static int classify(String fileName, String filePath, long fileMtime, long fileSize,
                                boolean originalSizeKnown, long originalSize) {
        return SaveAsDiscoveryService.classifyCandidate(fileName, filePath, fileMtime, fileSize,
                "test-render.docx", "test-render", "docx",
                originalSizeKnown, originalSize, START, END);
    }

    private static int classify(String fileName, long fileMtime, long fileSize) {
        return classify(fileName, "/storage/emulated/0/Documents/" + fileName,
                fileMtime, fileSize, true, ORIGINAL_SIZE);
    }

    private static int classify(String fileName, long fileMtime, long fileSize,
                                boolean originalSizeKnown, long originalSize) {
        return classify(fileName, "/storage/emulated/0/Documents/" + fileName,
                fileMtime, fileSize, originalSizeKnown, originalSize);
    }

    // ===== A 级：名称强关联（design 4.2.2） =====

    @Test
    public void a1_sameNameSameExtension_documentsPath_levelA() {
        // HF-D3-R01 盲区本体修复（fix1 因 extensionChanged 约束漏收同名同扩展另存为目标；
        // E4 路径级排除不误伤 Documents/ 下同名目标）
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render.docx", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void a2_baseNameRelated_sameExtension_levelA() {
        // HF-D3-R02a（基名关联 + 同扩展名：fix1 漏收形态，A 级扩集）
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render-v2.docx", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void a2_baseNameRelated_extensionChanged_levelA() {
        // HF-D3-R02a 既有能力保持（fix1 唯一可发现形态：基名关联+扩展名变更，严格扩集无回归）
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render.pdf", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void a_level_toleranceWindowBeforeStart_levelA() {
        // HF-D3-R05（A 级容差语义保持：mtime ∈ [start-60s, start) 前置容差区间准入）
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render-v2.docx", START - 30_000L, ORIGINAL_SIZE));
    }

    // ===== B 级：组合信号（design 4.2.3） =====

    @Test
    public void b_newNameSameExtension_inTightWindow_levelB() {
        // HF-D3-R02b（全新名同扩展 + 大小同量级 + 收紧时间窗 → B 级；HF-TC-D3-02b 逻辑层样本）
        assertEquals(SaveAsDiscoveryService.LEVEL_B,
                classify("终稿评审版.docx", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void b_extensionCaseInsensitive_levelB() {
        // HF-D3-R02b/B1（扩展名 equalsIgnoreCase：.DOCX 与 .docx 同格式文档）
        assertEquals(SaveAsDiscoveryService.LEVEL_B,
                classify("终稿评审版.DOCX", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void b_sizeRatioBoundaries() {
        // HF-D3-R02b/B2 边界值（design 4.2.3 量级区间 [0.25, 4.0]：含边界准入、越界排除）
        assertEquals("B2 下界含 0.25", SaveAsDiscoveryService.LEVEL_B,
                classify("终稿评审版.docx", START + 100, 2_500L));
        assertEquals("B2 下界外 0.2499", SaveAsDiscoveryService.NOT_CANDIDATE,
                classify("终稿评审版.docx", START + 100, 2_499L));
        assertEquals("B2 上界含 4.0", SaveAsDiscoveryService.LEVEL_B,
                classify("终稿评审版.docx", START + 100, 40_000L));
        assertEquals("B2 上界外 4.0001", SaveAsDiscoveryService.NOT_CANDIDATE,
                classify("终稿评审版.docx", START + 100, 40_001L));
    }

    @Test
    public void b_tightWindowBoundaries() {
        // HF-D3-R05/B3 收紧窗边界（无 -60s 前置容差：mtime=start 准入、start-1 拒绝——
        // 排除会话开始前已存在的历史文件）
        assertEquals("B3 左界含 start", SaveAsDiscoveryService.LEVEL_B,
                classify("终稿评审版.docx", START, ORIGINAL_SIZE));
        assertEquals("B3 左界外 start-1（A 级容差区间内但 B 级收紧窗拒绝）",
                SaveAsDiscoveryService.NOT_CANDIDATE,
                classify("终稿评审版.docx", START - 1, ORIGINAL_SIZE));
    }

    @Test
    public void b_sizeUnknown_degradesHonestly_aLevelUnaffected() {
        // design 4.2.3 诚实降级（缓存缺失 → B 级整体不可用仅 A 级生效，不猜测大小）
        assertEquals(SaveAsDiscoveryService.NOT_CANDIDATE,
                classify("终稿评审版.docx", START + 100, ORIGINAL_SIZE, false, 0L));
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render-v2.docx", START + 100, ORIGINAL_SIZE, false, 0L));
    }

    @Test
    public void b_extensionChangedWithoutNameRelation_notCandidate() {
        // design 4.3.2 已知边界（全新名+变扩展名"终稿.pdf"：无内容线索关联不虚构——
        // 诚实漏收，安全回退，HF-CON-08）
        assertEquals(SaveAsDiscoveryService.NOT_CANDIDATE,
                classify("终稿.pdf", START + 100, ORIGINAL_SIZE));
    }

    // ===== 前置排除 E2/E3/E4（design 4.2.1） =====

    @Test
    public void e2_intermediateFile_excludedTemp() {
        // HF-D3-R06 口径一致性（E2 与 D2 单一真源：实测中间文件形态经排除，双保险之扫描侧）
        assertEquals(SaveAsDiscoveryService.EXCLUDED_TEMP,
                classify("1963289719.-1908999883-1548918099", START + 100, ORIGINAL_SIZE));
    }

    @Test
    public void e3_outsideToleranceWindow_excludedWindow() {
        // HF-D3-R05/E3 容差窗 [start-60s, end+60s] 外排除（含 HF-TC-D3-05 历史文件逻辑层样本：
        // 即使 A2 名称命中，前置排除优先于 A 级判定）
        assertEquals("窗口前 start-61s（名称关联文件亦排除）", SaveAsDiscoveryService.EXCLUDED_WINDOW,
                classify("test-render-v2.docx", START - 61_000L, ORIGINAL_SIZE));
        assertEquals("窗口后 end+61s", SaveAsDiscoveryService.EXCLUDED_WINDOW,
                classify("终稿评审版.docx", END + 61_000L, ORIGINAL_SIZE));
    }

    @Test
    public void e4_cacheOriginalSelf_excludedSelf() {
        // design 4.2.1/E4（原文件自身排除：路径 == 缓存基路径+originalName——
        // smb_cache 入扫描集的配套防误收，原地保存后 mtime 更新的最高置信误收源）
        assertEquals(SaveAsDiscoveryService.EXCLUDED_SELF,
                classify("test-render.docx",
                        "/storage/emulated/0/PAD2/smb_cache/test-render.docx",
                        START + 100, ORIGINAL_SIZE, true, ORIGINAL_SIZE));
    }

    @Test
    public void e4_doesNotExcludeSameNameInOtherDirectories() {
        // design 4.2.1 E4 论证（排除依据是路径相等而非名称相等：
        // Documents/ 同名目标恰是 HF-D3-R01 要发现的对象）
        assertEquals(SaveAsDiscoveryService.LEVEL_A,
                classify("test-render.docx",
                        "/storage/emulated/0/Documents/test-render.docx",
                        START + 100, ORIGINAL_SIZE, true, ORIGINAL_SIZE));
    }
}