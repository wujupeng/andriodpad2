package com.pad2.filemanager.smb;

import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public class SaveAsDiscoveryService {

    private static final String TAG = "SaveAsDiscoveryService";

    private static final String[] SCAN_PATHS = {
        "/storage/emulated/0/",
        "/storage/emulated/0/Documents/",
        "/storage/emulated/0/Download/"
    };

    public List<File> discoverSaveAs(EditSessionContext sessionCtx) {
        List<File> results = new ArrayList<>();

        if (sessionCtx == null || sessionCtx.getOriginalFileName() == null) {
            Log.w(TAG, "Session context is null or has no original filename");
            return results;
        }

        String originalName = sessionCtx.getOriginalFileName();
        String originalBaseName = getBaseName(originalName);
        String originalExtension = getExtension(originalName);
        long startTime = sessionCtx.getSessionStartTime();
        long endTime = sessionCtx.getSessionEndTime();

        Log.i(TAG, "Scanning for save-as results: original=" + originalName +
                ", window=[" + startTime + ", " + endTime + "]");

        for (String scanPath : SCAN_PATHS) {
            File dir = new File(scanPath);
            if (!dir.exists() || !dir.isDirectory()) {
                continue;
            }

            File[] files = dir.listFiles();
            if (files == null) continue;

            for (File file : files) {
                if (!file.isFile()) continue;
                if (WpsSaveDetector.isTempFile(file.getName())) continue;

                long fileMtime = file.lastModified();
                if (fileMtime < startTime - 60000 || fileMtime > endTime + 60000) {
                    continue;
                }

                String fileName = file.getName();
                String fileBaseName = getBaseName(fileName);

                boolean nameMatch = fileName.contains(originalBaseName) ||
                        (originalBaseName.length() > 3 && fileBaseName.contains(originalBaseName));

                boolean extensionChanged = !fileName.endsWith("." + originalExtension);

                if (nameMatch && extensionChanged) {
                    Log.i(TAG, "Save-as candidate found: " + file.getAbsolutePath() +
                            " (mtime=" + fileMtime + ", size=" + file.length() + ")");
                    results.add(file);
                }
            }
        }

        Log.i(TAG, "Scan complete: " + results.size() + " save-as result(s) found");
        return results;
    }

    private static String getBaseName(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0) {
            return fileName.substring(0, lastDot);
        }
        return fileName;
    }

    private static String getExtension(String fileName) {
        int lastDot = fileName.lastIndexOf('.');
        if (lastDot > 0 && lastDot < fileName.length() - 1) {
            return fileName.substring(lastDot + 1);
        }
        return "";
    }
}