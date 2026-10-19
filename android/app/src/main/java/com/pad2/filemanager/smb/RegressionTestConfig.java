package com.pad2.filemanager.smb;

public class RegressionTestConfig {
    private String txtRemotePath;
    private String docxRemotePath;
    private String saveAsReachablePath;
    private String saveAsUnreachablePath;
    private String docxRenderEvidencePath;

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

    public boolean isValid() {
        return isNotBlank(txtRemotePath)
                && isNotBlank(docxRemotePath)
                && isNotBlank(saveAsReachablePath)
                && isNotBlank(saveAsUnreachablePath)
                && isNotBlank(docxRenderEvidencePath);
    }

    private static boolean isNotBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}