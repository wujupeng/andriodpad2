package com.pad2.filemanager.smb;

public class EditSessionContext {
    private final String originalFileName;
    private final long sessionStartTime;
    private final long sessionEndTime;

    public EditSessionContext(String originalFileName, long sessionStartTime, long sessionEndTime) {
        this.originalFileName = originalFileName;
        this.sessionStartTime = sessionStartTime;
        this.sessionEndTime = sessionEndTime;
    }

    public String getOriginalFileName() { return originalFileName; }
    public long getSessionStartTime() { return sessionStartTime; }
    public long getSessionEndTime() { return sessionEndTime; }
}