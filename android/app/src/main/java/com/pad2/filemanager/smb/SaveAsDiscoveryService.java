package com.pad2.filemanager.smb;

import android.os.Environment;
import android.util.Log;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class SaveAsDiscoveryService {

    private static final String TAG = "SaveAsDiscoveryService";

    static final String CACHE_BASE_PATH = "/storage/emulated/0/PAD2/smb_cache/";

    private static final String[] SCAN_PATHS = {
        "/storage/emulated/0/",
        "/storage/emulated/0/Documents/",
        "/storage/emulated/0/Download/",
        "/storage/emulated/0/PAD2/smb_cache/",
        "/storage/emulated/0/Download/WPS Office/"
    };

    static final int EXCLUDED_TEMP = 0;
    static final int EXCLUDED_WINDOW = 1;
    static final int EXCLUDED_SELF = 2;
    static final int LEVEL_A = 3;
    static final int LEVEL_B = 4;
    static final int NOT_CANDIDATE = 5;

    public List<File> discoverSaveAs(EditSessionContext sessionCtx) {
        List<File> levelAFiles = new ArrayList<>();
        List<File> levelBFiles = new ArrayList<>();

        if (sessionCtx == null || sessionCtx.getOriginalFileName() == null) {
            Log.w(TAG, "Session context is null or has no original filename");
            return new ArrayList<>();
        }

        String originalName = sessionCtx.getOriginalFileName();
        String originalBaseName = getBaseName(originalName);
        String originalExtension = getExtension(originalName);
        long startTime = sessionCtx.getSessionStartTime();
        long endTime = sessionCtx.getSessionEndTime();

        File cacheOriginal = new File(CACHE_BASE_PATH + originalName);
        boolean originalSizeKnown = cacheOriginal.isFile();
        long originalSize = originalSizeKnown ? cacheOriginal.length() : 0L;

        Log.i(TAG, "Scanning for save-as results: original=" + originalName +
                ", window=[" + startTime + ", " + endTime + "]" +
                ", cacheSizeKnown=" + originalSizeKnown);

        StringBuilder scope = new StringBuilder();
        for (String scanPath : SCAN_PATHS) {
            if (scope.length() > 0) scope.append(", ");
            scope.append(scanPath);
        }
        Log.i(TAG, "Scanning paths: [" + scope + "] (declared scan scope)");

        for (String scanPath : SCAN_PATHS) {
            File dir = new File(scanPath);
            if (!dir.exists() || !dir.isDirectory()) {
                Log.i(TAG, "Scan path=" + scanPath + " files=0 skipped=not-found");
                continue;
            }

            File[] files = dir.listFiles();
            if (files == null) {
                Log.i(TAG, "Scan path=" + scanPath + " files=0 skipped=not-accessible");
                continue;
            }

            for (File file : files) {
                if (!file.isFile()) continue;

                String fileName = file.getName();
                long fileMtime = file.lastModified();

                int verdict = classifyCandidate(fileName, file.getAbsolutePath(), fileMtime, file.length(),
                        originalName, originalBaseName, originalExtension,
                        originalSizeKnown, originalSize,
                        startTime, endTime);

                if (verdict == LEVEL_A) {
                    String signal = fileName.equals(originalName) ? "exact-name" : "base-name";
                    Log.i(TAG, "Candidate: " + file.getAbsolutePath() + " level=A signals=["
                            + signal + ", mtime=" + fileMtime + ", size=" + file.length() + "]");
                    levelAFiles.add(file);
                } else if (verdict == LEVEL_B) {
                    Log.i(TAG, "Candidate: " + file.getAbsolutePath() + " level=B signals=["
                            + "ext=" + getExtension(fileName)
                            + ", sizeRatio=" + String.format(Locale.US, "%.2f",
                                (double) file.length() / (double) originalSize)
                            + ", tight-window mtime=" + fileMtime + "]");
                    levelBFiles.add(file);
                }
            }

            Log.i(TAG, "Scan path=" + scanPath + " files=" + files.length + " skipped=-");
        }

        levelAFiles.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));
        levelBFiles.sort((a, b) -> Long.compare(b.lastModified(), a.lastModified()));

        List<File> results = new ArrayList<>(levelAFiles.size() + levelBFiles.size());
        results.addAll(levelAFiles);
        results.addAll(levelBFiles);

        if (results.isEmpty()) {
            Log.i(TAG, "Scan complete: none found (safe fallback)");
        } else {
            Log.i(TAG, "Scan complete: " + results.size() + " candidate(s) [A="
                    + levelAFiles.size() + ", B=" + levelBFiles.size() + "]");
        }
        return results;
    }

    static int classifyCandidate(String fileName, String filePath, long fileMtime, long fileSize,
                                 String originalName, String originalBaseName, String originalExtension,
                                 boolean originalSizeKnown, long originalSize,
                                 long startTime, long endTime) {
        if (WpsSaveDetector.isTempFile(fileName)) {
            return EXCLUDED_TEMP;
        }
        if (fileMtime < startTime - 60000L || fileMtime > endTime + 60000L) {
            return EXCLUDED_WINDOW;
        }
        if (filePath.equals(CACHE_BASE_PATH + originalName)) {
            return EXCLUDED_SELF;
        }
        if (fileName.equals(originalName)) {
            return LEVEL_A;
        }
        String fileBaseName = getBaseName(fileName);
        if (fileName.contains(originalBaseName)
                || (originalBaseName.length() > 3 && fileBaseName.contains(originalBaseName))) {
            return LEVEL_A;
        }
        if (originalSizeKnown && originalSize > 0
                && getExtension(fileName).equalsIgnoreCase(originalExtension)
                && fileMtime >= startTime && fileMtime <= endTime + 60000L) {
            double ratio = (double) fileSize / (double) originalSize;
            if (ratio >= 0.25 && ratio <= 4.0) {
                return LEVEL_B;
            }
        }
        return NOT_CANDIDATE;
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
