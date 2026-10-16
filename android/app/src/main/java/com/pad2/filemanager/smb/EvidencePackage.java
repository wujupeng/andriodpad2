package com.pad2.filemanager.smb;

import java.util.ArrayList;
import java.util.List;

public class EvidencePackage {
    private String apkVersion;
    private String codeSha;
    private DeviceInfo deviceInfo;
    private final List<String> testSteps = new ArrayList<>();
    private final List<String> sanitizedLogs = new ArrayList<>();
    private final List<Sha256Pair> sha256Pairs = new ArrayList<>();

    public String getApkVersion() { return apkVersion; }
    public void setApkVersion(String apkVersion) { this.apkVersion = apkVersion; }

    public String getCodeSha() { return codeSha; }
    public void setCodeSha(String codeSha) { this.codeSha = codeSha; }

    public DeviceInfo getDeviceInfo() { return deviceInfo; }
    public void setDeviceInfo(DeviceInfo deviceInfo) { this.deviceInfo = deviceInfo; }

    public List<String> getTestSteps() { return testSteps; }
    public List<String> getSanitizedLogs() { return sanitizedLogs; }
    public List<Sha256Pair> getSha256Pairs() { return sha256Pairs; }
}