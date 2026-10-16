package com.pad2.filemanager.smb;

import java.util.ArrayList;
import java.util.List;

public class TestReport {
    private final List<ScenarioResult> scenarioResults = new ArrayList<>();
    private final String environment;
    private boolean allPassed = true;

    public TestReport(String environment) {
        this.environment = environment;
    }

    public void addResult(ScenarioResult result) {
        scenarioResults.add(result);
        if (!result.isPassed()) {
            allPassed = false;
        }
    }

    public List<ScenarioResult> getScenarioResults() { return scenarioResults; }
    public String getEnvironment() { return environment; }
    public boolean isAllPassed() { return allPassed; }
}