package com.pad2.filemanager.smb;

import androidx.room.Entity;
import androidx.room.PrimaryKey;
import androidx.room.ColumnInfo;

@Entity(tableName = "edit_sessions")
public class EditSessionEntity {

    @PrimaryKey(autoGenerate = true)
    public long id;

    @ColumnInfo(name = "session_uuid")
    public String sessionUuid;

    @ColumnInfo(name = "remote_path")
    public String remotePath;

    @ColumnInfo(name = "local_cache_path")
    public String localCachePath;

    @ColumnInfo(name = "file_name")
    public String fileName;

    @ColumnInfo(name = "baseline_sha256")
    public String baselineSha256;

    @ColumnInfo(name = "baseline_mtime")
    public long baselineMtime;

    @ColumnInfo(name = "remote_mtime")
    public long remoteMtime;

    @ColumnInfo(name = "file_size")
    public long fileSize;

    @ColumnInfo(name = "status")
    public String status;

    @ColumnInfo(name = "created_at")
    public long createdAt;

    @ColumnInfo(name = "updated_at")
    public long updatedAt;

    @ColumnInfo(name = "uri_scheme")
    public String uriScheme;

    @ColumnInfo(name = "intent_action")
    public String intentAction;
}