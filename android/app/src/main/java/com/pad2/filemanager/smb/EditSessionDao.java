package com.pad2.filemanager.smb;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.Query;
import androidx.room.Update;
import androidx.room.Delete;

import java.util.List;

@Dao
public interface EditSessionDao {

    @Insert
    long insert(EditSessionEntity session);

    @Update
    void update(EditSessionEntity session);

    @Delete
    void delete(EditSessionEntity session);

    @Query("SELECT * FROM edit_sessions WHERE session_uuid = :uuid LIMIT 1")
    EditSessionEntity getByUuid(String uuid);

    @Query("SELECT * FROM edit_sessions WHERE remote_path = :remotePath AND status = 'open' ORDER BY created_at DESC LIMIT 1")
    EditSessionEntity getOpenSessionByPath(String remotePath);

    @Query("SELECT * FROM edit_sessions WHERE status = :status ORDER BY created_at DESC")
    List<EditSessionEntity> getByStatus(String status);

    @Query("SELECT * FROM edit_sessions ORDER BY created_at DESC")
    List<EditSessionEntity> getAll();

    @Query("UPDATE edit_sessions SET status = :status, updated_at = :updatedAt WHERE session_uuid = :uuid")
    void updateStatus(String uuid, String status, long updatedAt);

    @Query("DELETE FROM edit_sessions WHERE status = 'closed' AND updated_at < :before")
    void cleanupOldSessions(long before);

    @Query("SELECT COUNT(*) FROM edit_sessions WHERE status = 'open'")
    int countOpenSessions();
}