package com.pad2.filemanager.smb;

public class ScenarioResult {
    private final String scenarioName;
    private boolean passed;
    private String evidence;
    private String failureRootCause;

    public ScenarioResult(String scenarioName) {
        this.scenarioName = scenarioName;
        this.passed = false;
    }

    public String getScenarioName() { return scenarioName; }
    public boolean isPassed() { return passed; }
    public void setPassed(boolean passed) { this.passed = passed; }
    public String getEvidence() { return evidence; }
    public void setEvidence(String evidence) { this.evidence = evidence; }
    public String getFailureRootCause() { return failureRootCause; }
    public void setFailureRootCause(String failureRootCause) { this.failureRootCause = failureRootCause; }
}