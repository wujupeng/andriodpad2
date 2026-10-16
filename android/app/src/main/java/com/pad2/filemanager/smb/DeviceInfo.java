package com.pad2.filemanager.smb;

public class DeviceInfo {
    private final String model;
    private final String androidVersion;
    private final int apiLevel;
    private final String wpsPackageName;
    private final String wpsVersion;

    public DeviceInfo(String model, String androidVersion, int apiLevel, String wpsPackageName, String wpsVersion) {
        this.model = model;
        this.androidVersion = androidVersion;
        this.apiLevel = apiLevel;
        this.wpsPackageName = wpsPackageName;
        this.wpsVersion = wpsVersion;
    }

    public String getModel() { return model; }
    public String getAndroidVersion() { return androidVersion; }
    public int getApiLevel() { return apiLevel; }
    public String getWpsPackageName() { return wpsPackageName; }
    public String getWpsVersion() { return wpsVersion; }
}