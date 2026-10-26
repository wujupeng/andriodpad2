package com.pad2.filemanager.smb;

import org.junit.Test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * L1 矩阵测试：WpsSaveDetector.isTempFile 形态矩阵（PAD2-HOTFIX-D2D3D5-001）。
 * 样本来源：design.md 3.2 误伤论证表全量；用例-HF 需求映射见各方法注释。
 * 仅调用静态纯函数（无 Android API 引用、不实例化解冻类，规避 android.jar stub 异常，design R-06 缓解）。
 */
public class WpsSaveDetectorIsTempFileTest {

    // ===== 正样本：中间文件形态（断言 true） =====

    @Test
    public void measuredIntermediateFile_isFiltered() {
        // HF-D2-R01 层1；design 3.2：V2 实测中间文件（数字.数字-数字 三段形态）
        assertTrue("HF-D2-R01/L1: 实测中间文件形态须被过滤",
                WpsSaveDetector.isTempFile("1963289719.-1908999883-1548918099"));
    }

    @Test
    public void legacyTwoSegmentForm_isFiltered() {
        // HF-D2-R01 层1；design 3.2：既有两段形态向后兼容（fix1 已覆盖面，无回归）
        assertTrue(WpsSaveDetector.isTempFile("123.-456"));
        assertTrue(WpsSaveDetector.isTempFile("-1.0"));
        assertTrue(WpsSaveDetector.isTempFile("1.0"));
    }

    @Test
    public void pureDigitsNoSeparator_isFiltered() {
        // HF-D2-R01 层1；design 3.2 字符集规则：纯数字无分隔符亦属数字字符集（`^[\d.\-]+$`）
        assertTrue(WpsSaveDetector.isTempFile("123456"));
    }

    @Test
    public void pureDateNoExtension_isFiltered() {
        // HF-D2-R01 层1；design 3.2 误伤论证：纯日期无扩展名（理论误伤面，与中间文件特征重合，工程概率可忽略）
        assertTrue(WpsSaveDetector.isTempFile("2026.10.20"));
    }

    @Test
    public void multiSegmentVariant_isFiltered() {
        // HF-D2-R01 层1；design 3.4：未来 N 段未知形态（1.2-3.4.5）字符集覆盖（不依赖段数枚举）
        assertTrue(WpsSaveDetector.isTempFile("1.2-3.4.5"));
    }

    @Test
    public void wpsLockAndTempPrefixes_areFiltered() {
        // HF-D2-R07 功能保留：既有五类规则零改动（~$ / .tmp / .temp / .moffice_wr_check / .~lock）
        assertTrue(WpsSaveDetector.isTempFile("~$xxx.docx"));
        assertTrue(WpsSaveDetector.isTempFile("xxx.tmp"));
        assertTrue(WpsSaveDetector.isTempFile("xxx.temp"));
        assertTrue(WpsSaveDetector.isTempFile(".moffice_wr_check-123"));
        assertTrue(WpsSaveDetector.isTempFile(".~lockxxx.docx"));
    }

    // ===== 负样本：用户文档命名（断言 false，不得误伤） =====

    @Test
    public void chineseNamedDocument_notFiltered() {
        // HF-D2-R01 层1；design 3.2：中文/文字命名永不匹配数字字符集
        assertFalse(WpsSaveDetector.isTempFile("2026报告.docx"));
        assertFalse(WpsSaveDetector.isTempFile("终稿评审版.docx"));
    }

    @Test
    public void datedNameWithExtension_notFiltered() {
        // HF-D2-R01 层1；design 3.2：日期式命名带扩展名（扩展名字母使字符集规则永不匹配）
        assertFalse(WpsSaveDetector.isTempFile("2026.10.20.docx"));
        assertFalse(WpsSaveDetector.isTempFile("2026-10-20.docx"));
    }

    @Test
    public void regularDocument_notFiltered() {
        // HF-D2-R01 层1；design 3.2：常规文档命名（含 V2 实测受监听文件 test-render.docx）
        assertFalse(WpsSaveDetector.isTempFile("test-render.docx"));
        assertFalse(WpsSaveDetector.isTempFile("report_v2.pdf"));
        assertFalse(WpsSaveDetector.isTempFile("file-name.txt"));
    }

    @Test
    public void digitPrefixedNameWithExtension_notFiltered() {
        // HF-D2-R01 层1；design 3.2：数字段前缀 + 扩展名（123.456.docx 含字母不受字符集影响）
        assertFalse(WpsSaveDetector.isTempFile("123.456.docx"));
    }

    @Test
    public void nullAndEmpty_notFiltered() {
        // 边界：null 防御（既有行为保持）；空串不匹配 + 量词（至少 1 字符）
        assertFalse(WpsSaveDetector.isTempFile(null));
        assertFalse(WpsSaveDetector.isTempFile(""));
    }
}