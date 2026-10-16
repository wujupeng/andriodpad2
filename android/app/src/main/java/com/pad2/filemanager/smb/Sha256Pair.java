package com.pad2.filemanager.smb;

public class Sha256Pair {
    private final String operation;
    private final String beforeSha256;
    private final String afterSha256;

    public Sha256Pair(String operation, String beforeSha256, String afterSha256) {
        this.operation = operation;
        this.beforeSha256 = beforeSha256;
        this.afterSha256 = afterSha256;
    }

    public String getOperation() { return operation; }
    public String getBeforeSha256() { return beforeSha256; }
    public String getAfterSha256() { return afterSha256; }
}