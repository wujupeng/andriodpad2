package com.pad2.filemanager.smb;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

@Database(entities = {EditSessionEntity.class}, version = 1, exportSchema = false)
public abstract class EditSessionDatabase extends RoomDatabase {

    private static volatile EditSessionDatabase INSTANCE;

    public abstract EditSessionDao editSessionDao();

    public static EditSessionDatabase getInstance(Context context) {
        if (INSTANCE == null) {
            synchronized (EditSessionDatabase.class) {
                if (INSTANCE == null) {
                    INSTANCE = Room.databaseBuilder(
                            context.getApplicationContext(),
                            EditSessionDatabase.class,
                            "pad2_edit_sessions"
                    )
                    .fallbackToDestructiveMigration()
                    .allowMainThreadQueries()
                    .build();
                }
            }
        }
        return INSTANCE;
    }
}