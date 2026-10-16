package com.pad2.filemanager.smb;

import android.content.Context;
import android.util.Log;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public class EditSessionManager {

    private static final String TAG = "EditSessionManager";
    private static final String STATUS_OPEN = "open";
    private static final String STATUS_SAVED = "saved";
    private static final String STATUS_WRITEBACK = "writeback";
    private static final String STATUS_CLOSED = "closed";
    private static final String STATUS_FAILED = "failed";

    private EditSessionDao dao;

    public EditSessionManager(Context context) {
        this.dao = EditSessionDatabase.getInstance(context).editSessionDao();
    }

    public Map<String, Object> createSession(
            String remotePath,
            String localCachePath,
            String fileName,
            String baselineSha256,
            long baselineMtime,
            long remoteMtime,
            long fileSize,
            String uriScheme,
            String intentAction
    ) {
        EditSessionEntity entity = new EditSessionEntity();
        entity.sessionUuid = UUID.randomUUID().toString();
        entity.remotePath = remotePath;
        entity.localCachePath = localCachePath;
        entity.fileName = fileName;
        entity.baselineSha256 = baselineSha256;
        entity.baselineMtime = baselineMtime;
        entity.remoteMtime = remoteMtime;
        entity.fileSize = fileSize;
        entity.status = STATUS_OPEN;
        entity.createdAt = System.currentTimeMillis();
        entity.updatedAt = System.currentTimeMillis();
        entity.uriScheme = uriScheme;
        entity.intentAction = intentAction;

        long id = dao.insert(entity);
        entity.id = id;

        Log.i(TAG, "Created edit session: " + entity.sessionUuid + " for " + remotePath);

        return entityToMap(entity);
    }

    public EditSessionEntity getOpenSession(String remotePath) {
        return dao.getOpenSessionByPath(remotePath);
    }

    public EditSessionEntity getSessionByUuid(String uuid) {
        return dao.getByUuid(uuid);
    }

    public void updateStatus(String uuid, String status) {
        dao.updateStatus(uuid, status, System.currentTimeMillis());
    }

    public void updateBaseline(String uuid, String newSha256, long newMtime) {
        EditSessionEntity entity = dao.getByUuid(uuid);
        if (entity != null) {
            entity.baselineSha256 = newSha256;
            entity.baselineMtime = newMtime;
            entity.updatedAt = System.currentTimeMillis();
            dao.update(entity);
        }
    }

    public void closeSession(String uuid) {
        updateStatus(uuid, STATUS_CLOSED);
    }

    public void failSession(String uuid) {
        updateStatus(uuid, STATUS_FAILED);
    }

    public void cleanupOldSessions(long olderThanMs) {
        dao.cleanupOldSessions(olderThanMs);
    }

    public int countOpenSessions() {
        return dao.countOpenSessions();
    }

    public static Map<String, Object> entityToMap(EditSessionEntity entity) {
        Map<String, Object> map = new HashMap<>();
        map.put("sessionId", entity.sessionUuid);
        map.put("remotePath", entity.remotePath);
        map.put("localCachePath", entity.localCachePath);
        map.put("fileName", entity.fileName);
        map.put("baselineSha256", entity.baselineSha256);
        map.put("baselineMtime", entity.baselineMtime);
        map.put("remoteMtime", entity.remoteMtime);
        map.put("fileSize", entity.fileSize);
        map.put("status", entity.status);
        map.put("uriScheme", entity.uriScheme);
        map.put("intentAction", entity.intentAction);
        return map;
    }
}