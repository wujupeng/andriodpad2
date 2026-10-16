package com.pad2.filemanager.smb;

import android.util.Log;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

public class SaveAsResolutionPrompt {

    private static final String TAG = "SaveAsResolutionPrompt";

    public Map<String, Object> prompt(File saveAsFile, String originalFileName) {
        Map<String, Object> promptData = new HashMap<>();

        if (saveAsFile == null) {
            promptData.put("promptType", "MANUAL_SELECT");
            promptData.put("message", "未自动发现另存为文件，请手动选择文件");
            promptData.put("choices", new String[]{"WRITE_AS_NEW", "OVERWRITE_ORIGINAL", "DISCARD"});
            Log.i(TAG, "Prompt: manual select (no auto-discovered file)");
            return promptData;
        }

        String saveAsName = saveAsFile.getName();
        String originalExt = getExtension(originalFileName);
        String saveAsExt = getExtension(saveAsName);

        promptData.put("promptType", "AUTO_DISCOVERED");
        promptData.put("saveAsFilePath", saveAsFile.getAbsolutePath());
        promptData.put("saveAsFileName", saveAsName);
        promptData.put("originalFileName", originalFileName);
        promptData.put("choices", new String[]{"WRITE_AS_NEW", "OVERWRITE_ORIGINAL", "DISCARD"});

        if (!originalExt.equalsIgnoreCase(saveAsExt)) {
            promptData.put("formatChange", true);
            promptData.put("message", "检测到另存为: " + saveAsName +
                    "（格式从 ." + originalExt + " 变更为 ." + saveAsExt + "）" +
                    "，请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联");
            Log.i(TAG, "Prompt: format change ." + originalExt + " → ." + saveAsExt);
        } else {
            promptData.put("formatChange", false);
            promptData.put("message", "检测到另存为: " + saveAsName +
                    "，请选择操作：回写为新文件 / 覆盖原文件 / 放弃关联");
        }

        Log.i(TAG, "Prompt: auto-discovered " + saveAsFile.getAbsolutePath());
        return promptData;
    }

    private static String getExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0 && lastDot < fileName.length() - 1) {
            return fileName.substring(lastDot + 1);
        }
        return "";
    }
}