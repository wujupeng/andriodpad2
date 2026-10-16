package com.pad2.filemanager.smb;

public enum SaveDetectionVerdict {
    SAVE_SUCCESS,
    SAVE_FAILED,
    SAVE_AS_DETECTED,
    TEMP_FILE_FILTERED,
    DETECTION_UNCERTAIN,
    MTIME_FALSE_POSITIVE
}