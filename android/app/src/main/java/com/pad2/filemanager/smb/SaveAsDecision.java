package com.pad2.filemanager.smb;

public class SaveAsDecision {

    public enum SaveAsChoice {
        WRITE_AS_NEW,
        OVERWRITE_ORIGINAL,
        DISCARD
    }

    private final SaveAsChoice choice;
    private final String saveAsFilePath;

    public SaveAsDecision(SaveAsChoice choice, String saveAsFilePath) {
        this.choice = choice;
        this.saveAsFilePath = saveAsFilePath;
    }

    public SaveAsChoice getChoice() { return choice; }
    public String getSaveAsFilePath() { return saveAsFilePath; }
}