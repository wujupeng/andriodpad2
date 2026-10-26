package com.pad2.filemanager.smb;

import android.content.Context;
import android.os.FileObserver;
import android.util.Log;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

public class WpsSaveDetector {

    private static final String TAG = "WpsSaveDetector";

    private Context context;
    private FileObserver fileObserver;
    private FileObserver dirObserver;
    private FileObserver parentDirObserver;
    private volatile boolean monitoring = false;
    private volatile boolean paused = false;

    private File monitoredFile;
    private String monitoredFileName;
    private String baselineSha256;
    private long baselineMtime;

    private volatile boolean contentChanged = false;
    private volatile boolean mtimeChanged = false;
    private volatile boolean saveAsDetected = false;
    private volatile String saveAsFileName = null;
    private volatile String newSha256 = null;
    private volatile long newMtime = 0;
    private volatile String lastTempFileFiltered = null;

    private final List<Map<String, Object>> eventLog = new ArrayList<>();

    public WpsSaveDetector(Context context) {
        this.context = context;
    }

    public void startMonitoring(File file, String baselineSha256, long baselineMtime) {
        stopMonitoring();

        this.monitoredFile = file;
        this.monitoredFileName = file.getName();
        this.baselineSha256 = baselineSha256;
        this.baselineMtime = baselineMtime;
        this.contentChanged = false;
        this.mtimeChanged = false;
        this.saveAsDetected = false;
        this.saveAsFileName = null;
        this.newSha256 = null;
        this.newMtime = 0;
        this.lastTempFileFiltered = null;
        this.paused = false;
        synchronized (eventLog) {
            this.eventLog.clear();
        }

        fileObserver = new FileObserver(file, FileObserver.MODIFY | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO) {
            @Override
            public void onEvent(int event, String path) {
                if (paused) return;
                String eventName = getEventName(event);
                Log.i(TAG, "FileObserver: " + eventName + " path: " + path);
                recordEvent("file", eventName, path);
                checkChange();
            }
        };
        fileObserver.startWatching();

        File cacheDir = file.getParentFile();
        if (cacheDir != null) {
            dirObserver = new FileObserver(cacheDir, FileObserver.MODIFY | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO | FileObserver.CREATE) {
                @Override
                public void onEvent(int event, String path) {
                    if (paused) return;
                    if (path == null) return;

                    if (isTempFile(path)) {
                        Log.i(TAG, "Temp file filtered: " + path);
                        recordEvent("dir_temp_filtered", getEventName(event), path);
                        lastTempFileFiltered = path;
                        return;
                    }

                    if (!path.equals(monitoredFileName)) {
                        Log.i(TAG, "Save-as detected: " + path);
                        recordEvent("dir_save_as", getEventName(event), path);
                        saveAsDetected = true;
                        saveAsFileName = path;
                        return;
                    }

                    String eventName = getEventName(event);
                    Log.i(TAG, "DirObserver: " + eventName + " path: " + path);
                    recordEvent("dir", eventName, path);
                    checkChange();
                }
            };
            dirObserver.startWatching();
        }

        File parentDir = file.getParentFile();
        if (parentDir != null) {
            File grandparentDir = parentDir.getParentFile();
            if (grandparentDir != null && !grandparentDir.equals(parentDir)) {
                parentDirObserver = new FileObserver(grandparentDir,
                        FileObserver.MODIFY | FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO | FileObserver.CREATE) {
                    @Override
                    public void onEvent(int event, String path) {
                        if (paused) return;
                        if (path == null) return;

                        if (isTempFile(path)) {
                            return;
                        }

                        Log.i(TAG, "ParentDirObserver: " + getEventName(event) + " path: " + path);
                        recordEvent("parent_dir", getEventName(event), path);

                        if (!path.equals(monitoredFileName)) {
                            Log.i(TAG, "Save-as detected (parent dir): " + path);
                            saveAsDetected = true;
                            saveAsFileName = path;
                        }
                    }
                };
                parentDirObserver.startWatching();
                Log.i(TAG, "Parent dir observer started on: " + grandparentDir.getAbsolutePath());
            }
        }

        monitoring = true;
        Log.i(TAG, "Started monitoring: " + file.getAbsolutePath());
    }

    public void stopMonitoring() {
        if (fileObserver != null) {
            fileObserver.stopWatching();
            fileObserver = null;
        }
        if (dirObserver != null) {
            dirObserver.stopWatching();
            dirObserver = null;
        }
        if (parentDirObserver != null) {
            parentDirObserver.stopWatching();
            parentDirObserver = null;
        }
        monitoring = false;
        paused = false;
        Log.i(TAG, "Stopped monitoring");
    }

    public void pause() {
        paused = true;
        Log.i(TAG, "Monitoring paused for writeback");
    }

    public void resume() {
        paused = false;
        Log.i(TAG, "Monitoring resumed after writeback");
    }

    public SaveDetectionResult checkChange() {
        SaveDetectionResult result = new SaveDetectionResult();
        if (monitoredFile == null) {
            result.setVerdict(SaveDetectionVerdict.DETECTION_UNCERTAIN);
            result.setEvidence("No file monitored");
            return result;
        }

        result.setOriginalFilePath(monitoredFile.getAbsolutePath());
        result.setBaselineSha256(baselineSha256);
        result.setBaselineMtime(baselineMtime);

        long currentMtime = monitoredFile.lastModified();
        result.setFinalMtime(currentMtime);

        if (saveAsDetected) {
            result.setVerdict(SaveDetectionVerdict.SAVE_AS_DETECTED);
            result.setResultFilePath(saveAsFileName != null ? new File(monitoredFile.getParentFile(), saveAsFileName).getAbsolutePath() : null);
            result.setEvidence("Save-as detected by FileObserver: " + saveAsFileName);
            Log.i(TAG, "Verdict: SAVE_AS_DETECTED — " + saveAsFileName);
            return result;
        }

        boolean mtimeChangedNow = currentMtime != baselineMtime;

        if (!mtimeChangedNow) {
            result.setVerdict(SaveDetectionVerdict.DETECTION_UNCERTAIN);
            result.setEvidence("mtime unchanged (no file modification detected)");
            return result;
        }

        this.mtimeChanged = true;
        this.newMtime = currentMtime;

        try {
            String hash = StreamCacheService.calculateSHA256(monitoredFile);
            this.newSha256 = hash;
            result.setFinalSha256(hash);
            result.setResultFilePath(monitoredFile.getAbsolutePath());

            if (hash.equals(baselineSha256)) {
                result.setVerdict(SaveDetectionVerdict.MTIME_FALSE_POSITIVE);
                result.setEvidence("mtime changed but SHA-256 unchanged (false positive)");
                Log.i(TAG, "Verdict: MTIME_FALSE_POSITIVE — mtime changed but content identical");
            } else {
                result.setVerdict(SaveDetectionVerdict.SAVE_SUCCESS);
                this.contentChanged = true;
                result.setEvidence("mtime changed AND SHA-256 changed — three-factor correlation confirmed");
                Log.i(TAG, "Verdict: SAVE_SUCCESS — " + baselineSha256.substring(0, 16) + "... -> " + hash.substring(0, 16) + "...");
            }
        } catch (Exception e) {
            result.setVerdict(SaveDetectionVerdict.DETECTION_UNCERTAIN);
            result.setEvidence("SHA-256 calculation failed: " + e.getMessage());
            Log.e(TAG, "SHA-256 calculation failed", e);
        }

        return result;
    }

    public SaveDetectionResult foregroundCheck() {
        Log.i(TAG, "Foreground check triggered");
        SaveDetectionResult result = checkChange();
        if (result.getVerdict() == SaveDetectionVerdict.DETECTION_UNCERTAIN && !saveAsDetected) {
            result.setEvidence(result.getEvidence() + " [foregroundCheck: may need save-as scan]");
        }
        return result;
    }

    public boolean isContentChanged() { return contentChanged; }
    public boolean isMtimeChanged() { return mtimeChanged; }
    public boolean isSaveAsDetected() { return saveAsDetected; }
    public String getSaveAsFileName() { return saveAsFileName; }
    public String getNewSha256() { return newSha256; }
    public long getNewMtime() { return newMtime; }
    public boolean isMonitoring() { return monitoring; }

    public void updateBaseline(String newSha256, long newMtime) {
        this.baselineSha256 = newSha256;
        this.baselineMtime = newMtime;
        this.contentChanged = false;
        this.mtimeChanged = false;
        this.newSha256 = null;
        this.newMtime = 0;
        Log.i(TAG, "Baseline updated: SHA-256=" + newSha256.substring(0, 16) + "... mtime=" + newMtime);
    }

    private static final Pattern NUMERIC_TEMP_PATTERN = Pattern.compile("^-?\\d+\\.-?\\d+$");

    public static boolean isTempFile(String fileName) {
        if (fileName == null) return false;
        if (fileName.startsWith("~$")) return true;
        if (fileName.endsWith(".tmp")) return true;
        if (fileName.endsWith(".temp")) return true;
        if (fileName.startsWith(".moffice_wr_check")) return true;
        if (fileName.startsWith(".~lock")) return true;
        if (NUMERIC_TEMP_PATTERN.matcher(fileName).matches()) return true;
        return false;
    }

    private void recordEvent(String source, String eventType, String path) {
        Map<String, Object> event = new HashMap<>();
        event.put("timestamp", System.currentTimeMillis());
        event.put("source", source);
        event.put("eventType", eventType);
        event.put("path", path);
        synchronized (eventLog) {
            eventLog.add(event);
            if (eventLog.size() > 100) {
                eventLog.remove(0);
            }
        }
    }

    private String getEventLogSummary() {
        synchronized (eventLog) {
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> e : eventLog) {
                sb.append(String.format("[%s] %s: %s path=%s; ",
                    e.get("timestamp"), e.get("source"), e.get("eventType"), e.get("path")));
            }
            return sb.toString();
        }
    }

    private static String getEventName(int event) {
        switch (event) {
            case FileObserver.MODIFY: return "MODIFY";
            case FileObserver.CLOSE_WRITE: return "CLOSE_WRITE";
            case FileObserver.MOVED_TO: return "MOVED_TO";
            case FileObserver.CREATE: return "CREATE";
            case FileObserver.DELETE: return "DELETE";
            case FileObserver.MOVED_FROM: return "MOVED_FROM";
            default: return "EVENT_" + event;
        }
    }
}
