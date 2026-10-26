package com.pad2.filemanager.smb;

import org.junit.Test;

import static org.junit.Assert.assertEquals;

/**
 * L1 矩阵测试：WpsSaveDetector.resolveVerdict 判定决策矩阵（PAD2-HOTFIX-D2D3D5-001）。
 * (mtimeChanged, shaChanged, saveAsEvidenceValid, shaCalcFailed) 16 组合全分支覆盖；
 * HF-D2-R01~R06 映射见各方法注释（design 3.3.1 决策表）。
 * 仅调用静态纯函数（无 Android API 引用、不实例化解冻类，design R-06 缓解）。
 */
public class WpsSaveDetectorVerdictTest {

    // ===== shaCalcFailed = false 的 8 组合 =====

    @Test
    public void noEvidence_fallsBackToUncertain() {
        // HF-D2-R05/R06（无操作基线：无证据即诚实回退，HF-CON-08）
        assertEquals(SaveDetectionVerdict.DETECTION_UNCERTAIN,
                WpsSaveDetector.resolveVerdict(false, false, false, false));
    }

    @Test
    public void saveAsEvidenceOnly_yieldsSaveAsDetected() {
        // HF-D2-R04（原文件无变化 + 有效异名证据 → SAVE_AS）
        assertEquals(SaveDetectionVerdict.SAVE_AS_DETECTED,
                WpsSaveDetector.resolveVerdict(false, false, true, false));
    }

    @Test
    public void shaChangedWithoutMtime_fallsBackToUncertain() {
        // HF-D2-R05（异常输入形态：SHA 变化但 mtime 未变——纯函数层面诚实回退不虚构结论）
        assertEquals(SaveDetectionVerdict.DETECTION_UNCERTAIN,
                WpsSaveDetector.resolveVerdict(false, true, false, false));
    }

    @Test
    public void shaChangedWithSaveAsOnly_saveAsDetected() {
        // HF-D2-R04（mtime 不变时 saveAs 证据参与裁决）
        assertEquals(SaveDetectionVerdict.SAVE_AS_DETECTED,
                WpsSaveDetector.resolveVerdict(false, true, true, false));
    }

    @Test
    public void mtimeOnly_yieldsMtimeFalsePositive() {
        // HF-D2-R02b（mtime 变 + SHA 同 → 假阳性，touch 等价场景）
        assertEquals(SaveDetectionVerdict.MTIME_FALSE_POSITIVE,
                WpsSaveDetector.resolveVerdict(true, false, false, false));
    }

    @Test
    public void mtimeChanged_overridesStaleSaveAsEvidence_falsePositive() {
        // HF-D2-R03 判定不粘住的结构保证（V2 实测缺陷镜像：中间文件事件先到、
        // 原文件 mtime 变 + SHA 同 → 按原地保存证据裁决，不消费旧 saveAs 证据）
        assertEquals(SaveDetectionVerdict.MTIME_FALSE_POSITIVE,
                WpsSaveDetector.resolveVerdict(true, false, true, false));
    }

    @Test
    public void mtimeAndSha_yieldsSaveSuccess() {
        // HF-D2-R02a（双因子直接证据 → SAVE_SUCCESS）
        assertEquals(SaveDetectionVerdict.SAVE_SUCCESS,
                WpsSaveDetector.resolveVerdict(true, true, false, false));
    }

    @Test
    public void mtimeAndSha_overridesSaveAsEvidence_saveSuccess() {
        // HF-D2-R03 缺陷修复本体（V2 实测场景：saveAsDetected=true 粘住 + 原地写回
        // mtime/SHA 双变 → fix1 误报 SAVE_AS，修复后按直接证据判 SAVE_SUCCESS）
        assertEquals(SaveDetectionVerdict.SAVE_SUCCESS,
                WpsSaveDetector.resolveVerdict(true, true, true, false));
    }

    // ===== shaCalcFailed = true 的 8 组合（决策表第 1 条最优先） =====

    @Test
    public void shaCalcFailed_overridesEverything_uncertain_8combinations() {
        // design 3.3.1 决策表第 1 条（异常场景3：计算失败不默认成功，最优先于一切证据组合）
        boolean[][] combos = {
                {false, false, false}, {false, false, true},
                {false, true, false}, {false, true, true},
                {true, false, false}, {true, false, true},
                {true, true, false}, {true, true, true},
        };
        for (boolean[] c : combos) {
            assertEquals("shaCalcFailed 最优先组合: mtime=" + c[0] + ", sha=" + c[1]
                            + ", saveAs=" + c[2],
                    SaveDetectionVerdict.DETECTION_UNCERTAIN,
                    WpsSaveDetector.resolveVerdict(c[0], c[1], c[2], true));
        }
    }
}