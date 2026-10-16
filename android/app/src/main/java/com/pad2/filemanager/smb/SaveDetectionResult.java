package com.pad2.filemanager.smb;

import java.util.HashMap;
import java.util.Map;

public class SaveDetectionResult {

    private SaveDetectionVerdict verdict;
    private String originalFilePath;
    private String resultFilePath;
    private String baselineSha256;
    private String finalSha256;
    private long baselineMtime;
    private long finalMtime;
    private String evidence;
    private long timestamp;

    public SaveDetectionResult() {
        this.verdict = SaveDetectionVerdict.DETECTION_UNCERTAIN;
        this.timestamp = System.currentTimeMillis();
    }

    public SaveDetectionResult(SaveDetectionVerdict verdict, String evidence) {
        this.verdict = verdict;
        this.evidence = evidence;
        this.timestamp = System.currentTimeMillis();
    }

    public SaveDetectionVerdict getVerdict() { return verdict; }
    public void setVerdict(SaveDetectionVerdict verdict) { this.verdict = verdict; }

    public String getOriginalFilePath() { return originalFilePath; }
    public void setOriginalFilePath(String originalFilePath) { this.originalFilePath = originalFilePath; }

    public String getResultFilePath() { return resultFilePath; }
    public void setResultFilePath(String resultFilePath) { this.resultFilePath = resultFilePath; }

    public String getBaselineSha256() { return baselineSha256; }
    public void setBaselineSha256(String baselineSha256) { this.baselineSha256 = baselineSha256; }

    public String getFinalSha256() { return finalSha256; }
    public void setFinalSha256(String finalSha256) { this.finalSha256 = finalSha256; }

    public long getBaselineMtime() { return baselineMtime; }
    public void setBaselineMtime(long baselineMtime) { this.baselineMtime = baselineMtime; }

    public long getFinalMtime() { return finalMtime; }
    public void setFinalMtime(long finalMtime) { this.finalMtime = finalMtime; }

    public String getEvidence() { return evidence; }
    public void setEvidence(String evidence) { this.evidence = evidence; }

    public long getTimestamp() { return timestamp; }

    public Map<String, Object> toMap() {
        Map<String, Object> result = new HashMap<>();
        result.put("verdict", verdict.name());
        result.put("timestamp", timestamp);
        if (originalFilePath != null) result.put("originalFilePath", originalFilePath);
        if (resultFilePath != null) result.put("resultFilePath", resultFilePath);
        if (baselineSha256 != null) result.put("baselineHash", baselineSha256);
        if (finalSha256 != null) result.put("newHash", finalSha256);
        result.put("baselineMtime", baselineMtime);
        result.put("finalMtime", finalMtime);
        if (evidence != null) result.put("evidence", evidence);

        boolean changed = verdict == SaveDetectionVerdict.SAVE_SUCCESS;
        boolean contentChanged = changed;
        boolean mtimeChanged = finalMtime != baselineMtime;
        boolean saveAsDetected = verdict == SaveDetectionVerdict.SAVE_AS_DETECTED;

        result.put("changed", changed);
        result.put("contentChanged", contentChanged);
        result.put("mtimeChanged", mtimeChanged);
        result.put("saveAsDetected", saveAsDetected);
        result.put("currentMtime", finalMtime);

        return result;
    }

    @Override
    public String toString() {
        return "SaveDetectionResult{verdict=" + verdict +
                ", evidence='" + evidence + '\'' +
                ", baselineSha256=" + (baselineSha256 != null ? baselineSha256.substring(0, Math.min(16, baselineSha256.length())) + "..." : "null") +
                ", finalSha256=" + (finalSha256 != null ? finalSha256.substring(0, Math.min(16, finalSha256.length())) + "..." : "null") +
                '}';
    }
}