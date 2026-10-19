package com.pad2.filemanager.smb;

public class RegressionTestConfig {
    private String txtRemotePath;
    private String docxRemotePath;
    private String saveAsReachablePath;
    private String saveAsUnreachablePath;
    private String docxRenderEvidencePath;
    private long sessionWindowToleranceMs = 60000;
    private long waitTimeoutMs = 10000;
    private String localCacheBasePath = "/storage/emulated/0/PAD2/smb_cache/";

    public RegressionTestConfig() {
    }

    public RegressionTestConfig(String txtRemotePath, String docxRemotePath,
                                String saveAsReachablePath, String saveAsUnreachablePath,
                                String docxRenderEvidencePath) {
        this.txtRemotePath = txtRemotePath;
        this.docxRemotePath = docxRemotePath;
        this.saveAsReachablePath = saveAsReachablePath;
        this.saveAsUnreachablePath = saveAsUnreachablePath;
        this.docxRenderEvidencePath = docxRenderEvidencePath;
    }

    public String getTxtRemotePath() { return txtRemotePath; }
    public void setTxtRemotePath(String txtRemotePath) { this.txtRemotePath = txtRemotePath; }

    public String getDocxRemotePath() { return docxRemotePath; }
    public void setDocxRemotePath(String docxRemotePath) { this.docxRemotePath = docxRemotePath; }

    public String getSaveAsReachablePath() { return saveAsReachablePath; }
    public void setSaveAsReachablePath(String saveAsReachablePath) { this.saveAsReachablePath = saveAsReachablePath; }

    public String getSaveAsUnreachablePath() { return saveAsUnreachablePath; }
    public void setSaveAsUnreachablePath(String saveAsUnreachablePath) { this.saveAsUnreachablePath = saveAsUnreachablePath; }

    public String getDocxRenderEvidencePath() { return docxRenderEvidencePath; }
    public void setDocxRenderEvidencePath(String docxRenderEvidencePath) { this.docxRenderEvidencePath = docxRenderEvidencePath; }

    public long getSessionWindowToleranceMs() { return sessionWindowToleranceMs; }
    public void setSessionWindowToleranceMs(long v) { this.sessionWindowToleranceMs = v; }

    public long getWaitTimeoutMs() { return waitTimeoutMs; }
    public void setWaitTimeoutMs(long v) { this.waitTimeoutMs = v; }

    public String getLocalCacheBasePath() { return localCacheBasePath; }
    public void setLocalCacheBasePath(String v) { this.localCacheBasePath = v; }

    public boolean isValid() {
        return isNotBlank(txtRemotePath)
                && isNotBlank(docxRemotePath)
                && isNotBlank(saveAsReachablePath)
                && isNotBlank(saveAsUnreachablePath)
                && isNotBlank(docxRenderEvidencePath)
                && sessionWindowToleranceMs > 0
                && waitTimeoutMs > 0
                && isNotBlank(localCacheBasePath);
    }

    private static boolean isNotBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}