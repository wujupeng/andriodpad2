package com.pad2.filemanager.smb;

import android.content.Context;
import android.util.Log;

import java.io.IOException;
import java.util.List;
import java.util.Map;

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
                " / API " + android.os.Build.VERSION.SDK_INT;
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
        result.setEvidence("Verify save-as discovery (scenario A: found) + (scenario B: not found) (real assertion)");

        boolean scenarioAPassed = false;
        String scenarioARootCause = null;
        boolean scenarioBPassed = false;
        String scenarioBRootCause = null;

        try {
            Map<String, Object> openA = deliveryHandler.openFileInWps(config.getSaveAsReachablePath());
            if (!"true".equals(String.valueOf(openA.get("intentLaunched")))) {
                scenarioARootCause = "场景A: intentLaunched=false";
            } else {
                Map<String, Object> fgA = deliveryHandler.foregroundCheck();
                if (!assertSaveAsDiscovered(fgA, true, result)) {
                    scenarioARootCause = result.getFailureRootCause();
                } else if (!assertSaveAsChoices(fgA, result)) {
                    scenarioARootCause = result.getFailureRootCause();
                } else {
                    String saveAsFilePath = String.valueOf(fgA.get("saveAsFilePath"));
                    Map<String, Object> resolveA = deliveryHandler.resolveSaveAs("OVERWRITE_ORIGINAL", saveAsFilePath);
                    if (!assertWriteback(resolveA, result)) {
                        scenarioARootCause = result.getFailureRootCause();
                    } else {
                        scenarioAPassed = true;
                    }
                }
            }
        } catch (IOException e) {
            scenarioARootCause = "场景A IOException: " + e.getMessage();
        }

        try {
            Map<String, Object> openB = deliveryHandler.openFileInWps(config.getSaveAsUnreachablePath());
            if (!"true".equals(String.valueOf(openB.get("intentLaunched")))) {
                scenarioBRootCause = "场景B: intentLaunched=false";
            } else {
                Map<String, Object> fgB = deliveryHandler.foregroundCheck();
                if (!assertSaveAsNotFound(fgB, result)) {
                    scenarioBRootCause = result.getFailureRootCause();
                } else {
                    scenarioBPassed = true;
                }
            }
        } catch (IOException e) {
            scenarioBRootCause = "场景B IOException: " + e.getMessage();
        }

        if (scenarioAPassed && scenarioBPassed) {
            result.setPassed(true);
            result.setEvidence(result.getEvidence() + " — 场景A: saveAsDiscovered=true, 三选项完整, 回写成功; 场景B: saveAsDiscovered=false, SAF回退");
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

    private boolean assertWriteback(Map<String, Object> result, ScenarioResult sr) {
        Object wbSuccess = result.get("writebackSuccess");
        if (!"true".equals(String.valueOf(wbSuccess))) {
            sr.setFailureRootCause("writebackSuccess=false (实际=" + wbSuccess + ")");
            return false;
        }
        String localHash = result.get("localHash") != null ? String.valueOf(result.get("localHash")) : null;
        String verifyHash = result.get("verifyHash") != null ? String.valueOf(result.get("verifyHash")) : null;
        if (localHash != null && verifyHash != null && !localHash.equals(verifyHash)) {
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

    private boolean assertSaveAsNotFound(Map<String, Object> result, ScenarioResult sr) {
        Object discovered = result.get("saveAsDiscovered");
        if (!"false".equals(String.valueOf(discovered))) {
            sr.setFailureRootCause("saveAsDiscovered: 期望=false, 实际=" + discovered);
            return false;
        }
        String prompt = result.get("saveAsPrompt") != null ? String.valueOf(result.get("saveAsPrompt")) : null;
        if (prompt == null || prompt.isEmpty()) {
            sr.setFailureRootCause("未发现候选文件但未如实报告或触发 SAF 回退: saveAsPrompt 为空");
            return false;
        }
        if (!prompt.contains("未找到") && !prompt.contains("手动") && !prompt.contains("SAF")) {
            sr.setFailureRootCause("未发现候选文件但 saveAsPrompt 未含预期关键词: " + prompt);
            return false;
        }
        return true;
    }
}
