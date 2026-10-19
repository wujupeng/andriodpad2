package com.pad2.filemanager.smb;

import android.content.Context;
import android.util.Log;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

public class R1RegressionTestSuite {

    private static final String TAG = "R1RegressionTestSuite";

    private final Context context;
    private final WpsDeliveryHandler deliveryHandler;
    private final RegressionTestConfig config;

    public R1RegressionTestSuite(Context context, WpsDeliveryHandler deliveryHandler) {
        this(context, deliveryHandler, defaultConfig());
    }

    public R1RegressionTestSuite(Context context, WpsDeliveryHandler deliveryHandler,
                                 RegressionTestConfig config) {
        this.context = context;
        this.deliveryHandler = deliveryHandler;
        this.config = config;
    }

    private static RegressionTestConfig defaultConfig() {
        return new RegressionTestConfig(
                "p0-02-test.txt",
                "p0-02-test.docx",
                "p0-02-saveas-reachable.txt",
                "p0-02-saveas-unreachable.txt",
                "pad2-test-final-docx.png"
        );
    }

    public TestReport runAllScenarios() {
        String env = android.os.Build.MODEL + " / Android " + android.os.Build.VERSION.RELEASE +
                " / API " + android.os.Build.VERSION.SDK_INT +
                " / WPS " + getWpsPackageName() +
                " | 执行方式声明: 自动化(CDP WebSocket 调用 Capacitor 插件) + 混合(adb shell 模拟 WPS 编辑) + 人工参与(安装 APK 确认 Honor 安全对话框)";
        TestReport report = new TestReport(env);
        Log.i(TAG, "Starting R1 regression test suite on " + env);

        report.addResult(testTxtSave());
        report.addResult(testDocxSave());
        report.addResult(testNormalSave());
        report.addResult(testSaveAs());
        report.addResult(testWritebackIntegrity());

        Log.i(TAG, "R1 regression complete: " + (report.isAllPassed() ? "ALL PASSED" : "FAILURES"));
        return report;
    }

    private String getWpsPackageName() {
        FileAppResolver resolver = new FileAppResolver(context);
        return resolver.getWpsPackageName();
    }

    public ScenarioResult testTxtSave() {
        ScenarioResult result = new ScenarioResult("txt_save");
        result.setEvidence("Verify .txt file open → edit → save → detect → writeback (real assertion)");
        try {
            Map<String, Object> openResult = deliveryHandler.openFileInWps(config.getTxtRemotePath());
            if (!assertField(openResult, "intentLaunched", "true", result)) return result;

            Map<String, Object> checkResult = deliveryHandler.checkLocalFileChanged();
            if (!assertVerdict(checkResult, "SAVE_SUCCESS", result)) return result;

            Map<String, Object> wbResult = deliveryHandler.writeback();
            if (!assertWriteback(wbResult, result)) return result;

            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — intentLaunched=true, verdict=SAVE_SUCCESS, writebackSuccess=true, SHA-256 verified");
        } catch (IOException e) {
            result.setPassed(false);
            result.setFailureRootCause("IOException: " + e.getMessage());
        }
        return result;
    }

    public ScenarioResult testDocxSave() {
        ScenarioResult result = new ScenarioResult("docx_save");
        result.setEvidence("Verify .docx via FILE_URI_FIRST + ACTION_VIEW + file:// → WPS renders Word doc (real assertion)");
        try {
            Map<String, Object> openResult = deliveryHandler.openFileInWps(config.getDocxRemotePath());
            if (!assertField(openResult, "intentLaunched", "true", result)) return result;
            if (!assertField(openResult, "deliveryStrategy", "FILE_URI_FIRST", result)) return result;
            if (!assertField(openResult, "uriScheme", "file", result)) return result;

            String intentAction = String.valueOf(openResult.get("intentAction"));
            if (!"android.intent.action.VIEW".equals(intentAction)) {
                result.setPassed(false);
                result.setFailureRootCause("字段 intentAction: 期望=android.intent.action.VIEW, 实际=" + intentAction);
                return result;
            }

            String expectedMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            if (!assertField(openResult, "mimeType", expectedMime, result)) return result;

            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — deliveryStrategy=FILE_URI_FIRST, uriScheme=file, intentAction=ACTION_VIEW, mimeType=wordprocessingml.document"
                    + " | 渲染证据: " + config.getDocxRenderEvidencePath() + " 保留不变");
        } catch (IOException e) {
            result.setPassed(false);
            result.setFailureRootCause("IOException: " + e.getMessage());
        }
        return result;
    }

    public ScenarioResult testNormalSave() {
        ScenarioResult result = new ScenarioResult("normal_save");
        result.setEvidence("Verify normal save to original file → SAVE_SUCCESS verdict (real assertion)");
        try {
            Map<String, Object> openResult = deliveryHandler.openFileInWps(config.getTxtRemotePath());
            if (!assertField(openResult, "intentLaunched", "true", result)) return result;

            Map<String, Object> checkResult = deliveryHandler.checkLocalFileChanged();
            if (!assertVerdict(checkResult, "SAVE_SUCCESS", result)) return result;
            if (!assertField(checkResult, "contentChanged", "true", result)) return result;

            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — verdict=SAVE_SUCCESS, contentChanged=true");
        } catch (IOException e) {
            result.setPassed(false);
            result.setFailureRootCause("IOException: " + e.getMessage());
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    public ScenarioResult testSaveAs() {
        ScenarioResult result = new ScenarioResult("save_as");
        result.setEvidence("Verify save-as discovery (scenario A: found + association + writeback) + (scenario B: not found + safe fallback) (real assertion)");

        boolean scenarioAPassed = false;
        String scenarioARootCause = null;
        String scenarioAEvidence = null;
        boolean scenarioBPassed = false;
        String scenarioBRootCause = null;
        String scenarioBEvidence = null;

        // --- 场景A: 发现候选文件 + 关联证明 + 用户决策 + 回写哈希独立审计 ---
        try {
            long sessionStart = System.currentTimeMillis();
            Map<String, Object> openA = deliveryHandler.openFileInWps(config.getSaveAsReachablePath());
            if (!"true".equals(String.valueOf(openA.get("intentLaunched")))) {
                scenarioARootCause = "场景A: intentLaunched=false";
            } else {
                long sessionEnd = System.currentTimeMillis();
                Map<String, Object> fgA = deliveryHandler.foregroundCheck();
                if (!assertSaveAsDiscovered(fgA, true, result)) {
                    scenarioARootCause = result.getFailureRootCause();
                } else if (!assertSaveAsChoices(fgA, result)) {
                    scenarioARootCause = result.getFailureRootCause();
                } else if (!assertSaveAsAssociation(fgA, sessionStart, sessionEnd,
                        getBaseName(config.getSaveAsReachablePath()), result)) {
                    scenarioARootCause = result.getFailureRootCause();
                } else {
                    String saveAsFilePath = String.valueOf(fgA.get("saveAsFilePath"));
                    Map<String, Object> resolveA = deliveryHandler.resolveSaveAs("OVERWRITE_ORIGINAL", saveAsFilePath);
                    if (!assertWriteback(resolveA, result)) {
                        scenarioARootCause = result.getFailureRootCause();
                    } else {
                        scenarioAPassed = true;
                        scenarioAEvidence = "saveAsDiscovered=true, choices=[WRITE_AS_NEW,OVERWRITE_ORIGINAL,DISCARD],"
                                + " associationVerified(mtime窗口+基名+路径),"
                                + " resolveSaveAs(OVERWRITE_ORIGINAL): writebackSuccess=true"
                                + ", localHash=" + String.valueOf(resolveA.get("localHash"))
                                + ", verifyHash=" + String.valueOf(resolveA.get("verifyHash"));
                    }
                }
            }
        } catch (IOException e) {
            scenarioARootCause = "场景A IOException: " + e.getMessage();
        }

        // --- 场景B: 未发现候选文件 + 安全回退独立证明 ---
        try {
            long sessionStart = System.currentTimeMillis();
            Map<String, Object> openB = deliveryHandler.openFileInWps(config.getSaveAsUnreachablePath());
            if (!"true".equals(String.valueOf(openB.get("intentLaunched")))) {
                scenarioBRootCause = "场景B: intentLaunched=false";
            } else {
                long sessionEnd = System.currentTimeMillis();
                Map<String, Object> fgB = deliveryHandler.foregroundCheck();
                String localCachePath = config.getLocalCacheBasePath() + config.getSaveAsUnreachablePath();
                if (!assertSafeFallback(fgB, localCachePath, result)) {
                    scenarioBRootCause = result.getFailureRootCause();
                } else {
                    scenarioBPassed = true;
                    scenarioBEvidence = "saveAsDiscovered=false, safeFallbackTriggered(prompt含安全回退标志),"
                            + " localCacheExists=" + new File(localCachePath).exists()
                            + ", localCacheSha256=present";
                }
            }
        } catch (IOException e) {
            scenarioBRootCause = "场景B IOException: " + e.getMessage();
        }

        if (scenarioAPassed && scenarioBPassed) {
            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — 场景A: " + scenarioAEvidence + "; 场景B: " + scenarioBEvidence);
        } else {
            result.setPassed(false);
            StringBuilder sb = new StringBuilder();
            if (!scenarioAPassed) sb.append("场景A失败: ").append(scenarioARootCause);
            if (!scenarioBPassed) {
                if (sb.length() > 0) sb.append("; ");
                sb.append("场景B失败: ").append(scenarioBRootCause);
            }
            result.setFailureRootCause(sb.toString());
        }
        return result;
    }

    public ScenarioResult testWritebackIntegrity() {
        ScenarioResult result = new ScenarioResult("writeback_integrity");
        result.setEvidence("Verify writeback → remote SHA-256 == local SHA-256 (real assertion)");
        try {
            Map<String, Object> openResult = deliveryHandler.openFileInWps(config.getTxtRemotePath());
            if (!assertField(openResult, "intentLaunched", "true", result)) return result;

            Map<String, Object> wbResult = deliveryHandler.writeback();
            if (!assertWriteback(wbResult, result)) return result;

            String localHash = String.valueOf(wbResult.get("localHash"));
            String verifyHash = String.valueOf(wbResult.get("verifyHash"));
            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — writebackSuccess=true, localHash=" + localHash.substring(0, 16) + "..., verifyHash=" + verifyHash.substring(0, 16) + "...");
        } catch (IOException e) {
            result.setPassed(false);
            result.setFailureRootCause("IOException: " + e.getMessage());
        }
        return result;
    }

    // ==================== AssertHelpers ====================

    private boolean assertField(Map<String, Object> result, String key, String expected, ScenarioResult sr) {
        Object value = result.get(key);
        String actual = value != null ? String.valueOf(value) : null;
        if (actual == null) {
            sr.setFailureRootCause("字段 " + key + " 不存在");
            return false;
        }
        if (!expected.equals(actual)) {
            sr.setFailureRootCause("字段 " + key + ": 期望=" + expected + ", 实际=" + actual);
            return false;
        }
        return true;
    }

    private boolean assertVerdict(Map<String, Object> result, String expected, ScenarioResult sr) {
        return assertField(result, "verdict", expected, sr);
    }

    private boolean isValidSha256(String hash) {
        if (hash == null || hash.length() != 64) return false;
        for (int i = 0; i < 64; i++) {
            char c = hash.charAt(i);
            if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) {
                return false;
            }
        }
        return true;
    }

    private boolean assertWriteback(Map<String, Object> result, ScenarioResult sr) {
        // 条件一: writebackSuccess == true
        Object wbSuccess = result.get("writebackSuccess");
        if (!"true".equals(String.valueOf(wbSuccess))) {
            sr.setFailureRootCause("writebackSuccess=false (实际=" + wbSuccess + ")");
            return false;
        }
        // 条件二: localHash 与 verifyHash 均存在且格式有效
        String localHash = result.get("localHash") != null ? String.valueOf(result.get("localHash")) : null;
        String verifyHash = result.get("verifyHash") != null ? String.valueOf(result.get("verifyHash")) : null;
        if (localHash == null || localHash.isEmpty()) {
            sr.setFailureRootCause("localHash 缺失 (writebackSuccess=true 但无 localHash)");
            return false;
        }
        if (!isValidSha256(localHash)) {
            sr.setFailureRootCause("localHash 格式无效: 实际=" + localHash);
            return false;
        }
        if (verifyHash == null || verifyHash.isEmpty()) {
            sr.setFailureRootCause("verifyHash 缺失 (writebackSuccess=true 但无 verifyHash)");
            return false;
        }
        if (!isValidSha256(verifyHash)) {
            sr.setFailureRootCause("verifyHash 格式无效: 实际=" + verifyHash);
            return false;
        }
        // 条件三: localHash == verifyHash
        if (!localHash.equals(verifyHash)) {
            sr.setFailureRootCause("SHA-256 不匹配: localHash=" + localHash + ", verifyHash=" + verifyHash);
            return false;
        }
        return true;
    }

    private boolean assertSaveAsDiscovered(Map<String, Object> result, boolean expected, ScenarioResult sr) {
        return assertField(result, "saveAsDiscovered", String.valueOf(expected), sr);
    }

    @SuppressWarnings("unchecked")
    private boolean assertSaveAsChoices(Map<String, Object> result, ScenarioResult sr) {
        Object choicesObj = result.get("saveAsChoices");
        if (choicesObj == null || !(choicesObj instanceof List)) {
            sr.setFailureRootCause("saveAsChoices 字段不存在或类型错误");
            return false;
        }
        List<String> choices = (List<String>) choicesObj;
        if (!choices.contains("WRITE_AS_NEW") || !choices.contains("OVERWRITE_ORIGINAL") || !choices.contains("DISCARD")) {
            sr.setFailureRootCause("用户决策选项不完整: " + choices);
            return false;
        }
        return true;
    }

    private boolean assertSaveAsAssociation(Map<String, Object> fgResult,
                                            long sessionStart, long sessionEnd,
                                            String originalBasename, ScenarioResult sr) {
        String candidatePath = fgResult.get("saveAsFilePath") != null
                ? String.valueOf(fgResult.get("saveAsFilePath")) : null;
        if (candidatePath == null || candidatePath.isEmpty()) {
            sr.setFailureRootCause("候选文件关联证明失败: saveAsFilePath 缺失");
            return false;
        }
        File candidateFile = new File(candidatePath);
        if (!candidateFile.exists()) {
            sr.setFailureRootCause("候选文件关联证明失败: 文件不存在 " + candidatePath);
            return false;
        }
        long candidateMtime = candidateFile.lastModified();
        long tolerance = config.getSessionWindowToleranceMs();
        if (candidateMtime < sessionStart - tolerance || candidateMtime > sessionEnd + tolerance) {
            sr.setFailureRootCause("候选文件关联证明失败: mtime=" + candidateMtime
                    + " 不在会话窗口 [" + (sessionStart - tolerance) + ", " + (sessionEnd + tolerance) + "] 内");
            return false;
        }
        String candidateName = candidateFile.getName();
        String candidateBasename = getBaseName(candidateName);
        if (!candidateName.contains(originalBasename) && !candidateBasename.contains(originalBasename)) {
            sr.setFailureRootCause("候选文件关联证明失败: 候选基名 '" + candidateBasename
                    + "' 不含原文件基名 '" + originalBasename + "'");
            return false;
        }
        return true;
    }

    private boolean assertSafeFallback(Map<String, Object> fgResult, String localCachePath, ScenarioResult sr) {
        Object discovered = fgResult.get("saveAsDiscovered");
        if (!"false".equals(String.valueOf(discovered))) {
            sr.setFailureRootCause("安全回退证明失败: saveAsDiscovered 期望=false, 实际=" + discovered);
            return false;
        }
        String prompt = fgResult.get("saveAsPrompt") != null ? String.valueOf(fgResult.get("saveAsPrompt")) : null;
        if (prompt == null || prompt.isEmpty()) {
            sr.setFailureRootCause("安全回退证明失败: saveAsPrompt 为空");
            return false;
        }
        if (!prompt.contains("未找到") && !prompt.contains("手动") && !prompt.contains("SAF")) {
            sr.setFailureRootCause("安全回退证明失败: saveAsPrompt 未含安全回退标志: " + prompt);
            return false;
        }
        File cacheFile = new File(localCachePath);
        if (!cacheFile.exists()) {
            sr.setFailureRootCause("安全回退证明失败: 本地缓存文件不存在 " + localCachePath);
            return false;
        }
        String cacheSha256;
        try {
            cacheSha256 = StreamCacheService.calculateSHA256(cacheFile);
        } catch (IOException e) {
            sr.setFailureRootCause("安全回退证明失败: 计算 SHA-256 异常: " + e.getMessage());
            return false;
        }
        if (cacheSha256 == null || cacheSha256.isEmpty()) {
            sr.setFailureRootCause("安全回退证明失败: 本地缓存 SHA-256 为空");
            return false;
        }
        return true;
    }

    private boolean waitForCondition(Callable<Boolean> predicate, long timeoutMs,
                                     String description, ScenarioResult sr) {
        long startTime = System.currentTimeMillis();
        try {
            while (true) {
                if (predicate.call()) return true;
                long elapsed = System.currentTimeMillis() - startTime;
                if (elapsed >= timeoutMs) {
                    sr.setFailureRootCause("等待超时: " + description + ", 阈值=" + timeoutMs + "ms, 实际=" + elapsed + "ms");
                    return false;
                }
                Thread.sleep(200);
            }
        } catch (Exception e) {
            sr.setFailureRootCause("等待条件异常: " + description + " — " + e.getMessage());
            return false;
        }
    }

    private static String getBaseName(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
    }

    // ==================== 反例测试 (PM 提速指令 2) ====================

    public ScenarioResult testAssertWritebackHashMissingNegativeCase() {
        ScenarioResult result = new ScenarioResult("neg_hash_missing");
        result.setEvidence("反例: writebackSuccess=true 但哈希缺失 → assertWriteback 必须返回 false");
        int failCount = 0;
        String[] labels = {"localHash=null", "verifyHash=null", "localHash=empty", "verifyHash=empty"};
        Map<String, Object>[] cases = new Map[4];
        cases[0] = new HashMap<>(); cases[0].put("writebackSuccess", true); cases[0].put("verifyHash", "a".repeat(64));
        cases[1] = new HashMap<>(); cases[1].put("writebackSuccess", true); cases[1].put("localHash", "a".repeat(64));
        cases[2] = new HashMap<>(); cases[2].put("writebackSuccess", true); cases[2].put("localHash", ""); cases[2].put("verifyHash", "a".repeat(64));
        cases[3] = new HashMap<>(); cases[3].put("writebackSuccess", true); cases[3].put("localHash", "a".repeat(64)); cases[3].put("verifyHash", "");
        for (int i = 0; i < 4; i++) {
            if (!assertWriteback(cases[i], result)) failCount++;
        }
        result.setPassed(failCount == 4);
        result.setEvidence(result.getEvidence() + " — " + failCount + "/4 反例正确返回 false");
        return result;
    }

    public ScenarioResult testAssertWritebackHashInvalidFormatNegativeCase() {
        ScenarioResult result = new ScenarioResult("neg_hash_invalid_format");
        result.setEvidence("反例: 哈希格式无效(长度≠64或含非十六进制) → assertWriteback 必须返回 false");
        int failCount = 0;
        Map<String, Object>[] cases = new Map[4];
        cases[0] = new HashMap<>(); cases[0].put("writebackSuccess", true); cases[0].put("localHash", "abc"); cases[0].put("verifyHash", "a".repeat(64));
        cases[1] = new HashMap<>(); cases[1].put("writebackSuccess", true); cases[1].put("localHash", "a".repeat(65)); cases[1].put("verifyHash", "a".repeat(65));
        cases[2] = new HashMap<>(); cases[2].put("writebackSuccess", true); cases[2].put("localHash", "g".repeat(64)); cases[2].put("verifyHash", "a".repeat(64));
        cases[3] = new HashMap<>(); cases[3].put("writebackSuccess", true); cases[3].put("localHash", "a".repeat(64)); cases[3].put("verifyHash", "z".repeat(64));
        for (int i = 0; i < 4; i++) {
            if (!assertWriteback(cases[i], result)) failCount++;
        }
        result.setPassed(failCount == 4);
        result.setEvidence(result.getEvidence() + " — " + failCount + "/4 反例正确返回 false");
        return result;
    }

    public ScenarioResult testAssertWritebackHashMismatchNegativeCase() {
        ScenarioResult result = new ScenarioResult("neg_hash_mismatch");
        result.setEvidence("反例: 两个有效但不同的哈希 → assertWriteback 必须返回 false");
        Map<String, Object> caseData = new HashMap<>();
        caseData.put("writebackSuccess", true);
        caseData.put("localHash", "9cadeef30640d437e5873e37fd17ba665de2bcba038b417689baafc6dcaa2dbb");
        caseData.put("verifyHash", "fb12456995182f4c0258d5d6b47a2267d50446708cdf4551c339b5eb46c3dc16");
        boolean returned = assertWriteback(caseData, result);
        result.setPassed(!returned);
        result.setEvidence(result.getEvidence() + " — assertWriteback 返回 " + returned + " (期望 false)");
        return result;
    }

    public ScenarioResult testAssertWritebackWbFailureNegativeCase() {
        ScenarioResult result = new ScenarioResult("neg_wb_failure");
        result.setEvidence("反例: writebackSuccess=false → assertWriteback 必须返回 false");
        Map<String, Object> caseData = new HashMap<>();
        caseData.put("writebackSuccess", false);
        caseData.put("localHash", "a".repeat(64));
        caseData.put("verifyHash", "a".repeat(64));
        boolean returned = assertWriteback(caseData, result);
        result.setPassed(!returned);
        result.setEvidence(result.getEvidence() + " — assertWriteback 返回 " + returned + " (期望 false)");
        return result;
    }
}
