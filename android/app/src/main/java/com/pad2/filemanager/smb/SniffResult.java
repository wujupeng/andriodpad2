package com.pad2.filemanager.smb;

public class SniffResult {

    public enum SniffStatus {
        VALID,
        INVALID,
        CORRUPTED
    }

    private final SniffStatus status;
    private final String detail;

    public SniffResult(SniffStatus status, String detail) {
        this.status = status;
        this.detail = detail;
    }

    public SniffStatus getStatus() {
        return status;
    }

    public String getDetail() {
        return detail;
    }

    @Override
    public String toString() {
        return "SniffResult{status=" + status + ", detail='" + detail + "'}";
    }
}